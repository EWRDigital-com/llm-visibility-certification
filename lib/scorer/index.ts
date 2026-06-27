// LLM Visibility Score™ — reframed into the book's model (LLM Visibility Stack).
//
// The seven on-page measurements roll up into THREE scored pillars; crawler
// access is pulled OUT of the composite and used as an eligibility GATE (the
// book treats crawler mechanics as table-stakes hygiene, not a differentiator,
// and never mentions llms.txt — so we do not reward it). The composite is a
// weighted blend of pillar readiness; the report surfaces the WEAKEST pillar as
// the bottleneck and places the site on a maturity ladder capped at "Recognized"
// (the honest ceiling for an on-page-only audit). Off-domain pillars are shown
// as a roadmap, never scored from one URL.
//
// NOTE: pillar weights and tier bands are provisional — tuned during calibration
// (rank-ordering against ~30-50 sites with known real LLM-citation status). The
// methodology PAGE publishes the categories and principles, NOT these numbers.

import type {
  PageScrape,
  ScoreResult,
  Tier,
  CategoryResult,
  CategoryKey,
  PillarKey,
  PillarResult,
  MaturityResult,
  EligibilityResult,
  RoadmapPillar,
} from "./types";
import {
  scoreSchema,
  scoreEntity,
  scoreAuthorTrust,
  scoreCitations,
  scoreAnswerFormat,
  scoreFreshness,
  scoreBrand,
  scoreCrawlerAccess,
} from "./criteria";

// ---------- Pillar definitions ----------
// Which atomic measurements feed each pillar, plus its composite weight. Book
// guidance: weight Foundation (entity truth) and Validation (authority/proof)
// heavily, Ingestion (surfacing mechanics) medium. Weights sum to 1.

interface PillarSpec {
  key: PillarKey;
  label: string;
  aiPillar: string;
  weight: number;
  categories: CategoryKey[];
}

const PILLAR_SPECS: PillarSpec[] = [
  { key: "foundation", label: "Foundation", aiPillar: "Citations Consistency", weight: 0.4, categories: ["schema", "entity", "brand"] },
  { key: "validation", label: "Validation", aiPillar: "Authority Trust", weight: 0.35, categories: ["citations", "author_trust"] },
  { key: "ingestion", label: "Ingestion", aiPillar: "LLM Surfacing", weight: 0.25, categories: ["answer_format", "freshness"] },
];

// Severity order for bottleneck tie-breaks: a lower (more foundational) layer
// breaking is worse, because the book's stack is causal — lower tiers gate higher.
const BOTTLENECK_PRIORITY: PillarKey[] = ["foundation", "validation", "ingestion"];

// Off-domain pillars: real, but unscorable from a single URL. Shown as roadmap.
const ROADMAP: RoadmapPillar[] = [
  { name: "Search Mentions", stackLayer: "Engine", why: "Third-party mention footprint across the web — the book's #1 lever, invisible from your own page.", plannedVersion: "v1.x" },
  { name: "LLM Surfacing (outcome)", stackLayer: "Ingestion", why: "Whether you actually appear in AI answers, and how early — requires live prompt-suite testing, not page inspection.", plannedVersion: "v1.x" },
  { name: "Authority Trust (off-domain)", stackLayer: "Validation", why: "Third-party reviews and analyst/academic citations that back you — measured off your domain.", plannedVersion: "v1.x" },
  { name: "Entity Consistency (cross-web)", stackLayer: "Foundation", why: "Whether your name/bio/location match across LinkedIn, Crunchbase, Wikidata — contradictions cause LLM confidence drop.", plannedVersion: "v1.x" },
];

// ---------- Eligibility gate ----------
// "If a page is blocked by robots.txt, loaded via JavaScript, or not indexed,
// the model can't retrieve it. And if it's not retrievable, it can't be reused."
// Gate trips only on a HARD block of the major answer-engine crawlers.

const ANSWER_ENGINE_BOTS = ["GPTBot", "ClaudeBot"] as const;

function evalEligibility(s: PageScrape, detail: CategoryResult): EligibilityResult {
  const access = ANSWER_ENGINE_BOTS.map((b) => s.botAccess.find((x) => x.bot === b));
  const robotsBlocked = access.filter((a) => a && !a.allowedByRobots).length;
  const fetchBlocked = access.filter((a) => a && a.fetchStatus !== null && a.fetchStatus !== 200).length;
  const status2xx = s.statusCode >= 200 && s.statusCode < 300;

  if (!status2xx) {
    return { eligible: false, reason: `Page returned HTTP ${s.statusCode} — not retrievable by AI crawlers`, detail };
  }
  if (robotsBlocked >= ANSWER_ENGINE_BOTS.length) {
    return { eligible: false, reason: "robots.txt blocks every major AI answer-engine crawler (GPTBot + ClaudeBot)", detail };
  }
  if (fetchBlocked >= ANSWER_ENGINE_BOTS.length) {
    return { eligible: false, reason: "Every major AI crawler is blocked at fetch (WAF/CDN) despite robots.txt", detail };
  }
  if (robotsBlocked > 0 || fetchBlocked > 0) {
    return { eligible: true, reason: "Retrievable, but at least one major AI crawler is restricted", detail };
  }
  return { eligible: true, reason: "Retrievable by the major AI answer-engine crawlers", detail };
}

// ---------- Maturity ladder (capped at Recognized on-page) ----------

const LOCKED_RUNGS = [
  { rung: "referenced" as const, label: "Referenced", requires: "Off-domain: appearing in AI answers unprompted (live prompt-suite scan, v1.x)" },
  { rung: "authoritative" as const, label: "Authoritative", requires: "Off-domain: third-party reviews + analyst/academic citations that back you (v1.x)" },
  { rung: "default_source" as const, label: "Default Source", requires: "Off-domain: category ownership / share-of-voice across answers (v1.x)" },
];

const MATURITY_CAVEAT =
  "On-page audits ceiling at Recognized. Referenced, Authoritative, and Default Source are earned off-domain (third-party mentions, live AI-answer presence) and arrive in v1.x.";

function evalMaturity(eligible: boolean, foundationReadiness: number): MaturityResult {
  // Recognized = retrievable AND the entity is legible (Foundation holds). The
  // book's lower rungs are about being identifiable, not overall on-page polish —
  // polish gates the higher (off-domain) rungs. So Recognized keys off eligibility
  // + Foundation, decoupled from the composite and the cert tier.
  if (eligible && foundationReadiness >= 50) {
    return { rung: "recognized", label: "Recognized", ceilingReached: true, lockedRungs: LOCKED_RUNGS, caveat: MATURITY_CAVEAT };
  }
  return { rung: "invisible", label: "Invisible", ceilingReached: false, lockedRungs: LOCKED_RUNGS, caveat: MATURITY_CAVEAT };
}

// ---------- Tier (headline credential) ----------
// Gated by eligibility (can't certify a page AI can't fetch), the composite
// band, AND a per-pillar floor (book: the weakest pillar holds you back, so one
// dead pillar blocks a top tier even if the average looks fine).

/** Pure composite → band mapping (provisional: <60 none, 60-79 Certified, 80+ Gold). */
export function bandFor(composite: number): Tier {
  if (composite >= 80) return "gold";
  if (composite >= 60) return "certified";
  return "none";
}

export function tierFor(composite: number, pillars: PillarResult[], eligible: boolean): Tier {
  if (!eligible) return "none";
  const minReadiness = Math.min(...pillars.map((p) => p.readiness));
  let tier = bandFor(composite);
  if (tier === "gold" && minReadiness < 50) tier = "certified"; // a dead pillar can't be Gold
  if (tier === "certified" && minReadiness < 40) tier = "none"; // a dead pillar can't certify
  return tier;
}

// ---------- Composite ----------

export interface ScoreOptions {
  /** Injected for deterministic freshness scoring + scoredAt; defaults to now. */
  now?: Date;
}

export function scoreSite(scrape: PageScrape, opts: ScoreOptions = {}): ScoreResult {
  const now = opts.now ?? new Date();

  // 1. Run every atomic on-page measurement once.
  const measured: Record<CategoryKey, CategoryResult> = {
    schema: scoreSchema(scrape),
    entity: scoreEntity(scrape),
    author_trust: scoreAuthorTrust(scrape),
    citations: scoreCitations(scrape),
    answer_format: scoreAnswerFormat(scrape),
    freshness: scoreFreshness(scrape, now),
    brand: scoreBrand(scrape),
    crawler_access: scoreCrawlerAccess(scrape),
  };

  // 2. Roll measurements up into pillars; readiness = points / max * 100.
  const pillars: PillarResult[] = PILLAR_SPECS.map((spec) => {
    const categories = spec.categories.map((k) => measured[k]);
    const points = categories.reduce((a, c) => a + c.points, 0);
    const max = categories.reduce((a, c) => a + c.maxPoints, 0);
    const readiness = max === 0 ? 0 : Math.round((points / max) * 100);
    return { key: spec.key, label: spec.label, aiPillar: spec.aiPillar, readiness, weight: spec.weight, categories, isBottleneck: false };
  });

  // 3. Composite = weighted blend of pillar readiness.
  const composite = Math.round(pillars.reduce((a, p) => a + p.readiness * p.weight, 0));

  // 4. Bottleneck = weakest pillar (tie-break toward the more foundational layer).
  const bottleneckPillar = [...pillars].sort((a, b) => {
    if (a.readiness !== b.readiness) return a.readiness - b.readiness;
    return BOTTLENECK_PRIORITY.indexOf(a.key) - BOTTLENECK_PRIORITY.indexOf(b.key);
  })[0]!; // pillars is always the 3 PILLAR_SPECS, never empty
  bottleneckPillar.isBottleneck = true;

  // 5. Eligibility gate, maturity rung, tier.
  const eligibility = evalEligibility(scrape, measured.crawler_access);
  const foundation = pillars.find((p) => p.key === "foundation")!;
  const maturity = evalMaturity(eligibility.eligible, foundation.readiness);
  const tier = tierFor(composite, pillars, eligibility.eligible);

  return {
    composite,
    tier,
    pillars,
    bottleneck: bottleneckPillar.key,
    maturity,
    eligibility,
    roadmap: ROADMAP,
    scoredAt: now.toISOString(),
  };
}

export * from "./types";
export * from "./criteria";
