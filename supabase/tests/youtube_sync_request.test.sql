begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('44000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sync-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('44000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sync-viewer@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('44000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sync-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.workspaces(id, name, slug, owner_id) values
  ('44000000-1000-4000-8000-000000000001', 'Sync One', 'sync-one', '44000000-0000-4000-8000-000000000001'),
  ('44000000-1000-4000-8000-000000000002', 'Sync Two', 'sync-two', '44000000-0000-4000-8000-000000000003');
insert into public.workspace_members(workspace_id, user_id, role) values
  ('44000000-1000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', 'owner'),
  ('44000000-1000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000002', 'viewer'),
  ('44000000-1000-4000-8000-000000000002', '44000000-0000-4000-8000-000000000003', 'owner');
insert into app_private.youtube_connections(
  id, workspace_id, provider_subject_hash, encrypted_credentials,
  credential_version_number, scopes, expires_at, state
) values
  ('44000000-2000-4000-8000-000000000001', '44000000-1000-4000-8000-000000000001', repeat('a',64), 'cipher-one', 'v1', array['https://www.googleapis.com/auth/youtube.readonly'], now()+interval '1 hour', 'connected'),
  ('44000000-2000-4000-8000-000000000002', '44000000-1000-4000-8000-000000000002', repeat('b',64), 'cipher-two', 'v1', array['https://www.googleapis.com/auth/youtube.readonly'], now()+interval '1 hour', 'connected');
insert into public.channels(id, workspace_id, youtube_connection_id, external_id, title, is_selected) values
  ('44000000-3000-4000-8000-000000000001', '44000000-1000-4000-8000-000000000001', '44000000-2000-4000-8000-000000000001', 'UC-sync-selected', 'Selected', true),
  ('44000000-3000-4000-8000-000000000002', '44000000-1000-4000-8000-000000000001', '44000000-2000-4000-8000-000000000001', 'UC-sync-other', 'Not selected', false),
  ('44000000-3000-4000-8000-000000000003', '44000000-1000-4000-8000-000000000002', '44000000-2000-4000-8000-000000000002', 'UC-sync-tenant-two', 'Other tenant', true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.request_youtube_sync('44000000-1000-4000-8000-000000000001',
    '44000000-3000-4000-8000-000000000001','viewer-sync',2,25)$$,
  '42501','youtube_sync_forbidden','viewer cannot request sync'); -- 1

select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000001', true);
select is((public.select_youtube_channel(
  '44000000-1000-4000-8000-000000000001','44000000-3000-4000-8000-000000000002')->>'channelId'),
  '44000000-3000-4000-8000-000000000002','owner can explicitly select a Brand candidate'); -- 2
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.select_youtube_channel('44000000-1000-4000-8000-000000000001',
    '44000000-3000-4000-8000-000000000002')$$,
  '42501','youtube_channel_selection_forbidden','tenant cannot select another tenant channel'); -- 3
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.select_youtube_channel('44000000-1000-4000-8000-000000000001',
    '44000000-3000-4000-8000-000000000001')$$,
  'owner can restore the intended selected channel'); -- 4
select throws_ok(
  $$select public.request_youtube_sync('44000000-1000-4000-8000-000000000001',
    '44000000-3000-4000-8000-000000000001','disabled-default',2,25)$$,
  'P0001','youtube_sync_disabled',
  'YouTube API sync is disabled until an operator completes hosted smoke validation');
reset role;
update app_private.research_operational_controls
  set disabled = false, reason = null, updated_at = now()
  where scope = 'provider' and provider = 'youtube_api';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '44000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.request_youtube_sync('44000000-1000-4000-8000-000000000001',
    '44000000-3000-4000-8000-000000000003','cross-sync',2,25)$$,
  '42501','youtube_sync_forbidden','tenant cannot request another tenant channel'); -- 5
select throws_ok(
  $$select public.request_youtube_sync('44000000-1000-4000-8000-000000000001',
    '44000000-3000-4000-8000-000000000002','unselected-sync',2,25)$$,
  '42501','youtube_sync_forbidden','only selected channel can be synchronized'); -- 6
select throws_ok(
  $$select public.request_youtube_sync('44000000-1000-4000-8000-000000000001',
    '44000000-3000-4000-8000-000000000001','oversized-sync',11,25)$$,
  '22023','youtube_sync_bounds_invalid','authenticated sync retains hard bounds'); -- 7
select set_config('test.requested_sync', public.request_youtube_sync(
  '44000000-1000-4000-8000-000000000001','44000000-3000-4000-8000-000000000001',
  'bounded-sync-request',2,25)::text,true);
select ok((current_setting('test.requested_sync')::jsonb->>'created')::boolean,
  'owner queues bounded selected-channel sync'); -- 8
select is((public.request_youtube_sync(
  '44000000-1000-4000-8000-000000000001','44000000-3000-4000-8000-000000000001',
  'bounded-sync-request',2,25)->>'id'), current_setting('test.requested_sync')::jsonb->>'id',
  'same request is idempotent'); -- 9
select throws_ok(
  $$select public.request_youtube_sync('44000000-1000-4000-8000-000000000001',
    '44000000-3000-4000-8000-000000000001','bounded-sync-request',3,25)$$,
  'P0001','youtube_sync_idempotency_conflict','idempotency key cannot change bounds'); -- 10
select is((select count(*) from public.audit_events where workspace_id =
  '44000000-1000-4000-8000-000000000001' and action='youtube.sync.requested'),
  1::bigint,'sync request writes one audit event'); -- 11

select * from finish();
rollback;
