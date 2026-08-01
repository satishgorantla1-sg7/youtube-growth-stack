---
name: ship-feature
description: Deliver a vertical YouTube Growth Stack feature from issue to verified pull request. Use for user-facing features that cross UI, API, data, providers, approvals, or documentation.
---

# Ship a Feature

1. Read the closest `AGENTS.md`, the issue, and affected contracts.
2. State acceptance criteria and choose the smallest end-to-end slice.
3. Add or update tests before broad refactoring.
4. Keep browser, server, provider, and database code inside their existing boundaries.
5. Require an approval record before paid, publishing, credential, or destructive actions.
6. Run `npm run verify` and `git diff --check`.
7. Update architecture diagrams when boundaries change.
8. Prepare a focused PR summary with evidence, risks, screenshots, and rollback notes.

Never put secrets in source, expose service keys to browsers, or mix unrelated cleanup into the feature.
