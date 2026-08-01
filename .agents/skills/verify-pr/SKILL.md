---
name: verify-pr
description: Run the repository's complete pull-request quality gate and prepare evidence for reviewers. Use before opening, updating, approving, or merging a PR.
---

# Verify a Pull Request

1. Read the issue and inspect the complete diff for scope drift and secrets.
2. Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.
3. Run `git diff --check` and check that `.env` files, tokens, recordings, and generated build output are ignored.
4. For UI changes, test desktop and mobile widths and attach a screenshot.
5. For database changes, run a clean local reset and tenant-isolation tests.
6. For provider changes, test success, timeout, rate limit, and provider-down behavior with mocks.
7. Report commands and results. Never claim a check passed if it was skipped.
