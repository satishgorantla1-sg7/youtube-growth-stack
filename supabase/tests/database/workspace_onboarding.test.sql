begin;
select plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'one@example.test', 'not-used', now(), '{}', '{"full_name":"Owner One"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'two@example.test', 'not-used', now(), '{}', '{"full_name":"Owner Two"}', now(), now());

create temporary table onboarding_ids (user_id uuid primary key, workspace_id uuid not null);
grant all on onboarding_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
insert into onboarding_ids values (
  '10000000-0000-0000-0000-000000000001',
  public.create_workspace(' Creator One ', 'creator-one')
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
insert into onboarding_ids values (
  '20000000-0000-0000-0000-000000000002',
  public.create_workspace('Creator Two', 'creator-two')
);

reset role;
select is((select count(*) from public.workspaces where slug in ('creator-one', 'creator-two')), 2::bigint, 'both workspaces were created');
select is((select name from public.workspaces where slug = 'creator-one'), 'Creator One', 'workspace name is normalized');
select is((select count(*) from public.workspace_members where role = 'owner' and user_id in (select user_id from onboarding_ids)), 2::bigint, 'each creator receives owner membership');
select is((select count(*) from public.audit_events where action = 'workspace.created' and actor_id in (select user_id from onboarding_ids)), 2::bigint, 'each atomic onboarding is audited');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(
  public.create_workspace('Ignored retry', 'ignored-retry'),
  (select workspace_id from onboarding_ids where user_id = '10000000-0000-0000-0000-000000000001'),
  'repeated onboarding returns the existing workspace'
);

select is((select count(*) from public.workspaces), 1::bigint, 'tenant one sees only its workspace');
select is((select count(*) from public.workspace_members), 1::bigint, 'tenant one sees only its membership');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.workspaces), 1::bigint, 'tenant two sees only its workspace');
select is((select count(*) from public.workspace_members), 1::bigint, 'tenant two sees only its membership');

select throws_ok(
  $$ select public.create_workspace('Bad', 'UPPERCASE') $$,
  '22023',
  'invalid workspace slug',
  'database rejects a malformed onboarding slug'
);

select * from finish();
rollback;
