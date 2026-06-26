# Implementation Plan — LLM Visibility Certification™ (v1)

Locked by /gstack-plan-eng-review on 2026-06-26 against the approved design doc
(`~/.gstack/projects/llmvisibilitycertification.com/mattb-main-design-20260626-175427.md`).
Branch: main · Stack: Next.js (App Router) + Supabase (Postgres + Storage) + Vercel.

## v1 scope (LOCKED)

**Track 1 only. Public certification, OWNERSHIP-GATED.** A visitor submits a URL +
email; the audit runs and the scored report is delivered privately (email magic
link). The report becomes a **public** certificate (verify page + badge + registry)
ONLY after the submitter proves they control the domain. Sites whose owner does not
verify still get the private report (lead-magnet value preserved), never a public page.

Track 2 (exam → Pro credential) is a hard Phase-2 gate, out of v1.

## Decisions locked in this review

1. **Ownership gate before any public page.** No public verify/badge for a domain the
   submitter hasn't verified (DNS TXT or `.well-known` file). Kills the "certify a
   competitor and publish a negative score" defamation/brand-safety risk.
2. **Rubric calibration is a launch gate, not a /spec footnote.** Before any public
   `LLM Visibility Score™` is live, validate the deterministic rubric against ~30-50
   sites whose real LLM-citation status you've checked across 2-3 engines, and show it
   rank-orders them. An uncalibrated trademarked score is a reputational short on the mark.
3. **Static SVG badge, not a live token-checked route** for v1. Regenerate the SVG on
   (re)audit/revoke, serve from Storage/CDN. The live-route revocation-latency problem
   doesn't exist at launch volume (revocation = manual SQL in v1).
4. **Email domain auth (SPF/DKIM/DMARC) before launch.** A cold domain's first
   transactional sends land in spam and silently crater the confirm rate.
5. **Trademark line + issuing entity is step 0** — it blocks the first deployable public
   route (every verify page, badge, footer needs it), not just launch.
6. **Single-URL scope is explicit.** v1 audits the submitted URL (typically homepage)
   and the cert claims *that page's* readiness, plus site-wide signals available there
   (robots.txt, sitemap, schema). Multi-page crawl is deferred (Firecrawl cost).
7. **Methodology page publishes categories + principles, NOT exact point weights** — a
   published weight table on a deterministic rubric is an answer key for gaming the score.

## NOT in scope (deferred, with rationale)

- **Track 2 (exam/Pro cert)** — hard Phase-2 gate; ship + validate Track 1 first.
- **Live token-checked badge route** — premature; static SVG suffices at v1 volume.
- **90-day expiry enforcement** — issue non-expiring certs; add expiry cron once volume exists. Verify pages show "audited on {date}" + a "re-audit" affordance instead.
- **Admin revocation UI** — manual SQL at launch.
- **Per-view verify analytics table** — use Vercel Analytics.
- **Multi-page site crawl** — single-URL v1; multi-page multiplies Firecrawl cost.
- **Live citation-probing (querying real engines)** — v1.1, after the deterministic rubric is calibrated.

## What already exists / reuse

- **aeo-page-grader rubric** (Matt's internal skill) — the seed for the scoring criteria; do not invent a new rubric.
- **Firecrawl** — already in Matt's stack; the scraper. Reuse, don't build.
- **AI Reg Radar** (Next.js + Supabase + Vercel) — the proven project pattern; mirror its structure.
- **Repo foundation** — README, .gitignore (Next.js), CLAUDE.md (brand + guardrail rules) already committed.

## Architecture + data flow

```
              ┌──────────────────────────────────────────────────────────┐
  visitor ──▶ │  /  (submit: URL + email)                                  │
              └───────────────┬──────────────────────────────────────────┘
                              ▼  POST /api/audit
              ┌──────────────────────────────────────────────────────────┐
              │ validate · rate-limit (IP+domain, daily cap) · dedup       │
              │ create submission(status=pending) · enqueue audit job      │
              │ send magic-link email (Resend/Postmark, SPF/DKIM/DMARC)    │
              └───────────────┬──────────────────────────────────────────┘
                              ▼  audit worker
              ┌──────────────────────────────────────────────────────────┐
              │ Firecrawl scrape ──▶ Storage(raw)  ──▶ scorer(pure fn)     │
              │   scrapeJSON → [{category,points,max,evidence}] → 0-100    │
              │   → tier (0-59 none · 60-79 Certified · 80-100 Gold)       │
              │   create certificate(is_public=false)                      │
              └───────────────┬──────────────────────────────────────────┘
            magic link click  ▼  GET /api/confirm
              ┌──────────────────────────────────────────────────────────┐
              │ confirm email → PRIVATE report at /report/[id]            │
              │ (score + per-category punch list)   ← lead captured here   │
              └───────────────┬──────────────────────────────────────────┘
                              ▼  user opts to "make it public"
              ┌──────────────────────────────────────────────────────────┐
              │ POST /api/verify-domain → check DNS TXT or /.well-known    │
              │  verified → certificate.is_public=true, ownership_verified │
              │  → render static SVG badge to Storage                      │
              └───────────────┬──────────────────────────────────────────┘
                              ▼
        PUBLIC: /verify/[slug] (report)   ·   /badge/[slug].svg (embeddable)
```

## Data model (Supabase Postgres)

```sql
submissions(
  id uuid pk, email text, email_confirmed_at timestamptz,
  url text, domain text, ip inet, status text,           -- pending|confirmed|deleted
  consent_at timestamptz, created_at timestamptz default now())

site_audits(
  id uuid pk, submission_id uuid fk, url text,
  raw_scrape_path text,                                   -- Supabase Storage object key
  status text, fetched_at timestamptz)                    -- ok|incomplete|failed

audit_scores(
  id uuid pk, audit_id uuid fk, category text,
  points int, max_points int, evidence jsonb)

domain_verifications(
  id uuid pk, submission_id uuid fk, domain text,
  method text, token text, status text, verified_at timestamptz)  -- dns_txt|well_known

certificates(
  id uuid pk, submission_id uuid fk, public_slug text unique,
  domain text, score int, tier text,
  is_public bool default false, ownership_verified_at timestamptz,
  badge_path text, revoked bool default false,
  audited_at timestamptz, issued_at timestamptz)
```
Storage bucket: `raw-scrapes` (private). Dedup: one active certificate per domain
(latest re-audit supersedes; older marked `revoked=true` or `superseded`).

## Scoring contract

`score(scrapeJSON) -> { categories: [{key, points, max_points, evidence[]}], composite: 0-100, tier }`
- v1 deterministic, pure function, unit-testable in isolation (this is the product — build + calibrate it FIRST, before the web app).
- Category buckets (weights tuned in /spec, NOT published): schema/structured-data;
  citations + statistics + quotations; entity + E-E-A-T; LLM crawler access
  (robots.txt parse + live fetch with GPTBot/ClaudeBot/Google-Extended UAs to catch
  WAF/CDN blocks); answer-formatted content; freshness/dates; on-page brand signals.
- **Calibration gate:** rank-order ~30-50 real-citation-checked sites before public launch.

## Build sequence

- **Phase 0 — Rubric (de-risk first, no web app):** scorer as a CLI runnable on a list
  of URLs (Firecrawl + scorer). Assemble the calibration set; prove rank-ordering. This
  is the only hard, novel part — front-load it.
- **Phase 1a — Private audit (the lead magnet):** Next.js skeleton + Supabase schema +
  submit form + `/api/audit` + audit worker + magic-link confirm + `/report/[id]`.
  Fully usable, captures leads, zero public-exposure risk.
- **Phase 1b — Public credential (ownership-gated):** `/api/verify-domain` (DNS TXT +
  `.well-known`) → `is_public` flip → `/verify/[slug]` (noindex until trusted) + static
  `/badge/[slug].svg` + minimal registry + brand JSON-LD schema (Org=LLM Visibility™,
  author=Matt Bertram, sameAs matthewbertram.com).
- **Phase 1c — Hardening:** `/methodology` (categories, not weights), `/privacy` +
  `/api/me` deletion, rate-limit + daily cap + job queue, email domain auth, trademark
  line site-wide.

## Test coverage plan (target: 100% of v1 codepaths)

```
CODE PATHS                                          USER FLOWS / EDGE
[+] lib/scorer (pure)                               [+] Submit → confirm → private report
  ├── score() happy 0-100 + tier bands 60/80          ├── [→E2E] full happy path
  ├── empty/partial scrape → graceful low score        ├── double-submit same domain (dedup)
  └── each category scorer + evidence                  └── submit malformed URL
[+] api/audit                                       [+] Ownership verify → public cert
  ├── valid → submission + job + magic link            ├── [→E2E] DNS TXT verify → /verify public
  ├── rate-limit / daily-cap exceeded → 429            ├── well-known file verify
  ├── dedup existing active cert → refresh             └── verify FAILS (no record) → stays private
  └── invalid email / url → 400                      [+] Public page states
[+] audit worker (Firecrawl)                          ├── valid cert renders score+badge
  ├── scrape ok → score → cert(is_public=false)        ├── revoked → "revoked" state (not stale img)
  ├── scrape 403/429/timeout → status=failed, user msg ├── not-found slug → 404
  └── JS-only/partial → status=incomplete              └── noindex header present until trusted
[+] api/confirm (magic link)  valid / expired / reused
[+] api/verify-domain  dns_txt / well_known / fail / not-owner
[+] api/me (GDPR delete)  removes submission+audit+cert+badge
[+] badge/[slug].svg  valid tier / revoked / not-found

COVERAGE TARGET: every branch above + 6 E2E flows. CRITICAL: ownership-gate
(public page must NEVER render for an unverified domain) gets a dedicated test.
```

## Failure modes (each needs a test + visible error, never silent)

- Firecrawl down/timeout → audit `status=failed`, user sees "couldn't reach your site, retry"; NOT a 0 score masquerading as a real result.
- Magic link expired/reused → clear "link expired, request a new one"; never a blank confirm.
- Ownership check false-negative (DNS propagation lag) → "not found yet, DNS can take time, re-check" + re-check button; never silently public.
- **Public page renders for unverified domain → CRITICAL gap.** Guard: `/verify/[slug]` and `/badge` 404 unless `is_public=true`. Dedicated test.
- Email lands in spam (cold domain) → mitigated by SPF/DKIM/DMARC; monitor confirm rate.

## Implementation Tasks

Synthesized from this review. P1 blocks ship; P2 same branch; P3 follow-up.

- [ ] **T1 (P1, human ~1d / CC ~30m)** — scorer — build `lib/scorer` pure fn + CLI runner; assemble calibration set; prove rank-ordering. Verify: CLI on 50 URLs, rank-order check.
- [ ] **T2 (P1, human ~0.5d / CC ~15m)** — db — Supabase schema (5 tables) + `raw-scrapes` bucket + RLS. Verify: migrations apply, RLS denies cross-row reads.
- [ ] **T3 (P1, human ~1d / CC ~30m)** — api/audit + worker — submit, rate-limit, dedup, Firecrawl scrape → score → cert(private). Verify: unit + E2E happy + failure.
- [ ] **T4 (P1, human ~0.5d / CC ~15m)** — auth — magic-link confirm + `/report/[id]` private report. Verify: confirm valid/expired/reused tests.
- [ ] **T5 (P1, human ~1d / CC ~30m)** — ownership — `/api/verify-domain` (DNS TXT + well-known) → is_public flip. Verify: verify/fail/not-owner tests + the CRITICAL ownership-gate test.
- [ ] **T6 (P1, human ~0.5d / CC ~20m)** — public — `/verify/[slug]` (noindex) + static `/badge/[slug].svg` + brand JSON-LD. Verify: page-state tests (valid/revoked/not-found).
- [ ] **T7 (P2, human ~0.5d / CC ~15m)** — compliance — `/methodology` (no weights), `/privacy`, `/api/me` deletion, consent capture. Verify: deletion removes all rows + badge.
- [ ] **T8 (P2, human ~0.5d / CC ~15m)** — infra — rate-limit + daily cap + job queue; email SPF/DKIM/DMARC. Verify: cap returns 429; email auth checks pass.
- [ ] **T9 (P1, human ~10m / CC ~2m)** — legal — trademark line + issuing entity site-wide (BLOCKED on Matt). Verify: present on every public route.

## Worktree parallelization

| Step | Modules | Depends on |
|------|---------|-----------|
| T1 scorer | lib/ | — |
| T2 db | supabase/ | — |
| T3 audit | app/api/, lib/ | T1, T2 |
| T4 auth | app/api/, app/report | T2 |
| T5 ownership | app/api/ | T2 |
| T6 public | app/verify, app/badge | T2, T5 |
| T7 compliance | app/ | T2 |
| T8 infra | app/api/, infra | T3 |

Lane A: **T1 scorer** (independent, the long pole — start immediately).
Lane B: **T2 db → T3/T4/T5 → T6** (the app spine, sequential on shared app/api).
Launch A + T2 in parallel worktrees; merge; then the api routes; then T6/T7/T8.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 6 issues folded, 1 critical control (ownership gate) covered by guard+test |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| Outside Voice | Claude subagent | Independent 2nd opinion | 1 | issues_found | strategy/legal: uncalibrated mark, open-submission defamation surface, premature badge infra |

- **CROSS-MODEL:** Outside voice argued private-lead-magnet-first; review recommended public-but-ownership-gated. User chose ownership-gated public cert. The non-strategy fixes (calibration gate, static badge, email auth, single-URL scope, no published weights, ownership gate) were folded in regardless.
- **VERDICT:** ENG CLEARED — ready to implement. Phase 0 (scorer + calibration) is the long pole; start there. T9 (trademark line) blocked on Matt.

NO UNRESOLVED DECISIONS
