import { NextResponse, type NextRequest } from "next/server";
import { isTargetScrapeError, ScrapeError, scrapeUrl } from "@/lib/scrape/firecrawl";
import { scoreSite } from "@/lib/scorer/index";
import { assertPublicHost, validateSubmissionUrl, ValidationError } from "@/lib/security/url";

// Stateless audit endpoint (no email/DB): GET /api/score?url=<page> -> ScoreResult JSON.
// A scrape failure is a 502 (their page) or 503 (our side), never a fabricated 0-score.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  let target;
  try {
    target = validateSubmissionUrl(req.nextUrl.searchParams.get("url"));
    await assertPublicHost(target.hostname); // SSRF gate
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  try {
    const scrape = await scrapeUrl(target.url, {
      apiKey: process.env.FIRECRAWL_API_KEY || undefined,
      timeoutMs: 15_000,
    });
    const result = scoreSite(scrape);
    return NextResponse.json(
      { url: target.url, ...result },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (e) {
    if (e instanceof ScrapeError) {
      console.error(`[api/score] scrape failed for ${target.url}: ${e.message}`);
      if (isTargetScrapeError(e.message)) {
        return NextResponse.json(
          { error: "We couldn't fetch that page. It may be offline, blocking automated visitors, or relying on JavaScript to render — check the URL and try again." },
          { status: 502 },
        );
      }
      return NextResponse.json({ error: "The audit is temporarily at capacity. Please try again in a few minutes." }, { status: 503 });
    }
    console.error(`[api/score] unexpected error for ${target.url}:`, e);
    return NextResponse.json({ error: "Something went wrong running the audit. Please try again." }, { status: 500 });
  }
}
