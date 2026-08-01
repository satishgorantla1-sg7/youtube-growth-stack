# YouTube Growth Stack

An open-source, voice-first research and content-planning SaaS for YouTube creators. Connect a channel, ask the growth agent a question, review its evidence, and approve a complete content package: ideas, titles, thumbnail concepts, hooks, an outline, and a script.

> **Current status:** foundation/MVP. The interface and demo research loop run without paid credentials. Supabase, OpenAI voice, Firecrawl, Apify, and YouTube OAuth are adapter-ready and activate through environment configuration. Auto-publishing is deliberately outside the first release.

![MIT License](https://img.shields.io/badge/license-MIT-111111)
![Next.js](https://img.shields.io/badge/Next.js-16-111111)
![Supabase](https://img.shields.io/badge/Supabase-ready-3ECF8E)

## Product architecture

```mermaid
flowchart TB
  U[Creator] --> UI[Voice-first Next.js dashboard]
  UI --> AUTH[Supabase Auth]
  UI --> VOICE[Voice gateway]
  UI --> API[Typed API routes]
  VOICE --> RT[OpenAI Realtime voice]
  VOICE --> STT[GPT-4o Transcribe fallback]
  API --> APPROVAL{Human approval}
  APPROVAL -->|approved| JOBS[Durable job queue]
  APPROVAL -->|rejected| UI
  JOBS --> ORCH[Research orchestrator]
  ORCH --> YT[YouTube Data API]
  ORCH --> APIFY[Apify YouTube adapter]
  ORCH --> FIRE[Firecrawl web adapter]
  ORCH --> SYNTH[Pattern and idea synthesis]
  SYNTH --> PACKAGE[Versioned content package]
  PACKAGE --> APPROVAL
  AUTH --> DB[(Supabase Postgres + RLS)]
  JOBS --> DB
  ORCH --> DB
  PACKAGE --> DB
  DB --> UI
```

## User experience

The dedicated `/onboarding` route guides a creator through profile and workspace setup, a demo-safe channel connection, an optional microphone check, and completion. The interface asks for explicit confirmation before it would open Google OAuth or request browser microphone access. Demo mode uses a typed channel adapter and does not request or store OAuth tokens; every voice action has a full keyboard and text alternative.

With Supabase configured, /onboarding keeps workspace creation on the authenticated server action and atomic create_workspace RPC. A successful immediate sign-up, email callback, or workspace creation continues at /onboarding?stage=channel, where the same flow starts at channel connection with the authenticated display and workspace names already supplied.

```mermaid
journey
  title From spoken question to approved content package
  section Start
    Create account and workspace: 5: Creator
    Connect YouTube channel: 4: Creator
    Speak or type a goal: 5: Creator
  section Research
    Review plan, sources, and credit estimate: 5: Creator, Agent
    Approve research: 5: Creator
    Track evidence collection: 4: Agent
  section Create
    Compare scored ideas: 5: Creator, Agent
    Review titles, thumbnails, hook, outline, and script: 5: Creator
    Revise by voice or text: 5: Creator, Agent
    Approve and export: 5: Creator
```

## Example conversation

```mermaid
sequenceDiagram
  actor C as Creator
  participant V as Voice/Chat UI
  participant A as Growth Agent
  participant G as Approval Gate
  participant R as Research Workers
  C->>V: "Find a gap in AI productivity this week"
  V->>A: Transcript + workspace context
  A-->>C: Research plan, 20-source cap, 12-credit estimate
  C->>G: Approve
  G->>R: Queue idempotent research run
  R-->>A: Normalized evidence with provenance
  A-->>C: Three scored ideas and reasons
  C->>V: "Build number one, but make the hook more honest"
  V->>A: Revision instruction
  A-->>C: Version 2 content package
  C->>G: Approve export
  G-->>C: Downloadable package
```

## Data flow

```mermaid
flowchart LR
  INPUT[Voice or text] --> TRANSCRIPT[Editable transcript]
  TRANSCRIPT --> INTENT[Validated research request]
  INTENT --> PLAN[Plan + cost estimate]
  PLAN --> A1{Approval 1}
  A1 -->|yes| QUEUE[Queued job]
  QUEUE --> RAW[Raw provider results]
  RAW --> NORMAL[Normalized sources]
  NORMAL --> PROV[Provenance + content hash]
  PROV --> IDEAS[Patterns + scored ideas]
  IDEAS --> DRAFT[Versioned content package]
  DRAFT --> A2{Approval 2}
  A2 -->|revise| TRANSCRIPT
  A2 -->|approve| EXPORT[Private export]
  PLAN & QUEUE & RAW & IDEAS & DRAFT & EXPORT --> PG[(Postgres with workspace RLS)]
```

## Repository structure

```mermaid
flowchart TB
  ROOT[repository]
  ROOT --> AG[AGENTS.md]
  ROOT --> APP[src/app]
  ROOT --> COMPONENTS[src/components]
  ROOT --> LIB[src/lib]
  ROOT --> SUPA[supabase]
  ROOT --> SKILLS[.agents/skills]
  ROOT --> DOCS[docs]
  ROOT --> GH[.github]
  APP --> ROUTES[API routes]
  LIB --> PROVIDERS[provider adapters]
  LIB --> RESEARCH[orchestration]
  LIB --> CLIENTS[Supabase clients]
  SUPA --> MIGRATIONS[migrations + RLS]
  SKILLS --> SF[ship-feature]
  SKILLS --> DB[change-database]
  SKILLS --> AP[add-provider]
  SKILLS --> VV[change-voice]
  SKILLS --> VP[verify-pr]
  SKILLS --> AS[audit-safety]
  SKILLS --> UA[update-architecture]
```

## Agent workflow

```mermaid
flowchart LR
  TASK[Issue or user request] --> READ[Read nearest AGENTS.md]
  READ --> SKILL[Load matching repository skill]
  SKILL --> CONTRACT[Inspect types, migrations, tests, ADRs]
  CONTRACT --> SLICE[Implement smallest vertical slice]
  SLICE --> CHECK[Focused checks]
  CHECK --> VERIFY[npm run verify]
  VERIFY --> DIFF[Security, UX, cost, docs diff review]
  DIFF --> PR[Focused pull request]
  PR --> FEEDBACK[CI + human feedback]
  FEEDBACK -->|changes| READ
  FEEDBACK -->|approved| MERGE[Squash merge]
```

## Implementation loop

Loop engineering is the development method, not a backend technology. Each pass turns a request into verified evidence and captures useful learning for the next contributor.

```mermaid
stateDiagram-v2
  [*] --> Frame
  Frame --> Inspect
  Inspect --> Change
  Change --> Verify
  Verify --> Change: failed with a new hypothesis
  Verify --> Review: passed
  Review --> Change: risk or scope issue
  Review --> PullRequest
  PullRequest --> Frame: review feedback
  PullRequest --> Learn: merged
  Learn --> [*]
```

Read [Loop Engineering](docs/LOOP_ENGINEERING.md) for the plain-language repository mapping.

## Quick start

Requirements: Node.js 20.9+, npm, and optionally the Supabase CLI.

```bash
git clone https://github.com/satishgorantla1-sg7/youtube-growth-stack.git
cd youtube-growth-stack
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Demo mode is on by default and does not spend provider credits.

To exercise real sign-up, sign-in, email callback, workspace onboarding, and sign-out, configure the two public Supabase variables and turn demo mode off. See [Supabase identity and workspace onboarding](docs/operations/auth-workspaces.md) for local setup, redirect configuration, policy tests, and migration/rollback notes.

To verify the same gates used by pull requests:

```bash
npm run verify
```

Durable research runs stop for approval before provider execution. After applying the Supabase migrations and configuring server-only worker credentials, start the consumer with:

```bash
npm run worker:research
```

See [Durable research jobs](docs/DURABLE_RESEARCH_JOBS.md) for the lease/ack/fail contract, deployment requirements, and migration risk.

## Configure integrations

Copy `.env.example` to `.env.local` and add only the integrations you are testing. Never prefix a secret with `NEXT_PUBLIC_`.

| Capability | Environment variables | Safe fallback |
|---|---|---|
| Authentication and data | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | UI demo only |
| Voice | `OPENAI_API_KEY` and model overrides | Browser speech output + demo transcript |
| YouTube research | `APIFY_API_TOKEN` and actor ID | Deterministic demo source |
| Web research | `FIRECRAWL_API_KEY` | Deterministic demo source |
| Owned channel | Google OAuth variables | Example connected channel |

The default recorded-turn transcription model is `gpt-4o-transcribe`, which improves on original Whisper models. The realtime model is configurable because audio model availability evolves. Permanent OpenAI keys remain server-side; the Realtime route returns only short-lived client secrets. See the [OpenAI model catalog](https://developers.openai.com/api/docs/models) and [GPT-4o Transcribe](https://developers.openai.com/api/docs/models/gpt-4o-transcribe).

## Human approvals and safety

The application stops for explicit approval before paid deep research, channel actions, raw-audio retention, exports, and deletion. Provider results retain source URLs and capture timestamps. Raw audio is ephemeral by default. Workspace data is protected by Supabase row-level security.

Apify and Firecrawl availability does not grant permission to collect data. Deployers remain responsible for YouTube policies, provider terms, privacy notices, OAuth verification, deletion handling, and local law.

Before enabling production credentials, read the [public-launch safety and operations checklist](docs/SAFETY.md). It distinguishes safeguards already enforced from release-blocking voice privacy, provider policy, quota, monitoring, and kill-switch work.

## Delivery roadmap

1. Repository foundation, demo experience, schemas, agent instructions, and CI.
2. Supabase authentication, onboarding, workspace creation, and tested RLS. (complete)
3. YouTube OAuth and channel snapshot ingestion.
4. Durable worker consumer for Supabase Queues/job records.
5. Production Firecrawl and Apify contract tests with quotas.
6. Evidence-grounded synthesis and versioned content packages.
7. Realtime WebRTC client, accessibility, voice consent, and retention jobs.
8. Billing, admin controls, observability, OAuth verification, and public beta.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), the closest `AGENTS.md`, and the matching workflow under `.agents/skills`. New work should begin with an issue and arrive as a focused pull request.

## License

MIT © 2026 Satish Gorantla. See [LICENSE](LICENSE).
