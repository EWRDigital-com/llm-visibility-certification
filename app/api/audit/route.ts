import { NextResponse, type NextRequest } from "next/server";
import { assertPublicHost, validateSubmissionUrl, ValidationError } from "@/lib/security/url";
import { rateLimited } from "@/lib/security/ratelimit";
import { createSubmission, supabaseAuditStore } from "@/lib/db/repo";
import { runAudit } from "@/lib/audit/run";
import { magicLinkFor } from "@/lib/tokens";
import { sendMagicLink } from "@/lib/email/send";

// Node runtime (cheerio + node:dns + node:crypto), never prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim() : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (b.consent !== true) {
    return NextResponse.json({ error: "Please agree to receive your report by email." }, { status: 400 });
  }

  let target;
  try {
    target = validateSubmissionUrl(b.url);
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (rateLimited(`audit:${ip ?? "unknown"}`)) {
    return NextResponse.json({ error: "Too many audits from here — wait a minute and try again." }, { status: 429 });
  }

  // SSRF gate: refuse hosts that are / resolve to private/reserved addresses.
  try {
    await assertPublicHost(target.hostname);
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  try {
    const submissionId = await createSubmission({
      email,
      url: target.url,
      domain: target.domain,
      ip,
      consent: true,
    });
    // Run the audit (dedup supersedes any prior active cert for the domain).
    await runAudit({ submissionId, url: target.url, domain: target.domain, store: supabaseAuditStore });
    // Email the private-report magic link. The link is NEVER returned to the client.
    await sendMagicLink(email, magicLinkFor(submissionId));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/audit]", e);
    return NextResponse.json({ error: "We couldn't start the audit. Please try again." }, { status: 500 });
  }
}
