# ADR 0006: Health readiness is not release approval

**Status:** accepted

## Context

Operators need to distinguish a live web service from a deployment capable of
enforcing paid-research controls. Credential presence cannot prove that the
hosted migration, private control rows, RLS, alerts, or cancellation behavior
have been verified. Querying private controls from a public health route would
also widen the information exposed to unauthenticated callers.

## Decision

`GET /api/health` keeps `ok` as liveness and returns a separate, non-sensitive
research readiness contract. It reports only mode, configuration capability,
stable provider/configuration states, and whether server prerequisites can use
the control plane. Complete configuration ends at
`hosted_verification_required`; it never becomes release authorization.

Hosted verification and activation approval live in the deployment release
record and the paid-research safety runbook. Private control values, reasons,
limits, tenant identifiers, usage, and secrets are not exposed. There is no
public mutation endpoint for operational controls.

## Rejected alternatives

- Treat `ok: true` or credential presence as paid-research readiness.
- Return private control-plane rows or operational limits from public health.
- Add an unauthenticated or browser-admin kill-switch mutation route.
- Probe enforcement with a mutating or paid call during health checks.

## Consequences

Monitoring can detect missing configuration without receiving secrets, while a
separate hosted checklist remains mandatory. Operators must not use the health
response alone to enable credentials or paid traffic.
