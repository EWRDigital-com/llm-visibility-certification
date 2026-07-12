import { describe, it, expect } from "vitest";
import { htmlToScrape, hasScorableContent, type ScrapeContext } from "./parse";

const ctx: ScrapeContext = {
  url: "https://example.com/post",
  finalUrl: "https://example.com/post",
  statusCode: 200,
  robots: { fetched: true, raw: "" },
  botAccess: [{ bot: "GPTBot", allowedByRobots: true, fetchStatus: 200 }],
};

const FULL_HTML = `<!doctype html>
<html lang="en-US">
<head>
  <title>How LLM Visibility Works</title>
  <meta name="description" content="A guide to getting cited by AI answer engines and large language models.">
  <meta name="author" content="Matt Bertram">
  <meta property="article:published_time" content="2026-01-10T08:00:00Z">
  <meta property="article:modified_time" content="2026-06-01T08:00:00Z">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@graph":[
    {"@type":"Organization","name":"LLM Visibility","sameAs":["https://www.linkedin.com/x"]},
    {"@type":"Article","headline":"How LLM Visibility Works"}
  ]}
  </script>
  <script type="application/ld+json">{ this is not valid json }</script>
</head>
<body>
  <h1>How LLM Visibility Works</h1>
  <h2>What is answer engine optimization?</h2>
  <h3>Why entities matter</h3>
  <p>Adoption grew 45% and the market hit $12,000,000 last year.</p>
  <blockquote>Models reuse what they can retrieve.</blockquote>
  <a href="/about">About us</a>
  <a href="https://wikipedia.org/wiki/LLM" rel="nofollow">External source</a>
  <a href="mailto:hi@example.com">Email</a>
  <script>var hidden = "should not appear in text";</script>
</body>
</html>`;

describe("htmlToScrape — full page", () => {
  const s = htmlToScrape(FULL_HTML, ctx);

  it("passes context fields through unchanged", () => {
    expect(s.url).toBe("https://example.com/post");
    expect(s.finalUrl).toBe("https://example.com/post");
    expect(s.statusCode).toBe(200);
    expect(s.robots.fetched).toBe(true);
    expect(s.botAccess[0]?.bot).toBe("GPTBot");
  });

  it("extracts lang, title, and meta description", () => {
    expect(s.lang).toBe("en-US");
    expect(s.title).toBe("How LLM Visibility Works");
    expect(s.metaDescription).toBe(
      "A guide to getting cited by AI answer engines and large language models."
    );
  });

  it("extracts headings with levels", () => {
    expect(s.headings).toEqual([
      { level: 1, text: "How LLM Visibility Works" },
      { level: 2, text: "What is answer engine optimization?" },
      { level: 3, text: "Why entities matter" },
    ]);
  });

  it("parses valid JSON-LD blocks and skips invalid ones", () => {
    expect(s.jsonLd).toHaveLength(1);
    const graph = s.jsonLd[0]?.["@graph"] as unknown[];
    expect(Array.isArray(graph)).toBe(true);
    expect(graph).toHaveLength(2);
  });

  it("extracts links with rel and external resolution", () => {
    const about = s.links.find((l) => l.href.includes("/about"));
    const ext = s.links.find((l) => l.href.includes("wikipedia"));
    expect(about?.external).toBe(false);
    expect(about?.text).toBe("About us");
    expect(ext?.external).toBe(true);
    expect(ext?.rel).toBe("nofollow");
  });

  it("counts blockquotes", () => {
    expect(s.blockquotes).toBe(1);
  });

  it("captures visible text but not script contents", () => {
    expect(s.text).toContain("Adoption grew 45%");
    expect(s.text).not.toContain("should not appear");
  });

  it("reads published and modified dates from meta tags", () => {
    expect(s.publishedDate).toBe("2026-01-10T08:00:00Z");
    expect(s.modifiedDate).toBe("2026-06-01T08:00:00Z");
  });

  it("reads author from meta", () => {
    expect(s.author).toBe("Matt Bertram");
  });
});

describe("htmlToScrape — JSON-LD fallbacks", () => {
  it("falls back to JSON-LD for dates and author when meta is absent", () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {"@type":"Article","datePublished":"2025-03-01","dateModified":"2025-09-09",
       "author":{"@type":"Person","name":"Jane Doe"}}
      </script></head><body><h1>x</h1></body></html>`;
    const s = htmlToScrape(html, ctx);
    expect(s.publishedDate).toBe("2025-03-01");
    expect(s.modifiedDate).toBe("2025-09-09");
    expect(s.author).toBe("Jane Doe");
  });

  it("handles a bare-string JSON-LD author", () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"Article","author":"Bob"}</script>
      </head><body></body></html>`;
    expect(htmlToScrape(html, ctx).author).toBe("Bob");
  });
});

describe("htmlToScrape — minimal/empty page", () => {
  it("returns nulls and empty arrays without throwing", () => {
    const s = htmlToScrape("<html><body></body></html>", ctx);
    expect(s.lang).toBeNull();
    expect(s.title).toBeNull();
    expect(s.metaDescription).toBeNull();
    expect(s.headings).toEqual([]);
    expect(s.jsonLd).toEqual([]);
    expect(s.links).toEqual([]);
    expect(s.blockquotes).toBe(0);
    expect(s.publishedDate).toBeNull();
    expect(s.modifiedDate).toBeNull();
    expect(s.author).toBeNull();
  });

  it("resolves external links relative to finalUrl host, not the requested url", () => {
    // finalUrl is on a different host than ctx.url (a redirect); links resolve to finalUrl.
    const redirected: ScrapeContext = { ...ctx, finalUrl: "https://docs.example.org/p" };
    const html = `<html><body><a href="/internal">i</a><a href="https://example.com/x">o</a></body></html>`;
    const s = htmlToScrape(html, redirected);
    expect(s.links.find((l) => l.href.includes("/internal"))?.external).toBe(false);
    expect(s.links.find((l) => l.href.includes("example.com"))?.external).toBe(true);
  });
});

describe("hasScorableContent — shell / JS-wall detection", () => {
  it("treats a real content page as scorable", () => {
    expect(hasScorableContent(htmlToScrape(FULL_HTML, ctx))).toBe(true);
  });

  it("treats an empty body as not scorable (so the caller errors instead of fabricating a 0)", () => {
    expect(hasScorableContent(htmlToScrape("<html><body></body></html>", ctx))).toBe(false);
  });

  it("treats a JS-challenge shell (title only, no structure, trivial text) as not scorable", () => {
    const shell = `<html><head><title>Just a moment...</title></head>
      <body><div>Checking your browser before accessing the site.</div></body></html>`;
    expect(hasScorableContent(htmlToScrape(shell, ctx))).toBe(false);
  });

  it("counts structured data as scorable even with little visible text", () => {
    const jsonOnly = `<html><head>
      <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
      </head><body></body></html>`;
    expect(hasScorableContent(htmlToScrape(jsonOnly, ctx))).toBe(true);
  });

  it("counts a page with real headings as scorable even with little text", () => {
    const headed = `<html><body><h1>About Acme</h1><h2>What we do</h2></body></html>`;
    expect(hasScorableContent(htmlToScrape(headed, ctx))).toBe(true);
  });

  it("treats a hydration shell (nav boilerplate, NO headings, NO structured data) as not scorable", () => {
    // Britannica / Cloudflare-learning return this to a non-JS fetch: lots of nav
    // text but zero headings and zero JSON-LD. Real readable pages always have at
    // least one heading or schema — boilerplate text alone must NOT count.
    const navShell = `<html><body><nav>${"Home Products Pricing About Blog Careers Contact Login Sign up ".repeat(20)}</nav></body></html>`;
    expect(hasScorableContent(htmlToScrape(navShell, ctx))).toBe(false);
  });
});
