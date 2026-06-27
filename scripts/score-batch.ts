// CLI: audit a list of URLs and emit a rank-ordered CSV — the calibration harness.
//
//   npm run score:batch -- --in urls.txt --out calibration.csv
//   npm run score:batch -- https://a.com/ https://b.com/      (CSV to stdout)
//
// URLs come from --in <file> (one per line; blank lines and # comments ignored)
// and/or positional args. Scoring is SEQUENTIAL on purpose — be a polite
// single-origin visitor and stay within scraper rate limits. A per-URL scrape
// failure becomes an error row, never aborts the batch and never scores 0.

import { readFileSync, writeFileSync } from "node:fs";
import { scrapeUrl, ScrapeError } from "../lib/scrape/firecrawl";
import { scoreSite } from "../lib/scorer";
import { batchToCsv, type BatchRow } from "../lib/report/format";

try {
  process.loadEnvFile(".env");
} catch {
  /* .env optional when FIRECRAWL_API_KEY is exported in the shell */
}

const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const val = args[i + 1];
  if (val === undefined || val.startsWith("--")) {
    console.error(`Error: ${name} requires a value`);
    process.exit(1);
  }
  return val;
}

const inFile = flag("--in");
const outFile = flag("--out");
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--in" && args[i - 1] !== "--out");

const urls: string[] = [];
if (inFile) {
  for (const line of readFileSync(inFile, "utf8").split(/\r?\n/)) {
    const u = line.replace(/#.*$/, "").trim();
    if (u) urls.push(u);
  }
}
urls.push(...positional);

if (urls.length === 0) {
  console.error("Usage: npm run score:batch -- (--in <file> | <url>...) [--out <file>]");
  process.exit(1);
}

const apiKey = process.env.FIRECRAWL_API_KEY ?? "";
const rows: BatchRow[] = [];

// Async IIFE (not top-level await) so the project can stay CommonJS — required
// for the Vercel function to bundle cheerio's CJS deps without crashing.
void (async () => {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    process.stderr.write(`[${i + 1}/${urls.length}] ${url} ... `);
    try {
      const result = scoreSite(await scrapeUrl(url, { apiKey }));
      rows.push({
        url,
        composite: result.composite,
        tier: result.tier,
        bottleneck: result.bottleneck,
        eligible: result.eligibility.eligible,
        maturity: result.maturity.rung,
      });
      process.stderr.write(`${result.composite}/100 ${result.tier}\n`);
    } catch (e) {
      const error = e instanceof ScrapeError ? e.message : `unexpected: ${(e as Error).message}`;
      rows.push({ url, composite: null, tier: null, bottleneck: null, eligible: null, maturity: null, error });
      process.stderr.write(`FAILED (${error})\n`);
    }
  }

  const csv = batchToCsv(rows);
  if (outFile) {
    writeFileSync(outFile, csv, "utf8");
    process.stderr.write(`\nWrote ${rows.length} rows → ${outFile}\n`);
  } else {
    process.stdout.write(csv);
  }
})();
