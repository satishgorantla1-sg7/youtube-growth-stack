# API Route Instructions

- Parse every request at the boundary with Zod and return structured 4xx errors.
- Authenticate before reading workspace identifiers; authorize membership before data access.
- Keep service-role and vendor secrets server-only.
- Add explicit timeouts and safe provider error mapping.
- Never execute paid, publishing, credential, or destructive work without a persisted approval.
- Do not log request bodies, transcripts, tokens, or scraped personal data.
- Prefer queueing work that may exceed a normal request lifetime; route handlers should return a run identifier.
