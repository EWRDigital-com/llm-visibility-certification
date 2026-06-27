// Thin I/O shell: turn a URL into a PageScrape using Firecrawl for the page
// fetch, a direct robots.txt fetch, and per-bot UA probes to catch WAF/CDN
// blocks. All parsing/scoring logic lives in the pure modules (parse.ts,
// robots.ts) — this file only does network + wiring.
//
// Failure contract (IMPLEMENTATION-PLAN failure modes): a scrape that can't be
// retrieved throws ScrapeError. The caller surfaces "couldn't reach your site,
// retry" — it must NEVER become a 0-score masquerading as a real result.

import { htmlToScrape } from "./parse";
import { isPathAllowed } from "./robots";
import type { PageScrape, BotAccess } from "../scorer/types";

export class ScrapeError extends Error {
  override name = "ScrapeError";
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
  apiKey: string;
  fetchImpl?: FetchImpl; // injectable for testing
  timeoutMs?: number; // per-request timeout (Firecrawl + each probe)
}

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

/** Full pipeline: URL -> PageScrape. Throws ScrapeError if the page can't be retrieved. */
export async function scrapeUrl(url: string, opts: ScrapeOptions): Promise<PageScrape> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  if (!opts.apiKey) throw new ScrapeError("FIRECRAWL_API_KEY is not set — cannot scrape");

  // 1. Firecrawl page fetch (rawHtml + status + final URL after redirects).
  let json: unknown;
  try {
    json = await withTimeout(timeoutMs, async (signal) => {
      const res = await fetchImpl(FIRECRAWL_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
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
  const { rawHtml, statusCode, finalUrl } = parseFirecrawlScrape(json, url);

  // 2. robots.txt + 3. per-bot live probes (sequential — be a polite single-origin visitor).
  const robots = await fetchRobots(finalUrl, fetchImpl, timeoutMs);
  // robots rules can target query strings (Disallow: /*?*), so test path + search.
  const parsedFinal = new URL(finalUrl);
  const path = (parsedFinal.pathname || "/") + parsedFinal.search;
  const botAccess: BotAccess[] = [];
  for (const bot of AI_BOTS) {
    const allowedByRobots = robots.raw ? isPathAllowed(robots.raw, bot.token, path) : true;
    const fetchStatus = await probeBot(finalUrl, bot.ua, fetchImpl, timeoutMs);
    botAccess.push({ bot: bot.token, allowedByRobots, fetchStatus });
  }

  // 4. Pure transform into the scorer's input contract.
  return htmlToScrape(rawHtml, { url, finalUrl, statusCode, robots, botAccess });
}
