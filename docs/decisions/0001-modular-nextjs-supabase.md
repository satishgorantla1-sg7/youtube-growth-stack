# ADR 0001: Modular Next.js application with Supabase

Status: accepted — 2026-08-01

## Context

The first release needs a public SaaS interface, authentication, workspace isolation, voice interaction, external research, and durable approval history. A separate microservice fleet would add operational cost before demand is known.

## Decision

Start with one Next.js deployment arranged into strict UI, route, orchestration, provider, and persistence boundaries. Use Supabase for Auth, Postgres, RLS, Storage, and durable job records. Long-running workers may deploy separately while sharing internal contracts.

## Consequences

The repository is simple to run and review. Provider adapters and workers can be extracted later. Long research cannot depend on a browser request lifetime, so queued jobs and idempotency are required before production deep research.
