# ADR 0005: Dispatch approved research on demand

## Status

Accepted

## Decision

The production Next.js deployment schedules a bounded background worker invocation immediately after an approval queues a research job. Authenticated status polling may schedule the same dispatcher while the run remains queued. The existing Supabase lease token, expiry, attempt limit, and idempotent acknowledgement remain the concurrency and duplicate-spend boundary.

Connected mode requires the Supabase worker credential and every provider requested by the plan. Missing configuration leaves the approved job queued and visible as `configuration_required`; it never substitutes demo evidence. Demo mode retains its in-memory deterministic worker.

## Alternatives considered

- A Vercel cron-only worker was rejected as the primary path because Hobby cron runs at most once per day and has imprecise timing.
- Waiting synchronously in the approval request was rejected because provider work can take up to a minute and would make approval feel broken.
- A separate always-on worker host remains a valid scale-up option, but it adds another deployment and secret store before the beta needs it.

## Consequences

Approved research begins without a manually running terminal, the browser can show queued/running/completed/failed states, and normalized evidence appears in the same conversation. The dispatch is at-least-once, so the database lease remains mandatory. A later external worker or higher-plan cron can consume the same queue without a schema change.
