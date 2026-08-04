# Paid research safety runbook

This runbook is for authorized operators preparing or responding to paid Apify
and Firecrawl research. It does not grant permission to enable credentials, alter
private controls, or collect a target. Production activation remains a separate
human release decision after hosted verification.

## Readiness contract

`GET /api/health` separates service liveness from paid-research readiness. An
HTTP 200 response with `ok: true` only means the web service can answer.

| Field | Meaning | It does not mean |
|---|---|---|
| `research.configurationComplete` | Supabase worker access and both provider credentials are present | The hosted migration or controls passed verification |
| `research.controls.enforceable` | Connected mode has the server prerequisites needed to use database controls | The current control values are enabled, safe, or verified |
| `research.controls.verification` | Whether hosted control verification is still required | Permission to run a paid request |
| `research.providers.*` | A server-only credential is present or configuration is required | A provider is healthy, enabled, or approved for use |
| `research.activation` | Demo-disabled, configuration-required, or hosted-verification-required state | A production release flag |

The response includes booleans and stable state labels only. It never returns
keys, database URLs, control reasons, workspace identifiers, limits, counts, or
provider responses. Treat `hosted_verification_required` as a stop condition.

## Before credentials are enabled

1. Confirm migration `202608010009_research_safety_control_plane.sql` is applied
   in the target Supabase project. Do not infer this from the health endpoint.
2. Run the clean-reset database tests and the hosted two-user RLS checklist.
3. Prove concurrent approval attempts cannot over-reserve the daily workspace
   budget and duplicate requests cannot create a second reservation.
4. Prove the global, each provider, and a test-workspace kill switch blocks a
   request before a provider invocation starts.
5. Prove global, provider, and workspace concurrency limits fail closed.
6. Prove queued cancellation releases unused credits and leased cancellation
   preserves incurred usage before reaching `cancelled`.
7. Confirm dashboards and alerts below use safe metadata only.
8. Record the verifier, environment, test workspace, timestamp, result, and the
   separately approved activation decision in the release record.

Use a dedicated test workspace and the smallest bounded request. Keep the global
control disabled while credentials are first installed. Enabling a provider for
a live smoke test requires explicit approval, a narrow scope, and an operator
ready to restore the global stop immediately.

## Minimum operational signals

Alerts should carry a correlation ID, job/run identifier, provider label, safe
error code, bounded unit count, duration, and state. Do not include prompts,
scraped content, URLs containing personal data, audio, transcripts, cookies,
authorization headers, tokens, keys, or raw provider payloads.

| Signal | Alert condition | First response |
|---|---|---|
| Queue age | Oldest approved job exceeds the documented dispatch objective | Check dispatcher health; do not bypass the approval or lease boundary |
| Retry/dead letter | Retry rate rises or any job reaches `dead_letter` | Stop affected provider if systemic; inspect safe error codes |
| Budget pressure | Reserved plus settled credits approaches a workspace daily limit | Confirm reservations and usage reconcile; do not raise the limit during an incident |
| Budget drift | Settled credits differ unexpectedly from completed invocation totals | Disable new paid calls and reconcile by correlation ID |
| Concurrency pressure | Repeated global/provider/workspace limit rejections | Keep limits in place; investigate demand or stuck invocations |
| Invocation duration | A `started` invocation outlives its provider timeout and grace period | Disable the provider; determine whether a vendor charge is already in flight |
| Lease expiry | Leases expire repeatedly or the same job is leased abnormally often | Stop new dispatch, inspect worker health, preserve job events |
| Cancellation lag | A run remains `cancelling` beyond the bounded worker/provider window | Disable its provider if needed; reconcile incurred usage before acknowledgement |
| Control rejection | Kill-switch rejections rise unexpectedly | Verify the change record; do not turn controls off merely to clear an alert |

Thresholds belong in the deployment's monitored configuration and must be lower
than provider, budget, and platform hard limits. Changing a threshold is not a
substitute for changing an enforced database limit through review.

## Kill-switch procedure

Only an authorized database/platform operator may change the private control
plane. Browser roles have no access and there is intentionally no public admin
mutation endpoint.

1. Identify the narrowest safe scope: workspace, provider, or global. If scope
   or blast radius is uncertain, use global.
2. Record the incident, operator, reason, timestamp, and intended recovery gate.
3. Disable the selected private control through the approved, audited database
   operations path. Never expose `app_private` through the browser API.
4. Confirm a new bounded request is rejected before provider invocation. Do not
   use an existing customer's job as the test.
5. Observe leased/in-flight work separately. A kill switch blocks the next paid
   boundary; it cannot reverse a vendor request already accepted.
6. Preserve reservations, invocation summaries, job events, and audit evidence.
7. Re-enable only after the root cause, accounting reconciliation, focused test,
   monitoring, and human recovery approval are complete.

## Cancellation procedure

- Only workspace owners or admins request cancellation through the authorized
  application path.
- A queued job should become `cancelled` and release its unused reservation.
- A leased job should become `cancelling`. The worker checks before each paid
  call, records calls already made, settles incurred credits, and acknowledges
  cancellation.
- Never tell a customer that cancellation reversed an already accepted provider
  charge. Escalate a stuck `cancelling` run; do not rewrite its state manually.
- Retain the append-only job and audit events for incident review.

## Incident triage

1. Protect spend and privacy: apply the narrowest certain kill switch, or global
   when uncertain.
2. Capture safe evidence: correlation IDs, states, timestamps, bounded units,
   safe error codes, durations, and deployment version.
3. Determine whether any invocation is in flight before cancelling or rolling
   back application code.
4. Reconcile reservations, settled usage, and finished invocation credits.
5. Notify product/legal/privacy owners if target policy, personal data, or
   provider terms may be involved.
6. Fix forward, run focused tests plus `npm run verify`, and obtain recovery
   approval before resuming paid calls.

## Application rollback

The safety migration is forward-only. Do not drop reservations, provider
invocations, private controls, job events, or audit evidence during rollback.

1. Disable paid research globally.
2. Allow in-flight calls to finish or cancel them through the normal worker path.
3. Reconcile already incurred usage.
4. Deploy the last verified application/worker version.
5. Confirm no new provider invocation starts and queued jobs remain durable.
6. Keep credentials disabled until the fixed release passes the full hosted
   checklist and receives a new activation approval.

Related contracts: [research safety control plane](../RESEARCH_SAFETY_CONTROL_PLANE.md),
[durable research jobs](../DURABLE_RESEARCH_JOBS.md), and
[public-launch safety](../SAFETY.md).
