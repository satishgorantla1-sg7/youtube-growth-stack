begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

select has_table('app_private', 'youtube_connections', 'private YouTube connection table exists'); -- 1
select has_table('app_private', 'youtube_oauth_states', 'private one-use OAuth state table exists'); -- 2
select has_table('public', 'youtube_videos', 'normalized YouTube video table exists'); -- 3
select has_table('public', 'youtube_channel_snapshots', 'channel snapshot table exists'); -- 4
select has_table('public', 'youtube_video_snapshots', 'video snapshot table exists'); -- 5
select has_table('public', 'youtube_sync_runs', 'bounded sync run table exists'); -- 6
select has_table('public', 'youtube_quota_ledger', 'quota ledger exists'); -- 7

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('41000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'youtube-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('42000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'youtube-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.workspaces (id, name, slug, owner_id) values
  ('41000000-1000-4000-8000-000000000001', 'YouTube One', 'youtube-one', '41000000-0000-4000-8000-000000000001'),
  ('42000000-2000-4000-8000-000000000002', 'YouTube Two', 'youtube-two', '42000000-0000-4000-8000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('41000000-1000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'owner'),
  ('42000000-2000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000002', 'owner');
insert into public.approvals (
  id, workspace_id, entity_type, entity_id, state, risk_summary,
  requested_by, decided_by, decided_at
) values
  ('41000000-5000-4000-8000-000000000001', '41000000-1000-4000-8000-000000000001', 'channel_action',
    '41000000-6000-4000-8000-000000000001', 'approved', 'Connect read-only YouTube channel',
    '41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', now()),
  ('42000000-5000-4000-8000-000000000002', '42000000-2000-4000-8000-000000000002', 'channel_action',
    '42000000-6000-4000-8000-000000000002', 'approved', 'Connect read-only YouTube channel',
    '42000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000002', now()),
  ('41000000-5000-4000-8000-000000000003', '41000000-1000-4000-8000-000000000001', 'channel_action',
    '41000000-6000-4000-8000-000000000003', 'approved', 'Revoke YouTube connection',
    '41000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', now());

select ok(not has_schema_privilege('authenticated', 'app_private', 'USAGE'),
  'authenticated users cannot access private connection records'); -- 8
select ok(not has_table_privilege('authenticated', 'app_private.youtube_connections', 'SELECT'),
  'authenticated users cannot read encrypted tokens'); -- 9
select ok(not has_table_privilege('authenticated', 'app_private.youtube_connections', 'INSERT'),
  'authenticated users cannot write encrypted tokens'); -- 10
select ok(not has_function_privilege('authenticated',
  'public.lease_youtube_token_refresh(uuid,uuid,timestamptz)', 'EXECUTE'),
  'authenticated users cannot lease private credentials'); -- 11

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.create_youtube_oauth_state(
    '41000000-1000-4000-8000-000000000001', gen_random_uuid(), repeat('c', 64), now() + interval '5 minutes')$$,
  'P0001', 'approval_required', 'OAuth state requires an approved channel action'); -- 12
select lives_ok(
  $$select public.create_youtube_oauth_state(
    '41000000-1000-4000-8000-000000000001', '41000000-5000-4000-8000-000000000001',
    repeat('a', 64), now() + interval '5 minutes')$$,
  'approved user creates a short-lived OAuth state'); -- 13

select set_config('request.jwt.claim.sub', '42000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.consume_youtube_oauth_state(repeat('a', 64))$$,
  '42501', 'oauth_state_workspace_mismatch', 'OAuth state is bound to its user and workspace'); -- 14
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
select is(
  (select workspace_id from public.consume_youtube_oauth_state(repeat('a', 64))),
  '41000000-1000-4000-8000-000000000001'::uuid,
  'OAuth state is atomically consumed by the approving user'); -- 15
select throws_ok(
  $$select public.consume_youtube_oauth_state(repeat('a', 64))$$,
  'P0001', 'oauth_state_replayed', 'consumed OAuth state cannot be replayed'); -- 16
select throws_ok(
  $$select public.store_youtube_connection(
    '41000000-1000-4000-8000-000000000001', repeat('a', 64), 'youtube', 'cipher-one', 'v1',
    array['https://www.googleapis.com/auth/youtube.force-ssl'], now() + interval '1 minute',
    '[{"externalId":"UC-one-personal","title":"One Personal","handle":"@one","thumbnailUrl":"https://example.test/one.jpg"}]'::jsonb)$$,
  '22023', 'youtube_readonly_scope_required', 'write-capable YouTube scope is rejected'); -- 17
select lives_ok(
  $$select public.store_youtube_connection(
    '41000000-1000-4000-8000-000000000001', repeat('a', 64), 'youtube', 'cipher-one', 'v1',
    array['https://www.googleapis.com/auth/youtube.readonly'], now() + interval '1 minute',
    '[{"externalId":"UC-one-personal","title":"One Personal","handle":"@one","thumbnailUrl":"https://example.test/one.jpg"}]'::jsonb)$$,
  'consumed approval context stores a read-only connection'); -- 18

reset role;
select is((select encrypted_credentials from app_private.youtube_connections
    where workspace_id = '41000000-1000-4000-8000-000000000001'),
  'cipher-one', 'only the encrypted credential envelope is stored'); -- 19
select is((select credential_version_number from app_private.youtube_connections
    where workspace_id = '41000000-1000-4000-8000-000000000001'),
  'v1', 'credential key version is retained for rotation'); -- 20

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '42000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_youtube_oauth_state(
    '42000000-2000-4000-8000-000000000002', '42000000-5000-4000-8000-000000000002',
    repeat('b', 64), now() + interval '5 minutes')$$,
  'tenant two creates an independent OAuth state'); -- 21
select lives_ok(
  $$select public.consume_youtube_oauth_state(repeat('b', 64))$$,
  'tenant two consumes its OAuth state'); -- 22
select lives_ok(
  $$select public.store_youtube_connection(
    '42000000-2000-4000-8000-000000000002', repeat('b', 64), 'youtube', 'cipher-two', 'v1',
    array['https://www.googleapis.com/auth/youtube.readonly'], now() + interval '1 hour',
    '[{"externalId":"UC-two-brand","title":"Two Brand","handle":"@twobrand","thumbnailUrl":null}]'::jsonb)$$,
  'tenant two stores an isolated connection'); -- 23

reset role;
select set_config('test.youtube_conn_one', (select id::text from app_private.youtube_connections
  where workspace_id = '41000000-1000-4000-8000-000000000001'), true);
select set_config('test.youtube_conn_two', (select id::text from app_private.youtube_connections
  where workspace_id = '42000000-2000-4000-8000-000000000002'), true);
update public.channels set id = '41000000-3000-4000-8000-000000000001',
  account_kind = 'personal', uploads_playlist_id = 'UU-one-personal'
  where workspace_id = '41000000-1000-4000-8000-000000000001';
update public.channels set id = '42000000-3000-4000-8000-000000000002',
  account_kind = 'brand', uploads_playlist_id = 'UU-two-brand'
  where workspace_id = '42000000-2000-4000-8000-000000000002';
insert into public.channels (
  id, workspace_id, youtube_connection_id, external_id, title, handle,
  account_kind, is_selected, uploads_playlist_id
) values (
  '41000000-3000-4000-8000-000000000003', '41000000-1000-4000-8000-000000000001',
  current_setting('test.youtube_conn_one')::uuid, 'UC-one-brand', 'One Brand', '@onebrand',
  'brand', false, 'UU-one-brand'
);
select is((select count(*) from public.channels where workspace_id = '41000000-1000-4000-8000-000000000001'),
  2::bigint, 'one Google identity can expose personal and Brand channels'); -- 24
select throws_ok(
  $$insert into public.channels(workspace_id, youtube_connection_id, external_id, title, is_selected)
    values ('41000000-1000-4000-8000-000000000001', current_setting('test.youtube_conn_one')::uuid,
      'UC-second-selected', 'Second selected', true)$$,
  '23505', null, 'only one channel can be selected per workspace'); -- 25
select throws_ok(
  $$insert into public.channels(workspace_id, youtube_connection_id, external_id, title)
    values ('41000000-1000-4000-8000-000000000001', current_setting('test.youtube_conn_two')::uuid,
      'UC-cross-connection', 'Cross connection')$$,
  '23503', null, 'channel cannot reference another tenant connection'); -- 26

insert into public.youtube_videos (
  id, workspace_id, channel_id, external_id, title, published_at
) values (
  '41000000-4000-4000-8000-000000000001', '41000000-1000-4000-8000-000000000001',
  '41000000-3000-4000-8000-000000000001', 'video-one', 'Video One', now()
);
select throws_ok(
  $$insert into public.youtube_videos(workspace_id, channel_id, external_id, title)
    values ('42000000-2000-4000-8000-000000000002',
      '41000000-3000-4000-8000-000000000001', 'cross-video', 'Cross video')$$,
  '23503', null, 'video cannot reference another tenant channel'); -- 27
insert into public.youtube_channel_snapshots (
  workspace_id, channel_id, subscriber_count, view_count, video_count, captured_at
) values ('41000000-1000-4000-8000-000000000001', '41000000-3000-4000-8000-000000000001',
  10, 100, 2, '2026-08-01T00:00:00Z');
insert into public.youtube_video_snapshots (
  workspace_id, video_id, view_count, like_count, comment_count, captured_at
) values ('41000000-1000-4000-8000-000000000001', '41000000-4000-4000-8000-000000000001',
  20, 3, 1, '2026-08-01T00:00:00Z');
select is((select subscriber_count from public.youtube_channel_snapshots limit 1), 10::bigint,
  'channel metrics are preserved as immutable snapshots'); -- 28
select is((select view_count from public.youtube_video_snapshots limit 1), 20::bigint,
  'video metrics are preserved as immutable snapshots'); -- 29

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('test.youtube_sync', (public.begin_youtube_sync(
  '41000000-1000-4000-8000-000000000001', current_setting('test.youtube_conn_one')::uuid,
  '41000000-3000-4000-8000-000000000001', 'youtube-sync-idempotency-one', 3, 100)->>'id'), true);
select is((public.begin_youtube_sync(
  '41000000-1000-4000-8000-000000000001', current_setting('test.youtube_conn_one')::uuid,
  '41000000-3000-4000-8000-000000000001', 'youtube-sync-idempotency-one', 3, 100)->>'id'),
  current_setting('test.youtube_sync'), 'sync creation is idempotent'); -- 30
select throws_ok(
  $$select public.begin_youtube_sync(
    '41000000-1000-4000-8000-000000000001', current_setting('test.youtube_conn_one')::uuid,
    '41000000-3000-4000-8000-000000000001', 'youtube-sync-too-large', 11, 100)$$,
  '22023', 'youtube_sync_bounds_invalid', 'sync pages are bounded'); -- 31
select set_config('test.youtube_lease', coalesce(public.lease_youtube_sync('youtube-test-worker', 60)::text, 'null'), true);
select isnt(current_setting('test.youtube_lease')::jsonb, 'null'::jsonb, 'queued sync can be leased'); -- 32
select ok(public.record_youtube_quota(
  current_setting('test.youtube_sync')::uuid,
  (current_setting('test.youtube_lease')::jsonb->>'leaseToken')::uuid,
  'channels.list', 1, 'quota-request-one'), 'first quota request is recorded'); -- 33
select ok(not public.record_youtube_quota(
  current_setting('test.youtube_sync')::uuid,
  (current_setting('test.youtube_lease')::jsonb->>'leaseToken')::uuid,
  'channels.list', 1, 'quota-request-one'), 'replayed quota request is ignored'); -- 34
reset role;
select is((select quota_units from public.youtube_sync_runs where id = current_setting('test.youtube_sync')::uuid),
  1, 'quota total is not double counted'); -- 35
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.persist_youtube_sync_page(
    current_setting('test.youtube_sync')::uuid,
    (current_setting('test.youtube_lease')::jsonb->>'leaseToken')::uuid,
    '[]'::jsonb,
    '[{"external_id":"video-two","channel_external_id":"UC-one-personal","title":"Video Two","captured_at":"2026-08-01T01:00:00Z","view_count":30}]'::jsonb)$$,
  'leased worker atomically persists a bounded normalized page'); -- 36
reset role;
select is((select items_fetched from public.youtube_sync_runs where id = current_setting('test.youtube_sync')::uuid),
  1, 'persisted page advances bounded progress once'); -- 37
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(format(
  'select public.finish_youtube_sync(%L, %L, %L, 1, 1, null)',
  current_setting('test.youtube_sync')::uuid,
  (current_setting('test.youtube_lease')::jsonb->>'leaseToken')::uuid,
  'completed'), 'valid lease can complete a bounded sync'); -- 38
reset role;
select is((select state from public.youtube_sync_runs where id = current_setting('test.youtube_sync')::uuid),
  'completed', 'sync reaches a terminal state'); -- 39
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select set_config('test.refresh_owner', gen_random_uuid()::text, true);
select isnt((select row_to_json(lease)::text from public.lease_youtube_token_refresh(
  '41000000-1000-4000-8000-000000000001', current_setting('test.refresh_owner')::uuid,
  now() + interval '30 seconds') lease), null, 'expiring token can be refresh leased'); -- 40
select is((select count(*) from public.lease_youtube_token_refresh(
  '41000000-1000-4000-8000-000000000001', gen_random_uuid(), now() + interval '30 seconds')),
  0::bigint, 'concurrent refresh lease is rejected'); -- 41
select lives_ok(format(
  'select public.complete_youtube_token_refresh(%L,%L,%L,%L,now() + interval ''1 hour'')',
  '41000000-1000-4000-8000-000000000001'::uuid, current_setting('test.refresh_owner')::uuid,
  'cipher-one-v2', 'v2'), 'refresh owner rotates the encrypted envelope'); -- 42
reset role;
select is((select credential_version_number from app_private.youtube_connections
    where workspace_id = '41000000-1000-4000-8000-000000000001'),
  'v2', 'refreshed token carries the new key version'); -- 43
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
select set_config('test.revoke_approval',
  (public.create_youtube_connection_approval('41000000-1000-4000-8000-000000000001')->>'approvalId'), true);
select set_config('test.revoke_decision', public.decide_youtube_connection_approval(
  current_setting('test.revoke_approval')::uuid, 'approved', 'Separate revocation approval')::text, true);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('test.revoke_owner', gen_random_uuid()::text, true);
select isnt((select row_to_json(lease)::text from public.lease_youtube_revocation(
  '41000000-1000-4000-8000-000000000001', current_setting('test.revoke_approval')::uuid,
  current_setting('test.revoke_owner')::uuid,
  now() + interval '30 seconds') lease), null, 'connected token can be revocation leased'); -- 44
select lives_ok(format('select public.complete_youtube_revocation(%L,%L)',
  '41000000-1000-4000-8000-000000000001'::uuid, current_setting('test.revoke_owner')::uuid),
  'credentials are erased only after revocation succeeds'); -- 45
reset role;
select is((select encrypted_credentials from app_private.youtube_connections
    where workspace_id = '41000000-1000-4000-8000-000000000001'),
  null, 'revocation erases the encrypted credential envelope'); -- 46

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.channels), 2::bigint, 'tenant one sees only its channels'); -- 47
select is((select count(*) from public.youtube_videos), 2::bigint, 'tenant one sees only its videos'); -- 48
select is((select count(*) from public.youtube_sync_runs), 1::bigint, 'tenant one sees only its syncs'); -- 49
select is((select count(*) from public.youtube_quota_ledger), 1::bigint, 'tenant one sees only its quota entries'); -- 50
select ok(not has_table_privilege('authenticated', 'public.youtube_videos', 'INSERT'),
  'authenticated users cannot forge synchronized videos'); -- 51

select set_config('request.jwt.claim.sub', '42000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.channels), 1::bigint, 'tenant two sees only its channel'); -- 52
select is((select count(*) from public.youtube_videos), 0::bigint, 'tenant two cannot see tenant one videos'); -- 53
select is((select count(*) from public.youtube_quota_ledger), 0::bigint, 'tenant two cannot see tenant one quota usage'); -- 54

select * from finish();
rollback;
