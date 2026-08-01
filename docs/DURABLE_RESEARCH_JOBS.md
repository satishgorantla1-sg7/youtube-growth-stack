# Durable research jobs

`POST /api/research` validates a bounded plan and an 8–128 character idempotency key. It persists a run plus pending approval and returns in `awaiting_approval`; it never invokes Apify or Firecrawl. Reusing a key with the same plan returns the existing run. Reusing it for a different plan is a conflict.

Workspace owners, admins, and editors may create a research plan. Viewers are read-only. `POST /api/approvals` is the only user transition that can queue research, and only owners or admins may make that decision. PostgreSQL locks the pending approval and run, records the decision, and inserts the job in one transaction. Rejection cancels the run. Queue leasing joins an approved `research_plan`, so inserting or mutating a job cannot bypass the approval gate.

Unauthorized role transitions return stable `research_create_forbidden` or `research_approval_forbidden` errors without disclosing another workspace. These checks live inside the security-definer RPC boundary; route handlers remain provider-free.

## Run a worker

Apply migrations through `202608010005_research_role_authorization.sql`, then set server-only `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and whichever provider keys the deployment is allowed to spend. Do not expose the service-role key to a browser.

```bash
npm run worker:research
```

The worker leases one approved job at a time for 60 seconds, carries its correlation ID through events and source provenance, and acknowledges only with the matching lease token. Retryable failures use exponential backoff capped at five minutes. The third failed attempt and every non-retryable failure enter `dead_letter`. An expired lease may be reclaimed. Demo mode and tests use deterministic evidence and never call a paid provider.

The process handles `SIGINT`/`SIGTERM` between iterations. Poll intervals are clamped to 250–30,000 ms and non-finite values fall back to 2,000 ms. Deploy it as a continuously running, single-concurrency process initially. Horizontal replicas are safe because leasing uses `FOR UPDATE SKIP LOCKED`; still cap replicas to the workspace/provider quotas.

## Deployment work remaining

- Choose a long-running host and inject secrets from its secret manager.
- Apply the migration in staging, run a two-tenant RLS suite, and exercise lease expiry against the hosted Postgres version.
- Add provider-specific quota/concurrency controls and usage-ledger reconciliation before enabling paid credentials.
- Add metrics/alerts for queue age, retry rate, lease loss, and dead-letter count, plus an operator replay workflow that requires a new approval when scope or cost changes.
- Configure health checks and graceful termination longer than the 60-second lease, or add lease renewal for tasks that can exceed it.

## Migration and rollback

The migration adds nullable/defaulted columns, indexes, one event table, and functions. Table metadata locks and index builds are the main rollout risk; on a large production table, schedule a quiet window or convert indexes to a separately managed concurrent operation. Existing rows receive generated correlation IDs and safe source defaults. No existing migration is rewritten.

Rollback the application first so old code ignores the new contract. Functions, grants, policies, indexes, event table, and added columns can then be removed in a new forward migration if necessary. Completed provider calls are not reversible; retain `job_events`, `audit_events`, and normalized provenance for incident review.
