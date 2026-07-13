import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/tokens";
import {
  createDomainVerification,
  findVerification,
  getSubmission,
  markVerificationVerified,
  publishCertificateForDomain,
} from "@/lib/db/repo";
import {
  checkDnsTxt,
  checkWellKnown,
  makePublicSlug,
  makeVerificationToken,
  verificationInstructions,
} from "@/lib/verify/domain";
import { assertPublicHost, ValidationError } from "@/lib/security/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authorize: the caller must hold the report_access cookie for THIS submission —
// the same email-confirmation gate as the private report. You can only try to make
// public a domain whose private report you were emailed.
async function authorized(submissionId: string): Promise<boolean> {
  const store = await cookies();
  const access = store.get("report_access")?.value;
  const payload = access ? verifyAccessToken(access) : null;
  return !!payload && payload.sid === submissionId;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
  const action = body.action === "check" ? "check" : "issue";
  const method: "dns_txt" | "well_known" = body.method === "well_known" ? "well_known" : "dns_txt";

  if (!submissionId || !(await authorized(submissionId))) {
    return NextResponse.json({ error: "Open your report from the emailed link first." }, { status: 403 });
  }

  const submission = await getSubmission(submissionId).catch(() => null);
  if (!submission) {
    return NextResponse.json({ error: "We couldn't find that submission." }, { status: 404 });
  }
  const domain = submission.domain;

  if (action === "issue") {
    const token = makeVerificationToken();
    await createDomainVerification({ submissionId, domain, method, token });
    return NextResponse.json({ ok: true, instructions: verificationInstructions(domain, token) });
  }

  // action === "check"
  const token = typeof body.token === "string" ? body.token : "";
  const record = token ? await findVerification(submissionId, token) : null;
  if (!record) {
    return NextResponse.json({ error: "Request verification instructions first." }, { status: 400 });
  }

  let verified = false;
  try {
    if (record.method === "dns_txt") {
      verified = await checkDnsTxt(domain, token);
    } else {
      await assertPublicHost(domain); // SSRF-guard the .well-known fetch
      verified = await checkWellKnown(domain, token);
    }
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  if (!verified) {
    return NextResponse.json({
      ok: false,
      verified: false,
      hint:
        record.method === "dns_txt"
          ? "We couldn't find the TXT record yet — DNS can take a few minutes to propagate. Try again shortly."
          : "We couldn't read that file yet — confirm it's reachable over https and try again.",
    });
  }

  await markVerificationVerified(record.id);
  const cert = await publishCertificateForDomain(domain, makePublicSlug(domain));
  if (!cert?.public_slug) {
    return NextResponse.json({ error: "No active certificate to publish for this domain." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, verified: true, slug: cert.public_slug, url: `/verify/${cert.public_slug}` });
}
