# ADR 0003: Voice-first, audio-ephemeral

Status: accepted — 2026-08-01

## Decision

Use the current OpenAI Realtime family for low-latency conversation and GPT-4o Transcribe for recorded-turn fallback. Raw audio is not retained by default. The transcript is editable and every voice action has a text equivalent.

## Consequences

Microphone permission is requested only after user action. Retained recordings require explicit consent, private storage, a retention date, and deletion controls. Server routes mint short-lived Realtime client secrets; permanent API keys never reach browsers.
