import { cookies } from "next/headers";
import { getReportBundle, type ReportBundle } from "@/lib/db/repo";
import { verifyAccessToken } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  schema: "Structured data / Schema",
  entity: "Entity identity",
  brand: "On-page brand signals",
  citations: "Citations, statistics & quotes",
  author_trust: "Author trust",
  answer_format: "Answer-formatted content",
  freshness: "Freshness",
  crawler_access: "LLM crawler access",
};

const PILLARS: { label: string; aiPillar: string; cats: string[] }[] = [
  { label: "Foundation", aiPillar: "Citations Consistency", cats: ["schema", "entity", "brand"] },
  { label: "Validation", aiPillar: "Authority Trust", cats: ["citations", "author_trust"] },
  { label: "Ingestion", aiPillar: "LLM Surfacing", cats: ["answer_format", "freshness"] },
];

const TIER_LABEL: Record<string, string> = {
  none: "Not yet on-page ready",
  certified: "LLM Visibility™ Certified (on-page ready)",
  gold: "LLM Visibility™ Gold (on-page ready)",
};

type ScoreRow = ReportBundle["scores"][number];

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-line bg-white p-5">{children}</div>;
}

function ReadinessBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Access gate: the report is private — only a confirmed magic-link cookie for THIS
  // submission unlocks it.
  const cookieStore = await cookies();
  const access = cookieStore.get("report_access")?.value;
  const payload = access ? verifyAccessToken(access) : null;
  if (!payload || payload.sid !== id) {
    return (
      <section className="mx-auto max-w-lg text-center">
        <h1 className="font-serif text-2xl font-semibold">This report is private</h1>
        <p className="mt-3 text-ink-soft">
          Open it from the link we emailed you. If the link expired, run the audit again to get a fresh one.
        </p>
        <a href="/" className="mt-6 inline-block rounded-lg bg-brand px-4 py-2.5 font-medium text-white">
          Run an audit
        </a>
      </section>
    );
  }

  let bundle: ReportBundle | null = null;
  try {
    bundle = await getReportBundle(id);
  } catch {
    bundle = null;
  }
  if (!bundle) {
    return (
      <section className="mx-auto max-w-lg text-center">
        <h1 className="font-serif text-2xl font-semibold">Your report is being prepared</h1>
        <p className="mt-3 text-ink-soft">Give it a moment and refresh. If it doesn&rsquo;t appear, run the audit again.</p>
      </section>
    );
  }

  const { submission, audit, scores } = bundle;
  const auditedAt = new Date(audit.fetched_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  if (audit.status !== "ok") {
    return (
      <section className="mx-auto max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-faint">On-page readiness audit</p>
        <h1 className="mt-2 break-words font-serif text-2xl font-semibold">{submission.url}</h1>
        <div className="mt-6 rounded-xl border border-warn/40 bg-warn/5 p-5">
          <p className="font-medium text-warn">We couldn&rsquo;t complete this audit</p>
          <p className="mt-2 text-ink-soft">{audit.error ?? "The page couldn't be read."}</p>
        </div>
        <a href="/" className="mt-6 inline-block rounded-lg bg-brand px-4 py-2.5 font-medium text-white">
          Try another URL
        </a>
      </section>
    );
  }

  const byKey = new Map(scores.map((s) => [s.category, s]));
  const pillarReadiness = (cats: string[]): number => {
    let pts = 0;
    let max = 0;
    for (const c of cats) {
      const row = byKey.get(c);
      if (row) {
        pts += row.points;
        max += row.max_points;
      }
    }
    return max === 0 ? 0 : Math.round((pts / max) * 100);
  };
  const crawler = byKey.get("crawler_access");

  return (
    <section className="mx-auto max-w-2xl">
      <p className="font-mono text-xs uppercase tracking-widest text-ink-faint">
        LLM Visibility™ on-page readiness audit · {auditedAt}
      </p>
      <h1 className="mt-2 break-words font-serif text-2xl font-semibold">{submission.url}</h1>

      <div className="mt-6 grid grid-cols-[auto,1fr] items-center gap-5">
        <div className="flex h-24 w-24 flex-col items-center justify-center rounded-2xl bg-brand-soft">
          <span className="font-serif text-4xl font-semibold text-brand-ink">{audit.composite}</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-brand-ink">/ 100</span>
        </div>
        <div>
          <p className="text-lg font-semibold text-ink">{TIER_LABEL[audit.tier ?? "none"]}</p>
          <p className="mt-1 text-sm text-ink-soft">
            This is <strong className="text-ink">on-page readiness</strong> — how cleanly an answer engine can retrieve,
            understand, and attribute this page. It is <strong className="text-ink">not</strong> a prediction that you
            will be cited: real citation is dominated by off-domain authority and brand mentions a single-page audit
            can&rsquo;t see.
          </p>
        </div>
      </div>

      <h2 className="mt-10 font-serif text-lg font-semibold">Pillars</h2>
      <div className="mt-3 space-y-5">
        {PILLARS.map((p) => {
          const readiness = pillarReadiness(p.cats);
          return (
            <Card key={p.label}>
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="font-semibold text-ink">{p.label}</span>
                  <span className="ml-2 text-xs text-ink-faint">proxy for {p.aiPillar}</span>
                </div>
                <span className="font-mono text-sm tabular-nums text-ink-soft">{readiness}/100</span>
              </div>
              <div className="mt-2">
                <ReadinessBar value={readiness} />
              </div>
              <ul className="mt-4 space-y-3">
                {p.cats.map((c) => {
                  const row = byKey.get(c);
                  if (!row) return null;
                  return <CategoryRow key={c} row={row} />;
                })}
              </ul>
            </Card>
          );
        })}
      </div>

      {crawler && (
        <>
          <h2 className="mt-10 font-serif text-lg font-semibold">Eligibility</h2>
          <div className="mt-3">
            <Card>
              <ul className="space-y-3">
                <CategoryRow row={crawler} />
              </ul>
            </Card>
          </div>
        </>
      )}

      <p className="mt-10 text-sm text-ink-faint">
        Off-domain pillars (Search Mentions, live LLM surfacing, off-domain authority, cross-web entity consistency) are
        the biggest real-citation levers and aren&rsquo;t measured from one URL — they&rsquo;re on the roadmap.
      </p>
    </section>
  );
}

function CategoryRow({ row }: { row: ScoreRow }) {
  const label = CATEGORY_LABEL[row.category] ?? row.category;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="font-mono text-xs tabular-nums text-ink-faint">
          {row.points}/{row.max_points}
        </span>
      </div>
      {row.evidence.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-soft">
          {row.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
