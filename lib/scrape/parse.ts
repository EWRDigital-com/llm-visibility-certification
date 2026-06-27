// Pure HTML -> PageScrape transform. No I/O: given raw HTML plus the fields that
// can only come from the network (final URL, status, robots, per-bot access),
// produce the normalized scrape the scorer consumes. Fully offline-testable.

import * as cheerio from "cheerio";
import type { PageScrape, Heading, PageLink, JsonLdBlock, RobotsInfo, BotAccess } from "../scorer/types.js";

/** Network-derived fields the parser can't get from HTML alone. */
export interface ScrapeContext {
  url: string;
  finalUrl: string;
  statusCode: number;
  robots: RobotsInfo;
  botAccess: BotAccess[];
}

function nullIfEmpty(v: string | undefined | null): string | null {
  const t = v?.trim();
  return t ? t : null;
}

/** Parse every <script type="application/ld+json">; skip blocks that don't parse. */
function extractJsonLd($: cheerio.CheerioAPI): JsonLdBlock[] {
  const blocks: JsonLdBlock[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // malformed JSON-LD is common in the wild — skip, don't throw
    }
    // A block may be a single object or an array of objects. Keep objects only.
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        blocks.push(item as JsonLdBlock);
      }
    }
  });
  return blocks;
}

/** Depth-first search for the first string value under `key` (handles @graph + arrays). */
function findFirstString(blocks: JsonLdBlock[], key: string): string | null {
  let found: string | null = null;
  const visit = (node: unknown): void => {
    if (found !== null) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const v = obj[key];
      if (typeof v === "string" && v.trim()) {
        found = v.trim();
        return;
      }
      // author can be a nested Person/Organization with a name.
      if (key === "author" && v && typeof v === "object") {
        const name = (v as Record<string, unknown>)["name"];
        if (typeof name === "string" && name.trim()) {
          found = name.trim();
          return;
        }
      }
      Object.values(obj).forEach(visit);
    }
  };
  blocks.forEach(visit);
  return found;
}

function extractHeadings($: cheerio.CheerioAPI): Heading[] {
  const headings: Heading[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = Number($(el).prop("tagName")?.slice(1));
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text) headings.push({ level, text });
  });
  return headings;
}

function extractLinks($: cheerio.CheerioAPI, finalUrl: string): PageLink[] {
  let baseHost: string | null = null;
  try {
    baseHost = new URL(finalUrl).host;
  } catch {
    baseHost = null;
  }
  const links: PageLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href) return;
    const rel = nullIfEmpty($(el).attr("rel"));
    const text = $(el).text().replace(/\s+/g, " ").trim();
    let external = false;
    try {
      const resolved = new URL(href, finalUrl);
      // Only http(s) links to a different host count as external citations.
      external = (resolved.protocol === "http:" || resolved.protocol === "https:") && resolved.host !== baseHost;
    } catch {
      external = false;
    }
    links.push({ href, rel, text, external });
  });
  return links;
}

function extractText($: cheerio.CheerioAPI): string {
  // cheerio.load() always injects a <body>, so this is safe even for fragments.
  $("script, style, noscript, template").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

export function htmlToScrape(rawHtml: string, ctx: ScrapeContext): PageScrape {
  const $ = cheerio.load(rawHtml);

  const jsonLd = extractJsonLd($);
  const headings = extractHeadings($);
  const links = extractLinks($, ctx.finalUrl);
  const blockquotes = $("blockquote").length;

  const lang = nullIfEmpty($("html").attr("lang"));
  const title = nullIfEmpty($("title").first().text());
  const metaDescription = nullIfEmpty($('meta[name="description"]').attr("content"));

  const publishedDate =
    nullIfEmpty($('meta[property="article:published_time"]').attr("content")) ??
    nullIfEmpty($('meta[name="date"]').attr("content")) ??
    findFirstString(jsonLd, "datePublished");
  const modifiedDate =
    nullIfEmpty($('meta[property="article:modified_time"]').attr("content")) ??
    nullIfEmpty($('meta[property="og:updated_time"]').attr("content")) ??
    findFirstString(jsonLd, "dateModified");
  const author =
    nullIfEmpty($('meta[name="author"]').attr("content")) ?? findFirstString(jsonLd, "author");

  // extractText mutates $ (strips script/style), so run it last.
  const text = extractText($);

  return {
    url: ctx.url,
    finalUrl: ctx.finalUrl,
    statusCode: ctx.statusCode,
    lang,
    title,
    metaDescription,
    text,
    headings,
    jsonLd,
    links,
    blockquotes,
    publishedDate,
    modifiedDate,
    author,
    robots: ctx.robots,
    botAccess: ctx.botAccess,
  };
}
