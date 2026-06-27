import { describe, it, expect } from "vitest";
import { formatReport, batchToCsv, type BatchRow } from "./format";
import { scoreSite } from "../scorer";
import type { PageScrape } from "../scorer/types";

// A minimal but realistic scrape so scoreSite produces a full result to render.
function scrape(over: Partial<PageScrape> = {}): PageScrape {
  return {
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    statusCode: 200,
    lang: "en",
    title: "Example",
    metaDescription: "An example page about widgets and gadgets for testing.",
    text: "Adoption grew 45% to $1,000,000 across 12,000 users.",
    headings: [{ level: 1, text: "Example" }, { level: 2, text: "What is it?" }],
    jsonLd: [{ "@type": "Organization", name: "Example", sameAs: ["https://x.com/e"] }],
    links: [{ href: "https://wiki.org/a", rel: null, text: "src", external: true }],
    blockquotes: 1,
    publishedDate: "2026-06-01",
    modifiedDate: "2026-06-01",
    author: "Jane",
    robots: { fetched: true, raw: "" },
    botAccess: [
      { bot: "GPTBot", allowedByRobots: true, fetchStatus: 200 },
      { bot: "ClaudeBot", allowedByRobots: true, fetchStatus: 200 },
      { bot: "Google-Extended", allowedByRobots: true, fetchStatus: 200 },
    ],
    ...over,
  };
}

describe("formatReport", () => {
  const out = formatReport(scoreSite(scrape(), { now: new Date("2026-06-15") }), "https://example.com/");

  it("shows the URL, composite score, and tier", () => {
    expect(out).toContain("https://example.com/");
    expect(out).toMatch(/composite/i);
    expect(out).toMatch(/tier/i);
  });

  it("marks the bottleneck pillar", () => {
    expect(out).toMatch(/bottleneck/i);
  });

  it("surfaces the eligibility verdict", () => {
    expect(out).toMatch(/eligib/i);
  });

  it("lists per-category evidence as a punch list", () => {
    // freshness evidence string should appear somewhere
    expect(out).toMatch(/Updated \d+ days ago/);
  });
});

describe("batchToCsv", () => {
  const rows: BatchRow[] = [
    { url: "https://a.com/", composite: 72, tier: "certified", bottleneck: "ingestion", eligible: true, maturity: "recognized" },
    { url: "https://b.com/", composite: 88, tier: "gold", bottleneck: "validation", eligible: true, maturity: "recognized" },
    { url: "https://err.com/", composite: null, tier: null, bottleneck: null, eligible: null, maturity: null, error: "site unreachable, retry" },
  ];

  const csv = batchToCsv(rows);
  const lines = csv.trim().split("\n");

  it("emits a header row", () => {
    expect(lines[0]).toMatch(/^url,composite,tier,bottleneck,eligible,maturity,error/);
  });

  it("rank-orders scored rows by composite descending", () => {
    expect(lines[1]).toContain("https://b.com/"); // 88 first
    expect(lines[2]).toContain("https://a.com/"); // 72 second
  });

  it("places error rows (no composite) last", () => {
    expect(lines[3]).toContain("https://err.com/");
  });

  it("escapes fields containing commas by quoting them", () => {
    expect(csv).toContain('"site unreachable, retry"');
  });

  it("renders a missing composite as an empty cell, not 0 or null", () => {
    const errLine = lines[3]!;
    // url, then empty composite cell
    expect(errLine.startsWith("https://err.com/,,")).toBe(true);
  });
});

describe("batchToCsv — spreadsheet safety", () => {
  it("defangs formula-injection in operator/remote-derived cells", () => {
    const rows: BatchRow[] = [
      { url: "=1+1", composite: 5, tier: "none", bottleneck: "foundation", eligible: true, maturity: "invisible" },
      { url: "https://ok.com/", composite: null, tier: null, bottleneck: null, eligible: null, maturity: null, error: "+cmd|calc" },
    ];
    const csv = batchToCsv(rows);
    // No cell may begin (at line-start or right after a comma) with a formula trigger.
    expect(csv).not.toMatch(/(?:^|,)=1\+1/m);
    expect(csv).not.toMatch(/(?:^|,)\+cmd\|calc/m);
  });

  it("quotes a value containing a lone carriage return", () => {
    const rows: BatchRow[] = [
      { url: "a\rb", composite: 1, tier: "none", bottleneck: "foundation", eligible: true, maturity: "invisible" },
    ];
    expect(batchToCsv(rows)).toContain('"a\rb"');
  });
});
