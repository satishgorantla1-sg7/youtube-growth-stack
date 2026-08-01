# Public-launch safety and operations

**Status (2026-08-01): controlled beta foundation, not production-ready.** Demo mode is safe without paid credentials. The repository contains the paid-research control plane, but hosted enforcement, isolation, alerting, and cancellation tests remain release gates. Keep Apify and Firecrawl credentials disabled in public environments until those gates pass and activation is separately approved.

| Area | Implemented now | Still required before public launch | Decision / owner |
|---|---|---|---|
| Research isolation and approval | Workspace RLS/roles; owner/admin approval; atomic approval, budget reservation, and queue transition; immutable audit evidence | Hosted two-tenant and concurrent-approval verification | Block if failing — backend/data |
| Voice privacy | User-triggered mic permission; server-only permanent key; no raw-audio persistence by default; authenticated voice routes | Persisted consent; editable transcript before action; retention/export/deletion | Block public voice until complete — product/privacy |
| Voice abuse/cost | Payload caps, timeouts, per-instance rate limits | Distributed user/workspace/global limits, session-duration caps, usage ledger, alerts, kill switch | Block scaled public OpenAI credentials — platform |
| Paid research | Reservations and settlement; distributed limits; global/provider/workspace controls; provider invocation summaries; cancellation contract; 25-source cap; provider timeouts; retries/dead letters; correlation IDs | Hosted control tests, monitored alerts, lease-expiry exercise, provider terms review, and activation approval | Block paid providers until verified — platform |
| Terms, PII, provenance | Provider, URL, source type, title, capture time, adapter and correlation metadata retained | Target policy and terms review; personal-data minimization; raw-result retention/deletion; claim-level hashes | Block production scraping — product/legal + data |

## Mandatory operating rules

- Voice commands never count as approval. Paid, publishing, credential, raw-audio retention, export, and deletion actions require persisted approval.
- Raw audio is ephemeral by default. Retention must be opt-in, private, time-bounded, auditable, and deletable; provider-side processing must be disclosed.
- Limits are enforced server-side at user, workspace, provider, and global levels. UI counters and provider dashboards are evidence, not boundaries.
- Kill switches must stop new paid calls globally, per provider, and per workspace without a deployment while preserving queue and audit evidence.
- Scraping availability is not permission. Collect only approved targets and data, respect provider and YouTube obligations, and preserve provenance.
- Logs and analytics must exclude audio, transcripts, prompts, tokens, secrets, and unnecessary personal data; use safe error codes and correlation IDs.

## Launch verification

Before enabling paid credentials, run `audit-safety`, `npm run verify`, hosted RLS and rate-limit tests, and provider contract tests. Exercise consent withdrawal, transcript correction, deletion/export, concurrent budget exhaustion, every kill-switch scope, cancellation, reconciliation, lease expiry, and dead-letter replay. Verify safe alert payloads, secret rotation, and complete privacy/provider-terms review. Every finding needs a severity, owner, fix, and release decision.

The public health endpoint reports configuration capability only; it never proves hosted enforcement or authorizes activation. See the [paid research safety runbook](operations/research-safety-runbook.md), [durable research jobs](DURABLE_RESEARCH_JOBS.md), [human approval ADR](decisions/0002-human-approval-gates.md), and [voice privacy ADR](decisions/0003-voice-privacy.md).
