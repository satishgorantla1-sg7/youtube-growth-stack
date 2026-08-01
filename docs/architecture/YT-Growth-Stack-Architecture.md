---
title: "YT Growth Stack  -  Final Logical Architecture"
version: "1.0"
date: "2026-08-01"
status: "approved logical direction"
visual_direction: "Conversational Systems Atlas"
---

# YT Growth Stack  -  Final Logical Architecture

YT Growth Stack is a voice-first, multi-tenant SaaS for YouTube creators. A customer talks to an AI agent, connects an owned YouTube channel, selects competitor or niche research, and receives evidence-backed content packages containing ideas, titles, thumbnail concepts, hooks, outlines, and scripts.

The printable infographic is available in [YT-Growth-Stack-Architecture.html](./YT-Growth-Stack-Architecture.html).

## Architecture at a glance

| Layer | Responsibility | Primary technology |
|---|---|---|
| 01. Experience | Voice-native conversation, visible chat transcript, artifact editor, job progress | Next.js, React, shadcn/ui, TweakCN |
| 02. Voice | Realtime speech input/output and live transcript | OpenAI Realtime API, GPT-Live, GPT-Realtime-Whisper |
| 03. Trust | Authentication, workspaces, roles, tenant isolation, credits | Supabase Auth, PostgreSQL RLS |
| 04. Orchestration | Durable jobs, workflow states, retries, timeouts, cancellation, approvals | Next.js server modules initially; replaceable worker boundary |
| 05. Research | Owned-channel data, competitor data, supporting web evidence | YouTube APIs, Apify, Firecrawl |
| 06. Intelligence | Normalization, provenance, pattern extraction, idea scoring, package generation, validation | Versioned AI pipeline |
| 07. Data and operations | Product records, files, realtime events, usage, monitoring, admin | Supabase Postgres, Storage, Realtime plus observability tools |

## Voice-first interaction

The dashboard is a conversational command centre. Voice is the default input and spoken responses are supported, while text remains available for accessibility, precise editing, review, and auditability.

The current architecture uses the OpenAI Realtime API over WebRTC. `GPT-Realtime-Whisper` is the configured live-transcription default and `GPT-Live` is the configured spoken-agent default, subject to verifying supported model IDs during implementation. Model names live in server configuration rather than application code.

`whisper-1` is retained only as a compatibility or batch fallback. OpenAI documents that it is powered by Whisper V2; it is not the newest transcription path. Wispr Flow remains an optional provider behind a `TranscriptionProvider` adapter.

## Human approval gates

1. The customer reviews or edits a transcript before it becomes a costly or consequential instruction.
2. The customer confirms research scope and expected credit use.
3. The customer selects an idea before full-package generation.
4. The customer approves or requests changes to the generated package.
5. Any future publishing action requires a separate explicit approval.

Approvals attach to immutable artifact versions. Later edits create a new version and require reapproval. Each approval records actor, timestamp, prior state, resulting state, artifact version, and feedback.

## Research and content flow

1. Official YouTube OAuth and APIs provide authoritative owned-channel information.
2. Apify Actors collect permitted public competitor data.
3. Firecrawl collects supporting research from relevant web sources.
4. The platform normalizes and deduplicates vendor output.
5. Every useful claim retains its source URL, collection timestamp, method, and confidence.
6. The intelligence pipeline extracts patterns, generates candidates, scores them, and presents a shortlist.
7. After idea approval, the system produces titles, thumbnail concepts, hooks, an outline, and a script.
8. Evidence, quality, originality, policy, and completeness checks run before customer approval.

## Security and SaaS rules

- Every customer-owned record includes a workspace boundary and is protected by row-level security.
- Permanent provider credentials never reach browser code.
- OpenAI realtime browser access uses a short-lived server-created session or client credential.
- Raw microphone audio is not retained by default.
- OAuth refresh tokens and future bring-your-own-provider secrets require encrypted server-side handling.
- Usage is metered per workspace for audio, scraping, research, and generation.
- Destructive, publishing, billing, and administrative operations require explicit authorization.

## Product loop versus loop engineering

The product loop is `listen → research → generate → validate → approve`. It runs for customers.

Loop engineering is the repository development system: `issue → read AGENTS.md and skills → plan → branch → implement → test → review → pull request → human merge`. It does not replace the production backend, customer approval, or engineering judgment.

## Implementation boundary

The first version is a modular Next.js application with a Supabase control and data plane. Long-running work is represented as durable jobs and completed asynchronously through webhooks or worker calls. Provider clients and intelligence stages use explicit interfaces so a dedicated worker service can be extracted later without redesigning the product.

## Sources

- [OpenAI Realtime API](https://platform.openai.com/docs/api-reference/realtime)
- [OpenAI Audio API](https://platform.openai.com/docs/api-reference/audio)
- [OpenAI: Advancing voice intelligence](https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/)
- [OpenAI: Introducing GPT-Live](https://openai.com/index/introducing-gpt-live/)
- [Wispr Flow Voice Interface API](https://api-docs.wisprflow.ai/introduction)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [YouTube OAuth for web applications](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)
- [YouTube quota and compliance audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits)
- [Apify Actors](https://docs.apify.com/actors)
- [Firecrawl introduction](https://docs.firecrawl.dev/introduction)
- [Addy Osmani: Loop Engineering](https://addyosmani.com/blog/loop-engineering/)

