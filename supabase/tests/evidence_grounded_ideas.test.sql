begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select has_table('public','idea_generation_runs','generation runs are durable');
select has_table('public','idea_evidence','idea citations are relational');
select has_column('public','ideas','generation_run_id','ideas identify their generation run');
select has_column('public','ideas','confidence_score','generated confidence is explicit');
select has_index('public','idea_generation_runs','idea_generation_runs_research_idx','research generation lookup is indexed');
select has_index('public','idea_evidence','idea_evidence_source_idx','citation source lookup is indexed');
select ok(has_table_privilege('authenticated','public.idea_generation_runs','SELECT'),'members may read visible generation runs');
select ok(not has_table_privilege('authenticated','public.idea_generation_runs','INSERT'),'clients cannot create generation rows');
select ok(not has_table_privilege('authenticated','public.ideas','INSERT'),'clients cannot forge generated ideas');
select ok(not has_table_privilege('authenticated','public.ideas','UPDATE'),'clients cannot rewrite scores or citations');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('61000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@ideas.test','',now(),'{}','{}',now(),now()),
('61000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','editor@ideas.test','',now(),'{}','{}',now(),now()),
('61000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','viewer@ideas.test','',now(),'{}','{}',now(),now()),
('62000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@ideas.test','',now(),'{}','{}',now(),now());
insert into public.workspaces(id,name,slug,owner_id) values
('61000000-1000-4000-8000-000000000001','Ideas One','ideas-one','61000000-0000-4000-8000-000000000001'),
('62000000-1000-4000-8000-000000000002','Ideas Two','ideas-two','62000000-0000-4000-8000-000000000004');
insert into public.workspace_members(workspace_id,user_id,role) values
('61000000-1000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','owner'),
('61000000-1000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','editor'),
('61000000-1000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003','viewer'),
('62000000-1000-4000-8000-000000000002','62000000-0000-4000-8000-000000000004','owner');
insert into public.research_runs(id,workspace_id,prompt,mode,state,estimated_credits,actual_credits,requested_by,idempotency_key,completed_at) values
('61000000-3000-4000-8000-000000000001','61000000-1000-4000-8000-000000000001','Completed evidence','quick','completed',0,0,'61000000-0000-4000-8000-000000000001','ideas-completed',now()),
('61000000-3000-4000-8000-000000000002','61000000-1000-4000-8000-000000000001','Still running','quick','running',0,null,'61000000-0000-4000-8000-000000000001','ideas-running',null),
('62000000-3000-4000-8000-000000000003','62000000-1000-4000-8000-000000000002','Other evidence','quick','completed',0,0,'62000000-0000-4000-8000-000000000004','ideas-other',now());
insert into public.research_sources(id,workspace_id,research_run_id,provider,source_type,url,title,content) values
('61000000-4000-4000-8000-000000000001','61000000-1000-4000-8000-000000000001','61000000-3000-4000-8000-000000000001','demo','web','https://example.com/one','One','Evidence one'),
('61000000-4000-4000-8000-000000000002','61000000-1000-4000-8000-000000000001','61000000-3000-4000-8000-000000000002','demo','web','https://example.com/two','Two','Evidence two'),
('62000000-4000-4000-8000-000000000003','62000000-1000-4000-8000-000000000002','62000000-3000-4000-8000-000000000003','demo','web','https://example.com/other','Other','Other tenant');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.begin_idea_generation('61000000-1000-4000-8000-000000000001','61000000-3000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','ideas-generation-one',3,'demo-v1','ideas-v1')$$,
  '42501',null,'browser clients cannot begin trusted generation');
select throws_ok($$select public.persist_generated_ideas(gen_random_uuid(),'[]')$$,
  '42501',null,'browser clients cannot persist AI output');
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$select public.begin_idea_generation('61000000-1000-4000-8000-000000000001','61000000-3000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','ideas-running-run',3,'demo-v1','ideas-v1')$$,
  'P0001','completed_research_required','generation rejects incomplete research');
select throws_ok($$select public.begin_idea_generation('61000000-1000-4000-8000-000000000001','61000000-3000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003','ideas-viewer-run',3,'demo-v1','ideas-v1')$$,
  '42501','idea_generation_forbidden','viewer cannot be attributed as generation requester');
select set_config('test.generation',public.begin_idea_generation(
  '61000000-1000-4000-8000-000000000001','61000000-3000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',
  'ideas-generation-one',3,'demo-v1','ideas-v1')::text,true);
select is(current_setting('test.generation')::jsonb->>'state','generating','completed research begins generation');
select ok((current_setting('test.generation')::jsonb->>'created')::boolean,'first generation request creates a run');
select ok(not (public.begin_idea_generation(
  '61000000-1000-4000-8000-000000000001','61000000-3000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',
  'ideas-generation-one',3,'demo-v1','ideas-v1')->>'created')::boolean,'matching request is idempotent');
select throws_ok($$select public.begin_idea_generation('61000000-1000-4000-8000-000000000001','61000000-3000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','ideas-generation-one',4,'demo-v1','ideas-v1')$$,
  'P0001','idea_generation_idempotency_conflict','changed idempotent request fails closed');

select throws_ok(format($q$select public.persist_generated_ideas(%L,'[{"title":"Invented citation","premise":"This premise has enough detail to validate.","demandScore":70,"demandReason":"Demand reason","relevanceScore":80,"relevanceReason":"Relevance reason","competitionScore":40,"competitionReason":"Competition reason","confidenceScore":90,"confidenceReason":"Confidence reason","evidenceSourceIds":["62000000-4000-4000-8000-000000000003"]}]')$q$,
  (current_setting('test.generation')::jsonb->>'id')::uuid),
  'P0001','invalid_idea_evidence','cross-workspace citation fails closed');
select is((select count(*) from public.ideas where generation_run_id=(current_setting('test.generation')::jsonb->>'id')::uuid),0::bigint,'failed batch persists no partial ideas');

select lives_ok(format($q$select public.persist_generated_ideas(%L,'[{"title":"Grounded opportunity","premise":"A useful idea grounded directly in the completed research evidence.","demandScore":70,"demandReason":"Observed demand","relevanceScore":80,"relevanceReason":"Strong research match","competitionScore":40,"competitionReason":"Moderate competition","confidenceScore":90,"confidenceReason":"Direct citation","evidenceSourceIds":["61000000-4000-4000-8000-000000000001"]}]')$q$,
  (current_setting('test.generation')::jsonb->>'id')::uuid),'valid evidence persists atomically');
select is((select state from public.idea_generation_runs where id=(current_setting('test.generation')::jsonb->>'id')::uuid),'completed','generation completes after persistence');
select is((select count(*) from public.ideas where generation_run_id=(current_setting('test.generation')::jsonb->>'id')::uuid),1::bigint,'one generated idea persists');
select is((select count(*) from public.idea_evidence where generation_run_id=(current_setting('test.generation')::jsonb->>'id')::uuid),1::bigint,'citation persists relationally');
select is((select score from public.ideas where generation_run_id=(current_setting('test.generation')::jsonb->>'id')::uuid),76.50::numeric,'weighted score is server-computed');
select is((select model_version from public.ideas where generation_run_id=(current_setting('test.generation')::jsonb->>'id')::uuid),'demo-v1','model provenance is copied from trusted run');
select set_config('test.idea',(select id::text from public.ideas where generation_run_id=(current_setting('test.generation')::jsonb->>'id')::uuid),true);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
select lives_ok(format('select public.transition_idea_state(%L,%L,%L)',current_setting('test.idea')::uuid,'shortlisted','editor review'),'editor can shortlist');
select throws_ok(format('select public.transition_idea_state(%L,%L,null)',current_setting('test.idea')::uuid,'approved'),
  '42501','idea_approval_forbidden','editor cannot approve');
select set_config('request.jwt.claim.sub','62000000-0000-4000-8000-000000000004',true);
select throws_ok(format('select public.transition_idea_state(%L,%L,null)',current_setting('test.idea')::uuid,'rejected'),
  '42501','idea_transition_forbidden','cross-workspace transition fails without disclosure');
select is((select count(*) from public.ideas),0::bigint,'RLS hides another workspace ideas');
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select lives_ok(format('select public.transition_idea_state(%L,%L,%L)',current_setting('test.idea')::uuid,'approved','owner approval'),'owner can approve shortlisted idea');
select throws_ok(format('select public.transition_idea_state(%L,%L,null)',current_setting('test.idea')::uuid,'rejected'),
  'P0001','invalid_idea_transition','invalid terminal transition fails closed');
reset role;

select is((select count(*) from public.audit_events where action='ideas.generation_started'),1::bigint,'generation start is audited once');
select is((select count(*) from public.audit_events where action='idea.state_changed'),2::bigint,'successful human transitions are audited');

select * from finish();
rollback;
