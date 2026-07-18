// AI Visibility Scorecard endpoint for ewrdigital.com/ai-visibility-audit.
//
// A lead-gen leaf on top of the existing, tested scorer: scrape a URL, score it,
// upsert the visitor as a GHL lead, and return the graphic's data (composite,
// tier, 3 pillars, bottleneck). It deliberately SKIPS the cert app's Supabase /
// magic-link / public-cert path — no DB, no report row, no email link. Consent is
// enforced server-side; the GHL write is best-effort (never blocks the score);
// the response exposes only display fields, never rubric weights or evidence.
//
// Honest scoring: scrapeUrl() already THROWS (never fabricates a 0) when a 2xx
// page has no scorable content, or on a non-2xx / unreachable page. We split those
// target-side failures (→ an honest "unscorable" 200, lead still captured) from
// our-side failures (Firecrawl down → 502) using isTargetScrapeError.

import { NextResponse, type NextRequest } from "next/server";
import { validateSubmissionUrl, assertPublicHost, ValidationError } from "../../../lib/security/url.js";
import { rateLimited } from "../../../lib/security/ratelimit.js";
import { scrapeUrl, ScrapeError, isTargetScrapeError } from "../../../lib/scrape/firecrawl.js";
import { scoreSite } from "../../../lib/scorer/index.js";
import { upsertGhlLead } from "../../../lib/crm/ghl.js";

// Node runtime (cheerio + node:dns), never prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://www.ewrdigital.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  Vary: "Origin",
};

const UNSCORABLE_REASON =
  "Your site blocks automated readers or renders with JavaScript — the same wall AI crawlers hit. " +
  "That itself is an AI-visibility signal worth fixing, and it's in the fix-list we just emailed you.";

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const j = (v: unknown, status: number) => NextResponse.json(v, { status, headers: CORS });

  let body: Record<string, unknown>;
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return j({ error: "Invalid request." }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email)) return j({ error: "Enter a valid email address." }, 400);
  if (body.consent !== true) return j({ error: "Please agree to receive your report by email." }, 400);

  let target: { url: string; domain: string; hostname: string };
  try {
    target = validateSubmissionUrl(body.url);
  } catch (e) {
    if (e instanceof ValidationError) return j({ error: e.message }, 400);
    throw e;
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(`aiv:${ip}`)) {
    return j({ error: "Too many scans — wait a minute and try again." }, 429);
  }

  // SSRF gate: refuse hosts that are / resolve to private/reserved addresses.
  try {
    await assertPublicHost(target.hostname);
  } catch (e) {
    if (e instanceof ValidationError) return j({ error: e.message }, 400);
    throw e;
  }

  let scrape;
  try {
    scrape = await scrapeUrl(target.url, { apiKey: process.env.FIRECRAWL_API_KEY ?? "" });
  } catch (e) {
    if (e instanceof ScrapeError) {
      // Target-side failure (JS shell / anti-bot / non-2xx / unreachable): NOT a 0.
      // Give an honest unscorable panel and still capture the lead — the block is
      // itself a finding. Our-side failure (Firecrawl down) → 502, nothing captured.
      if (isTargetScrapeError(e.message)) {
        void upsertGhlLead({ email, url: target.url, composite: null }).catch(() => {});
        return j({ unscorable: true, reason: UNSCORABLE_REASON }, 200);
      }
      return j({ error: "We couldn't read that site right now — please try again in a minute." }, 502);
    }
    throw e;
  }

  const result = scoreSite(scrape);
  const partial = scrape.statusCode !== 200;

  // Best-effort, non-blocking: a GHL failure must not deny the visitor their score.
  void upsertGhlLead({ email, url: target.url, composite: result.composite }).catch(() => {});

  return j(
    {
      composite: result.composite,
      tier: result.tier,
      bottleneck: result.bottleneck,
      partial,
      pillars: result.pillars.map((p) => ({
        key: p.key,
        label: p.label,
        readiness: p.readiness,
        isBottleneck: p.isBottleneck,
      })),
    },
    200,
  );
}
