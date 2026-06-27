// Pure presentation: turn a ScoreResult into a human-readable CLI report, and a
// set of batch rows into a rank-ordered CSV for calibration. No I/O here.

import type { ScoreResult, PillarKey, Tier, MaturityRung } from "../scorer/types.js";

const TIER_LABEL: Record<Tier, string> = {
  none: "Not yet certified",
  certified: "LLM Visibility™ Certified",
  gold: "LLM Visibility™ Gold",
};

function bar(readiness: number): string {
  const filled = Math.round(readiness / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

/** Human-readable single-URL report (default CLI output). */
export function formatReport(r: ScoreResult, url: string): string {
  const lines: string[] = [];
  lines.push(`LLM Visibility™ audit — ${url}`);
  lines.push("═".repeat(64));
  lines.push(`Composite score:  ${r.composite}/100`);
  lines.push(`Tier:             ${TIER_LABEL[r.tier]}`);
  lines.push(`Maturity rung:    ${r.maturity.label}${r.maturity.ceilingReached ? " (on-page ceiling)" : ""}`);
  lines.push(`Eligibility:      ${r.eligibility.eligible ? "✓" : "✗"} ${r.eligibility.reason}`);
  lines.push("");

  lines.push("Pillars");
  lines.push("─".repeat(64));
  for (const p of r.pillars) {
    const mark = p.isBottleneck ? "  ◀ BOTTLENECK (fix first)" : "";
    lines.push(`${p.label.padEnd(12)} ${bar(p.readiness)} ${String(p.readiness).padStart(3)}/100${mark}`);
  }
  lines.push("");

  lines.push("Punch list (per category)");
  lines.push("─".repeat(64));
  for (const p of r.pillars) {
    for (const c of p.categories) {
      lines.push(`[${p.label}] ${c.label} — ${c.points}/${c.maxPoints}`);
      for (const e of c.evidence) lines.push(`    • ${e}`);
    }
  }
  // crawler_access feeds eligibility, not a pillar — surface it too.
  const ca = r.eligibility.detail;
  lines.push(`[Eligibility] ${ca.label} — ${ca.points}/${ca.maxPoints}`);
  for (const e of ca.evidence) lines.push(`    • ${e}`);
  lines.push("");

  lines.push("Off-domain roadmap (not scored from one URL)");
  lines.push("─".repeat(64));
  for (const rp of r.roadmap) lines.push(`• ${rp.name} (${rp.stackLayer}, ${rp.plannedVersion})`);

  return lines.join("\n");
}

// ---------- Batch / calibration CSV ----------

export interface BatchRow {
  url: string;
  composite: number | null; // null = scrape failed
  tier: Tier | null;
  bottleneck: PillarKey | null;
  eligible: boolean | null;
  maturity: MaturityRung | null;
  error?: string;
}

const CSV_HEADER = ["url", "composite", "tier", "bottleneck", "eligible", "maturity", "error"];

function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Defang spreadsheet formula injection: url/error are operator- and remote-derived,
  // and the calibration CSV is meant to be opened in Excel/Sheets. A leading
  // = + - @ (or tab/CR) would execute as a formula; prefix with ' to neutralize.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rank-ordered CSV: scored rows by composite desc, failed/unscored rows last. */
export function batchToCsv(rows: BatchRow[]): string {
  const sorted = [...rows].sort((a, b) => {
    const ac = a.composite, bc = b.composite;
    if (ac === null && bc === null) return 0;
    if (ac === null) return 1; // errors sink to the bottom
    if (bc === null) return -1;
    return bc - ac; // higher composite first
  });
  const body = sorted.map((r) =>
    [r.url, r.composite, r.tier, r.bottleneck, r.eligible, r.maturity, r.error].map(csvCell).join(",")
  );
  return [CSV_HEADER.join(","), ...body].join("\n") + "\n";
}
