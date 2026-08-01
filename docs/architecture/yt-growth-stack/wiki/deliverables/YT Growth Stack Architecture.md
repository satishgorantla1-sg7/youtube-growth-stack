---
type: "deliverable"
title: "YT Growth Stack Architecture"
status: "mature"
created: "2026-08-01"
updated: "2026-08-01"
tags: ["gogh/stack", "note/deliverable"]
domain: "stack"
confidence: "evidence-based"
related: ["[[Architecture Visual Stack]]", "[[Hot]]", "[[Index]]", "[[Overview]]", "[[Log]]", "[[Dashboard]]", "[[yt-growth-stack-architecture-brief]]"]
source_urls:
  - "https://platform.openai.com/docs/api-reference/realtime (retrieved 2026-08-01)"
  - "https://supabase.com/docs/guides/auth (retrieved 2026-08-01)"
sources: ["[[yt-growth-stack-architecture-brief]]"]
---

# YT Growth Stack Architecture

The final logical architecture presents YT Growth Stack as a voice-first, multi-tenant, approval-gated YouTube research and content-generation SaaS.

## Deliverables

- `../../../YT-Growth-Stack-Architecture.html` - accessible, printable infographic document.
- `../../../YT-Growth-Stack-Architecture.pdf` - three-page A3 landscape PDF.
- `../../../YT-Growth-Stack-Architecture.png` - first-page architecture preview.
- `../../../YT-Growth-Stack-Architecture.md` - readable architecture specification.

## Direction commitment

- Direction: Conversational Systems Atlas.
- Signature element: one voice spine that becomes research, approvals, and content.
- Five-second memory: voice enters left; approved creative work leaves right.
- Banned default: a vertical pile of interchangeable pastel cards.

## Architecture decision

- Start with a modular Next.js application and Supabase data/control plane.
- Use OpenAI realtime voice with configurable model identifiers.
- Keep Wispr Flow behind an optional transcription adapter.
- Use official YouTube APIs for the owned channel, Apify for permitted competitor collection, and Firecrawl for supporting web research.
- Represent long work as durable asynchronous jobs.
- Require human approval for transcripts, research scope, selected ideas, content packages, and future publishing.
- Keep loop engineering in the repository workflow rather than calling it the production backend.

## Sources

- [[yt-growth-stack-architecture-brief]] contains the complete approved architecture and official provider references.

## Related

- [[Architecture Visual Stack]]
- [[Hot]]
- [[Index]]
- [[Overview]]
- [[Log]]
- [[Dashboard]]

## Next actions

- Design the Supabase schema and row-level security policies.
- Design the repository structure, AGENTS.md hierarchy, reusable skills, CI checks, and pull-request loop.

