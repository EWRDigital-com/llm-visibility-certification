-- LLM Visibility Certification™ — v1 data model (T2).
-- Locked schema from docs/IMPLEMENTATION-PLAN.md: 5 tables + a private raw-scrapes
-- Storage bucket. All access is server-side via the service-role key, which BYPASSES
-- RLS. We still enable RLS with NO permissive policies so that the anon/public key
-- (if ever used from the browser) can read/write nothing — deny-by-default.

create extension if not exists "pgcrypto";

-- 1. Submissions — one row per URL+email submitted through the form.
create table if not exists public.submissions (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  email_confirmed_at timestamptz,
  url               text not null,
  domain            text not null,
  ip                inet,
  status            text not null default 'pending'
                      check (status in ('pending', 'confirmed', 'deleted')),
  consent_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists submissions_domain_idx on public.submissions (domain);
create index if not exists submissions_email_idx on public.submissions (email);

-- 2. Site audits — one row per scrape+score run for a submission.
create table if not exists public.site_audits (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.submissions (id) on delete cascade,
  url             text not null,
  raw_scrape_path text,                       -- Supabase Storage object key (raw-scrapes bucket)
  status          text not null
                    check (status in ('ok', 'incomplete', 'failed')),
  composite       int,                         -- cached headline readiness (0-100), null when not ok
  tier            text check (tier in ('none', 'certified', 'gold')),
  error           text,                        -- user-facing reason when status <> 'ok'
  fetched_at      timestamptz not null default now()
);
create index if not exists site_audits_submission_idx on public.site_audits (submission_id);

-- 3. Audit scores — the per-category punch list for an audit (one row per category).
create table if not exists public.audit_scores (
  id          uuid primary key default gen_random_uuid(),
  audit_id    uuid not null references public.site_audits (id) on delete cascade,
  category    text not null,
  points      int not null,
  max_points  int not null,
  evidence    jsonb not null default '[]'::jsonb
);
create index if not exists audit_scores_audit_idx on public.audit_scores (audit_id);

-- 4. Domain verifications — proof-of-control attempts (Phase 1b uses these).
create table if not exists public.domain_verifications (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  domain        text not null,
  method        text check (method in ('dns_txt', 'well_known')),
  token         text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'verified', 'failed')),
  verified_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists domain_verifications_submission_idx on public.domain_verifications (submission_id);

-- 5. Certificates — the issued credential. Private until ownership is verified.
create table if not exists public.certificates (
  id                    uuid primary key default gen_random_uuid(),
  submission_id         uuid not null references public.submissions (id) on delete cascade,
  audit_id              uuid references public.site_audits (id) on delete set null,
  public_slug           text unique,
  domain                text not null,
  score                 int not null,
  tier                  text not null check (tier in ('none', 'certified', 'gold')),
  is_public             boolean not null default false,
  ownership_verified_at timestamptz,
  badge_path            text,
  revoked               boolean not null default false,
  superseded            boolean not null default false,
  audited_at            timestamptz not null default now(),
  issued_at             timestamptz not null default now()
);
create index if not exists certificates_domain_idx on public.certificates (domain);
-- Dedup: at most ONE active (non-revoked, non-superseded) certificate per domain.
create unique index if not exists certificates_one_active_per_domain
  on public.certificates (domain)
  where (revoked = false and superseded = false);

-- Deny-by-default RLS on every table (service-role bypasses; anon gets nothing).
alter table public.submissions          enable row level security;
alter table public.site_audits          enable row level security;
alter table public.audit_scores         enable row level security;
alter table public.domain_verifications enable row level security;
alter table public.certificates         enable row level security;

-- Private Storage bucket for raw scrape payloads (never public).
insert into storage.buckets (id, name, public)
values ('raw-scrapes', 'raw-scrapes', false)
on conflict (id) do nothing;
