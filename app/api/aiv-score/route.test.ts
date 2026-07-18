import { describe, it, expect, vi, beforeEach } from "vitest";

// A scorable scrape (has JSON-LD + a heading) so scoreSite returns a real result.
const goodScrape = {
  url: "https://example.com",
  finalUrl: "https://example.com",
  statusCode: 200,
  lang: "en",
  title: "Example",
  metaDescription: "d",
  text: "Example Corp is a widget maker. We build widgets. Contact us.",
  headings: [{ level: 1, text: "Example Corp" }],
  jsonLd: [{ "@type": "Organization", name: "Example Corp" }],
  links: [],
  blockquotes: 0,
  publishedDate: null,
  modifiedDate: null,
  author: null,
  robots: { fetched: true, raw: "" },
  botAccess: [
    { bot: "GPTBot", allowedByRobots: true, fetchStatus: 200 },
    { bot: "ClaudeBot", allowedByRobots: true, fetchStatus: 200 },
    { bot: "Google-Extended", allowedByRobots: true, fetchStatus: 200 },
  ],
};

// vi.mock factories are hoisted above the module body, so the mocks' shared state
// (the fake error class + the mutable scrape behaviour) must live in a vi.hoisted
// block that also runs first. Tests mutate `mocks.scrapeImpl` per-case.
const mocks = vi.hoisted(() => {
  class FakeScrapeError extends Error {
    override name = "ScrapeError";
  }
  return {
    FakeScrapeError,
    upsertMock: vi.fn(async () => ({ ok: true })),
    // default set in beforeEach; typed loose to avoid importing PageScrape here
    scrapeImpl: (async () => ({})) as () => Promise<unknown>,
  };
});

vi.mock("../../../lib/crm/ghl.js", () => ({ upsertGhlLead: mocks.upsertMock }));
vi.mock("../../../lib/scrape/firecrawl.js", () => ({
  ScrapeError: mocks.FakeScrapeError,
  isTargetScrapeError: (m: string) =>
    /no HTML|unreachable|no scorable content|to a direct fetch|could not scrape|returned HTTP/i.test(m),
  scrapeUrl: async () => mocks.scrapeImpl(),
}));

const { FakeScrapeError, upsertMock } = mocks;

import { POST, OPTIONS } from "./route.js";

function req(body: unknown) {
  return new Request("http://x/api/aiv-score", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  upsertMock.mockClear();
  mocks.scrapeImpl = async () => goodScrape;
});

describe("POST /api/aiv-score", () => {
  it("400s when consent is not true", async () => {
    const res = await POST(req({ url: "https://example.com", email: "a@b.com", consent: false }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("400s on a bad email", async () => {
    const res = await POST(req({ url: "https://example.com", email: "nope", consent: true }));
    expect(res.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("400s on a non-http URL", async () => {
    const res = await POST(req({ url: "ftp://example.com", email: "a@b.com", consent: true }));
    expect(res.status).toBe(400);
  });

  it("returns the score shape on a good submission", async () => {
    const res = await POST(req({ url: "https://example.com", email: "a@b.com", consent: true }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(typeof j.composite).toBe("number");
    expect(j.pillars).toHaveLength(3);
    expect(["foundation", "validation", "ingestion"]).toContain(j.bottleneck);
    // Each pillar exposes only the safe fields (no rubric weights / evidence).
    for (const p of j.pillars) {
      expect(Object.keys(p).sort()).toEqual(["isBottleneck", "key", "label", "readiness"]);
    }
    expect(j).not.toHaveProperty("maturity");
    expect(j).not.toHaveProperty("roadmap");
  });

  it("captures the lead (GHL upsert) on a good submission", async () => {
    await POST(req({ url: "https://example.com", email: "a@b.com", consent: true }));
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = (upsertMock.mock.calls[0] as unknown as [{ email: string; url: string; composite: number | null }])[0];
    expect(arg.email).toBe("a@b.com");
    expect(typeof arg.composite).toBe("number");
  });

  it("returns an honest unscorable 200 (not a scary 0) for a JS/anti-bot shell, still capturing the lead", async () => {
    mocks.scrapeImpl = async () => {
      throw new FakeScrapeError("https://x.com returned no scorable content — likely JavaScript-rendered.");
    };
    const res = await POST(req({ url: "https://example.com", email: "a@b.com", consent: true }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.unscorable).toBe(true);
    expect(typeof j.reason).toBe("string");
    expect(j).not.toHaveProperty("composite");
    // Lead is still captured with a null composite.
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect((upsertMock.mock.calls[0] as unknown as [{ composite: number | null }])[0].composite).toBeNull();
  });

  it("502s when the scrape fails on OUR side (not a target problem)", async () => {
    mocks.scrapeImpl = async () => {
      throw new FakeScrapeError("Firecrawl request failed for https://x.com: network down");
    };
    const res = await POST(req({ url: "https://example.com", email: "a@b.com", consent: true }));
    expect(res.status).toBe(502);
    // Our-side failure: nothing to capture.
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("answers CORS preflight (OPTIONS) with 204 + the EWR origin", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://www.ewrdigital.com");
  });
});
