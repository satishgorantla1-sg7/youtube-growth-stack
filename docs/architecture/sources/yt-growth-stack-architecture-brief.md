# YT Growth Stack  -  Architecture Source Brief

Date: 2026-08-01
Status: approved logical direction, prepared for visual architecture documentation

## Product promise

YT Growth Stack is a public, multi-tenant SaaS product for YouTube creators. A customer connects an owned YouTube channel, identifies competitors or a niche, and talks to a voice-first AI agent. The system researches the market and produces editable content packages containing evidence-backed ideas, title options, thumbnail concepts, hooks, outlines, and full scripts.

The primary interaction is conversational voice. Text chat remains visible as the transcript, audit trail, accessibility fallback, and place to edit instructions and generated artifacts.

## Experience layer

- Next.js application using React, shadcn/ui components, and a TweakCN theme.
- Voice-native command centre rather than a conventional analytics-only dashboard.
- Persistent conversation panel with push-to-talk, interruption, mute, replay, transcript editing, and a normal text composer.
- Artifact workspace beside the conversation for research evidence, ideas, titles, thumbnail concepts, outlines, and scripts.
- Realtime progress for scraping, analysis, generation, approval, retry, and failure states.
- Keyboard-complete and screen-reader-compatible alternatives for every voice interaction.

## Voice architecture

- Use OpenAI's Realtime API over WebRTC for low-latency browser speech sessions.
- Use GPT-Live or the current supported realtime speech-to-speech model for the spoken agent.
- Use GPT-Realtime-Whisper or the current supported realtime transcription model for the visible live transcript.
- Keep model identifiers in server-side configuration so model upgrades do not require product redesign.
- Keep `whisper-1` only as a compatibility or batch fallback. OpenAI documents that `whisper-1` is powered by open-source Whisper V2; it is not the newest transcription stack.
- Keep Wispr Flow behind the same transcription-provider interface as an optional alternative, not the primary provider.
- Never expose the permanent OpenAI API key in browser code. The server creates short-lived realtime credentials or sessions.
- Default to not retaining raw microphone audio. Store approved transcripts and usage metadata according to the customer's retention settings.

## Identity and SaaS control

- Supabase Auth for customer identity.
- Organizations/workspaces, memberships, and roles.
- Row-level security on every tenant-owned record.
- Encrypted handling of YouTube OAuth refresh tokens and any future bring-your-own-provider credentials.
- Plans, credits, scrape limits, audio usage, AI usage, and audit events.

## Research ingestion

- Official YouTube OAuth and YouTube APIs for the customer's owned channel.
- Apify Actors for public competitor videos, metadata, comments, and transcripts where permitted.
- Firecrawl for competitor sites, newsletters, articles, product pages, and supporting web research.
- An asynchronous job controller with explicit states, retries, timeouts, cancellation, idempotency, and webhooks.
- Normalize vendor-specific results into stable channel, video, transcript, comment, web-source, and evidence records.
- Preserve source URLs, timestamps, collection method, confidence, and raw vendor payload references.

## Content intelligence

1. Normalize and deduplicate collected evidence.
2. Extract patterns from owned-channel performance and competitor content.
3. Generate candidate video ideas.
4. Score opportunity, audience fit, evidence strength, and originality.
5. Ask the customer to approve an idea.
6. Generate title options, thumbnail concepts, hooks, outline, and script.
7. Validate evidence, quality, originality, policy risk, and completeness.
8. Ask the customer to approve the package before export or any future publishing action.

## Human approval boundaries

- Approve or edit voice transcripts before they become costly or consequential instructions.
- Explicitly start research after reviewing its scope and expected credit use.
- Select an idea before generating a full content package.
- Approve or request changes to the content package.
- Require a separate explicit approval before any future external publishing action.
- Store approval actor, timestamp, object version, previous state, resulting state, and feedback.
- An approval applies to an immutable artifact version; later edits require reapproval.

## Data platform

- Supabase PostgreSQL for structured product data and workflow state.
- Supabase Storage for raw vendor payloads, exports, and approved project assets.
- Supabase Realtime for progress and status updates.
- Tables or equivalent domain records for workspaces, memberships, channels, competitors, sources, evidence, jobs, conversations, messages, transcripts, ideas, content packages, artifact versions, approvals, usage events, and audit events.

## Operations

- Structured logs, error monitoring, cost and latency metrics, product analytics, and support/admin views.
- Per-workspace rate limits and budgets for YouTube, Apify, Firecrawl, realtime audio, and content generation.
- Privacy controls, deletion/export flows, retention settings, and provider-policy compliance.

## Loop engineering boundary

Loop engineering is the repository development system, not the SaaS runtime backend. A coding task follows: small issue, read `AGENTS.md` and relevant repository skill, plan, branch, implement, run checks, review, open pull request, respond to feedback, and human merge. Loops have iteration, time, and cost limits. Production publishing, secrets, billing changes, database destruction, and pull-request merging remain human-controlled.

## Visual direction

- Format: high-legibility systems infographic and companion readable architecture document.
- Mood: editorial technical atlas, not a generic gradient SaaS diagram.
- Structure: left-to-right customer journey supported by clearly separated platform bands.
- Signature element: a central voice conversation spine that becomes research, intelligence, approval, and content artifacts.
- Colour meaning must remain consistent: violet for experience/voice, blue for trust/data, cyan for research providers, amber for intelligence, green for human approvals, and red only for risk or blocked states.
- Use short labels, generous spacing, strong hierarchy, a legend, and numbered layers.
- Include a plain-language note distinguishing product analysis loops from repository loop engineering.

## Trustworthy sources

- OpenAI Realtime API reference: https://platform.openai.com/docs/api-reference/realtime (accessed 2026-08-01).
- OpenAI Audio API reference: https://platform.openai.com/docs/api-reference/audio (accessed 2026-08-01).
- OpenAI, "Advancing voice intelligence with new models in the API": https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/ (accessed 2026-08-01).
- OpenAI, "Introducing GPT-Live": https://openai.com/index/introducing-gpt-live/ (accessed 2026-08-01).
- Wispr Flow Voice Interface API: https://api-docs.wisprflow.ai/introduction (accessed 2026-08-01).
- Supabase Auth documentation: https://supabase.com/docs/guides/auth (accessed 2026-08-01).
- YouTube OAuth for web server applications: https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps (accessed 2026-08-01).
- YouTube quota and compliance audits: https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits (accessed 2026-08-01).
- Apify Actors documentation: https://docs.apify.com/actors (accessed 2026-08-01).
- Firecrawl introduction: https://docs.firecrawl.dev/introduction (accessed 2026-08-01).
- Addy Osmani, "Loop Engineering": https://addyosmani.com/blog/loop-engineering/ (accessed 2026-08-01).

