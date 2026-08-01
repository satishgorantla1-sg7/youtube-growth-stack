# Durable research jobs

`POST /api/research` validates a bounded plan and an 8–128 character idempotency key. It persists a run plus pending approval and returns in `awaiting_approval`; it never invokes Apify or Firecrawl. Reusing a key with the same plan returns the existing run. Reusing it for a different plan is a conflict.

Workspace owners, admins, and editors may create a research plan. Viewers are read-only. `POST /api/approvals` is the only user transition that can queue research, and only owners or admins may make that decision. PostgreSQL locks the pending approval and run, records the decision, and inserts the job in one transaction. Rejection cancels the run. Queue leasing joins an approved `research_plan`, so inserting or mutating a job cannot bypass the approval gate.

Unauthorized role transitions return stable `research_create_forbidden` or `research_approval_forbidden` errors without disclosing another workspace. These checks live inside the security-definer RPC boundary; route handlers remain provider-free.

## Production execution

Apply all Supabase migrations, then configure these server-only Production variables in Vercel:

- `SUPABASE_SERVICE_ROLE_KEY`
- `APIFY_API_TOKEN`
- `FIRECRAWL_API_KEY`
- optional `APIFY_YOUTUBE_ACTOR_ID` and `RESEARCH_WORKER_ID`

Do not expose any of them with a `NEXT_PUBLIC_` prefix.

After an owner or admin approves a run, the route returns immediately and schedules one bounded background dispatch with Next.js `after()`. The authenticated `GET /api/research/[runId]` status route also schedules a dispatch while a run remains queued. This second trigger is intentional recovery: leases prevent duplicate provider work, while normal status polling can restart a job after an interrupted function invocation.

The worker leases one approved job at a time for 180 seconds, carries its correlation ID through events and source provenance, and acknowledges only with the matching lease token. Apify and Firecrawl run in parallel with 60-second and 30-second request timeouts. Retryable failures use exponential backoff capped at five minutes. The third failed attempt and every non-retryable failure enter `dead_letter`. An expired lease may be reclaimed.

Vercel Hobby cron is not the primary runner because its minimum interval is once per day. A higher-plan cron or an external long-running worker can be added later as a queue-age safety net without changing the lease contract. Local operators can still run the same consumer:

```bash
npm run worker:research
```

Demo mode implements the same approval and worker state machine in memory, uses deterministic evidence, and never calls a paid provider.

## Provider contracts

- Apify uses `streamers/youtube-scraper` by default. A YouTube URL is sent as `startUrls`; other prompts use `searchQueries`. Results are capped at 25 and normalized to the internal evidence contract.
- Firecrawl uses `POST /v2/search`, explicitly requests the `web` source and Markdown content, and caps results at 25.
- Successful but malformed responses fail closed. Provider tokens remain in Authorization headers and are never included in URLs or logs.
- Connected mode does not silently fall back to demo evidence. Missing worker or provider configuration leaves the approved job safely queued and reports configuration required to the user.

## Operations and risk

- Watch queue age, retry rate, lease loss, provider rate limits, and dead-letter count.
- Set Vercel function duration to at least 120 seconds; the database lease is intentionally longer than either provider timeout.
- Add workspace/provider concurrency quotas and usage-ledger reconciliation before broad paid rollout.
- Replaying a dead-letter job requires an operator workflow; any broader scope or higher cost requires a new approval.
- Status responses are authenticated and protected by workspace RLS. They return normalized source metadata, not service credentials or raw vendor responses.

## Migration and rollback

This slice does not add or rewrite a migration. It consumes the existing `lease_research_job`, `ack_research_job`, and `fail_research_job` RPCs and existing RLS-protected `research_sources` records.

Rollback by reverting the web dispatch and status UI. Queued jobs remain durable and can still be processed with `npm run worker:research`. Completed provider calls are not reversible; retain `job_events`, `audit_events`, and normalized provenance for incident review.
