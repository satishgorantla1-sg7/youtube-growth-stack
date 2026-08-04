begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select has_index('public','research_runs','research_runs_workspace_created_idx','history index exists');
select has_index('public','research_runs','research_runs_workspace_state_created_idx','state history index exists');
select has_index('public','research_runs','research_runs_workspace_project_created_idx','project history index exists');
select has_index('public','research_sources','research_sources_workspace_run_captured_idx','source detail index exists');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('51000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@example.test','',now(),'{}','{}',now(),now()),
('51000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','editor@example.test','',now(),'{}','{}',now(),now()),
('51000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','viewer@example.test','',now(),'{}','{}',now(),now()),
('52000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@example.test','',now(),'{}','{}',now(),now());
insert into public.workspaces(id,name,slug,owner_id,daily_credit_limit) values
('51000000-1000-4000-8000-000000000001','Explorer One','explorer-one','51000000-0000-4000-8000-000000000001',100),
('52000000-1000-4000-8000-000000000002','Explorer Two','explorer-two','52000000-0000-4000-8000-000000000004',100);
insert into public.workspace_members(workspace_id,user_id,role) values
('51000000-1000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','owner'),
('51000000-1000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002','editor'),
('51000000-1000-4000-8000-000000000001','51000000-0000-4000-8000-000000000003','viewer'),
('52000000-1000-4000-8000-000000000002','52000000-0000-4000-8000-000000000004','owner');
insert into public.projects(id,workspace_id,created_by,name) values
('51000000-2000-4000-8000-000000000001','51000000-1000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','Project One'),
('52000000-2000-4000-8000-000000000002','52000000-1000-4000-8000-000000000002','52000000-0000-4000-8000-000000000004','Project Two');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000001',true);
select set_config('test.source_result',public.create_research_run(
  '51000000-1000-4000-8000-000000000001','Preserved retry prompt','deep',array['youtube','web'],8,6,'explorer-source-run')::text,true);
reset role;
update public.research_runs set project_id='51000000-2000-4000-8000-000000000001'
where id=(current_setting('test.source_result')::jsonb->>'id')::uuid;
select throws_ok(
  $$update public.research_runs set project_id='52000000-2000-4000-8000-000000000002'
    where id=(current_setting('test.source_result')::jsonb->>'id')::uuid$$,
  '23503',null,'run cannot reference another workspace project');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000001',true);
select lives_ok(format('select public.decide_research_approval(%L,%L,null)',
  (current_setting('test.source_result')::jsonb->>'approvalId')::uuid,'approved'),
  'source run is approval-gated before queueing');
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000002',true);
select throws_ok(format('select public.cancel_research_run(%L,null)',
  (current_setting('test.source_result')::jsonb->>'id')::uuid),
  'P0001','research_cancel_forbidden','editor cannot cancel paid research');
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000003',true);
select throws_ok(format('select public.cancel_research_run(%L,null)',
  (current_setting('test.source_result')::jsonb->>'id')::uuid),
  'P0001','research_cancel_forbidden','viewer cannot cancel paid research');
select set_config('request.jwt.claim.sub','52000000-0000-4000-8000-000000000004',true);
select throws_ok(format('select public.cancel_research_run(%L,null)',
  (current_setting('test.source_result')::jsonb->>'id')::uuid),
  'P0001','research_cancel_forbidden','cross-workspace actor cannot cancel research');
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000001',true);
select lives_ok(format('select public.cancel_research_run(%L,%L)',
  (current_setting('test.source_result')::jsonb->>'id')::uuid,'Stop before provider calls'),
  'owner cancels queued research through the audited safety contract');
select is((select state from public.research_credit_reservations where research_run_id=
  (current_setting('test.source_result')::jsonb->>'id')::uuid),'released','queued cancellation releases reservation');
select is((select count(*) from public.audit_events where action='research.cancellation_requested' and entity_id=
  current_setting('test.source_result')::jsonb->>'id'),1::bigint,'cancellation is audited once');

select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000002',true);
select throws_ok(format('select public.retry_research_run(%L,%L)',
  (current_setting('test.source_result')::jsonb->>'id')::uuid,'explorer-retry-one'),
  '42501','research_retry_forbidden','editor cannot create a paid retry');
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000003',true);
select throws_ok(format('select public.retry_research_run(%L,%L)',
  (current_setting('test.source_result')::jsonb->>'id')::uuid,'explorer-retry-one'),
  '42501','research_retry_forbidden','viewer cannot create a paid retry');
select set_config('request.jwt.claim.sub','52000000-0000-4000-8000-000000000004',true);
select throws_ok(format('select public.retry_research_run(%L,%L)',
  (current_setting('test.source_result')::jsonb->>'id')::uuid,'explorer-retry-one'),
  '42501','research_retry_forbidden','cross-workspace actor cannot retry research');
select set_config('request.jwt.claim.sub','51000000-0000-4000-8000-000000000001',true);
select set_config('test.retry_result',public.retry_research_run(
  (current_setting('test.source_result')::jsonb->>'id')::uuid,'explorer-retry-one')::text,true);
select ok((current_setting('test.retry_result')::jsonb->>'created')::boolean,'owner creates a new retry run');
select isnt(current_setting('test.retry_result')::jsonb->>'runId',current_setting('test.source_result')::jsonb->>'id','retry never reuses old run');
select is((select state from public.research_runs where id=(current_setting('test.retry_result')::jsonb->>'runId')::uuid),'awaiting_approval','retry stops awaiting approval');
select is((select state from public.approvals where id=(current_setting('test.retry_result')::jsonb->>'approvalId')::uuid),'pending','retry creates pending approval');
select is((select count(*) from public.jobs where research_run_id=(current_setting('test.retry_result')::jsonb->>'runId')::uuid),0::bigint,'retry does not queue a job');
select is((select count(*) from public.research_credit_reservations where research_run_id=(current_setting('test.retry_result')::jsonb->>'runId')::uuid),0::bigint,'retry does not reserve credits');
select is((select prompt from public.research_runs where id=(current_setting('test.retry_result')::jsonb->>'runId')::uuid),'Preserved retry prompt','retry preserves prompt');
select is((select mode from public.research_runs where id=(current_setting('test.retry_result')::jsonb->>'runId')::uuid),'deep','retry preserves mode');
select is((select project_id from public.research_runs where id=(current_setting('test.retry_result')::jsonb->>'runId')::uuid),'51000000-2000-4000-8000-000000000001'::uuid,'retry preserves project');
select is((select requested_sources from public.research_runs where id=(current_setting('test.retry_result')::jsonb->>'runId')::uuid),array['youtube','web']::text[],'retry preserves requested sources');
select is((select retry_of_run_id from public.research_runs where id=(current_setting('test.retry_result')::jsonb->>'runId')::uuid),(current_setting('test.source_result')::jsonb->>'id')::uuid,'retry links prior run safely');
select is((select count(*) from public.audit_events where action='research.retry_requested' and metadata->>'source_run_id'=current_setting('test.source_result')::jsonb->>'id'),1::bigint,'retry link is present in safe audit metadata');
select ok(not (public.retry_research_run((current_setting('test.source_result')::jsonb->>'id')::uuid,'explorer-retry-one')->>'created')::boolean,'retry request is idempotent without duplicate approval');

select * from finish();
rollback;
