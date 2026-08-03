begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sync-state-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sync-state-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.workspaces (id, name, slug, owner_id) values
  ('51000000-1000-4000-8000-000000000001', 'Sync State One', 'sync-state-one', '51000000-0000-4000-8000-000000000001'),
  ('52000000-2000-4000-8000-000000000002', 'Sync State Two', 'sync-state-two', '52000000-0000-4000-8000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('51000000-1000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'owner'),
  ('52000000-2000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'owner');
insert into app_private.youtube_connections (
  id, workspace_id, provider_subject_hash, encrypted_credentials,
  credential_version_number, scopes, expires_at
) values
  ('51000000-2000-4000-8000-000000000001', '51000000-1000-4000-8000-000000000001', repeat('a', 64), 'cipher-one', 'v1',
    array['https://www.googleapis.com/auth/youtube.readonly'], now() + interval '1 hour'),
  ('52000000-3000-4000-8000-000000000002', '52000000-2000-4000-8000-000000000002', repeat('b', 64), 'cipher-two', 'v1',
    array['https://www.googleapis.com/auth/youtube.readonly'], now() + interval '1 hour');
insert into public.channels (
  id, workspace_id, youtube_connection_id, provider, external_id, title,
  uploads_playlist_id, connection_state, is_selected
) values
  ('51000000-3000-4000-8000-000000000001', '51000000-1000-4000-8000-000000000001', '51000000-2000-4000-8000-000000000001', 'youtube', 'UC-state-one', 'State One', 'UU-state-one', 'active', true),
  ('51000000-3000-4000-8000-000000000002', '51000000-1000-4000-8000-000000000001', '51000000-2000-4000-8000-000000000001', 'youtube', 'UC-state-one-brand', 'State One Brand', 'UU-state-one-brand', 'active', false),
  ('52000000-4000-4000-8000-000000000002', '52000000-2000-4000-8000-000000000002', '52000000-3000-4000-8000-000000000002', 'youtube', 'UC-state-two', 'State Two', 'UU-state-two', 'active', true);
insert into public.youtube_sync_runs (
  id, workspace_id, youtube_connection_id, channel_id, idempotency_key,
  state, max_pages, max_items, attempt_count, lease_token, lease_expires_at
) values
  ('51000000-4000-4000-8000-000000000001', '51000000-1000-4000-8000-000000000001', '51000000-2000-4000-8000-000000000001', '51000000-3000-4000-8000-000000000001', 'sync-state-reconnect', 'running', 3, 100, 1, '51000000-5000-4000-8000-000000000001', now() + interval '1 minute'),
  ('51000000-4000-4000-8000-000000000002', '51000000-1000-4000-8000-000000000001', '51000000-2000-4000-8000-000000000001', '51000000-3000-4000-8000-000000000001', 'sync-state-expired', 'running', 3, 100, 1, '51000000-5000-4000-8000-000000000002', now() - interval '1 second'),
  ('52000000-5000-4000-8000-000000000001', '52000000-2000-4000-8000-000000000002', '52000000-3000-4000-8000-000000000002', '52000000-4000-4000-8000-000000000002', 'sync-state-cross', 'running', 3, 100, 1, '52000000-6000-4000-8000-000000000001', now() + interval '1 minute'),
  ('52000000-5000-4000-8000-000000000002', '52000000-2000-4000-8000-000000000002', '52000000-3000-4000-8000-000000000002', '52000000-4000-4000-8000-000000000002', 'sync-state-requeue', 'running', 3, 100, 2, '52000000-6000-4000-8000-000000000002', now() + interval '1 minute'),
  ('52000000-5000-4000-8000-000000000003', '52000000-2000-4000-8000-000000000002', '52000000-3000-4000-8000-000000000002', '52000000-4000-4000-8000-000000000002', 'sync-state-bound', 'running', 3, 100, 5, '52000000-6000-4000-8000-000000000003', now() + interval '1 minute');

select ok(not has_function_privilege('authenticated',
  'public.fail_youtube_sync_for_reconnect(uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated users cannot force a reconnect transition'); -- 1
select ok(not has_function_privilege('authenticated',
  'public.requeue_youtube_sync_after_refresh_lock(uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated users cannot requeue sync work'); -- 2
select ok(has_function_privilege('service_role',
  'public.fail_youtube_sync_for_reconnect(uuid,uuid,uuid)', 'EXECUTE'),
  'service role may invoke the reconnect transition'); -- 3
select ok(has_function_privilege('service_role',
  'public.requeue_youtube_sync_after_refresh_lock(uuid,uuid,uuid)', 'EXECUTE'),
  'service role may invoke the bounded requeue transition'); -- 4

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.fail_youtube_sync_for_reconnect('51000000-1000-4000-8000-000000000001', '51000000-4000-4000-8000-000000000001', '51000000-5000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function fail_youtube_sync_for_reconnect',
  'authenticated callers cannot execute the service-only reconnect RPC'); -- 5

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.fail_youtube_sync_for_reconnect('51000000-1000-4000-8000-000000000001', '51000000-4000-4000-8000-000000000001', gen_random_uuid())$$,
  'P0001', 'invalid_or_expired_sync_lease', 'wrong reconnect lease is denied'); -- 6
select throws_ok(
  $$select public.fail_youtube_sync_for_reconnect('51000000-1000-4000-8000-000000000001', '51000000-4000-4000-8000-000000000002', '51000000-5000-4000-8000-000000000002')$$,
  'P0001', 'invalid_or_expired_sync_lease', 'expired reconnect lease is denied'); -- 7
select throws_ok(
  $$select public.fail_youtube_sync_for_reconnect('51000000-1000-4000-8000-000000000001', '52000000-5000-4000-8000-000000000001', '52000000-6000-4000-8000-000000000001')$$,
  'P0001', 'invalid_or_expired_sync_lease', 'cross-workspace reconnect transition is denied'); -- 8
select is((public.fail_youtube_sync_for_reconnect(
  '51000000-1000-4000-8000-000000000001', '51000000-4000-4000-8000-000000000001',
  '51000000-5000-4000-8000-000000000001')->>'state'), 'failed',
  'provider 401 atomically returns a failed sync'); -- 9
reset role;
select is((select state from public.youtube_sync_runs where id = '51000000-4000-4000-8000-000000000001'),
  'failed', 'provider 401 terminalizes the sync'); -- 10
select is((select last_error_code from public.youtube_sync_runs where id = '51000000-4000-4000-8000-000000000001'),
  'youtube_reconnect_required', 'provider 401 stores a safe error code'); -- 11
select is((select state from app_private.youtube_connections where id = '51000000-2000-4000-8000-000000000001'),
  'reconnect_required', 'provider 401 marks the private connection for reconnect'); -- 12
select is((select count(*) from public.channels where workspace_id = '51000000-1000-4000-8000-000000000001' and connection_state = 'expired'),
  2::bigint, 'all channels for the connection become visibly expired'); -- 13
select is((select count(*) from public.audit_events where workspace_id = '51000000-1000-4000-8000-000000000001' and action = 'youtube.sync.reconnect_required'),
  1::bigint, 'reconnect transition appends one safe audit event'); -- 14
select ok(not exists(select 1 from public.audit_events where action = 'youtube.sync.reconnect_required'
  and metadata::text ~ '(cipher|credential|token)'), 'audit metadata contains no credential material'); -- 15

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.channels where connection_state = 'expired'), 2::bigint,
  'workspace UI queries observe the expired channel state through RLS'); -- 16

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.requeue_youtube_sync_after_refresh_lock('52000000-2000-4000-8000-000000000002', '52000000-5000-4000-8000-000000000002', gen_random_uuid())$$,
  'P0001', 'invalid_or_expired_sync_lease', 'wrong requeue lease is denied'); -- 17
select is((public.requeue_youtube_sync_after_refresh_lock(
  '52000000-2000-4000-8000-000000000002', '52000000-5000-4000-8000-000000000002',
  '52000000-6000-4000-8000-000000000002')->>'state'), 'queued',
  'refresh-lock contention returns a bounded queued state'); -- 18
reset role;
select is((select state from public.youtube_sync_runs where id = '52000000-5000-4000-8000-000000000002'),
  'queued', 'refresh-lock contention requeues the running sync'); -- 19
select is((select lease_token from public.youtube_sync_runs where id = '52000000-5000-4000-8000-000000000002'),
  null, 'requeue clears the lease token'); -- 20
select ok((select available_at > now() from public.youtube_sync_runs where id = '52000000-5000-4000-8000-000000000002'),
  'requeue applies a safe retry delay'); -- 21
select is((select last_error_code from public.youtube_sync_runs where id = '52000000-5000-4000-8000-000000000002'),
  'youtube_token_refresh_locked', 'requeue stores a safe retry reason'); -- 22

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is((public.requeue_youtube_sync_after_refresh_lock(
  '52000000-2000-4000-8000-000000000002', '52000000-5000-4000-8000-000000000003',
  '52000000-6000-4000-8000-000000000003')->>'state'), 'failed',
  'the fifth attempt is terminal instead of requeued'); -- 23
reset role;
select is((select state from public.youtube_sync_runs where id = '52000000-5000-4000-8000-000000000003'),
  'failed', 'retry exhaustion leaves a terminal sync'); -- 24
select is((select last_error_code from public.youtube_sync_runs where id = '52000000-5000-4000-8000-000000000003'),
  'youtube_sync_retry_exhausted', 'retry exhaustion stores a safe terminal reason'); -- 25
select is((select lease_token from public.youtube_sync_runs where id = '52000000-5000-4000-8000-000000000003'),
  null, 'retry exhaustion clears the lease token'); -- 26
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.requeue_youtube_sync_after_refresh_lock('52000000-2000-4000-8000-000000000002', '52000000-5000-4000-8000-000000000003', '52000000-6000-4000-8000-000000000003')$$,
  'P0001', 'invalid_or_expired_sync_lease', 'terminal sync cannot be requeued again'); -- 27

select * from finish();
rollback;
