# Supabase identity and workspace onboarding

The app has two intentional runtime modes:

- With no Supabase URL/key (the default), `/` remains an open, credential-free demo.
- With both public Supabase variables configured, the app refreshes sessions in `proxy.ts` and protects `/` and `/onboarding`. Auth entry pages and the callback remain public.

## Local setup

1. Install Docker and the Supabase CLI, then run `supabase start` and `supabase db reset`.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `supabase status`. Keep service-role credentials out of browser variables and source control.
4. Keep `NEXT_PUBLIC_APP_URL=http://localhost:3000`; add the deployed `/auth/callback` URL to the Supabase Auth redirect allow-list in hosted environments.
5. Run `npm run dev`, create an account at `/auth/sign-up`, and confirm email if the project requires confirmation.

Sign-up stores only the pending workspace name/slug in Auth user metadata. When a session exists, the server calls `public.create_workspace`. The security-definer function creates the workspace, owner membership, and audit event in one transaction. Direct authenticated inserts into `public.workspaces` are revoked so callers cannot create an owner row without membership.

## Verification and operations

- `npm run verify` covers TypeScript validation, safe redirect logic, demo-mode boundaries, and the production build.
- `supabase test db` runs the two-tenant onboarding/RLS policy test after a clean reset.
- No provider cost, voice retention, or approval behavior changes.

Migration `202608010007_secure_workspace_onboarding.sql` runs after the durable research migrations and takes brief catalog locks while replacing the workspace function, dropping one insert policy, and revoking direct insert. It does not rewrite or backfill data. Roll forward by correcting the function/policy in a later migration. Emergency rollback is a new migration restoring the old insert policy and grant; reverting application code alone does not revert database authorization.
