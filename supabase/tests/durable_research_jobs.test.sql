begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'tenant-one@example.test', '', now(), '{}'::jsonb, '{"full_name":"Tenant One"}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'tenant-two@example.test', '', now(), '{}'::jsonb, '{"full_name":"Tenant Two"}'::jsonb, now(), now());

insert into public.workspaces (id, name, slug, owner_id) values
  ('10000000-1000-4000-8000-000000000001', 'Tenant One', 'tenant-one', '10000000-0000-4000-8000-000000000001'),
  ('20000000-2000-4000-8000-000000000002', 'Tenant Two', 'tenant-two', '20000000-0000-4000-8000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('10000000-1000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('20000000-2000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.create_research_run('10000000-1000-4000-8000-000000000001', 'Tenant-safe research', 'quick', array['web'], 5, 1, 'tenant-one-request')$$,
  'a member can create an approval-gated run in their workspace'
);
select throws_ok(
  $$select public.create_research_run('20000000-2000-4000-8000-000000000002', 'Cross-tenant research', 'quick', array['web'], 5, 1, 'cross-tenant-request')$$,
  'P0001', 'workspace_forbidden', 'a member cannot create a run in another workspace'
);
select is((select count(*) from public.research_runs where workspace_id = '10000000-1000-4000-8000-000000000001'), 1::bigint,
  'the member can read their own run');
select is((select count(*) from public.research_runs where workspace_id = '20000000-2000-4000-8000-000000000002'), 0::bigint,
  'RLS hides the other tenant runs');

select * from finish();
rollback;
