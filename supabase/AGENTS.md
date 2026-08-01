# Supabase Instructions

- Migrations are append-only after merge. Never edit production history.
- Every tenant-owned table requires `workspace_id`, RLS, and an isolation test.
- Keep OAuth/provider credentials in `app_private` and revoke client access.
- Use a security-definer membership helper with an empty search path to avoid RLS recursion.
- Add indexes for foreign keys, state/time filters, and queue leases.
- Raw audio is private, short-lived, and deleted by retention jobs unless a user explicitly opts in.
- Run a clean local reset before requesting review and describe rollback/data migration in the PR.
