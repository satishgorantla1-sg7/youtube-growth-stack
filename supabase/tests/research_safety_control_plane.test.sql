begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

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
select set_config('test.safety_job', coalesce(public.lease_research_job('safety-worker', 120)::text, 'null'), true);
select isnt(current_setting('test.safety_job')::jsonb, 'null'::jsonb,
  'service worker leases an approved bounded job');
select set_config('test.safety_invocation', public.begin_provider_invocation(
    (current_setting('test.safety_job')::jsonb->>'id')::uuid,
    (current_setting('test.safety_job')::jsonb->>'leaseToken')::uuid,
    'apify', 'youtube.search', 5, 'safety-apify-invocation')::text, true);
select ok(
  (current_setting('test.safety_invocation')::jsonb->>'created')::boolean,
  'worker starts a bounded provider invocation'
);
select is(
  (select (public.begin_provider_invocation(
    (current_setting('test.safety_job')::jsonb->>'id')::uuid,
    (current_setting('test.safety_job')::jsonb->>'leaseToken')::uuid,
    'apify', 'youtube.search', 5, 'safety-apify-invocation')->>'created')::boolean),
  false, 'provider invocation start is idempotent'
);
select throws_ok(
  $$select public.finish_provider_invocation(
    (current_setting('test.safety_invocation')::jsonb->>'id')::uuid,
    'succeeded', 2, 2, 0.01, null, '{"prompt":"secret"}'::jsonb)$$,
  'P0001', 'invalid_invocation_result', 'unsafe prompt metadata is rejected'
);
select throws_ok(
  $$select public.finish_provider_invocation(
    (current_setting('test.safety_invocation')::jsonb->>'id')::uuid,
    'succeeded', 2, 2, 0.01, null, '{"request":{"Token":"secret"}}'::jsonb)$$,
  'P0001', 'invalid_invocation_result', 'nested case-insensitive secret metadata is rejected'
);
select throws_ok(
  $$select public.finish_provider_invocation(
    (current_setting('test.safety_invocation')::jsonb->>'id')::uuid,
    'succeeded', 2, 2, 0.01, null, '{"http_status":200}'::jsonb)$$,
  'P0001', 'provider_invocation_approved_bound_exceeded',
  'provider result cannot report credits above its approved worst-case bound'
);
select lives_ok(
  $$select public.finish_provider_invocation(
    (current_setting('test.safety_invocation')::jsonb->>'id')::uuid,
    'succeeded', 2, 1, 0.01, null, '{"http_status":200}'::jsonb)$$,
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
    (current_setting('test.safety_job')::jsonb->>'id')::uuid,
    (current_setting('test.safety_job')::jsonb->>'leaseToken')::uuid),
  'worker observes cancellation before another paid call'
);
select lives_ok(
  $$select public.acknowledge_research_cancellation(
    (current_setting('test.safety_job')::jsonb->>'id')::uuid,
    (current_setting('test.safety_job')::jsonb->>'leaseToken')::uuid,
    2)$$,
  'worker settles incurred usage and acknowledges cancellation'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
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

-- Explicit settlement must be cumulative across provider attempts, and a
-- later acknowledgement must not re-settle the original estimate.
reset role;
update public.workspaces set daily_credit_limit = 100
where id = '31000000-1000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_research_run('31000000-1000-4000-8000-000000000001',
    'Cumulative settlement run', 'quick', array['web'], 5, 4, 'safety-cumulative-run')$$,
  'owner creates a cumulative settlement run'
);
select lives_ok(
  $$select public.decide_research_approval((select id from public.approvals where entity_id =
    (select id from public.research_runs where idempotency_key = 'safety-cumulative-run')),
    'approved', 'bounded')$$,
  'cumulative settlement run is approved'
);
select set_config('test.cumulative_run',
  (select id::text from public.research_runs where idempotency_key = 'safety-cumulative-run'), true);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('test.cumulative_job',
  coalesce(public.lease_research_job('cumulative-worker', 120)::text, 'null'), true);
select isnt(current_setting('test.cumulative_job')::jsonb, 'null'::jsonb,
  'cumulative run receives a lease');
select set_config('test.failed_invocation', public.begin_provider_invocation(
  (current_setting('test.cumulative_job')::jsonb->>'id')::uuid,
  (current_setting('test.cumulative_job')::jsonb->>'leaseToken')::uuid,
  'apify', 'youtube.search', 5, 'cumulative-failed-invocation')::text, true);
select lives_ok(
  $$select public.finish_provider_invocation(
    (current_setting('test.failed_invocation')::jsonb->>'id')::uuid,
    'failed', 2, 1, 0.01, 'upstream_error', '{"http_status":500}'::jsonb)$$,
  'failed provider attempt records incurred credits'
);
select set_config('test.success_invocation', public.begin_provider_invocation(
  (current_setting('test.cumulative_job')::jsonb->>'id')::uuid,
  (current_setting('test.cumulative_job')::jsonb->>'leaseToken')::uuid,
  'firecrawl', 'web.search', 5, 'cumulative-success-invocation')::text, true);
select lives_ok(
  $$select public.finish_provider_invocation(
    (current_setting('test.success_invocation')::jsonb->>'id')::uuid,
    'succeeded', 1, 1, 0.01, null, '{"http_status":200}'::jsonb)$$,
  'successful provider attempt records incurred credits'
);
select throws_ok(
  $$select public.begin_provider_invocation(
    (current_setting('test.cumulative_job')::jsonb->>'id')::uuid,
    (current_setting('test.cumulative_job')::jsonb->>'leaseToken')::uuid,
    'firecrawl', 'web.search', 15, 'cumulative-retry-over-approved-budget')$$,
  'P0001', 'research_approval_budget_exhausted',
  'a retry cannot exceed the approved reservation after finished credits'
);
select lives_ok(
  $$select public.settle_research_usage(
    (current_setting('test.cumulative_job')::jsonb->>'id')::uuid,
    (current_setting('test.cumulative_job')::jsonb->>'leaseToken')::uuid, 1)$$,
  'settlement reconciles all attempts instead of trusting the last attempt'
);
select lives_ok(
  $$select public.ack_research_job(
    (current_setting('test.cumulative_job')::jsonb->>'id')::uuid,
    (current_setting('test.cumulative_job')::jsonb->>'leaseToken')::uuid, '[]'::jsonb)$$,
  'acknowledgement accepts an existing explicit settlement'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select is(
  (select actual_credits from public.research_credit_reservations
    where research_run_id = current_setting('test.cumulative_run')::uuid),
  2, 'cumulative settlement charges failed and successful attempts exactly once'
);
select is(
  (select state from public.jobs
    where research_run_id = current_setting('test.cumulative_run')::uuid),
  'completed', 'acknowledgement completes the explicitly settled job'
);
select is(
  (select count(*) from public.usage_ledger where correlation_id =
    (select correlation_id from public.research_runs where id = current_setting('test.cumulative_run')::uuid)),
  1::bigint, 'explicit settlement remains a single ledger entry after acknowledgement'
);

-- A max-attempt lease expiry must close orphaned invocations and retain a
-- conservative estimate when the provider outcome is indeterminate.
select lives_ok(
  $$select public.create_research_run('31000000-1000-4000-8000-000000000001',
    'Expiry reconciliation run', 'quick', array['web'], 5, 4, 'safety-expiry-run')$$,
  'owner creates a lease-expiry run'
);
select lives_ok(
  $$select public.decide_research_approval((select id from public.approvals where entity_id =
    (select id from public.research_runs where idempotency_key = 'safety-expiry-run')),
    'approved', 'bounded')$$,
  'lease-expiry run is approved'
);
select set_config('test.expiry_run',
  (select id::text from public.research_runs where idempotency_key = 'safety-expiry-run'), true);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('test.expiry_job',
  coalesce(public.lease_research_job('expiry-worker', 120)::text, 'null'), true);
select isnt(current_setting('test.expiry_job')::jsonb, 'null'::jsonb,
  'lease-expiry run receives a lease');
select set_config('test.expiry_finished_invocation', public.begin_provider_invocation(
  (current_setting('test.expiry_job')::jsonb->>'id')::uuid,
  (current_setting('test.expiry_job')::jsonb->>'leaseToken')::uuid,
  'apify', 'youtube.search', 5, 'expiry-finished-invocation')::text, true);
select lives_ok(
  $$select public.finish_provider_invocation(
    (current_setting('test.expiry_finished_invocation')::jsonb->>'id')::uuid,
    'succeeded', 1, 1, 0.01, null, '{"http_status":200}'::jsonb)$$,
  'completed charge exists before lease expiry'
);
select set_config('test.expiry_stale_invocation', public.begin_provider_invocation(
  (current_setting('test.expiry_job')::jsonb->>'id')::uuid,
  (current_setting('test.expiry_job')::jsonb->>'leaseToken')::uuid,
  'firecrawl', 'web.search', 5, 'expiry-stale-invocation')::text, true);
select throws_ok(
  $$select public.begin_provider_invocation(
    (current_setting('test.expiry_job')::jsonb->>'id')::uuid,
    (current_setting('test.expiry_job')::jsonb->>'leaseToken')::uuid,
    'firecrawl', 'web.search', 15, 'expiry-parallel-over-approved-budget')$$,
  'P0001', 'research_approval_budget_exhausted',
  'an in-flight invocation reserves its worst case before a parallel start'
);
reset role;
update public.jobs set max_attempts = attempts, lease_expires_at = now() - interval '1 second'
where id = (current_setting('test.expiry_job')::jsonb->>'id')::uuid;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.lease_research_job('expiry-reconciler', 120)$$,
  'next lease pass reconciles max-attempt expired work'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select is(
  (select state from public.provider_invocations
    where id = (current_setting('test.expiry_stale_invocation')::jsonb->>'id')::uuid),
  'failed', 'expired started invocation no longer consumes concurrency'
);
select is(
  (select actual_credits from public.research_credit_reservations
    where research_run_id = current_setting('test.expiry_run')::uuid),
  4, 'indeterminate expired invocation conservatively retains the run estimate'
);
select is(
  (select state from public.jobs where research_run_id = current_setting('test.expiry_run')::uuid),
  'dead_letter', 'max-attempt expired job is dead-lettered'
);
select is(
  (select count(*) from public.usage_ledger where correlation_id =
    (select correlation_id from public.research_runs where id = current_setting('test.expiry_run')::uuid)),
  1::bigint, 'lease-expiry reconciliation writes one usage entry'
);

-- An abandoned cancelling lease must terminate without charging unused credit.
select lives_ok(
  $$select public.create_research_run('31000000-1000-4000-8000-000000000001',
    'Cancellation expiry run', 'quick', array['web'], 5, 2, 'safety-cancel-expiry-run')$$,
  'owner creates a cancellation-expiry run'
);
select lives_ok(
  $$select public.decide_research_approval((select id from public.approvals where entity_id =
    (select id from public.research_runs where idempotency_key = 'safety-cancel-expiry-run')),
    'approved', 'bounded')$$,
  'cancellation-expiry run is approved'
);
select set_config('test.cancel_expiry_run',
  (select id::text from public.research_runs where idempotency_key = 'safety-cancel-expiry-run'), true);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('test.cancel_expiry_job',
  coalesce(public.lease_research_job('cancel-expiry-worker', 120)::text, 'null'), true);
select isnt(current_setting('test.cancel_expiry_job')::jsonb, 'null'::jsonb,
  'cancellation-expiry run receives a lease');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.cancel_research_run(current_setting('test.cancel_expiry_run')::uuid, 'worker disappeared')$$,
  'owner requests cancellation before lease expiry'
);
reset role;
update public.jobs set lease_expires_at = now() - interval '1 second'
where id = (current_setting('test.cancel_expiry_job')::jsonb->>'id')::uuid;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select public.lease_research_job('cancel-expiry-reconciler', 120)$$,
  'lease cleanup closes abandoned cancelling work'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select is((select state from public.jobs where research_run_id = current_setting('test.cancel_expiry_run')::uuid),
  'cancelled', 'expired cancelling job reaches a terminal state');
select is((select state from public.research_credit_reservations
    where research_run_id = current_setting('test.cancel_expiry_run')::uuid),
  'released', 'expired cancellation releases credit when no provider call started');

reset role;
select throws_ok(
  format($sql$insert into public.provider_invocations(
      workspace_id, research_run_id, job_id, provider, operation, requested_units,
      correlation_id, idempotency_key)
    values ('31000000-1000-4000-8000-000000000001', %L, %L,
      'apify', 'mismatched.run', 1, gen_random_uuid(), 'same-workspace-run-mismatch')$sql$,
    current_setting('test.cumulative_run')::uuid,
    (current_setting('test.expiry_job')::jsonb->>'id')::uuid),
  '23503', null, 'provider invocation cannot pair a job with another run in the same workspace'
);
select ok(
  position('research-job-lease:global' in
    pg_get_functiondef('public.lease_research_job(text,integer)'::regprocedure)) > 0,
  'lease count and transition are advisory-lock serialized'
);

reset role;
select ok(
  not has_function_privilege('authenticated',
    'public.lease_research_job(text,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.begin_provider_invocation(uuid,uuid,text,text,integer,text)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.finish_provider_invocation(uuid,text,integer,integer,numeric,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.settle_research_usage(uuid,uuid,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.ack_research_job(uuid,uuid,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.fail_research_job(uuid,uuid,text,boolean)', 'EXECUTE'),
  'all worker mutation functions remain service-role-only'
);

select * from finish();
rollback;
