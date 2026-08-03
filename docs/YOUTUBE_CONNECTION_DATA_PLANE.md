# YouTube connection data plane

PR #15 adds a read-only, multi-tenant YouTube data plane. It deliberately separates customer-visible channel data from OAuth credentials.

## Security boundary

- `app_private.youtube_oauth_states` stores SHA-256 OAuth state hashes. States expire within ten minutes, are bound to the approving user/workspace, and can be consumed and completed once.
- `app_private.youtube_connections` stores one opaque encrypted credential envelope and its key version per workspace. Browser roles have neither schema usage nor table privileges.
- `public.store_youtube_connection` requires the exact consumed state hash and a one-use approved `channel_action`, accepts only `youtube.readonly`, then atomically stores the envelope, upserts 1-50 validated channel candidates, completes the state, and appends an audit event.
- Refresh and revocation leases are service-role-only. A transient provider failure leaves the short lease to expire for retry. `invalid_grant` moves the connection to `reconnect_required`.
- Serialized approval claims prevent connect/revoke cross-purpose replay. Revocation requires a separate approval bound to the private connection; ciphertext is erased only after Google revocation succeeds.

No raw access token, refresh token, OAuth code, state value, or credential envelope is written to a public table, audit metadata, or provider error.

## Tenant-visible model

- `channels` supports multiple personal/Brand candidates under one workspace Google grant, explicit audited selection, and `unknown`, `personal`, or `brand` classification. One candidate is selected automatically only when it is the sole result. The API adapter does not infer Brand ownership from response order.
- V1 intentionally supports one Google credential connection per workspace because lifecycle RPCs are workspace-keyed. That grant may expose up to 50 channels. Multiple Google identities in one workspace require a future connection-ID-keyed lifecycle contract.
- `youtube_videos` stores stable normalized metadata.
- `youtube_channel_snapshots` and `youtube_video_snapshots` preserve point-in-time metrics and source etags.
- Composite `(workspace_id, id)` foreign keys prevent a channel, video, snapshot, sync, or quota entry from crossing tenant boundaries.
- Authenticated members can read their workspace rows through RLS but cannot forge provider-synchronized rows.

## Bounded synchronization

`youtube_sync_runs` is idempotent per workspace and caps each run at 10 pages, 500 items, and 5 attempts. Authenticated owner/admin/editor members can request a sync only for the selected active channel. A service worker leases one run at a time, persists each normalized page and its versioned encrypted pagination cursor atomically, resumes safely after lease expiry, reserves quota with a request idempotency key before each outbound attempt, and completes with a safe error code.

The `youtube_api` provider is disabled by default. Authorization preflight, callback discovery, sync leasing, and token refresh all fail closed while disabled. Owned-channel discovery reserves its `channels.list` unit before the request in the same serialized, UTC-day 10,000-unit project budget as sync traffic; discovery entries use a one-time OAuth-state-derived idempotency key and do not invent a sync run.

| Control | Default | Hard maximum |
| --- | ---: | ---: |
| Pages | 5 | 10 |
| Items | 250 | 500 |
| Request timeout | 15 seconds | 30 seconds |
| Retries | 2 | 3 |

Retry uses bounded exponential backoff for HTTP 429 and 5xx or network failures. HTTP 4xx errors are non-retryable. Every attempt is counted, terminal errors retain their attempted-request count, and a pre-request guard lets the worker reserve quota before calling Google. API payloads are validated with Zod and normalized before persistence. Quota charges are append-only and idempotent; normal tests make no live provider calls.

## Verification and rollback

Before merging, run a clean local Supabase reset, then `supabase test db`. The pgTAP suites prove approval/state behavior, purpose claims, private credential privileges, revocation leases, tenant isolation, explicit channel selection, authenticated bounded sync requests, composite integrity, idempotent quota accounting, and atomic page persistence.

Regenerate `src/lib/supabase/database.types.ts` only after the reset. The integration owner owns that generated file to avoid stacked-PR conflicts.

Rollback is forward-only: disable YouTube connect/sync entry points first, wait for leases to expire, revoke or export encrypted envelopes according to the incident plan, then ship a new migration. Do not rewrite migration `202608010010` after it has been applied.
