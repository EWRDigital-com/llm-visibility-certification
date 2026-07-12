import { describe, it, expect } from "vitest";
import { parseFirecrawlScrape, scrapeUrl, ScrapeError, isTargetScrapeError } from "./firecrawl";

const REQ = "https://example.com/post";

/** A fetch stand-in: robots.txt gets `robots`, everything else gets `body` (HTTP 200). */
function fakeFetch(body: string, robots = ""): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) {
      return new Response(robots, { status: robots ? 200 : 404 });
    }
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

describe("parseFirecrawlScrape", () => {
  it("extracts rawHtml, statusCode, and finalUrl from a valid response", () => {
    const json = {
      success: true,
      data: {
        rawHtml: "<html><body>hi</body></html>",
        metadata: { statusCode: 200, sourceURL: "https://example.com/post" },
      },
    };
    const r = parseFirecrawlScrape(json, REQ);
    expect(r.rawHtml).toContain("hi");
    expect(r.statusCode).toBe(200);
    expect(r.finalUrl).toBe("https://example.com/post");
  });

  it("throws ScrapeError when success is false (failure must not become a 0-score)", () => {
    const json = { success: false, error: "site unreachable" };
    expect(() => parseFirecrawlScrape(json, REQ)).toThrow(ScrapeError);
  });

  it("throws ScrapeError when rawHtml is missing", () => {
    const json = { success: true, data: { metadata: { statusCode: 200 } } };
    expect(() => parseFirecrawlScrape(json, REQ)).toThrow(ScrapeError);
  });

  it("preserves a non-200 status when HTML is still returned (e.g. 404 page)", () => {
    const json = {
      success: true,
      data: { rawHtml: "<html>404</html>", metadata: { statusCode: 404, sourceURL: REQ } },
    };
    expect(parseFirecrawlScrape(json, REQ).statusCode).toBe(404);
  });

  it("prefers metadata.url, then sourceURL, then the requested url for finalUrl", () => {
    const withUrl = parseFirecrawlScrape(
      { success: true, data: { rawHtml: "<i>x</i>", metadata: { url: "https://a.com/", sourceURL: "https://b.com/" } } },
      REQ
    );
    expect(withUrl.finalUrl).toBe("https://a.com/");

    const withSource = parseFirecrawlScrape(
      { success: true, data: { rawHtml: "<i>x</i>", metadata: { sourceURL: "https://b.com/" } } },
      REQ
    );
    expect(withSource.finalUrl).toBe("https://b.com/");

    const neither = parseFirecrawlScrape(
      { success: true, data: { rawHtml: "<i>x</i>", metadata: {} } },
      REQ
    );
    expect(neither.finalUrl).toBe(REQ);
  });

  it("defaults statusCode to 200 when HTML is present but status is absent", () => {
    const json = { success: true, data: { rawHtml: "<html>ok</html>", metadata: {} } };
    expect(parseFirecrawlScrape(json, REQ).statusCode).toBe(200);
  });

  it("throws ScrapeError on a malformed (non-object) response", () => {
    expect(() => parseFirecrawlScrape(null, REQ)).toThrow(ScrapeError);
    expect(() => parseFirecrawlScrape("nope", REQ)).toThrow(ScrapeError);
  });
});

describe("scrapeUrl — unscorable-content guard", () => {
  it("throws ScrapeError on a 2xx JS/anti-bot shell instead of returning a fabricated 0", async () => {
    const shell =
      "<html><head><title>Just a moment...</title></head><body><div>Enable JavaScript to continue.</div></body></html>";
    await expect(scrapeUrl("https://spa.example/", { fetchImpl: fakeFetch(shell) })).rejects.toThrow(ScrapeError);
  });

  it("returns a PageScrape for a real, server-rendered content page", async () => {
    const html = `<html><body><h1>Real Page</h1><p>${"content ".repeat(40)}</p></body></html>`;
    const s = await scrapeUrl("https://real.example/", { fetchImpl: fakeFetch(html, "User-agent: *\nAllow: /") });
    expect(s.headings[0]?.text).toBe("Real Page");
    expect(s.statusCode).toBe(200);
  });

  it("throws ScrapeError on a non-2xx page from the free fetch (block/missing) instead of scoring 0", async () => {
    // Real content in the body, but HTTP 403 — the free fetch was blocked, so we
    // did NOT retrieve the live page. Must be unscorable, not a fabricated 0.
    const blocked = (async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response("<html><body><h1>Access Denied</h1><p>blocked</p></body></html>", { status: 403 });
    }) as typeof fetch;
    await expect(scrapeUrl("https://g2-like.example/", { fetchImpl: blocked })).rejects.toThrow(ScrapeError);
  });
});

describe("isTargetScrapeError — who owns the failure (drives the API's 502 vs 503)", () => {
  it("classifies user-page failures (block / non-2xx / shell / empty) as target issues", () => {
    const targetMsgs = [
      "https://x/ returned HTTP 403 to a direct fetch — the live page wasn't retrievable (...)",
      "https://x/ returned no scorable content — the page is likely JavaScript-rendered or behind an anti-bot wall.",
      "https://x/ is unreachable — it may be offline or blocking automated visitors (timeout)",
      "No HTML returned for https://x/ — site unreachable or empty",
      "Firecrawl could not scrape https://x/: site unreachable",
    ];
    for (const m of targetMsgs) expect(isTargetScrapeError(m)).toBe(true);
  });

  it("classifies our-side scraper/capacity failures as NOT target issues", () => {
    const capacityMsgs = [
      "Firecrawl HTTP 402 for https://x/",
      "Firecrawl HTTP 429 for https://x/",
      "Firecrawl request failed for https://x/: network down",
      "Firecrawl returned a malformed response for https://x/",
    ];
    for (const m of capacityMsgs) expect(isTargetScrapeError(m)).toBe(false);
  });
});
