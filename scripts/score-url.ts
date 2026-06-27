// CLI: audit a single URL against the LLM Visibility™ rubric.
//
//   npm run score -- https://example.com/page          (pretty report)
//   npm run score -- https://example.com/page --json    (machine-readable)
//
// A scrape failure exits non-zero with a clear message — it is NEVER rendered as
// a 0 score (per the IMPLEMENTATION-PLAN failure-mode contract).

import { scrapeUrl, ScrapeError } from "../lib/scrape/firecrawl";
import { scoreSite } from "../lib/scorer";
import { formatReport } from "../lib/report/format";

try {
  process.loadEnvFile(".env"); // Node 22; no-op-ish if the key is already in env
} catch {
  /* .env optional when FIRECRAWL_API_KEY is exported in the shell */
}

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const url = args.find((a) => !a.startsWith("--"));

if (!url) {
  console.error("Usage: npm run score -- <url> [--json]");
  process.exit(1);
}

try {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("not http(s)");
} catch {
  console.error(`Error: "${url}" is not a valid http(s) URL`);
  process.exit(1);
}

const apiKey = process.env.FIRECRAWL_API_KEY ?? "";

// Executable body in an async IIFE so it needs no top-level await.
void (async () => {
  try {
    const scrape = await scrapeUrl(url, { apiKey });
    const result = scoreSite(scrape);
    if (jsonOut) {
      console.log(JSON.stringify({ url, ...result }, null, 2));
    } else {
      console.log(formatReport(result, url));
    }
  } catch (e) {
    if (e instanceof ScrapeError) {
      console.error(`✗ Could not audit ${url}`);
      console.error(`  ${e.message}`);
      console.error(`  (this is a fetch failure, not a 0 score — fix access or retry)`);
      process.exit(2);
    }
    console.error(`Unexpected error auditing ${url}:`, e);
    process.exit(1);
  }
})();
