// Input/output contract for the deterministic LLM Visibility scorer.
//
// The scorer is a PURE function over a normalized page scrape, so it is fully
// testable offline. Firecrawl (or any scraper) produces a `PageScrape`; the
// scorer never performs I/O.
//
// v1 reframes the on-page measurements into the book's model (LLM Visibility
// Stack): three SCORED on-page pillars (Foundation / Validation / Ingestion),
// a crawler-access ELIGIBILITY GATE (light, not a composite component), a
// weakest-pillar BOTTLENECK, and a maturity rung capped at "Recognized" — the
// honest ceiling for an on-page-only audit. The off-domain pillars (Search
// Mentions et al.) are surfaced as a roadmap, never scored from one URL.

export interface Heading {
  level: number; // 1..6
  text: string;
}

export interface PageLink {
  href: string;
  rel: string | null;
  text: string;
  external: boolean; // resolved at scrape time: does href leave the audited domain?
}

/** A parsed JSON-LD block (one <script type="application/ld+json"> payload). */
export type JsonLdBlock = Record<string, unknown>;

export interface RobotsInfo {
  fetched: boolean;
  raw: string | null;
}

/** Per-bot crawler-access probe result. */
export interface BotAccess {
  bot: string; // "GPTBot" | "ClaudeBot" | "Google-Extended" | ...
  allowedByRobots: boolean; // robots.txt does NOT disallow this bot
  fetchStatus: number | null; // status when fetching the page with this bot's UA (null = not attempted)
}

/** Normalized scrape of the audited URL plus site-wide signals. */
export interface PageScrape {
  url: string;
  finalUrl: string;
  statusCode: number;
  lang: string | null;
  title: string | null;
  metaDescription: string | null;
  text: string; // visible text content
  headings: Heading[];
  jsonLd: JsonLdBlock[];
  links: PageLink[];
  blockquotes: number; // count of <blockquote> elements
  publishedDate: string | null; // ISO-ish, from meta/JSON-LD
  modifiedDate: string | null;
  author: string | null;
  robots: RobotsInfo;
  botAccess: BotAccess[];
}

// ---------- Atomic on-page measurements ----------
// These are the deterministic units of measurement. They roll up into pillars
// (see PillarKey). `crawler_access` is measured but feeds the eligibility gate,
// not the composite — the book treats crawler mechanics as table-stakes hygiene.

export type CategoryKey =
  | "schema"
  | "entity"
  | "author_trust"
  | "citations"
  | "answer_format"
  | "freshness"
  | "brand"
  | "crawler_access";

export interface CategoryResult {
  key: CategoryKey;
  label: string;
  points: number;
  maxPoints: number;
  evidence: string[]; // human-readable findings / punch-list items
}

// ---------- Pillars (the book's on-page scoreboard) ----------

export type PillarKey = "foundation" | "validation" | "ingestion";

export interface PillarResult {
  key: PillarKey;
  label: string; // "Foundation"
  /** The AI-era pillar this on-page slice is a proxy for. */
  aiPillar: string; // "Citations Consistency"
  readiness: number; // 0..100, this pillar's on-page readiness
  weight: number; // contribution to the composite (0..1)
  categories: CategoryResult[]; // the atomic measurements feeding this pillar
  isBottleneck: boolean; // the weakest pillar (book: fix this first)
}

// ---------- Maturity ladder (capped at Recognized in v1) ----------

export type MaturityRung =
  | "invisible"
  | "recognized"
  | "referenced"
  | "authoritative"
  | "default_source";

export interface LockedRung {
  rung: MaturityRung;
  label: string;
  /** Why an on-page audit can't award this rung — what off-domain signal it needs. */
  requires: string;
}

export interface MaturityResult {
  rung: MaturityRung; // never above "recognized" in v1
  label: string;
  /** true when the page reached the on-page ceiling (Recognized). */
  ceilingReached: boolean;
  /** Rungs 3-5, always locked in v1, with the off-domain signal each needs. */
  lockedRungs: LockedRung[];
  caveat: string;
}

// ---------- Eligibility gate (crawler access) ----------

export interface EligibilityResult {
  eligible: boolean; // can the major AI answer engines retrieve this page at all?
  reason: string;
  detail: CategoryResult; // the crawler_access measurement (kept for the fix-list)
}

// ---------- Off-domain roadmap (NOT scored in v1) ----------

export interface RoadmapPillar {
  name: string; // "Search Mentions"
  stackLayer: string; // "Engine"
  why: string; // why it's off-domain / unscorable from one URL
  plannedVersion: string; // "v1.x"
}

export type Tier = "none" | "certified" | "gold";

export interface ScoreResult {
  composite: number; // 0..100, weighted blend of pillar readiness
  tier: Tier; // headline credential (gated by composite + per-pillar floor + eligibility)
  pillars: PillarResult[]; // the 3 scored on-page pillars
  bottleneck: PillarKey; // weakest pillar — what to fix first
  maturity: MaturityResult;
  eligibility: EligibilityResult;
  roadmap: RoadmapPillar[]; // off-domain pillars shown as roadmap, not scored
  scoredAt: string; // ISO timestamp
}
