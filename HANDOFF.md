# HANDOFF — LLM Visibility Certification™

Last updated: 2026-07-13 (session 4 — Phase 1a + 1b built; Supabase provisioned). Read this first when resuming. Built with **gstack** — keep using it.

## ▶ RESUME HERE — next session (priority order)
State: recalibration landed (committed + deployed); **Phase 1a + 1b built** (submit → audit → magic-link → private
report → ownership-gated public cert + badge). tsc clean · **124 tests** · `next build` green · committed + pushed
(**HEAD `c00df14`**). **Supabase provisioned** (`vhhgykgigcbbxuqeuyyc`, schema applied). App is NOT deployed.

1. **Run the live E2E — blocked only on one secret.** Paste the Supabase **service_role** key into `.env` as
   `SUPABASE_SERVICE_ROLE_KEY` (Dashboard → Project Settings → API), then `npm run dev` → submit a URL at `/` → the
   magic link **prints to the server console** (no email provider yet) → open it → `/report/[id]` → "Make this public".
   Fix whatever surfaces. No email account needed for this test.
2. **Phase 1c — hardening:** `/methodology` (categories, NOT weights) · `/privacy` + `/api/me` GDPR delete (must also
   purge the `raw-scrapes` Storage object, not just rows) · durable rate-limit + daily cap + queue + CAPTCHA
   (email-abuse) · production monitoring/alerting (uptime, worker failures, email bounce).
3. **Calibration gate (parallelizable):** approve a ~30–50-site list → `npm run score:batch` → finalize the 60/80 tier
   + maturity-rung cutoffs off the distribution → add a golden-file rank-order regression test.
4. **Go-live plumbing:** paste the approved TM legal line (independent, under Matt) · flip the Vercel project from
   static (`framework:null`/`outputDirectory:public`) to Next.js · reconnect Git→Vercel auto-deploy · then the
   Cloudflare→Vercel apex DNS cutover (HIGH-RISK; documented rollback; WP archive exists).
5. **Email (before public launch):** Resend key + authenticated sending domain (SPF/DKIM/DMARC).
6. **Pre-launch:** git-history scrub for ever-committed `.private/`; flip repo private; TM clearance (not just wording);
   reciprocal `sameAs` on matthewbertram.com / ewrdigital / bestseopodcast for the @graph entity weld.

Blocked-on-Matt: service_role key (E2E) · calibration site list · email provider+domain · TM legal string ·
Cloudflare/registrar control. Full narrative in the session notes below.

## ⭐ SESSION 2026-07-13 (cont.) — PHASE 1b PUBLIC CREDENTIAL + SUPABASE PROVISIONED
**Supabase is live:** project `llm-visibility-certification` (ref `vhhgykgigcbbxuqeuyyc`, org MBL – Personal, us-east-1,
$0/mo). Migration `init_llm_visibility_cert_v1` applied — all 5 tables present + RLS on, `raw-scrapes` bucket created.
`.env` scaffolded locally (real `SUPABASE_URL` + a generated `MAGIC_LINK_SECRET`). **`SUPABASE_SERVICE_ROLE_KEY` is
still blank — the MCP cannot expose the secret, so Matt pastes it** (Dashboard → Project Settings → API → service_role)
to run the live flow. **Phase 1b built (ownership-gated public credential):** `POST /api/verify-domain` (issue token →
DNS-TXT or `.well-known` check → flip the domain's active cert `is_public=true` + public slug; authorized by the
report_access cookie; SSRF-guards the well-known fetch), `/verify/[slug]` (public cert page, **noindex** in v1, 404s via
`canRenderPublic` unless public + verified + not-revoked), `/badge/[slug]` (SVG; revoked → "revoked" state,
missing/private → 404), and a `PublishPanel` on the report drives it. Repo adds getSubmission /
createDomainVerification / findVerification / markVerificationVerified / publishCertificateForDomain /
getCertificateBySlug. **`canRenderPublic` is THE ownership gate** — the most-tested unit (11 verify tests incl. the
never-render-unverified / never-render-revoked cases). **Gate green: tsc clean, 124 tests, `next build` OK (9 routes).**
Committed + pushed; NOT deployed (would replace the live definitional homepage + needs env).
**E2E to run once the service_role key is set:** `npm run dev` → submit at `/` → the magic link prints to the server
console (no email provider yet) → open it → `/report/[id]` → "Make this public".

## ⭐ SESSION 2026-07-13 — PHASE 1a FOUNDATION BUILT (code-complete; gate green; NOT yet run against live infra)
Converted the repo from the static placeholder to a **Next.js (App Router + Tailwind)** app and built the
Phase-1a private-audit pipeline end to end in code. **Gate green: `tsc` clean, 113 tests pass, `next build` OK.**
Flow implemented:
`/` submit form → `POST /api/audit` (email/consent validation · **SSRF gate** via `assertPublicHost` · best-effort
rate-limit · create submission) → `runAudit` (`lib/audit/run.ts`: free-fetch scrape → `scoreSite` → persist
site_audit + audit_scores + a PRIVATE certificate; dedup supersedes any prior active cert for the domain; scrape
failures record `failed`/`incomplete`, never a 0-score) → magic-link email (`lib/email/send.ts`, Resend REST,
**env-gated** — logs the link if `RESEND_API_KEY` unset) → `GET /api/confirm` (verify HMAC token → confirm email →
set httpOnly `report_access` cookie → redirect) → `/report/[id]` (**cookie-gated** private report: composite, tier,
per-pillar readiness, punch list, "not a citation prediction" disclaimer). Also migrated `api/score.ts` →
`app/api/score/route.ts` **and added the SSRF guard there** (closes the live SSRF hole the review flagged).
New: `lib/db/{client,repo,types}.ts` (typed, `AuditStore` injectable), `lib/security/{url,ratelimit}.ts`,
`lib/tokens.ts`, `lib/email/send.ts`, `supabase/migrations/0001_init.sql` (5 tables + private `raw-scrapes` bucket +
deny-by-default RLS). Tests added: url/SSRF (11), tokens (5), audit runner (3).

**BLOCKERS before it runs end-to-end (need Matt / infra):**
1. **Supabase not provisioned** — MCP requires org + free-tier cost confirm. Migration is ready to apply.
2. **Email not live** — needs `RESEND_API_KEY` + an authenticated sending domain (SPF/DKIM/DMARC).
3. Set env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAGIC_LINK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`,
   `NEXT_PUBLIC_APP_URL`.
4. **Vercel project settings** still `framework:null` / `outputDirectory:public` — flip to Next.js before deploy.

**NEXT:** provision Supabase → set env → run E2E (submit→confirm→report) → Phase 1b (ownership verify → public
`/verify/[slug]` + badge). Calibration gate (finalize 60/80 thresholds) can run in parallel. `raw-scrapes` Storage
write + GDPR `/api/me` purge, real rate-limit/queue + CAPTCHA, and monitoring are Phase 1c.

## ⭐ SESSION 2026-07-12 — RECALIBRATION COMMITTED (reconciled; deploy via CLI)
Matt locked the two gating decisions: (a) **score label = keep the "LLM Visibility™ Score" mark**, with the
subtitle always reading "on-page readiness audit" + the explicit "NOT a citation prediction" disclaimer (already
carried in `lib/report/format.ts`); (b) **issuing entity = independent, under Matt Bertram** (LLM Visibility™ as
its own authority, not an EWR funnel) — the exact TM legal string still needs pasting into the `TODO(Matt)` in
`public/index.html`. Reconciled the two inconsistencies the 06-27 recalibration left, then committed the whole
change set on HEAD:
1. **crawler_access no longer scores the advisory UA probe** (`criteria.ts scoreCrawlerAccess`) — now robots-only,
   so a robots-allowed page whose WAF 403s our crawler-UA probe scores 20/20, matching the eligibility gate. +1 test.
2. **Comment contradiction fixed** — headers in `index.ts`/`criteria.ts` now say pillar weights + category maxes are
   SET from the 2026 citation-driver research, while the **tier bands (60/80) stay provisional** pending the
   calibration run (no more "provisional… will be tuned" vs "calibrated" clash).
**94 tests green, tsc clean.** Deploy to prod is manual: `vercel deploy --prod --yes` (GitHub→Vercel auto-deploy
still not firing). NEXT: Phase-0 calibration gate (approve the 30-50-site list → `npm run score:batch` → finalize
60/80 + rung cutoffs), paste the TM legal line, then Phase 1a. Full remaining-work map lives in the session roadmap.

## ⭐ SESSION 2026-06-27 PM — RECALIBRATION (now committed 2026-07-12; see note above)
Matt's decision: **score = on-page READINESS, not a citation prediction.** This RETIRES the old launch
gate (Spearman of composite vs real citation) — under readiness framing, modalpoint 89 > Mayo 35 is
CORRECT (Mayo wins citations off-domain, which v1 doesn't measure). New gate = readiness face-validity +
no fabricated scores + blocked sites handled honestly. Shipped (all TDD, **93 tests green**, tsc clean):
1. **Unscorable guard** — 2xx page with no headings AND no JSON-LD = JS/anti-bot shell → error row, never 0 (`lib/scrape/parse.ts` `hasScorableContent`).
2. **Non-2xx free-fetch = unscorable** (403/404 → ScrapeError, not 0; `lib/scrape/firecrawl.ts` `fetchPageDirect`).
3. **Eligibility false-negatives fixed** — spoofed-UA fetch probe no longer flips eligibility; keys off robots.txt + real status (Mayo now eligible; WebMD correctly ineligible = real robots block).
4. **Reweight** per `.private/research/ai-citation-drivers-2026.md`: pillars 0.30/0.40/0.30; Foundation made entity-weighted (schema max 20→10, entity 10→16, brand 10→14) in `lib/scorer/{index,criteria}.ts`.
5. **Report + API reframed** to readiness; new `isTargetScrapeError` so anti-bot/JS sites return clean 502 (not 503 "at capacity").
Results: `.private/calibration/results-run2.csv` + `run2-findings.md` (Run-1 `results.csv` preserved). 23 scored / 8 unscorable; no fabricated 0s.
⚠️ **FREE-TIER BLIND SPOT:** ~26% of authority sites are anti-bot/JS-walled → unscorable on free fetch; scoring them needs Firecrawl (key currently 402).
**OPEN DECISIONS (Matt)** in `.private/index-reframe-proposal.md`: (a) TM legal line + issuing entity; (b) score label keep vs "…Readiness Score"; (c) free tier accept-unscorable vs budget Firecrawl; (d) badge-on-readiness + finalize 60/80 thresholds.
**NEXT:** decisions → `/gstack-review` → commit → `vercel deploy --prod` (auto-deploy NOT wired). Then Phase 1a (Next.js + Supabase + ownership-gated cert/verify).

## What this is
Free, public certification platform for the standalone **LLM Visibility™** brand
(Matt Bertram = certifying authority; filed USPTO mark + his book *LLM Visibility*).
Goal = authority + lead-gen for the paid LLM Visibility™ service, NOT direct revenue.
v1 = **Track 1** (certify a WEBSITE), **public but ownership-gated**. Track 2 (exam →
Pro credential) is a hard Phase-2 gate, deferred.

## Canonical docs (read in this order)
1. `docs/IMPLEMENTATION-PLAN.md` — the locked v1 plan (data model, scoring contract, routes, build sequence, tests, NOT-in-scope). Source of truth.
2. `~/.gstack/projects/llmvisibilitycertification.com/mattb-main-design-20260626-175427.md` — approved design doc (the why).
3. `CLAUDE.md` — brand + guardrail rules + gstack routing.
4. Memory: `~/.claude/projects/C--Users-mattb/memory/ventures/project_llm_visibility_certification.md`.

## Current state (git `main`)
- `532b1a0` foundation (README, .gitignore, CLAUDE.md)
- `f76e081` locked implementation plan
- `90cd2ce` Phase 0 / T1 core: deterministic scorer `lib/scorer` (original 7 flat categories)
- `02c0071` **Pillar reframe: 3 scored pillars + eligibility gate + bottleneck + capped maturity rung**
- `124ec84` **Phase 0 scrape adapter + CLIs**: `lib/scrape/{robots,parse,firecrawl}.ts`, `lib/report/format.ts`, `scripts/score-url.ts` + `scripts/score-batch.ts`. Scorer now runs on real URLs.
- DONE and green (`npm test` → **77/77**, `npx tsc --noEmit` clean). Node v24, npm 11. Deps added: `cheerio` (runtime), `tsx` (dev).
- Verified end-to-end on real HTML (matthewbertram.com) — pipeline produces a coherent report, bottleneck = Ingestion.
- **SHIPPED 2026-06-27 — GitHub + Vercel live.** Repo pushed **PUBLIC** to `EWRDigital-com/llm-visibility-certification`
  (https://github.com/EWRDigital-com/llm-visibility-certification).
  **LIVE + public + indexable at https://llmvisibilitycertificationcom.vercel.app/** (note: NO dash — the dashed/dotted variants 404).
  `public/index.html` is now the real **"What is LLM Visibility"** definitional page (answer-formatted for the AIO query; connected
  `@graph` JSON-LD = Matt Bertram Person hub → EWR / Best SEO Podcast / book; E-E-A-T author block at bottom; trademark line shipped
  minimal with a `TODO(Matt)` for exact legal wording). Replaced the old `noindex` placeholder 2026-06-27.
  `.private/` + `scripts/calibration/` are gitignored AND vercelignored — book, answer key, and creds are NOT published.
  - ⚠️ **GitHub→Vercel auto-deploy is NOT firing.** A `git push` to main did NOT trigger a Vercel build (verified 2026-06-27: latest
    git-side deploy was 56m stale after a fresh push). **To deploy: `vercel deploy --prod --yes` from the project dir (CLI).** The
    git integration is either disconnected or broken — fix it or keep deploying via CLI. (Handoff previously claimed auto-deploy worked — it doesn't.)
  - ⚠️ **Custom domain `llmvisibilitycertification.com` is NOT yet on Vercel.** It still serves a **disposable WordPress demo**
    (unedited "itactics" theme, behind Cloudflare). Matt confirmed disposable 2026-06-27; archived (public REST + HTML snapshot,
    no DB access) to **private repo `EWRDigital-com/llmvisibilitycertification-wp-archive`**. **Remaining to go live on the domain:**
    repoint Cloudflare DNS → Vercel (HIGH-RISK live-domain change; confirm who controls that Cloudflare account) + add the domain in Vercel.
  - ⚠️ **At Phase 1a: delete the `vercel.json` `outputDirectory: public` override** (and the placeholder) so Next.js builds normally.
  - ⚠️ **Scorer source (incl. provisional pre-calibration weights) is now PUBLIC** — flip repo private if the weight-exposure (plan decision #7, "answer key") matters more than the public-repo Vercel-Hobby benefit.

### Phase 0 architecture (pure logic / thin I/O split — mirrors the scorer)
- `lib/scrape/robots.ts` — PURE robots.txt evaluator: `isPathAllowed(txt, botToken, path)`, longest-match (counts `*`/`$`), specific-bot beats `*`.
- `lib/scrape/parse.ts` — PURE `htmlToScrape(rawHtml, ctx) → PageScrape` via cheerio (JSON-LD incl. @graph + invalid-block skip, headings, links+rel+external, blockquotes, meta/JSON-LD dates+author).
- `lib/scrape/firecrawl.ts` — THIN I/O: `scrapeUrl(url, {apiKey})` = Firecrawl `/v2/scrape` (rawHtml) + robots fetch + per-bot UA probe → `htmlToScrape`. `parseFirecrawlScrape` is pure + tested. **Scrape failure throws `ScrapeError` (never a 0-score).**
- `lib/report/format.ts` — PURE: `formatReport(result, url)` (CLI report) + `batchToCsv(rows)` (rank-ordered calibration CSV, formula-injection-safe).
- `scripts/score-url.ts` — `npm run score -- <url> [--json]`. `scripts/score-batch.ts` — `npm run score:batch -- (--in urls.txt | <url>...) [--out cal.csv]` (sequential = polite + within rate limits).
- **To run live:** put `FIRECRAWL_API_KEY` in `.env` (see `.env.example`; key also in `seo-intel/.env`). Loaded via Node 22 `process.loadEnvFile`.
- **Known follow-up:** cheerio `.text()` concatenates across `<br>` in headings ("Gas"+"AI") — cosmetic, doesn't affect scoring.

## Resume protocol (gstack-native)
1. Open the project; gstack auto-routes via `CLAUDE.md` → `## Skill routing`.
2. The newest checkpoint at `~/.gstack/projects/llmvisibilitycertification.com/checkpoints/` is read by gstack's context-recovery on the next skill run (or run `/gstack-context-restore`).
3. The loop continues: build a piece → `/gstack-review` before committing → `/gstack-ship` when a phase is shippable. For new sub-features, `/gstack-plan-eng-review` against the plan first.

## ✅ Methodology reconciliation — steps 1-3 DONE (commit 02c0071, 2026-06-27)
Steps 1-3 shipped: pillar roll-up (Foundation/Validation/Ingestion), eligibility gate, weighted
composite, bottleneck, capped maturity rung, off-domain roadmap. **Remaining = step 4** (reweight
against `.private/rubric-source-digest.md` + calibration) — blocked on the calibration site list.
Scoring contract pinned in decision `bf33c01e` (cert tier headline; rung capped at Recognized).
The book defines a richer model than the v1 on-page scorer. Reconcile before tuning weights.
- **The Stack (5 causal layers):** Foundation (trademark/entity anchors) · Engine (content & PR mentions) · Validation (analyst/academic citations) · Ingestion (LLM training inputs) · Impact (market adoption).
- **The Four Pillars (the scoreboard):** Search Mentions · LLM Surfacing · Authority Trust · Citations Consistency.
- **Scoring = maturity ladder + bottleneck** (Invisible → Recognized → Referenced → Authoritative → Default Source). Faithful scorer surfaces the WEAKEST pillar, not a flat sum.
- **Biggest levers are OFF-DOMAIN** (third-party mention footprint, cross-web entity consistency, authority citations, LLM surfacing via prompt suites). The v1 scorer (`lib/scorer`) is **on-page-only** — it faithfully covers the Foundation/Ingestion on-page subset (schema, sameAs/entity, answer-formatting, freshness, on-page citations) but CANNOT see off-domain pillars from one URL.
- Book **omits llms.txt and named bots** (GPTBot/ClaudeBot). Don't over-weight crawler mechanics; don't reward llms.txt as if the book backs it. (Crawler-access is still a real eligibility gate, just keep it light per the source.)

**DECISION: A — LOCKED 2026-06-26.** v1 scores the **on-page subset only** (honest, deterministic, free, single-URL), reframed into the book's pillar language with a **bottleneck + maturity-ladder** readout; off-domain pillars shown as a **roadmap**, not scored in v1. **Steps 1-3 shipped 2026-06-27 (commit 02c0071); only step 4 (reweight + calibration) remains, blocked on the calibration set.** Steps as executed:

1. Refactor `lib/scorer` to roll the 7 on-page criteria up into the book's pillars (on-page slice of each):
   - **Foundation** ← schema (Org/Person), sameAs/entity linking, brand signals.
   - **Ingestion** ← answer-formatting/chunking/compressibility, freshness.
   - **Validation** ← on-page citations / statistics / quotes.
   - **Crawler access** = eligibility gate (keep light; do NOT over-weight; do NOT reward llms.txt — book omits both).
2. Output a **per-pillar readiness score + the WEAKEST pillar (bottleneck)** + a maturity rung (Invisible → Recognized → Referenced → Authoritative → Default Source), computed from the on-page subset, with a clear caveat that off-domain pillars (Engine / LLM Surfacing / Authority-Mentions / Search Mentions) are NOT measured in v1.
3. Mark off-domain pillars as a roadmap section on the report + methodology page (v1.x adds mention scan + entity-consistency + live prompt-suite surfacing).
4. Reweight using `.private/rubric-source-digest.md` as the spec; then calibration.

The scorer built this session is the on-page component — reused, re-labelled, not rebuilt.

## Next pieces (build in order; pick one per session)
1. **Finish Phase 0 calibration** — CLI + adapter + harness are DONE (`124ec84`). Remaining: (a) bootstrap the ~30–50-site calibration set with real AI-citation status, (b) run `npm run score:batch` over it, (c) reweight `lib/scorer/criteria.ts` (category maxes) + `lib/scorer/index.ts` (`PILLAR_SPECS` weights + tier/rung thresholds) to rank-order correctly. This is methodology-reconciliation **step 4**, and the launch gate. Needs the calibration list (or approve a bootstrap) + a live `FIRECRAWL_API_KEY` in `.env`.
2. **Phase 1a (lead magnet)** — Next.js (App Router + Tailwind) skeleton + Supabase schema + submit form + `/api/audit` + worker + magic-link confirm + `/report/[id]`.
3. **Phase 1b (public credential)** — ownership verify (DNS TXT / .well-known) → `/verify/[slug]` (noindex until trusted) + static badge SVG + brand JSON-LD.
4. **Phase 1c (hardening)** — `/methodology` (categories, NOT weights), `/privacy` + `/api/me` deletion, rate-limit + daily cap + queue, email SPF/DKIM/DMARC.
5. **Plumbing** — ✅ GitHub repo under EWR Digital org (`EWRDigital-com`) created + pushed (public); ✅ Vercel linked + auto-deploy connected. **Remaining: point DNS** (`llmvisibilitycertification.com` → Vercel) when ready to go past the placeholder.

## Inputs needed for the next heavy session

### Only Matt can provide
- ✅ **The book — RECEIVED.** *LLM Visibility Stack V1* (by Matt) → `.private/llm-visibility-stack-v1.md` (raw) + `.private/rubric-source-digest.md` (methodology extract). **See "Methodology reconciliation" below — it changes the scorer scope.**
- **Trademark legal line + issuing entity** — exact wording + which entity issues the cert ("LLM Visibility™ / Matt Bertram" personally, or another entity). Blocks first public route.
- **Calibration ground truth** — ~30–50 sites with their real AI-citation status (or approve a list I bootstrap). Needed before any public trademarked score.
- **Email provider choice** — Resend or Postmark (+ which domain sends).
- **Domain/DNS** — confirm registrar for llmvisibilitycertification.com so it can point to Vercel.

### I can self-serve via MCP (with your go-ahead)
- **Supabase project** — create via Supabase MCP (`create_project`), apply the schema migration.
- **GitHub repo** under EWR Digital org — create + push via GitHub MCP.
- **Vercel project + link** — via Vercel MCP.
- **Firecrawl** — key already in `seo-intel/.env`; I wire the adapter.
- **Calibration set bootstrap** — I can assemble a candidate list and check citations (Firecrawl + DataForSEO), for your approval.

## Toolchain / commands
- `npm test` (vitest run, 77 tests) · `npm run test:watch` · `npm run typecheck` (`tsc --noEmit`)
- `npm run score -- <url> [--json]` · `npm run score:batch -- (--in urls.txt | <url>...) [--out cal.csv]` (need `FIRECRAWL_API_KEY` in `.env`)
- Node v24, npm 11. `type: module`, TS `moduleResolution: Bundler`. Deps: `cheerio` (runtime), `tsx` + `vitest` + `typescript` (dev).
- `node_modules/`, `.env*`, `.private/` are gitignored.

## Locked decisions (do not re-litigate without flagging)
- Hybrid product; **v1 = Track 1 only**, Track 2 deferred (hard gate).
- **Public cert is OWNERSHIP-GATED** — no public page for a domain the submitter doesn't control. Unverified domains still get the private report (lead-magnet value).
- **Rubric calibration is a launch gate**; build the scorer first (done).
- Static SVG badge (not live route) for v1. Email domain auth before launch. Methodology page publishes categories, NOT weights. Single-URL audit (multi-page deferred).
- Stack: Next.js + Supabase + Vercel; GitHub EWR org = source of truth.

## Brand rules (always)
Write `LLM Visibility™` (™ never ®, never "registered" — filed not registered). Cite the
book as the authority hook. Org schema = LLM Visibility™, author = Matt Bertram, sameAs →
matthewbertram.com. No cross-link IN from EWR (pre-revenue, clean-signal rule); link OUT
for authority. No empty indexable shells.
