# ADR 0008: YouTube sync uses a dedicated worker and coarse heartbeat

**Status:** accepted

## Context

A durable queue does not prove that anything is polling it. Reporting every queued row as “refreshing” hid the difference between a healthy worker, an expired lease, and a request waiting behind an unavailable worker. Vercel hosts the web application but does not provide this repository with a continuously running queue consumer.

## Decision

Run YouTube synchronization as a separate long-running process. It records allowlisted heartbeats in `app_private`; authenticated customers and public health receive only a coarse status without worker identifiers or tenant data. Workspace sync state remains in `youtube_sync_runs`, protected by its existing workspace RLS. The application combines its tenant-scoped latest run with the coarse heartbeat to report queued, running, stalled, complete, or failed.

A queue becomes stalled only when objective evidence supports it: a running lease has expired, or a queue is at least two minutes old while no heartbeat is healthy. Provider activation remains a separate human-controlled decision.

## Rejected alternatives

- Claim a successful Vercel response means background execution is available.
- Put service-role worker identifiers or logs in a public table.
- Expose global queue counts or another tenant's run timing in health output.
- Mark an old queued request failed automatically without a lease owner and an audited transition.

## Consequences

Operators must deploy and monitor another process. In exchange, customers see truthful execution state and alerts can distinguish web liveness from worker liveness. Heartbeats contain no payload or secrets. The writer opportunistically removes rows older than seven days whenever a later heartbeat arrives; a final stale row can remain if no worker ever returns.
