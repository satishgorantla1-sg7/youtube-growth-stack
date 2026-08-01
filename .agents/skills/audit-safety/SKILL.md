---
name: audit-safety
description: Review a YouTube Growth Stack change for multi-tenant isolation, secrets, OAuth, privacy, consent, scraping, cost, abuse, and human approval risks. Use before public release or for security-sensitive PRs.
---

# Audit SaaS Safety

Review and report findings by severity:

1. Verify every tenant-owned query is constrained by RLS and workspace membership.
2. Trace API keys, OAuth tokens, service roles, and Realtime secrets from storage to use.
3. Confirm paid, publishing, credential, deletion, and high-impact actions require an auditable approval.
4. Confirm voice consent, transcript editing, raw-audio retention, export, and deletion controls.
5. Check provider terms, provenance, personal-data minimization, and YouTube metric labelling.
6. Check quotas, rate limits, crawl bounds, timeouts, retry limits, and kill switches.
7. Check logs and analytics for prompts, tokens, transcripts, and personal data.
8. Give each finding an owner, recommended fix, and release-blocking decision.
