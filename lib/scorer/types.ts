// Input/output contract for the deterministic LLM Visibility scorer.
// The scorer is a PURE function over a normalized page scrape, so it is fully
// testable offline. Firecrawl (or any scraper) produces a `PageScrape`; the
// scorer never performs I/O.

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

export type CategoryKey =
  | "schema"
  | "citations"
  | "eeat"
  | "crawler_access"
  | "answer_format"
  | "freshness"
  | "brand";

export interface CategoryResult {
  key: CategoryKey;
  label: string;
  points: number;
  maxPoints: number;
  evidence: string[]; // human-readable findings / punch-list items
}

export type Tier = "none" | "certified" | "gold";

export interface ScoreResult {
  composite: number; // 0..100
  tier: Tier;
  categories: CategoryResult[];
  scoredAt: string; // ISO timestamp
}
