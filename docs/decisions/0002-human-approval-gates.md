# ADR 0002: Human approval gates are domain records

Status: accepted — 2026-08-01

## Decision

Paid research, channel publishing, credentials, raw-audio retention, export, and deletion require a pending `approvals` record followed by an explicit decision. Conversational confirmation alone is not sufficient.

## Consequences

The system can explain what will happen, estimate cost, audit who approved it, and safely resume queued work. Agents and voice interfaces must model “waiting for approval” as a normal state.
