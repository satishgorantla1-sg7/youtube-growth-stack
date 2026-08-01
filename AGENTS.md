# YouTube Growth Stack Agent Guide

This file is the durable operating manual for coding agents. Read it before editing. A closer nested `AGENTS.md` overrides this file for its subtree.

## Product promise

YouTube Growth Stack is a voice-first, multi-tenant SaaS. A creator connects a channel, asks for research, reviews evidence, and approves a versioned content package containing ideas, titles, thumbnail concepts, hooks, an outline, and a script.

## Commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run verify
```

Use Node 20.9 or newer. The app must remain useful in demo mode without vendor credentials.

## Boundaries

- `src/app` owns pages and HTTP entry points.
- `src/components` owns presentation and browser interaction.
- `src/lib/research` owns orchestration and internal workflow rules.
- `src/lib/providers` owns external API adapters and normalization.
- `src/lib/supabase` owns authenticated database clients.
- `supabase/migrations` is the append-only database history.
- `.agents/skills` contains reusable task workflows.
- `docs/decisions` records consequential architectural choices.

Never import a vendor SDK directly into a UI component. Never expose service-role keys, OpenAI keys, OAuth secrets, or provider tokens to browser code.

## Human approval rules

Create a pending approval and stop before:

- starting a paid deep research run;
- publishing or changing a connected channel;
- storing or sharing raw voice recordings;
- deleting or exporting user data;
- accepting materially higher cost or a broader crawl scope.

Approval events are append-only audit evidence. Voice commands do not bypass these rules.

## Loop engineering

Treat development as a controlled feedback loop:

1. **Frame** — restate the issue as measurable acceptance criteria.
2. **Inspect** — read local instructions, contracts, tests, and recent decisions.
3. **Change** — implement the smallest coherent vertical slice.
4. **Verify** — run focused checks, then `npm run verify`.
5. **Review** — inspect the diff for scope, security, UX, cost, and documentation.
6. **Learn** — update tests, skills, AGENTS.md, or an ADR when the repository learned a durable rule.
7. **PR** — publish evidence and let CI/review feedback start the next loop.

Do not repeat a failing command without changing a hypothesis or the code.

## Code conventions

- TypeScript strict mode; validate untrusted input with Zod.
- Prefer server components. Add `"use client"` only for browser state or APIs.
- Return stable internal contracts from provider adapters.
- Add timeouts and bounded limits to external calls.
- Make jobs idempotent and observable with correlation IDs.
- Preserve provenance for every research source and label internal scores as our analysis.
- Avoid raw personal data in logs. Audio is ephemeral by default.
- Keep PRs focused; architecture-only, schema, provider, and UI changes should be separable when practical.

## Definition of done

- Acceptance criteria are met and the unhappy path is handled.
- Tenant data is protected by RLS and authorization is tested.
- Relevant tests exist and `npm run verify` passes.
- No secret or generated artifact is tracked.
- User-visible changes are accessible and responsive.
- README/ADR/skills are updated when a durable behavior changed.
- The PR explains risk, verification, screenshots, migration, and rollback.

## Repository skills

Use the matching workflow in `.agents/skills`: `ship-feature`, `change-database`, `add-provider`, `change-voice`, `verify-pr`, `audit-safety`, or `update-architecture`.
