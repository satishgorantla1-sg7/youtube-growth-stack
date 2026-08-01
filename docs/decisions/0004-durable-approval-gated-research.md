# ADR 0004: Research execution is leased after approval

## Status

Accepted

## Decision

Research requests persist a bounded, idempotent plan and stop in `awaiting_approval`. An explicit database transition records approval and queues exactly one job. Service-role workers lease approved jobs with a token, bounded attempts, expiry, acknowledgement, retry, and dead-letter transitions. Provider adapters execute only after a successful lease. Every run and job carries one correlation ID.

Demo mode implements the same state machine in memory and uses deterministic sources, so contributors need no vendor credentials.

## Consequences

HTTP request lifetimes no longer own research execution, duplicate submissions do not duplicate spend, and approval evidence is durable before provider use. Production now requires a continuously running worker, queue observability, secret management, and operational handling for dead letters and long-running lease renewal.
