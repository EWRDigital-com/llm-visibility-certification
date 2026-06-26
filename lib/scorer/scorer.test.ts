import { describe, it, expect } from "vitest";
import { scoreSite, tierFor } from "./index";
import { scoreSchema, scoreCrawlerAccess, scoreFreshness, scoreEeat } from "./criteria";
import type { PageScrape } from "./types";

const NOW = new Date("2026-06-26T00:00:00Z");

/** A strong, LLM-visibility-ready page (should certify Gold). */
function goodScrape(): PageScrape {
  return {
    url: "https://acme.example/",
    finalUrl: "https://acme.example/",
    statusCode: 200,
    lang: "en",
    title: "Acme Robotics — Industrial Automation Experts",
    metaDescription:
      "Acme Robotics builds industrial automation systems for manufacturing plants, with 30 years of proven results.",
    text: "Acme grew output by 45% and cut costs by $2,000,000. Over 1,200 plants trust us. Studies show 30 percent gains.",
    headings: [
      { level: 1, text: "Acme Robotics — Industrial Automation" },
      { level: 2, text: "What is industrial automation?" },
      { level: 2, text: "How does Acme improve output?" },
      { level: 3, text: "Case studies" },
    ],
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "Acme Robotics", sameAs: ["https://linkedin.com/company/acme", "https://x.com/acme"] },
          { "@type": "Article", author: { "@type": "Person", name: "Jane Doe" } },
          { "@type": "FAQPage" },
        ],
      },
    ],
    links: [
      { href: "https://nist.gov/automation", rel: null, text: "NIST", external: true },
      { href: "https://ieee.org/report", rel: null, text: "IEEE", external: true },
      { href: "https://acme.example/about", rel: null, text: "About", external: false },
    ],
    blockquotes: 2,
    publishedDate: "2026-05-01",
    modifiedDate: "2026-06-01",
    author: "Jane Doe",
    robots: { fetched: true, raw: "User-agent: *\nAllow: /" },
    botAccess: [
      { bot: "GPTBot", allowedByRobots: true, fetchStatus: 200 },
      { bot: "ClaudeBot", allowedByRobots: true, fetchStatus: 200 },
      { bot: "Google-Extended", allowedByRobots: true, fetchStatus: 200 },
    ],
  };
}

/** A near-empty page that blocks AI crawlers (should not certify). */
function minimalScrape(): PageScrape {
  return {
    url: "https://nobody.test/",
    finalUrl: "https://nobody.test/",
    statusCode: 200,
    lang: null,
    title: "Home",
    metaDescription: null,
    text: "Welcome to our website.",
    headings: [],
    jsonLd: [],
    links: [],
    blockquotes: 0,
    publishedDate: null,
    modifiedDate: null,
    author: null,
    robots: { fetched: true, raw: "User-agent: *\nDisallow: /" },
    botAccess: [
      { bot: "GPTBot", allowedByRobots: false, fetchStatus: 200 },
      { bot: "ClaudeBot", allowedByRobots: false, fetchStatus: 200 },
      { bot: "Google-Extended", allowedByRobots: false, fetchStatus: 200 },
    ],
  };
}

describe("scoreSite — composite + tiers", () => {
  it("certifies a strong page as Gold (>= 80)", () => {
    const r = scoreSite(goodScrape(), { now: NOW });
    expect(r.composite).toBeGreaterThanOrEqual(80);
    expect(r.tier).toBe("gold");
    expect(r.categories).toHaveLength(7);
    expect(r.scoredAt).toBe(NOW.toISOString());
  });

  it("does not certify a near-empty, crawler-blocked page", () => {
    const r = scoreSite(minimalScrape(), { now: NOW });
    expect(r.composite).toBeLessThan(60);
    expect(r.tier).toBe("none");
  });

  it("composite never exceeds 100 or drops below 0", () => {
    for (const s of [goodScrape(), minimalScrape()]) {
      const r = scoreSite(s, { now: NOW });
      expect(r.composite).toBeGreaterThanOrEqual(0);
      expect(r.composite).toBeLessThanOrEqual(100);
    }
  });
});

describe("tierFor — band boundaries", () => {
  it.each([
    [0, "none"],
    [59, "none"],
    [60, "certified"],
    [79, "certified"],
    [80, "gold"],
    [100, "gold"],
  ] as const)("score %i -> %s", (score, tier) => {
    expect(tierFor(score)).toBe(tier);
  });
});

describe("scoreSchema", () => {
  it("awards full marks for Org + Article + FAQ schema", () => {
    const r = scoreSchema(goodScrape());
    expect(r.points).toBe(20);
  });
  it("scores zero with no JSON-LD and lists the gaps", () => {
    const r = scoreSchema(minimalScrape());
    expect(r.points).toBe(0);
    expect(r.evidence.join(" ")).toMatch(/No JSON-LD/);
  });
});

describe("scoreCrawlerAccess", () => {
  it("full marks when all target bots are allowed and fetch 200", () => {
    expect(scoreCrawlerAccess(goodScrape()).points).toBe(20);
  });
  it("halves the score and flags BLOCKED when robots disallows the bots", () => {
    const r = scoreCrawlerAccess(minimalScrape());
    expect(r.points).toBe(10); // robots 0/3, fetch 3/3 -> 0 + 10
    expect(r.evidence.join(" ")).toMatch(/BLOCKED by robots\.txt/);
  });
});

describe("scoreFreshness", () => {
  it("gives full marks for content updated within 180 days", () => {
    expect(scoreFreshness(goodScrape(), NOW).points).toBe(5);
  });
  it("gives zero for stale content (> 2 years)", () => {
    const stale = { ...goodScrape(), modifiedDate: "2023-01-01", publishedDate: "2023-01-01" };
    expect(scoreFreshness(stale, NOW).points).toBe(0);
  });
  it("gives zero and a note when no date is present", () => {
    const r = scoreFreshness(minimalScrape(), NOW);
    expect(r.points).toBe(0);
    expect(r.evidence.join(" ")).toMatch(/No published\/modified date/);
  });
});

describe("scoreEeat", () => {
  it("rewards author + sameAs + about + org", () => {
    expect(scoreEeat(goodScrape()).points).toBe(15);
  });
});
