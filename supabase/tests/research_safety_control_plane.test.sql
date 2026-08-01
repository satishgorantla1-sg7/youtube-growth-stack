begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select has_table('public', 'research_credit_reservations', 'credit reservation table exists');
select has_table('public', 'provider_invocations', 'safe provider invocation ledger exists');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('31000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'safety-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('31000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'safety-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.workspaces (id, name, slug, owner_id, daily_credit_limit) values
  ('31000000-1000-4000-8000-000000000001', 'Safety One', 'safety-one', '31000000-0000-4000-8000-000000000001', 5),
  ('32000000-2000-4000-8000-000000000002', 'Safety Two', 'safety-two', '31000000-0000-4000-8000-000000000002', 5);
insert into public.workspace_members (workspace_id, user_id, role) values
  ('31000000-1000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', 'owner'),
  ('32000000-2000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000002', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);

select ok(
  not has_table_privilege('authenticated', 'public.research_credit_reservations', 'INSERT'),
  'authenticated users cannot forge credit reservations'
);
select lives_ok(
  $$select public.create_research_run('31000000-1000-4000-8000-000000000001', 'First bounded run', 'quick', array['web'], 5, 3, 'safety-first-run')$$,
  'owner creates an approval-gated run'
);
select lives_ok(
  $$select public.decide_research_approval((select id from public.approvals where entity_id =
    (select id from public.research_runs where idempotency_key = 'safety-first-run')), 'approved', 'bounded')$$,
  'approval atomically reserves and queues'
);
select is(
  (select state from public.research_credit_reservations where research_run_id =
    (select id from public.research_runs where idempotency_key = 'safety-first-run')),
  'reserved', 'approved research has one active reservation'
);
select is(
  (select state from public.jobs where research_run_id =
    (select id from public.research_runs where idempotency_key = 'safety-first-run')),
  'queued', 'approved research has one queued job'
);
select throws_ok(
  $$select public.decide_research_approval((select id from public.approvals where entity_id =
    (select id from public.research_runs where idempotency_key = 'safety-first-run')), 'approved', null)$$,
  'P0001', 'approval_not_pending', 'duplicate decisions cannot double reserve'
);

select lives_ok(
  $$select public.create_research_run('31000000-1000-4000-8000-000000000001', 'Second bounded run', 'quick', array['youtube'], 5, 4, 'safety-second-run')$$,
  'second plan may await approval'
);
select throws_ok(
  $$select public.decide_research_approval((select id from public.approvals where entity_id =
    (select id from public.research_runs where idempotency_key = 'safety-second-run')), 'approved', null)$$,
  'P0001', 'workspace_daily_credit_limit_exceeded', 'budget rejects an over-reservation atomically'
);
select is(
  (select count(*) from public.research_credit_reservations where research_run_id =
    (select id from public.research_runs where idempotency_key = 'safety-second-run')),
  0::bigint, 'failed approval leaves no reservation'
);

reset role;
insert into app_private.research_operational_controls(scope, workspace_id, disabled, reason)
values ('workspace', '31000000-1000-4000-8000-000000000001', true, 'test stop');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.decide_research_approval((select id from public.approvals where entity_id =
    (select id from public.research_runs where idempotency_key = 'safety-second-run')), 'approved', null)$$,
  'P0001', 'research_disabled', 'workspace kill switch stops queueing without deployment'
);
reset role;
update app_private.research_operational_controls set disabled = false, reason = null
where scope = 'workspace' and workspace_id = '31000000-1000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.research_credit_reservations), 0::bigint,
  'RLS hides another tenant reservations');
select is((select count(*) from public.provider_invocations), 0::bigint,
  'RLS hides another tenant provider invocations');

select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.cancel_research_run((select id from public.research_runs where idempotency_key = 'safety-first-run'), 'changed plan')$$,
  'owner cancels a queued run'
);
select is(
  (select state from public.research_credit_reservations where research_run_id =
    (select id from public.research_runs where idempotency_key = 'safety-first-run')),
  'released', 'queued cancellation releases unused credits'
);
select lives_ok(
  $$select public.decide_research_approval((select id from public.approvals where entity_id =
    (select id from public.research_runs where idempotency_key = 'safety-second-run')), 'approved', null)$$,
  'released credits make room for the next approved run'
);

reset role;
select throws_ok(
  $$insert into public.research_sources(workspace_id, research_run_id, provider, source_type, url)
    values ('32000000-2000-4000-8000-000000000002',
      (select id from public.research_runs where idempotency_key = 'safety-second-run'),
      'manual', 'web', 'https://example.test/cross-tenant')$$,
  '23503', null, 'composite foreign key rejects cross-workspace evidence'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select isnt(public.lease_research_job('safety-worker', 120), null::jsonb,
  'service worker leases an approved bounded job');
select lives_ok(
  $$select public.begin_provider_invocation(
    (select id from public.jobs where research_run_id = (select id from public.research_runs where idempotency_key = 'safety-second-run')),
    (select lease_token from public.jobs where research_run_id = (select id from public.research_runs where idempotency_key = 'safety-second-run')),
    'apify', 'youtube.search', 5, 'safety-apify-invocation')$$,
  'worker starts a bounded provider invocation'
);
select is(
  (select (public.begin_provider_invocation(
    (select id from public.jobs where research_run_id = (select id from public.research_runs where idempotency_key = 'safety-second-run')),
    (select lease_token from public.jobs where research_run_id = (select id from public.research_runs where idempotency_key = 'safety-second-run')),
    'apify', 'youtube.search', 5, 'safety-apify-invocation')->>'created')::boolean),
  false, 'provider invocation start is idempotent'
);
select throws_ok(
  $$select public.finish_provider_invocation(
    (select id from public.provider_invocations where idempotency_key = 'safety-apify-invocation'),
    'succeeded', 2, 2, 0.01, null, '{"prompt":"secret"}'::jsonb)$$,
  'P0001', 'invalid_invocation_result', 'unsafe prompt metadata is rejected'
);
select lives_ok(
  $$select public.finish_provider_invocation(
    (select id from public.provider_invocations where idempotency_key = 'safety-apify-invocation'),
    'succeeded', 2, 2, 0.01, null, '{"http_status":200}'::jsonb)$$,
  'safe bounded invocation metadata is recorded'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.cancel_research_run((select id from public.research_runs where idempotency_key = 'safety-second-run'), 'stop remaining calls')$$,
  'owner requests cancellation of leased work'
);
select is(
  (select state from public.research_runs where idempotency_key = 'safety-second-run'),
  'cancelling', 'leased cancellation remains observable until worker acknowledgement'
);
select throws_ok(
  $$select public.begin_provider_invocation(
    (select id from public.jobs where research_run_id = (select id from public.research_runs where idempotency_key = 'safety-second-run')),
    (select lease_token from public.jobs where research_run_id = (select id from public.research_runs where idempotency_key = 'safety-second-run')),
    'firecrawl', 'web.search', 5, 'safety-firecrawl-after-cancel')$$,
  '42501', null, 'authenticated clients cannot invoke worker-only provider RPCs'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(public.research_cancellation_requested(
    (select id from public.jobs where research_run_id = (select id from public.research_runs where idempotency_key = 'safety-second-run')),
    (select lease_token from public.jobs where research_run_id = (select id from public.research_runs where idempotency_key = 'safety-second-run'))),
  'worker observes cancellation before another paid call'
);
select lives_ok(
  $$select public.acknowledge_research_cancellation(
    (select id from public.jobs where research_run_id = (select id from public.research_runs where idempotency_key = 'safety-second-run')),
    (select lease_token from public.jobs where research_run_id = (select id from public.research_runs where idempotency_key = 'safety-second-run')),
    2)$$,
  'worker settles incurred usage and acknowledges cancellation'
);
select is(
  (select actual_credits from public.research_credit_reservations where research_run_id =
    (select id from public.research_runs where idempotency_key = 'safety-second-run')),
  2, 'cancellation settlement preserves incurred credits'
);
select is(
  (select count(*) from public.usage_ledger where correlation_id =
    (select correlation_id from public.research_runs where idempotency_key = 'safety-second-run')),
  1::bigint, 'settlement creates one usage ledger entry'
);
select is(
  (select state from public.jobs where research_run_id =
    (select id from public.research_runs where idempotency_key = 'safety-second-run')),
  'cancelled', 'worker acknowledgement closes the durable job'
);

reset role;
select ok(not has_function_privilege('authenticated',
  'public.begin_provider_invocation(uuid,uuid,text,text,integer,text)', 'EXECUTE'),
  'provider invocation mutation remains service-role-only');

select * from finish();
rollback;
