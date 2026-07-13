// The audit worker: URL -> scrape -> deterministic score -> persisted rows.
//
// Failure contract (IMPLEMENTATION-PLAN): a scrape that can't be retrieved is
// recorded as a `failed`/`incomplete` audit with a user-facing message — NEVER a
// fabricated 0-score, and no certificate is issued. On success it stores the audit,
// the per-category punch list, and a fresh PRIVATE certificate (superseding any
// prior active cert for the domain, so there's one active cert per domain).
//
// scrape + store + clock are injectable so this is unit-testable without network/DB.

import { ScrapeError, isTargetScrapeError, scrapeUrl } from "../scrape/firecrawl.js";
import { scoreSite } from "../scorer/index.js";
import type { PageScrape, ScoreResult, Tier } from "../scorer/types.js";
import type { AuditStore, ScoreRow } from "../db/repo.js";

export type AuditStatus = "ok" | "incomplete" | "failed";

export interface RunAuditInput {
  submissionId: string;
  url: string;
  domain: string;
  store: AuditStore;
  scrape?: (url: string) => Promise<PageScrape>;
  now?: Date;
}

export interface RunAuditResult {
  auditId: string;
  status: AuditStatus;
  composite: number | null;
  tier: Tier | null;
  certificateId: string | null;
  error: string | null;
}

/** Flatten a ScoreResult into audit_scores rows (pillars + the eligibility detail). */
export function scoreRowsFrom(result: ScoreResult): ScoreRow[] {
  const rows: ScoreRow[] = [];
  for (const p of result.pillars) {
    for (const c of p.categories) {
      rows.push({ category: c.key, points: c.points, maxPoints: c.maxPoints, evidence: c.evidence });
    }
  }
  // crawler_access feeds the eligibility gate, not a pillar — persist it for the punch list.
  const ca = result.eligibility.detail;
  rows.push({ category: ca.key, points: ca.points, maxPoints: ca.maxPoints, evidence: ca.evidence });
  return rows;
}

const defaultScrape = (url: string): Promise<PageScrape> =>
  scrapeUrl(url, { apiKey: process.env.FIRECRAWL_API_KEY || undefined, timeoutMs: 20_000 });

export async function runAudit(input: RunAuditInput): Promise<RunAuditResult> {
  const scrape = input.scrape ?? defaultScrape;

  let page: PageScrape;
  try {
    page = await scrape(input.url);
  } catch (e) {
    const message = (e as Error).message;
    // A JS-rendered / anti-bot shell (page exists, nothing extractable) = incomplete;
    // everything else (offline, 403/429, timeout, our-side) = failed. Never a 0-score.
    const status: AuditStatus =
      e instanceof ScrapeError && /no scorable content/i.test(message) ? "incomplete" : "failed";
    const userMessage =
      e instanceof ScrapeError && isTargetScrapeError(message)
        ? "We couldn't read that page. It may be offline, blocking automated visitors, or JavaScript-rendered — check the URL and re-run."
        : "The audit couldn't finish. Please try again in a few minutes.";
    const auditId = await input.store.createAudit({
      submissionId: input.submissionId,
      url: input.url,
      status,
      composite: null,
      tier: null,
      error: userMessage,
      rawScrapePath: null,
    });
    return { auditId, status, composite: null, tier: null, certificateId: null, error: userMessage };
  }

  const result = scoreSite(page, { now: input.now });

  const auditId = await input.store.createAudit({
    submissionId: input.submissionId,
    url: input.url,
    status: "ok",
    composite: result.composite,
    tier: result.tier,
    error: null,
    rawScrapePath: null, // raw payload -> Storage is a Phase-1c enhancement (see roadmap)
  });
  await input.store.insertScores(auditId, scoreRowsFrom(result));

  // Dedup: supersede any prior active cert for this domain, then issue the fresh
  // PRIVATE cert (is_public=false; only ownership verification flips it public).
  await input.store.supersedeActiveCertificates(input.domain);
  const certificateId = await input.store.createCertificate({
    submissionId: input.submissionId,
    auditId,
    domain: input.domain,
    score: result.composite,
    tier: result.tier,
  });

  return {
    auditId,
    status: "ok",
    composite: result.composite,
    tier: result.tier,
    certificateId,
    error: null,
  };
}
