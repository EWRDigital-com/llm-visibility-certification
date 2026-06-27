// Deterministic category scorers for the LLM Visibility Score™.
//
// Each scorer is a pure function PageScrape -> CategoryResult. These atomic
// measurements roll up into pillars in index.ts (Foundation / Validation /
// Ingestion); crawler_access feeds the eligibility gate, not the composite.
// NOTE: these point weights are provisional and will be tuned during calibration
// (rank-ordering against ~30-50 sites with known real LLM-citation status). The
// methodology PAGE publishes the categories and principles, NOT these exact weights.

import type { PageScrape, CategoryResult, JsonLdBlock } from "./types";

// ---------- JSON-LD helpers (handle @graph + @type string|array) ----------

function collectTypes(blocks: JsonLdBlock[]): Set<string> {
  const types = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const t = obj["@type"];
      if (typeof t === "string") types.add(t);
      else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
      if (Array.isArray(obj["@graph"])) obj["@graph"].forEach(visit);
    }
  };
  blocks.forEach(visit);
  return types;
}

function hasAnyType(types: Set<string>, wanted: string[]): boolean {
  return wanted.some((w) => types.has(w));
}

function findNode(blocks: JsonLdBlock[], typeNames: string[]): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  const visit = (node: unknown): void => {
    if (found) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const t = obj["@type"];
      const ts = typeof t === "string" ? [t] : Array.isArray(t) ? t : [];
      if (ts.some((x) => typeof x === "string" && typeNames.includes(x))) {
        found = obj;
        return;
      }
      if (Array.isArray(obj["@graph"])) obj["@graph"].forEach(visit);
    }
  };
  blocks.forEach(visit);
  return found;
}

const clamp = (n: number, max: number): number => Math.max(0, Math.min(max, n));

// ---------- 1. Structured data / Schema (max 20) ----------

export function scoreSchema(s: PageScrape): CategoryResult {
  const types = collectTypes(s.jsonLd);
  const evidence: string[] = [];
  let pts = 0;
  if (types.size > 0) {
    pts += 8;
    evidence.push(`JSON-LD present: ${[...types].join(", ")}`);
  } else {
    evidence.push("No JSON-LD structured data found");
  }
  if (hasAnyType(types, ["Organization", "WebSite", "LocalBusiness"])) pts += 4;
  else evidence.push("Add Organization/WebSite schema (entity identity)");
  if (hasAnyType(types, ["Article", "BlogPosting", "NewsArticle", "WebPage"])) pts += 4;
  else evidence.push("Add Article/WebPage content schema");
  if (hasAnyType(types, ["FAQPage", "QAPage", "HowTo", "BreadcrumbList"])) pts += 4;
  else evidence.push("Add FAQ/HowTo/Breadcrumb schema (high value for AI answers)");
  return { key: "schema", label: "Structured data / Schema", points: clamp(pts, 20), maxPoints: 20, evidence };
}

// ---------- 2. Citations, statistics & quotes (max 15) ----------

const STAT_RE =
  /(\d+(?:\.\d+)?\s?%)|(\$\s?\d[\d,]*)|(\b\d{1,3}(?:,\d{3})+\b)|(\b\d+(?:\.\d+)?\s?(?:million|billion|trillion|percent|x)\b)/gi;

export function scoreCitations(s: PageScrape): CategoryResult {
  const evidence: string[] = [];
  let pts = 0;
  const external = s.links.filter((l) => l.external);
  pts += Math.min(6, external.length);
  evidence.push(`${external.length} external outbound link(s) used as citations`);

  const stats = s.text.match(STAT_RE) ?? [];
  if (stats.length >= 3) {
    pts += 5;
    evidence.push(`${stats.length} statistics/data points cited`);
  } else if (stats.length >= 1) {
    pts += 2;
    evidence.push(`Only ${stats.length} statistic(s) — LLMs favor data-rich content`);
  } else {
    evidence.push("No statistics/data points found");
  }

  if (s.blockquotes >= 1) {
    pts += 4;
    evidence.push(`${s.blockquotes} quotation(s)/blockquote(s)`);
  } else {
    evidence.push("No quotations/blockquotes");
  }
  return { key: "citations", label: "Citations, statistics & quotes", points: clamp(pts, 15), maxPoints: 15, evidence };
}

// ---------- 3a. Author trust (max 5) → VALIDATION pillar ----------
// Book: "Confirmed authorship (bios with credentials that match public records)"
// is part of Authority Trust. On-page we can only confirm authorship is asserted;
// the heavier Authority-Trust signals (third-party citations, reviews) are
// off-domain and live in the roadmap, not here.

export function scoreAuthorTrust(s: PageScrape): CategoryResult {
  const evidence: string[] = [];
  let pts = 0;
  const person = findNode(s.jsonLd, ["Person"]);
  const org = findNode(s.jsonLd, ["Organization", "LocalBusiness"]);

  const hasAuthor = !!s.author || !!person || !!(org && org["author"]);
  if (hasAuthor) {
    pts += 5;
    evidence.push(`Author/authorship identified${s.author ? `: ${s.author}` : ""}`);
  } else {
    evidence.push("No author attribution — models favor content with confirmed authorship");
  }
  return { key: "author_trust", label: "Author trust", points: clamp(pts, 5), maxPoints: 5, evidence };
}

// ---------- 3b. Entity identity (max 10) → FOUNDATION pillar ----------
// Book: entity resolution is the heaviest theme (68 "entity" mentions). sameAs
// to Wikidata/Crunchbase/LinkedIn turns "maybe it's them" into "it's definitely
// them"; About/Contact + a declared Organization name anchor canonical truth.

export function scoreEntity(s: PageScrape): CategoryResult {
  const evidence: string[] = [];
  let pts = 0;
  const person = findNode(s.jsonLd, ["Person"]);
  const org = findNode(s.jsonLd, ["Organization", "LocalBusiness"]);
  const entity = person ?? org;

  const sameAs = entity && Array.isArray(entity["sameAs"]) ? entity["sameAs"] : [];
  if (sameAs.length >= 1) {
    pts += 4;
    evidence.push(`${sameAs.length} sameAs entity link(s) (knowledge-graph resolution)`);
  } else {
    evidence.push("No sameAs entity links — add LinkedIn/Crunchbase/Wikidata to resolve identity");
  }

  if (s.links.some((l) => /\/(about|contact|team)\b/i.test(l.href))) {
    pts += 3;
    evidence.push("About/Contact present");
  } else {
    evidence.push("No About/Contact link found");
  }

  if (org && typeof org["name"] === "string") {
    pts += 3;
    evidence.push(`Organization declared: ${org["name"]}`);
  } else {
    evidence.push("No Organization name in schema");
  }
  return { key: "entity", label: "Entity identity", points: clamp(pts, 10), maxPoints: 10, evidence };
}

// ---------- 4. LLM crawler access (max 20) ----------

const TARGET_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended"] as const;

export function scoreCrawlerAccess(s: PageScrape): CategoryResult {
  const evidence: string[] = [];
  const access = TARGET_BOTS.map((bot) => s.botAccess.find((b) => b.bot === bot));
  const allowed = access.filter((a) => a?.allowedByRobots).length;
  const fetchOk = access.filter((a) => a?.fetchStatus === 200).length;
  const robotsPts = (allowed / TARGET_BOTS.length) * 10;
  const fetchPts = (fetchOk / TARGET_BOTS.length) * 10;

  TARGET_BOTS.forEach((bot, i) => {
    const a = access[i];
    if (!a) {
      evidence.push(`${bot}: not tested`);
      return;
    }
    if (!a.allowedByRobots) evidence.push(`${bot}: BLOCKED by robots.txt`);
    if (a.fetchStatus !== null && a.fetchStatus !== 200)
      evidence.push(`${bot}: fetch returned ${a.fetchStatus} (WAF/CDN block?)`);
    if (a.allowedByRobots && a.fetchStatus === 200) evidence.push(`${bot}: allowed`);
  });

  return {
    key: "crawler_access",
    label: "LLM crawler access",
    points: Math.round(clamp(robotsPts + fetchPts, 20)),
    maxPoints: 20,
    evidence,
  };
}

// ---------- 5. Answer-formatted content (max 15) ----------

const QUESTION_RE = /^(how|what|why|when|where|who|which|can|do|does|is|are)\b|\?$/i;

export function scoreAnswerFormat(s: PageScrape): CategoryResult {
  const evidence: string[] = [];
  let pts = 0;

  if (s.headings.some((h) => h.level === 1)) {
    pts += 3;
    evidence.push("H1 present");
  } else {
    evidence.push("No H1 heading");
  }

  const subs = s.headings.filter((h) => h.level >= 2 && h.level <= 3);
  if (subs.length >= 3) {
    pts += 4;
    evidence.push(`${subs.length} subheadings (scannable structure)`);
  } else {
    evidence.push(`Only ${subs.length} subheading(s) — add more H2/H3 sections`);
  }

  const questions = s.headings.filter((h) => QUESTION_RE.test(h.text.trim()));
  if (questions.length >= 1) {
    pts += 4;
    evidence.push(`${questions.length} question-style heading(s) (answer-friendly)`);
  } else {
    evidence.push("No question-style headings (Q&A format aids AI extraction)");
  }

  const md = s.metaDescription?.trim() ?? "";
  if (md.length >= 50 && md.length <= 170) {
    pts += 4;
    evidence.push("Meta description well-sized");
  } else {
    evidence.push("Meta description missing or poorly sized");
  }
  return { key: "answer_format", label: "Answer-formatted content", points: clamp(pts, 15), maxPoints: 15, evidence };
}

// ---------- 6. Freshness (max 5) ----------

export function scoreFreshness(s: PageScrape, now: Date): CategoryResult {
  const dateStr = s.modifiedDate ?? s.publishedDate;
  if (!dateStr)
    return { key: "freshness", label: "Freshness", points: 0, maxPoints: 5, evidence: ["No published/modified date found"] };
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime()))
    return { key: "freshness", label: "Freshness", points: 0, maxPoints: 5, evidence: [`Unparseable date: ${dateStr}`] };

  const days = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  let pts = 0;
  let note: string;
  if (days <= 180) {
    pts = 5;
    note = `Updated ${days} days ago`;
  } else if (days <= 365) {
    pts = 3;
    note = `Updated ${days} days ago (within a year)`;
  } else if (days <= 730) {
    pts = 1;
    note = `Updated ${days} days ago (getting stale)`;
  } else {
    note = `Last updated ${days} days ago (stale)`;
  }
  return { key: "freshness", label: "Freshness", points: pts, maxPoints: 5, evidence: [note] };
}

// ---------- 7. On-page brand signals (max 10) ----------

export function scoreBrand(s: PageScrape): CategoryResult {
  const evidence: string[] = [];
  let pts = 0;
  const entity = findNode(s.jsonLd, ["Organization", "LocalBusiness"]) ?? findNode(s.jsonLd, ["Person"]);
  const name = entity && typeof entity["name"] === "string" ? entity["name"] : null;

  if (name) {
    pts += 4;
    evidence.push(`Brand entity: ${name}`);
  } else {
    evidence.push("No brand entity (Organization/Person) in schema");
  }

  const sameAs = entity && Array.isArray(entity["sameAs"]) ? entity["sameAs"] : [];
  if (sameAs.length >= 2) {
    pts += 3;
    evidence.push(`${sameAs.length} social/profile links (sameAs)`);
  } else {
    evidence.push("Fewer than 2 social/profile links");
  }

  if (name) {
    const hay = `${s.title ?? ""} ${s.headings
      .filter((h) => h.level === 1)
      .map((h) => h.text)
      .join(" ")}`.toLowerCase();
    if (hay.includes(name.toLowerCase())) {
      pts += 3;
      evidence.push("Brand name in title/H1");
    } else {
      evidence.push("Brand name not in title/H1");
    }
  }
  return { key: "brand", label: "On-page brand signals", points: clamp(pts, 10), maxPoints: 10, evidence };
}
