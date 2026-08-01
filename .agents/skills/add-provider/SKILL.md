---
name: add-provider
description: Add or change a Firecrawl, Apify, YouTube, OpenAI, or future external API integration behind the provider boundary. Use for provider endpoints, credentials, mapping, retries, or fallback behavior.
---

# Add a Provider

1. Implement `ResearchProvider` or the closest existing interface; do not call vendors from UI components.
2. Validate server-only environment variables and redact secrets from logs.
3. Set request timeouts, bounded result counts, concurrency limits, and clear error mapping.
4. Normalize results into internal contracts with URL, capture time, and provenance.
5. Make retryable work idempotent and send repeated failures to a dead-letter state.
6. Add mocked contract tests. Live tests must be opt-in and must never run in normal CI.
7. Update `.env.example`, provider status, compliance notes, and cost assumptions.
