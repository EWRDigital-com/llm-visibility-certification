// Composite LLM Visibility Score™ — sums the seven deterministic category scorers.
// maxPoints across categories sum to 100, so composite == total points (0-100).

import type { PageScrape, ScoreResult, Tier, CategoryResult } from "./types";
import {
  scoreSchema,
  scoreCitations,
  scoreEeat,
  scoreCrawlerAccess,
  scoreAnswerFormat,
  scoreFreshness,
  scoreBrand,
} from "./criteria";

/** Tier bands (provisional, tuned in /spec): <60 none, 60-79 Certified, 80-100 Gold. */
export function tierFor(composite: number): Tier {
  if (composite >= 80) return "gold";
  if (composite >= 60) return "certified";
  return "none";
}

export interface ScoreOptions {
  /** Injected for deterministic freshness scoring + scoredAt; defaults to now. */
  now?: Date;
}

export function scoreSite(scrape: PageScrape, opts: ScoreOptions = {}): ScoreResult {
  const now = opts.now ?? new Date();
  const categories: CategoryResult[] = [
    scoreSchema(scrape),
    scoreCitations(scrape),
    scoreEeat(scrape),
    scoreCrawlerAccess(scrape),
    scoreAnswerFormat(scrape),
    scoreFreshness(scrape, now),
    scoreBrand(scrape),
  ];
  const totalPoints = categories.reduce((a, c) => a + c.points, 0);
  const totalMax = categories.reduce((a, c) => a + c.maxPoints, 0);
  const composite = Math.round((totalPoints / totalMax) * 100);
  return { composite, tier: tierFor(composite), categories, scoredAt: now.toISOString() };
}

export * from "./types";
export * from "./criteria";
