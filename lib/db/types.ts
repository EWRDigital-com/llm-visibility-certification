// Row shapes for the Supabase tables (see supabase/migrations/0001_init.sql).
// Tier is shared with the scorer so the credential tier has a single definition.

import type { Tier } from "../scorer/types.js";

export type { Tier };
export type SubmissionStatus = "pending" | "confirmed" | "deleted";
export type AuditStatus = "ok" | "incomplete" | "failed";

export interface SubmissionRow {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  url: string;
  domain: string;
  ip: string | null;
  status: SubmissionStatus;
  consent_at: string | null;
  created_at: string;
}

export interface SiteAuditRow {
  id: string;
  submission_id: string;
  url: string;
  raw_scrape_path: string | null;
  status: AuditStatus;
  composite: number | null;
  tier: Tier | null;
  error: string | null;
  fetched_at: string;
}

export interface AuditScoreRow {
  id: string;
  audit_id: string;
  category: string;
  points: number;
  max_points: number;
  evidence: string[];
}

export interface CertificateRow {
  id: string;
  submission_id: string;
  audit_id: string | null;
  public_slug: string | null;
  domain: string;
  score: number;
  tier: Tier;
  is_public: boolean;
  ownership_verified_at: string | null;
  badge_path: string | null;
  revoked: boolean;
  superseded: boolean;
  audited_at: string;
  issued_at: string;
}
