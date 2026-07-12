// Serverless audit endpoint: GET /api/score?url=<page>
//
// Wraps the tested engine (scrapeUrl -> scoreSite) for the web tool. Returns the
// full ScoreResult as JSON. A scrape failure is a 502 with a clear message — it
// is NEVER returned as a 0 score (per the IMPLEMENTATION-PLAN failure contract).
// Node.js runtime (cheerio + node fetch are not edge-safe).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { scrapeUrl, ScrapeError, isTargetScrapeError } from "../lib/scrape/firecrawl.js";
import { scoreSite } from "../lib/scorer/index.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const raw = req.query.url;
  const urlParam = typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? "") : "";

  let target: URL;
  try {
    target = new URL(urlParam.trim());
    if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("not http(s)");
  } catch {
    res.status(400).json({ error: "Enter a full URL including https:// — e.g. https://example.com/page" });
    return;
  }

  try {
    // Free direct fetch (no API key) — enough for on-page signals on server-rendered HTML.
    const scrape = await scrapeUrl(target.toString(), { timeoutMs: 15_000 });
    const result = scoreSite(scrape);
    // Cache identical audits briefly at the edge; scores are deterministic per page.
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ url: target.toString(), ...result });
  } catch (e) {
    if (e instanceof ScrapeError) {
      // Log the real cause server-side (Vercel logs); show the user a clean message.
      console.error(`[score] scrape failed for ${target.toString()}: ${e.message}`);
      // Distinguish a problem with the user's target page from a problem on our
      // side (out of credits / rate-limited / scraper down). Target-page failures
      // (block / non-2xx / JS-shell / empty / offline) are the user's URL;
      // everything else (Firecrawl HTTP 402/429/5xx, network, malformed) is ours.
      if (isTargetScrapeError(e.message)) {
        res.status(502).json({
          error: "We couldn't fetch that page. It may be offline, blocking automated visitors, or relying on JavaScript to render — check the URL and try again.",
        });
      } else {
        res.status(503).json({
          error: "The audit is temporarily at capacity. Please try again in a few minutes.",
        });
      }
      return;
    }
    console.error(`[score] unexpected error for ${target.toString()}:`, e);
    res.status(500).json({ error: "Something went wrong running the audit. Please try again." });
  }
}
