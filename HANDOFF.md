# HANDOFF — LLM Visibility Certification™

Last updated: 2026-06-26. Read this first when resuming. Built with **gstack** — keep using it.

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
- `90cd2ce` **Phase 0 / T1 core: deterministic scorer `lib/scorer` + 17 passing tests**
- Scorer is DONE and green (`npm test` → 17/17, `npx tsc --noEmit` clean). Node v24, npm 11.
- Repo is local only — NOT yet pushed to GitHub, NOT yet linked to Vercel.

## Resume protocol (gstack-native)
1. Open the project; gstack auto-routes via `CLAUDE.md` → `## Skill routing`.
2. The newest checkpoint at `~/.gstack/projects/llmvisibilitycertification.com/checkpoints/` is read by gstack's context-recovery on the next skill run (or run `/gstack-context-restore`).
3. The loop continues: build a piece → `/gstack-review` before committing → `/gstack-ship` when a phase is shippable. For new sub-features, `/gstack-plan-eng-review` against the plan first.

## Next pieces (build in order; pick one per session)
1. **Finish Phase 0** — `scripts/score-url.ts` CLI + Firecrawl→`PageScrape` adapter + calibration harness. Then run it on the calibration set and tune weights in `lib/scorer/criteria.ts`. *(Scorer logic already done.)*
2. **Phase 1a (lead magnet)** — Next.js (App Router + Tailwind) skeleton + Supabase schema + submit form + `/api/audit` + worker + magic-link confirm + `/report/[id]`.
3. **Phase 1b (public credential)** — ownership verify (DNS TXT / .well-known) → `/verify/[slug]` (noindex until trusted) + static badge SVG + brand JSON-LD.
4. **Phase 1c (hardening)** — `/methodology` (categories, NOT weights), `/privacy` + `/api/me` deletion, rate-limit + daily cap + queue, email SPF/DKIM/DMARC.
5. **Plumbing** — create GitHub repo under EWR Digital org, push, link Vercel, point DNS.

## Inputs needed for the next heavy session

### Only Matt can provide
- **The book** *LLM Visibility* → drop in `.private/` (gitignored). Grounds the rubric, the exam, the methodology page, and E-E-A-T. PDF/DOCX/EPUB/markdown all fine.
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
- `npm test` (vitest run) · `npm run test:watch` · `npx tsc --noEmit`
- Node v24, npm 11. `type: module`, TS `moduleResolution: Bundler`.
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
