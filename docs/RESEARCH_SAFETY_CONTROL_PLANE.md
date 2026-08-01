# Research safety control plane

This contract defines the database boundary for paid research. It is implemented by
`202608010009_research_safety_control_plane.sql`; application and worker integration
must use its RPCs instead of writing safety tables directly.

## Approval and credits

`decide_research_approval` is the only authenticated path from a pending research
approval to a queued job. The transaction takes a workspace advisory lock, checks
the global/workspace kill switch and distributed request counters, compares all
credits reserved or settled today with `workspaces.daily_credit_limit`, creates one
idempotent reservation, approves the request, and queues the job atomically.

A reservation has three terminal meanings:

- `reserved`: estimated credits are unavailable to other approvals.
- `settled`: actual credits were written once to `usage_ledger`.
- `released`: no paid call occurred, so the reservation no longer consumes budget.

Duplicate approval, settlement, and provider-start calls either return the original
result or fail closed on a conflicting payload. They never create a second charge.

## Kill switches, limits, and invocation records

Operational controls, safety limits, and minute counters live in `app_private`.
They are not available to browser roles. Defaults are deliberately conservative:
ten active calls globally, five per provider, two per workspace, and no more than
ten approval attempts per user per minute. Workspace-specific rows can narrow those
defaults. A disabled global, provider, or workspace control blocks the next paid
boundary without a deployment.

Before each provider call, a service worker must call `begin_provider_invocation`.
The RPC validates the lease, cancellation flag, kill switches, bounded units,
idempotency key, and global/provider/workspace concurrency caps. It returns an
invocation ID. The worker then calls `finish_provider_invocation` with bounded unit,
credit, duration/cost, HTTP/error-code, and correlation metadata.

Invocation metadata must never contain prompts, scraped content, credentials,
authorization headers, tokens, or transcripts. The database rejects those keys.

## Cancellation

Only workspace owners and admins may call `cancel_research_run`.

- A queued job becomes `cancelled` immediately and releases unused credits.
- A leased job becomes `cancelling`. The lease remains valid so the worker can abort
  safely, record any already incurred units, settle usage, and call
  `acknowledge_research_cancellation`.
- Workers call `research_cancellation_requested` before every paid provider call.

Cancellation does not claim to undo a vendor charge already in flight. Audit and job
events preserve the request, actor, correlation ID, and final accounting.

## Authorization and tenancy

- Members may read their workspace's reservations and safe invocation summaries.
- Authenticated clients cannot insert, update, or delete either table.
- Worker mutation RPCs require `service_role`; public execution is revoked.
- Composite foreign keys enforce matching `workspace_id` across runs, jobs, job
  events, sources, reservations, and invocations, including privileged writes.
- Approval and cancellation failures deliberately avoid revealing another tenant's
  object existence.

## Integration order

1. Apply the migration and run the pgTAP suite on a clean local Supabase reset.
2. Regenerate database types in the integration branch (root-agent ownership).
3. Update the worker to begin/finish every paid invocation and poll cancellation.
4. Add safe operational configuration/readiness and alerting.
5. Run hosted two-tenant isolation and race tests.
6. Only then configure paid provider credentials.

Rollback is application-level: turn on the global kill switch and deploy the prior
worker. The migration is forward-only; do not drop ledger or audit evidence. New
tables contain accounting evidence and have no automatic retention policy.
