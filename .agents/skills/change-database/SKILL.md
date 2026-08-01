---
name: change-database
description: Create and verify Supabase migrations, RLS policies, indexes, storage rules, and generated types. Use whenever a task changes persisted data or authorization.
---

# Change the Database

1. Read existing migrations in timestamp order; never rewrite an applied migration.
2. Add one forward-only migration with the smallest reversible change.
3. Add `workspace_id` to tenant-owned rows and enable RLS immediately.
4. Prefer membership policies through `app_private.is_workspace_member`.
5. Keep credentials and provider refresh tokens in `app_private`; never expose that schema to `anon` or `authenticated`.
6. Add indexes for foreign keys and frequent queue/filter paths.
7. Reset a local Supabase database, run policy tests for two separate tenants, then regenerate types.
8. Describe data migration, lock risk, rollback, and retention impact in the PR.
