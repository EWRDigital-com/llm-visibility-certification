// Data-access layer. The AuditStore interface is the persistence surface the audit
// runner needs — a Supabase implementation for production, easily faked in tests.
// The remaining functions serve the submit / confirm / report flows.

import type { Tier } from "../scorer/types.js";
import { getServiceClient } from "./client.js";
import type { AuditStatus, CertificateRow, SiteAuditRow, SubmissionRow } from "./types.js";

export interface NewAudit {
  submissionId: string;
  url: string;
  status: AuditStatus;
  composite: number | null;
  tier: Tier | null;
  error: string | null;
  rawScrapePath: string | null;
}

export interface ScoreRow {
  category: string;
  points: number;
  maxPoints: number;
  evidence: string[];
}

/** Persistence the audit runner depends on — injectable so runAudit() is testable
 *  with an in-memory fake and never touches a live database in unit tests. */
export interface AuditStore {
  createAudit(a: NewAudit): Promise<string>;
  insertScores(auditId: string, rows: ScoreRow[]): Promise<void>;
  supersedeActiveCertificates(domain: string): Promise<void>;
  createCertificate(c: {
    submissionId: string;
    auditId: string;
    domain: string;
    score: number;
    tier: Tier;
  }): Promise<string>;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data returned`);
  return res.data;
}

// ---------- Production AuditStore (Supabase) ----------

export const supabaseAuditStore: AuditStore = {
  async createAudit(a) {
    const db = getServiceClient();
    const row = unwrap(
      await db
        .from("site_audits")
        .insert({
          submission_id: a.submissionId,
          url: a.url,
          status: a.status,
          composite: a.composite,
          tier: a.tier,
          error: a.error,
          raw_scrape_path: a.rawScrapePath,
        })
        .select("id")
        .single(),
      "createAudit",
    ) as { id: string };
    return row.id;
  },

  async insertScores(auditId, rows) {
    if (rows.length === 0) return;
    const db = getServiceClient();
    const { error } = await db.from("audit_scores").insert(
      rows.map((r) => ({
        audit_id: auditId,
        category: r.category,
        points: r.points,
        max_points: r.maxPoints,
        evidence: r.evidence,
      })),
    );
    if (error) throw new Error(`insertScores: ${error.message}`);
  },

  async supersedeActiveCertificates(domain) {
    const db = getServiceClient();
    // Free up the "one active cert per domain" partial unique index before inserting
    // the fresh cert (re-audit supersedes the prior one).
    const { error } = await db
      .from("certificates")
      .update({ superseded: true })
      .eq("domain", domain)
      .eq("revoked", false)
      .eq("superseded", false);
    if (error) throw new Error(`supersedeActiveCertificates: ${error.message}`);
  },

  async createCertificate(c) {
    const db = getServiceClient();
    const row = unwrap(
      await db
        .from("certificates")
        .insert({
          submission_id: c.submissionId,
          audit_id: c.auditId,
          domain: c.domain,
          score: c.score,
          tier: c.tier,
          is_public: false,
        })
        .select("id")
        .single(),
      "createCertificate",
    ) as { id: string };
    return row.id;
  },
};

// ---------- Submit / confirm / report helpers ----------

export interface NewSubmission {
  email: string;
  url: string;
  domain: string;
  ip: string | null;
  consent: boolean;
}

export async function createSubmission(s: NewSubmission): Promise<string> {
  const db = getServiceClient();
  const row = unwrap(
    await db
      .from("submissions")
      .insert({
        email: s.email,
        url: s.url,
        domain: s.domain,
        ip: s.ip,
        status: "pending",
        consent_at: s.consent ? new Date().toISOString() : null,
      })
      .select("id")
      .single(),
    "createSubmission",
  ) as { id: string };
  return row.id;
}

/** Latest active (non-revoked, non-superseded) certificate for a domain, if any. */
export async function findActiveCertificateByDomain(domain: string): Promise<CertificateRow | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("certificates")
    .select("*")
    .eq("domain", domain)
    .eq("revoked", false)
    .eq("superseded", false)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findActiveCertificateByDomain: ${error.message}`);
  return (data as CertificateRow | null) ?? null;
}

/** Mark a submission's email confirmed. Idempotent: safe to call on an already-
 *  confirmed submission (a reused magic link just re-confirms). */
export async function confirmSubmission(submissionId: string): Promise<SubmissionRow | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("submissions")
    .update({ status: "confirmed", email_confirmed_at: new Date().toISOString() })
    .eq("id", submissionId)
    .neq("status", "deleted")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`confirmSubmission: ${error.message}`);
  return (data as SubmissionRow | null) ?? null;
}

export interface ReportBundle {
  submission: SubmissionRow;
  audit: SiteAuditRow;
  scores: { category: string; points: number; max_points: number; evidence: string[] }[];
}

/** Everything the private report page needs, by submission id. Null if not found
 *  or not yet confirmed (the report is gated behind email confirmation). */
export async function getReportBundle(submissionId: string): Promise<ReportBundle | null> {
  const db = getServiceClient();
  const { data: submission, error: subErr } = await db
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();
  if (subErr) throw new Error(`getReportBundle.submission: ${subErr.message}`);
  if (!submission) return null;

  const { data: audit, error: audErr } = await db
    .from("site_audits")
    .select("*")
    .eq("submission_id", submissionId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (audErr) throw new Error(`getReportBundle.audit: ${audErr.message}`);
  if (!audit) return null;

  const { data: scores, error: scErr } = await db
    .from("audit_scores")
    .select("category, points, max_points, evidence")
    .eq("audit_id", (audit as SiteAuditRow).id);
  if (scErr) throw new Error(`getReportBundle.scores: ${scErr.message}`);

  return {
    submission: submission as SubmissionRow,
    audit: audit as SiteAuditRow,
    scores: (scores as ReportBundle["scores"]) ?? [],
  };
}

// ---------- Ownership verification / public credential (Phase 1b) ----------

export async function getSubmission(id: string): Promise<SubmissionRow | null> {
  const db = getServiceClient();
  const { data, error } = await db.from("submissions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getSubmission: ${error.message}`);
  return (data as SubmissionRow | null) ?? null;
}

export interface VerificationRecord {
  id: string;
  domain: string;
  method: "dns_txt" | "well_known";
  token: string;
  status: string;
}

export async function createDomainVerification(v: {
  submissionId: string;
  domain: string;
  method: "dns_txt" | "well_known";
  token: string;
}): Promise<void> {
  const db = getServiceClient();
  const { error } = await db.from("domain_verifications").insert({
    submission_id: v.submissionId,
    domain: v.domain,
    method: v.method,
    token: v.token,
    status: "pending",
  });
  if (error) throw new Error(`createDomainVerification: ${error.message}`);
}

/** The most recent verification record for a submission carrying this token. */
export async function findVerification(submissionId: string, token: string): Promise<VerificationRecord | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from("domain_verifications")
    .select("id, domain, method, token, status")
    .eq("submission_id", submissionId)
    .eq("token", token)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`findVerification: ${error.message}`);
  return (data as VerificationRecord | null) ?? null;
}

export async function markVerificationVerified(id: string): Promise<void> {
  const db = getServiceClient();
  const { error } = await db
    .from("domain_verifications")
    .update({ status: "verified", verified_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`markVerificationVerified: ${error.message}`);
}

/** Flip the domain's active certificate to public (idempotent: keeps an existing slug). */
export async function publishCertificateForDomain(domain: string, slug: string): Promise<CertificateRow | null> {
  const db = getServiceClient();
  const active = await findActiveCertificateByDomain(domain);
  if (!active) return null;
  if (active.is_public && active.public_slug) return active;
  const { data, error } = await db
    .from("certificates")
    .update({
      is_public: true,
      ownership_verified_at: new Date().toISOString(),
      public_slug: active.public_slug ?? slug,
    })
    .eq("id", active.id)
    .select("*")
    .single();
  if (error) throw new Error(`publishCertificateForDomain: ${error.message}`);
  return data as CertificateRow;
}

/** Fetch a certificate by its public slug (any state — the caller applies canRenderPublic). */
export async function getCertificateBySlug(slug: string): Promise<CertificateRow | null> {
  const db = getServiceClient();
  const { data, error } = await db.from("certificates").select("*").eq("public_slug", slug).maybeSingle();
  if (error) throw new Error(`getCertificateBySlug: ${error.message}`);
  return (data as CertificateRow | null) ?? null;
}
