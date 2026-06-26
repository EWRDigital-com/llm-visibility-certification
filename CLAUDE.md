# CLAUDE.md — LLM Visibility Certification™

## What this is

A **free, public certification platform** for the standalone **LLM Visibility™**
brand. Applicants apply, are scored against the LLM Visibility™ criteria, and
receive a **verifiable credential + embeddable badge** with a public verify URL.
Matt Bertram is the certifying authority (author of the book *LLM Visibility*).

- Domain: llmvisibilitycertification.com
- Source of truth: this GitHub repo (EWR Digital org) → deploys to Vercel
- Independent of llmvisibilityindex.org (the "Index" mark) for now

## Planned stack

Next.js + Supabase (Postgres) + Vercel. DB holds: applications, scores, issued
credentials, verify lookups, badge assets. Final architecture locked via
`/gstack-plan-eng-review` before build. Don't install deps until the spec is set.

## Hard rules (brand + enterprise)

1. **Trademark notation:** always `LLM Visibility™` — ™ never ®, NEVER say
   "registered." The mark is *filed*, not registered. Cite the *book* as the
   authority hook, not registration. Confirm with Matt before any new public IP claim.
2. **No empty indexable shells:** no page is ever both empty AND indexable. Ship
   real content, or set noindex, or keep it draft. Nav-linked empty pages are the
   worst case — never ship them.
3. **No cross-link in from EWR:** established revenue properties (EWR Digital) do
   NOT cross-link INTO this pre-revenue site until it's productized with a proven
   sales motion. This site may link OUT to matthewbertram.com / authority hubs.
4. **Standalone brand schema:** Organization = "LLM Visibility™"; founder/author =
   Matt Bertram; sameAs → matthewbertram.com. Provider note may credit EWR Digital.
5. **Live-site safety:** backup before any write, verify after. Never commit secrets
   (`.env` is gitignored; real keys live in env, never in code or chat).

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /gstack-office-hours
- Strategy/scope → invoke /gstack-plan-ceo-review
- Architecture → invoke /gstack-plan-eng-review
- Design system/plan review → invoke /gstack-design-consultation or /gstack-plan-design-review
- Full review pipeline → invoke /gstack-autoplan
- Bugs/errors → invoke /gstack-investigate
- QA/testing site behavior → invoke /gstack-qa or /gstack-qa-only
- Code review/diff check → invoke /gstack-review
- Visual polish → invoke /gstack-design-review
- Ship/deploy/PR → invoke /gstack-ship or /gstack-land-and-deploy
- Save progress → invoke /gstack-context-save
- Resume context → invoke /gstack-context-restore
- Author a backlog-ready spec/issue → invoke /gstack-spec

## Status

Greenfield. Repo initialized 2026-06-26. Next: `/gstack-office-hours` to shape the
certification product before any code.
