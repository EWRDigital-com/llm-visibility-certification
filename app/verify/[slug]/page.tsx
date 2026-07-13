import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCertificateBySlug } from "@/lib/db/repo";
import { canRenderPublic } from "@/lib/verify/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v1: keep public verify pages OUT of the index until the tier thresholds are
// calibration-finalized. Flip to index once the score bands are locked.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const TIER_LABEL: Record<string, string> = {
  none: "Not yet on-page ready",
  certified: "LLM Visibility™ Certified",
  gold: "LLM Visibility™ Gold",
};

export default async function VerifyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cert = await getCertificateBySlug(slug).catch(() => null);

  // THE ownership gate: a public page renders ONLY for a verified, non-revoked,
  // public certificate. Everything else is a 404 — never a live public credential.
  if (!canRenderPublic(cert)) {
    notFound();
  }
  const c = cert!;

  const auditedOn = new Date(c.audited_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const verifiedOn = c.ownership_verified_at
    ? new Date(c.ownership_verified_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <section className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-line bg-white p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-brand">LLM Visibility™ Certification</p>
        <h1 className="mt-3 break-words font-serif text-2xl font-semibold">{c.domain}</h1>

        <div className="mx-auto mt-6 flex h-28 w-28 flex-col items-center justify-center rounded-full bg-brand-soft">
          <span className="font-serif text-5xl font-semibold text-brand-ink">{c.score}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-brand-ink">/ 100</span>
        </div>

        <p className="mt-5 text-lg font-semibold text-ink">{TIER_LABEL[c.tier]}</p>
        <p className="mt-1 text-sm text-ink-soft">On-page readiness — not a prediction of AI citation.</p>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-good">
          <span aria-hidden>✓</span>
          <span>Domain ownership verified{verifiedOn ? ` · ${verifiedOn}` : ""}</span>
        </div>

        <img
          src={`/badge/${c.public_slug}`}
          alt={`LLM Visibility ${c.tier} badge for ${c.domain}`}
          width={220}
          height={80}
          className="mx-auto mt-6"
        />

        <p className="mt-6 text-xs text-ink-faint">
          Audited on {auditedOn}. On-page readiness reflects the page at audit time; re-audit to refresh.
        </p>
      </div>
    </section>
  );
}
