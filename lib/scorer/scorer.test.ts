import { describe, it, expect } from "vitest";
import { scoreSite, tierFor, bandFor } from "./index";
import { scoreSchema, scoreFreshness, scoreEntity, scoreAuthorTrust, scoreCrawlerAccess } from "./criteria";
import type { PageScrape, PillarResult, PillarKey } from "./types";

const NOW = new Date("2026-06-26T00:00:00Z");

/** A strong, LLM-visibility-ready page (should certify Gold, rung Recognized). */
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

/** A near-empty page that blocks AI crawlers (ineligible → not certifiable). */
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

/** Strong entity Foundation, but no proof/formatting — eligible & legible, not certifiable. */
function foundationOnlyScrape(): PageScrape {
  return {
    url: "https://acme.example/",
    finalUrl: "https://acme.example/",
    statusCode: 200,
    lang: "en",
    title: "Acme Robotics",
    metaDescription: null,
    text: "Acme Robotics.",
    headings: [],
    jsonLd: [
      { "@context": "https://schema.org", "@type": "Organization", name: "Acme Robotics", sameAs: ["https://linkedin.com/company/acme", "https://x.com/acme"] },
    ],
    links: [{ href: "https://acme.example/about", rel: null, text: "About", external: false }],
    blockquotes: 0,
    publishedDate: null,
    modifiedDate: null,
    author: null,
    robots: { fetched: true, raw: "User-agent: *\nAllow: /" },
    botAccess: [
      { bot: "GPTBot", allowedByRobots: true, fetchStatus: 200 },
      { bot: "ClaudeBot", allowedByRobots: true, fetchStatus: 200 },
    ],
  };
}

const pill = (key: PillarKey, readiness: number, weight: number): PillarResult => ({
  key,
  label: key,
  aiPillar: "",
  readiness,
  weight,
  categories: [],
  isBottleneck: false,
});

describe("scoreSite — composite, pillars, tier", () => {
  it("certifies a strong page as Gold with three pillars", () => {
    const r = scoreSite(goodScrape(), { now: NOW });
    expect(r.composite).toBeGreaterThanOrEqual(80);
    expect(r.tier).toBe("gold");
    expect(r.pillars).toHaveLength(3);
    expect(r.pillars.map((p) => p.key)).toEqual(["foundation", "validation", "ingestion"]);
    expect(r.scoredAt).toBe(NOW.toISOString());
  });

  it("rolls atomic measurements into the right pillar readiness", () => {
    const r = scoreSite(goodScrape(), { now: NOW });
    const byKey = Object.fromEntries(r.pillars.map((p) => [p.key, p.readiness]));
    expect(byKey.foundation).toBe(100); // schema 20 + entity 10 + brand 10
    expect(byKey.validation).toBe(80); // citations 11 + author 5 of 20
    expect(byKey.ingestion).toBe(100); // answer_format 15 + freshness 5
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

describe("scoreSite — bottleneck (weakest pillar)", () => {
  it("names the weakest pillar as the bottleneck", () => {
    const r = scoreSite(goodScrape(), { now: NOW });
    expect(r.bottleneck).toBe("validation"); // 80 vs 100/100
    const flagged = r.pillars.filter((p) => p.isBottleneck);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.key).toBe("validation");
  });

  it("tie-breaks an all-zero page toward the most foundational pillar", () => {
    const r = scoreSite(minimalScrape(), { now: NOW });
    expect(r.bottleneck).toBe("foundation");
  });
});

describe("scoreSite — eligibility gate", () => {
  it("flags a page whose robots.txt blocks the answer-engine bots as ineligible", () => {
    const r = scoreSite(minimalScrape(), { now: NOW });
    expect(r.eligibility.eligible).toBe(false);
    expect(r.eligibility.reason).toMatch(/robots\.txt blocks/);
  });

  it("a crawler-blocked page cannot certify, even with strong on-page signals", () => {
    const blocked: PageScrape = {
      ...goodScrape(),
      botAccess: [
        { bot: "GPTBot", allowedByRobots: false, fetchStatus: 200 },
        { bot: "ClaudeBot", allowedByRobots: false, fetchStatus: 200 },
        { bot: "Google-Extended", allowedByRobots: false, fetchStatus: 200 },
      ],
    };
    const r = scoreSite(blocked, { now: NOW });
    expect(r.composite).toBeGreaterThanOrEqual(80); // on-page is strong
    expect(r.eligibility.eligible).toBe(false); // but unreachable
    expect(r.tier).toBe("none"); // gate wins
    expect(r.maturity.rung).toBe("invisible");
  });

  it("treats a non-200 page as not retrievable", () => {
    const r = scoreSite({ ...goodScrape(), statusCode: 404 }, { now: NOW });
    expect(r.eligibility.eligible).toBe(false);
    expect(r.eligibility.reason).toMatch(/HTTP 404/);
  });
});

describe("scoreSite — maturity ladder (capped at Recognized)", () => {
  it("places a strong, retrievable page at Recognized and locks rungs 3-5", () => {
    const r = scoreSite(goodScrape(), { now: NOW });
    expect(r.maturity.rung).toBe("recognized");
    expect(r.maturity.ceilingReached).toBe(true);
    expect(r.maturity.lockedRungs.map((l) => l.rung)).toEqual(["referenced", "authoritative", "default_source"]);
    expect(r.maturity.lockedRungs.every((l) => /off-domain/i.test(l.requires))).toBe(true);
  });

  it("reaches Recognized on a strong Foundation even when the composite is too low to certify", () => {
    const r = scoreSite(foundationOnlyScrape(), { now: NOW });
    expect(r.composite).toBeLessThan(60); // not certifiable
    expect(r.tier).toBe("none");
    expect(r.eligibility.eligible).toBe(true); // retrievable + entity is legible
    expect(r.maturity.rung).toBe("recognized"); // rung is decoupled from the cert tier
  });

  it("never awards a rung above Recognized from an on-page audit", () => {
    const ABOVE = new Set(["referenced", "authoritative", "default_source"]);
    for (const s of [goodScrape(), minimalScrape()]) {
      expect(ABOVE.has(scoreSite(s, { now: NOW }).maturity.rung)).toBe(false);
    }
  });
});

describe("scoreSite — off-domain roadmap", () => {
  it("surfaces off-domain pillars as roadmap, not scored", () => {
    const r = scoreSite(goodScrape(), { now: NOW });
    expect(r.roadmap.length).toBeGreaterThanOrEqual(1);
    expect(r.roadmap.map((p) => p.name)).toContain("Search Mentions");
    expect(r.roadmap.every((p) => p.plannedVersion === "v1.x")).toBe(true);
  });
});

describe("bandFor — pure composite → band", () => {
  it.each([
    [0, "none"],
    [59, "none"],
    [60, "certified"],
    [79, "certified"],
    [80, "gold"],
    [100, "gold"],
  ] as const)("score %i -> %s", (score, band) => {
    expect(bandFor(score)).toBe(band);
  });
});

describe("tierFor — eligibility gate + per-pillar floor", () => {
  const strong = [pill("foundation", 100, 0.4), pill("validation", 100, 0.35), pill("ingestion", 100, 0.25)];

  it("ineligible always yields none, regardless of composite", () => {
    expect(tierFor(95, strong, false)).toBe("none");
  });

  it("a dead pillar (<50) blocks Gold, dropping it to Certified", () => {
    const lopsided = [pill("foundation", 100, 0.4), pill("validation", 100, 0.35), pill("ingestion", 40, 0.25)];
    expect(tierFor(85, lopsided, true)).toBe("certified");
  });

  it("a critically dead pillar (<40) blocks certification entirely", () => {
    const starved = [pill("foundation", 100, 0.4), pill("validation", 100, 0.35), pill("ingestion", 20, 0.25)];
    expect(tierFor(85, starved, true)).toBe("none");
  });

  it("balanced + eligible certifies on the composite band", () => {
    expect(tierFor(90, strong, true)).toBe("gold");
    expect(tierFor(70, strong, true)).toBe("certified");
  });
});

// ---------- Atomic measurements (unchanged logic, regrouped) ----------

describe("scoreSchema", () => {
  it("awards full marks for Org + Article + FAQ schema", () => {
    expect(scoreSchema(goodScrape()).points).toBe(20);
  });
  it("scores zero with no JSON-LD and lists the gaps", () => {
    const r = scoreSchema(minimalScrape());
    expect(r.points).toBe(0);
    expect(r.evidence.join(" ")).toMatch(/No JSON-LD/);
  });
});

describe("scoreEntity (Foundation)", () => {
  it("rewards sameAs + about + org name", () => {
    const r = scoreEntity(goodScrape());
    expect(r.points).toBe(10);
    expect(r.key).toBe("entity");
  });
  it("scores zero with no entity signals", () => {
    expect(scoreEntity(minimalScrape()).points).toBe(0);
  });
});

describe("scoreAuthorTrust (Validation)", () => {
  it("rewards confirmed authorship", () => {
    const r = scoreAuthorTrust(goodScrape());
    expect(r.points).toBe(5);
    expect(r.key).toBe("author_trust");
  });
  it("scores zero with no author", () => {
    expect(scoreAuthorTrust(minimalScrape()).points).toBe(0);
  });
});

describe("scoreCrawlerAccess (eligibility detail)", () => {
  it("full marks when all target bots are allowed and fetch 200", () => {
    expect(scoreCrawlerAccess(goodScrape()).points).toBe(20);
  });
  it("flags BLOCKED when robots disallows the bots", () => {
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
