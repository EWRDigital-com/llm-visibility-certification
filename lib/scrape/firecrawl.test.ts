import { describe, it, expect } from "vitest";
import { parseFirecrawlScrape, ScrapeError } from "./firecrawl";

const REQ = "https://example.com/post";

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
