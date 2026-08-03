begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('55000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gate-owner@example.test','',now(),'{}','{}',now(),now()),
  ('55000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gate-viewer@example.test','',now(),'{}','{}',now(),now()),
  ('55000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gate-other@example.test','',now(),'{}','{}',now(),now());
insert into public.workspaces(id,name,slug,owner_id) values
  ('55000000-1000-4000-8000-000000000001','Gate One','gate-one','55000000-0000-4000-8000-000000000001'),
  ('55000000-1000-4000-8000-000000000002','Gate Two','gate-two','55000000-0000-4000-8000-000000000003');
insert into public.workspace_members(workspace_id,user_id,role) values
  ('55000000-1000-4000-8000-000000000001','55000000-0000-4000-8000-000000000001','owner'),
  ('55000000-1000-4000-8000-000000000001','55000000-0000-4000-8000-000000000002','viewer'),
  ('55000000-1000-4000-8000-000000000002','55000000-0000-4000-8000-000000000003','owner');
insert into app_private.youtube_connections(
  id,workspace_id,provider_subject_hash,encrypted_credentials,credential_version_number,scopes,expires_at,state
) values
  ('55000000-2000-4000-8000-000000000001','55000000-1000-4000-8000-000000000001',repeat('a',64),'cipher-one','v1',array['https://www.googleapis.com/auth/youtube.readonly'],now()+interval '1 minute','connected'),
  ('55000000-2000-4000-8000-000000000002','55000000-1000-4000-8000-000000000002',repeat('b',64),'cipher-two','v1',array['https://www.googleapis.com/auth/youtube.readonly'],now()+interval '1 minute','connected');
insert into public.channels(id,workspace_id,youtube_connection_id,external_id,title,uploads_playlist_id,is_selected) values
  ('55000000-3000-4000-8000-000000000001','55000000-1000-4000-8000-000000000001','55000000-2000-4000-8000-000000000001','UC-gate-one','Gate One','UU-gate-one',true),
  ('55000000-3000-4000-8000-000000000002','55000000-1000-4000-8000-000000000002','55000000-2000-4000-8000-000000000002','UC-gate-two','Gate Two','UU-gate-two',true);
insert into public.youtube_sync_runs(id,workspace_id,youtube_connection_id,channel_id,idempotency_key,max_pages,max_items)
values('55000000-4000-4000-8000-000000000001','55000000-1000-4000-8000-000000000001','55000000-2000-4000-8000-000000000001','55000000-3000-4000-8000-000000000001','gate-disabled-sync',1,1);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','55000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.assert_youtube_provider_enabled('55000000-1000-4000-8000-000000000001')$$,
  'P0001','youtube_provider_disabled','default-off blocks owner authorization preflight'); -- 1
select set_config('request.jwt.claim.sub','55000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$select public.assert_youtube_provider_enabled('55000000-1000-4000-8000-000000000001')$$,
  '42501','workspace_access_denied','viewer cannot start provider authorization'); -- 2
select set_config('request.jwt.claim.sub','55000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$select public.assert_youtube_provider_enabled('55000000-1000-4000-8000-000000000001')$$,
  '42501','workspace_access_denied','another tenant cannot preflight this workspace'); -- 3
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select public.reserve_youtube_provider_quota('55000000-1000-4000-8000-000000000001','channels.list',1,'disabled-discovery')$$,
  'P0001','youtube_provider_disabled','default-off blocks discovery reservation'); -- 4
select is(public.lease_youtube_sync('gate-worker',60),null::jsonb,
  'default-off prevents queued sync from being leased'); -- 5
select throws_ok(
  $$select * from public.lease_youtube_token_refresh('55000000-1000-4000-8000-000000000001','55000000-5000-4000-8000-000000000001',now()+interval '30 seconds')$$,
  'P0001','youtube_provider_disabled','default-off prevents token refresh leases'); -- 6
reset role;

update app_private.research_operational_controls set disabled=false,reason=null,updated_at=now()
  where scope='provider' and provider='youtube_api';
update app_private.research_safety_limits set requests_per_minute=10000
  where scope in ('global','provider') and (provider is null or provider='youtube_api');
insert into app_private.research_safety_limits(scope,workspace_id,max_concurrent,requests_per_minute)
values
  ('workspace','55000000-1000-4000-8000-000000000001',5,10000),
  ('workspace','55000000-1000-4000-8000-000000000002',5,10000);
update app_private.youtube_api_quota_control set daily_quota_units=2 where singleton;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','55000000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$select public.assert_youtube_provider_enabled('55000000-1000-4000-8000-000000000001')$$,
  're-enabled owner preflight succeeds'); -- 7
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select ok(public.reserve_youtube_provider_quota(
  '55000000-1000-4000-8000-000000000001','channels.list',1,'discovery-one'),
  'first owned-channel discovery reserves one global unit'); -- 8
select ok(not public.reserve_youtube_provider_quota(
  '55000000-1000-4000-8000-000000000001','channels.list',1,'discovery-one'),
  'same discovery reservation is idempotent'); -- 9
select ok(public.reserve_youtube_provider_quota(
  '55000000-1000-4000-8000-000000000002','channels.list',1,'discovery-two'),
  'another workspace contributes to the same global daily cap'); -- 10
select throws_ok(
  $$select public.reserve_youtube_provider_quota('55000000-1000-4000-8000-000000000001','channels.list',1,'discovery-over-cap')$$,
  'P0001','youtube_daily_quota_exceeded','discovery cannot exceed the global daily cap'); -- 11
reset role;
select is((select count(*) from public.youtube_quota_ledger where sync_run_id is null),2::bigint,
  'discovery quota is persisted without inventing sync runs'); -- 12
select is((select sum(quota_units) from public.youtube_quota_ledger),2::bigint,
  'idempotent discovery reservations count exactly once'); -- 13

update app_private.youtube_api_quota_control set daily_quota_units=10000 where singleton;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select isnt(public.lease_youtube_sync('gate-worker-enabled',60),null::jsonb,
  're-enabled provider permits a queued sync lease'); -- 14

select * from finish();
rollback;
