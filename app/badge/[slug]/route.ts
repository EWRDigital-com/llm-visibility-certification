import { type NextRequest } from "next/server";
import { getCertificateBySlug } from "@/lib/db/repo";
import { canRenderPublic } from "@/lib/verify/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SVG_HEADERS = { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" };

const TIER = {
  gold: { label: "Gold", fill: "#B08A2E", ink: "#3A2E12" },
  certified: { label: "Certified", fill: "#1C7A72", ink: "#0E4C47" },
  none: { label: "Audited", fill: "#727C88", ink: "#2A2F36" },
} as const;

function esc(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);
}

function badgeSvg(tier: keyof typeof TIER, score: number): string {
  const t = TIER[tier] ?? TIER.none;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="80" role="img" aria-label="LLM Visibility ${esc(t.label)}: ${score}/100">
  <rect width="220" height="80" rx="10" fill="#fff" stroke="#E1E5EA"/>
  <rect x="1" y="1" width="8" height="78" rx="4" fill="${t.fill}"/>
  <text x="22" y="26" font-family="ui-monospace,Menlo,monospace" font-size="9" letter-spacing="1.5" fill="#727C88">LLM VISIBILITY™</text>
  <text x="22" y="48" font-family="Georgia,serif" font-size="17" font-weight="600" fill="${t.ink}">${esc(t.label)}</text>
  <text x="22" y="66" font-family="ui-monospace,Menlo,monospace" font-size="11" fill="#4B535E">${score}/100 on-page readiness</text>
</svg>`;
}

function stateSvg(label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="80" role="img" aria-label="${esc(label)}">
  <rect width="220" height="80" rx="10" fill="#fff" stroke="#E1E5EA"/>
  <text x="110" y="45" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="12" fill="#727C88">${esc(label)}</text>
</svg>`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await ctx.params;
  const cert = await getCertificateBySlug(slug).catch(() => null);

  if (!cert) return new Response(stateSvg("badge not found"), { status: 404, headers: SVG_HEADERS });
  if (cert.revoked) return new Response(stateSvg("certification revoked"), { status: 200, headers: SVG_HEADERS });
  if (!canRenderPublic(cert)) return new Response(stateSvg("badge not found"), { status: 404, headers: SVG_HEADERS });

  const tier = (cert.tier in TIER ? cert.tier : "none") as keyof typeof TIER;
  return new Response(badgeSvg(tier, cert.score), { status: 200, headers: SVG_HEADERS });
}
