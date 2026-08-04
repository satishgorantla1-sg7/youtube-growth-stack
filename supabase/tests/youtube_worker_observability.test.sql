begin;
select plan(13);

select has_table('app_private', 'worker_heartbeats', 'private worker heartbeat ledger exists');
select is(
  (select has_table_privilege('authenticated', 'app_private.worker_heartbeats', 'select')),
  false,
  'authenticated users cannot read worker instance identifiers'
);
select is(
  (select has_function_privilege('authenticated', 'public.record_worker_heartbeat(text,uuid,text)', 'execute')),
  false,
  'browser users cannot forge worker heartbeats'
);
select ok(
  has_function_privilege('service_role', 'public.record_worker_heartbeat(text,uuid,text)', 'execute'),
  'service workers can record heartbeats'
);

set local role service_role;
select public.record_worker_heartbeat('youtube_sync', '10000000-0000-4000-8000-000000000001', 'starting');
select public.record_worker_heartbeat('youtube_sync', '10000000-0000-4000-8000-000000000001', 'idle');
reset role;

select is(
  (select count(*)::integer from app_private.worker_heartbeats where worker_kind = 'youtube_sync'),
  1,
  'one worker instance updates one durable row'
);
select is(
  (select last_status from app_private.worker_heartbeats where worker_instance_id = '10000000-0000-4000-8000-000000000001'),
  'idle',
  'heartbeat records only an allowlisted operational status'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(public.get_youtube_worker_status()->>'status', 'healthy', 'service health sees a recent heartbeat');
reset role;

update app_private.worker_heartbeats set last_seen_at = now() - interval '31 seconds';
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is(public.get_youtube_worker_status()->>'status', 'stale', 'expired heartbeat is reported as stale');
select is(public.get_youtube_worker_status() ? 'workerId', false, 'coarse status never exposes a worker identifier');
reset role;
select set_config('request.jwt.claim.role', '', true);

select throws_ok(
  $$ select public.record_worker_heartbeat('youtube_sync', '10000000-0000-4000-8000-000000000001', 'token=secret') $$,
  '22023',
  'worker_heartbeat_invalid',
  'arbitrary status text cannot enter the heartbeat ledger'
);

select lives_ok(
  $$ set local role authenticated $$,
  'authenticated status access can be tested without table access'
);
select throws_ok(
  $$ select public.get_youtube_worker_status() $$,
  '42501',
  'authentication_required',
  'an authenticated database role without a JWT cannot impersonate a user'
);
reset role;

select is(
  (select count(*)::integer from information_schema.columns where table_schema = 'app_private' and table_name = 'worker_heartbeats'),
  5,
  'heartbeat schema contains no payload, tenant data, credentials, or log message columns'
);

select * from finish();
rollback;
