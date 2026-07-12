// Thin I/O shell: turn a URL into a PageScrape. The page fetch is FREE by default
// (a direct GET — enough for the on-page signals the scorer reads on server-
// rendered HTML); a Firecrawl key is OPTIONAL and only used for JS-rendered pages,
// with automatic fallback to the free fetch if Firecrawl fails (e.g. out of credits).
// robots.txt + per-bot UA probes are direct fetches. Parsing/scoring lives in the
// pure modules (parse.ts, robots.ts) — this file only does network + wiring.
//
// Failure contract (IMPLEMENTATION-PLAN failure modes): a scrape that can't be
// retrieved throws ScrapeError. The caller surfaces "couldn't reach your site,
// retry" — it must NEVER become a 0-score masquerading as a real result.

import { htmlToScrape, hasScorableContent } from "./parse.js";
import { isPathAllowed } from "./robots.js";
import type { PageScrape, BotAccess } from "../scorer/types.js";

export class ScrapeError extends Error {
  override name = "ScrapeError";
}

/**
 * Does this ScrapeError describe a problem with the TARGET page (offline, anti-bot
 * block, non-2xx, JS-rendered shell, empty) versus a problem on OUR side (Firecrawl
 * out of credits / rate-limited / down)? Drives the API's response: target issues
 * are a 502 "we couldn't fetch that page"; our-side issues are a 503 "try again".
 * Pure + tested so the classification can't silently drift from the thrown messages.
 */
export function isTargetScrapeError(message: string): boolean {
  return /no HTML|unreachable|no scorable content|to a direct fetch|could not scrape/i.test(message);
}

/** The bots whose access the rubric cares about (token = robots.txt UA token). */
export const AI_BOTS: { token: string; ua: string }[] = [
  { token: "GPTBot", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot" },
  { token: "ClaudeBot", ua: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" },
  // Google-Extended is a robots policy token, not its own fetcher — it rides
  // Googlebot infrastructure, so we probe fetch with Googlebot's UA.
  { token: "Google-Extended", ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
];

const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";

export interface FirecrawlScrape {
  rawHtml: string;
  statusCode: number;
  finalUrl: string;
}

/** Validate + normalize a Firecrawl /scrape response. Throws ScrapeError on anything unusable. */
export function parseFirecrawlScrape(json: unknown, requestedUrl: string): FirecrawlScrape {
  if (!json || typeof json !== "object") {
    throw new ScrapeError(`Firecrawl returned a malformed response for ${requestedUrl}`);
  }
  const root = json as Record<string, unknown>;
  if (root["success"] === false) {
    throw new ScrapeError(`Firecrawl could not scrape ${requestedUrl}: ${String(root["error"] ?? "unknown error")}`);
  }
  const data = (root["data"] ?? {}) as Record<string, unknown>;
  const rawHtml = data["rawHtml"];
  if (typeof rawHtml !== "string" || rawHtml.length === 0) {
    throw new ScrapeError(`Firecrawl returned no HTML for ${requestedUrl} — site unreachable or empty`);
  }
  const metadata = (data["metadata"] ?? {}) as Record<string, unknown>;
  // Firecrawl v2 reports the target's real status (incl. 4xx/5xx on error pages),
  // and evalEligibility gates on non-2xx — so a real error page scores ineligible,
  // not as a fabricated result. The 200 default only covers the (non-occurring)
  // case where success:true + rawHtml arrive with no statusCode echoed.
  const statusCode = typeof metadata["statusCode"] === "number" ? (metadata["statusCode"] as number) : 200;
  const finalUrl =
    (typeof metadata["url"] === "string" && metadata["url"]) ||
    (typeof metadata["sourceURL"] === "string" && metadata["sourceURL"]) ||
    requestedUrl;

  return { rawHtml, statusCode, finalUrl };
}

type FetchImpl = typeof fetch;

export interface ScrapeOptions {
  apiKey?: string; // optional: if set, try Firecrawl (JS rendering); else free direct fetch
  fetchImpl?: FetchImpl; // injectable for testing
  timeoutMs?: number; // per-request timeout (page fetch + each probe)
}

/** A current desktop-Chrome UA — some sites refuse non-browser agents. */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch the page with a bot's UA and return the HTTP status (null if it never responded). */
async function probeBot(url: string, ua: string, fetchImpl: FetchImpl, timeoutMs: number): Promise<number | null> {
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const res = await fetchImpl(url, { method: "GET", headers: { "User-Agent": ua }, redirect: "follow", signal });
      await res.body?.cancel().catch(() => {}); // we only need the status — release the stream
      return res.status;
    });
  } catch {
    return null; // network error / timeout — "not attempted/unknown", not a hard block
  }
}

/** Fetch robots.txt for the URL's origin. Returns raw text + whether the fetch succeeded. */
async function fetchRobots(finalUrl: string, fetchImpl: FetchImpl, timeoutMs: number): Promise<{ fetched: boolean; raw: string | null }> {
  let robotsUrl: string;
  try {
    robotsUrl = new URL("/robots.txt", finalUrl).toString();
  } catch {
    return { fetched: false, raw: null };
  }
  try {
    return await withTimeout(timeoutMs, async (signal) => {
      const res = await fetchImpl(robotsUrl, { headers: { "User-Agent": AI_BOTS[0]!.ua }, signal });
      if (!res.ok) {
        await res.body?.cancel().catch(() => {}); // 404/5xx = no usable robots = allow all
        return { fetched: false, raw: null };
      }
      return { fetched: true, raw: await res.text() };
    });
  } catch {
    return { fetched: false, raw: null };
  }
}

/** FREE page fetch: a direct GET of the URL. No API key, no JS rendering — enough
 *  for the on-page signals the scorer reads (schema, meta, headings, links) on
 *  server-rendered HTML. A non-2xx response (after following redirects) means the
 *  free fetch could not retrieve the live page — almost always an anti-bot block —
 *  so it's a ScrapeError (unscorable), NOT a 0-score. The optional Firecrawl path,
 *  which renders and returns the real status, still flows non-2xx through to the
 *  eligibility gate. A network failure or empty body is likewise a ScrapeError. */
export async function fetchPageDirect(url: string, fetchImpl: FetchImpl, timeoutMs: number): Promise<FirecrawlScrape> {
  let res: Response;
  try {
    res = await withTimeout(timeoutMs, (signal) =>
      fetchImpl(url, {
        method: "GET",
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
        redirect: "follow",
        signal,
      }),
    );
  } catch (e) {
    throw new ScrapeError(`${url} is unreachable — it may be offline or blocking automated visitors (${(e as Error).message})`);
  }
  const statusCode = res.status;
  const finalUrl = res.url || url;
  const rawHtml = await res.text().catch(() => "");
  if (statusCode < 200 || statusCode >= 300) {
    await res.body?.cancel().catch(() => {});
    throw new ScrapeError(
      `${url} returned HTTP ${statusCode} to a direct fetch — the live page wasn't retrievable ` +
        `(the site likely blocks automated visitors). Re-run with a rendering fetch (Firecrawl) to score it.`,
    );
  }
  if (rawHtml.trim().length === 0) {
    throw new ScrapeError(`No HTML returned for ${url} — site unreachable or empty`);
  }
  return { rawHtml, statusCode, finalUrl };
}

/** OPTIONAL Firecrawl fetch (JS rendering). Throws ScrapeError on any failure so
 *  the caller can fall back to the free direct fetch. */
async function fetchViaFirecrawl(url: string, apiKey: string, fetchImpl: FetchImpl, timeoutMs: number): Promise<FirecrawlScrape> {
  let json: unknown;
  try {
    json = await withTimeout(timeoutMs, async (signal) => {
      const res = await fetchImpl(FIRECRAWL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ url, formats: ["rawHtml"], onlyMainContent: false }),
        signal,
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new ScrapeError(`Firecrawl HTTP ${res.status} for ${url}`);
      }
      return res.json();
    });
  } catch (e) {
    if (e instanceof ScrapeError) throw e;
    throw new ScrapeError(`Firecrawl request failed for ${url}: ${(e as Error).message}`);
  }
  return parseFirecrawlScrape(json, url);
}

/** Full pipeline: URL -> PageScrape. Throws ScrapeError if the page can't be retrieved. */
export async function scrapeUrl(url: string, opts: ScrapeOptions = {}): Promise<PageScrape> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  // 1. Page fetch — free direct GET by default; Firecrawl only if a key is given
  // (with fallback to the free fetch if Firecrawl fails, e.g. out of credits).
  let page: FirecrawlScrape;
  if (opts.apiKey) {
    try {
      page = await fetchViaFirecrawl(url, opts.apiKey, fetchImpl, timeoutMs);
    } catch {
      page = await fetchPageDirect(url, fetchImpl, timeoutMs);
    }
  } else {
    page = await fetchPageDirect(url, fetchImpl, timeoutMs);
  }
  const { rawHtml, statusCode, finalUrl } = page;

  // 2. robots.txt, then 3. per-bot live probes. Probes run CONCURRENTLY: this is a
  // single user-initiated audit (3 requests to one target, not a crawl), and the
  // bounded latency keeps the serverless audit well under its time limit. Promise.all
  // preserves AI_BOTS order, so botAccess order is stable.
  const robots = await fetchRobots(finalUrl, fetchImpl, timeoutMs);
  // robots rules can target query strings (Disallow: /*?*), so test path + search.
  const parsedFinal = new URL(finalUrl);
  const path = (parsedFinal.pathname || "/") + parsedFinal.search;
  const botAccess: BotAccess[] = await Promise.all(
    AI_BOTS.map(async (bot) => {
      const allowedByRobots = robots.raw ? isPathAllowed(robots.raw, bot.token, path) : true;
      const fetchStatus = await probeBot(finalUrl, bot.ua, fetchImpl, timeoutMs);
      return { bot: bot.token, allowedByRobots, fetchStatus };
    }),
  );

  // 4. Pure transform into the scorer's input contract.
  const scrape = htmlToScrape(rawHtml, { url, finalUrl, statusCode, robots, botAccess });

  // 5. Guard against fabricated 0-scores: a 2xx response that yields no scorable
  // content is a JS-rendered SPA or an anti-bot challenge shell, not a real page.
  // Surface it as an error (the caller retries / marks it unscorable) rather than
  // scoring an empty shell as 0. Non-2xx pages flow through to the eligibility gate.
  if (statusCode >= 200 && statusCode < 300 && !hasScorableContent(scrape)) {
    throw new ScrapeError(
      `${url} returned no scorable content — the page is likely JavaScript-rendered or behind an anti-bot wall. ` +
        `Re-run with a rendering fetch (Firecrawl) to score it.`,
    );
  }
  return scrape;
}
