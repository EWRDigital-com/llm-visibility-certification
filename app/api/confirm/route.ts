import { NextResponse, type NextRequest } from "next/server";
import { confirmSubmission } from "@/lib/db/repo";
import { makeAccessToken, verifyMagicLink } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Magic-link landing: verify the token, mark the email confirmed, grant report
// access via an httpOnly cookie, and redirect to the private report.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = req.nextUrl.origin;
  const token = req.nextUrl.searchParams.get("token") ?? "";

  const payload = verifyMagicLink(token);
  if (!payload) {
    return NextResponse.redirect(new URL("/?confirm=expired", origin));
  }

  try {
    const submission = await confirmSubmission(payload.sid);
    if (!submission) {
      return NextResponse.redirect(new URL("/?confirm=notfound", origin));
    }
  } catch (e) {
    console.error("[api/confirm]", e);
    return NextResponse.redirect(new URL("/?confirm=error", origin));
  }

  const res = NextResponse.redirect(new URL(`/report/${payload.sid}`, origin));
  res.cookies.set("report_access", makeAccessToken(payload.sid), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/report",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
