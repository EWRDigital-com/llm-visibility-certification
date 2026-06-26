# LLM Visibility Certification™

Free, public certification platform for the standalone **LLM Visibility™** brand
(USPTO-*filed* mark + Matt Bertram's book of the same name). Applicants apply, get
assessed/scored against the LLM Visibility™ criteria, and receive a **verifiable
credential + embeddable badge** with a public verify URL.

- **Domain:** https://llmvisibilitycertification.com
- **Status:** scaffolding (greenfield)
- **Certifying authority:** Matt Bertram (author of *LLM Visibility*)
- **Brand:** standalone LLM Visibility™ (independent of llmvisibilityindex.org)

## Planned stack

DB-backed platform (not a static site): **Next.js + Supabase (Postgres) + Vercel** —
the same proven pattern as AI Reg Radar. Final architecture is locked via gstack
`/plan-eng-review` before build.

- **Source of truth:** this GitHub repo (EWR Digital org)
- **Deploy:** Vercel, connected to the EWR Digital GitHub account
- **DB:** Supabase (applications, scores, issued credentials, verify lookups)

## Build process

Built with **gstack**. Loop: shape → plan → build → review → ship.

1. `/gstack-office-hours` — shape the product (what's certified, the assessment, the credential)
2. `/gstack-spec` — write the buildable spec
3. `/gstack-plan-eng-review` — lock architecture
4. build
5. `/gstack-review` → `/gstack-ship`

## Hard rules (see CLAUDE.md)

- Write the mark as **`LLM Visibility™`** — ™ never ®, never "registered".
- No empty indexable shells — every page ships with real content or noindex/draft.
- No cross-links *from* EWR into this site until it is productized with a real
  sales motion (it can link *out* to authority hubs).
- Live-site safety: backup before write, verify after write.
