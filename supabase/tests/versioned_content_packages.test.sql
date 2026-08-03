begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select has_table('public','content_package_evidence','package evidence is relational');
select has_column('public','content_packages','source_package_id','versions preserve ancestry');
select has_column('public','content_packages','model_version','model provenance is durable');
select has_index('public','content_packages','content_packages_workspace_idea_version_idx','version history is indexed');
select has_index('public','content_package_evidence','content_package_evidence_source_idx','evidence lookup is indexed');
select ok(not has_table_privilege('authenticated','public.content_packages','INSERT'),'browser cannot forge package versions');
select ok(not has_table_privilege('authenticated','public.content_packages','UPDATE'),'browser cannot rewrite package content or state');
select ok(not has_table_privilege('authenticated','public.content_package_evidence','INSERT'),'browser cannot forge citations');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('71000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@packages.test','',now(),'{}','{}',now(),now()),
('71000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','editor@packages.test','',now(),'{}','{}',now(),now()),
('72000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@packages.test','',now(),'{}','{}',now(),now());
insert into public.workspaces(id,name,slug,owner_id) values
('71000000-1000-4000-8000-000000000001','Packages One','packages-one','71000000-0000-4000-8000-000000000001'),
('72000000-1000-4000-8000-000000000002','Packages Two','packages-two','72000000-0000-4000-8000-000000000003');
insert into public.workspace_members(workspace_id,user_id,role) values
('71000000-1000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','owner'),
('71000000-1000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','editor'),
('72000000-1000-4000-8000-000000000002','72000000-0000-4000-8000-000000000003','owner');
insert into public.research_runs(id,workspace_id,prompt,mode,state,estimated_credits,actual_credits,requested_by,idempotency_key,completed_at) values
('71000000-3000-4000-8000-000000000001','71000000-1000-4000-8000-000000000001','Package evidence','quick','completed',0,0,'71000000-0000-4000-8000-000000000001','packages-research',now()),
('72000000-3000-4000-8000-000000000002','72000000-1000-4000-8000-000000000002','Other evidence','quick','completed',0,0,'72000000-0000-4000-8000-000000000003','packages-other',now());
insert into public.research_sources(id,workspace_id,research_run_id,provider,source_type,url,title,content) values
('71000000-4000-4000-8000-000000000001','71000000-1000-4000-8000-000000000001','71000000-3000-4000-8000-000000000001','demo','web','https://example.com/package','Package source','Evidence'),
('72000000-4000-4000-8000-000000000002','72000000-1000-4000-8000-000000000002','72000000-3000-4000-8000-000000000002','demo','web','https://example.com/other','Other source','Other evidence');
insert into public.ideas(id,workspace_id,research_run_id,title,premise,status) values
('71000000-5000-4000-8000-000000000001','71000000-1000-4000-8000-000000000001','71000000-3000-4000-8000-000000000001','Approved idea','A grounded premise for package generation.','approved'),
('71000000-5000-4000-8000-000000000002','71000000-1000-4000-8000-000000000001','71000000-3000-4000-8000-000000000001','Candidate idea','This idea has not received human approval.','shortlisted');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.create_content_package_version('71000000-1000-4000-8000-000000000001','71000000-5000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','package-version-one','demo-v1','package-v1','{}')$$,
  '42501',null,'browser cannot call service-owned generation RPC');
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$select public.create_content_package_version('71000000-1000-4000-8000-000000000001','71000000-5000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','candidate-package','demo-v1','package-v1','{}')$$,
  'P0001','approved_idea_required','only approved ideas can generate packages');
select throws_ok($$select public.create_content_package_version('71000000-1000-4000-8000-000000000001','71000000-5000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','package-bad-source','demo-v1','package-v1',
  '{"titles":["Evidence-led title"],"thumbnailConcepts":[{"concept":"Visual concept","visualDescription":"A detailed visual description.","overlayText":null}],"hooks":["A useful opening hook"],"outline":[{"section":"One"},{"section":"Two"},{"section":"Three"}],"script":"This is a long enough package script that explains the idea, evidence, and practical action without making unsupported claims to the viewer.","citations":["72000000-4000-4000-8000-000000000002"]}')$$,
  'P0001','invalid_content_package_evidence','cross-workspace citations fail closed');
select is((select count(*) from public.content_packages),0::bigint,'invalid package persists nothing');
select set_config('test.package',public.create_content_package_version(
  '71000000-1000-4000-8000-000000000001','71000000-5000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','package-version-one','demo-v1','package-v1',
  '{"titles":["Evidence-led title"],"thumbnailConcepts":[{"concept":"Visual concept","visualDescription":"A detailed visual description.","overlayText":null}],"hooks":["A useful opening hook"],"outline":[{"section":"One"},{"section":"Two"},{"section":"Three"}],"script":"This is a long enough package script that explains the idea, evidence, and practical action without making unsupported claims to the viewer.","citations":["71000000-4000-4000-8000-000000000001"]}')::text,true);
select is(current_setting('test.package')::jsonb->>'state','draft','valid package begins as draft');
select is((current_setting('test.package')::jsonb->>'version')::integer,1,'first package is version one');
select is((select count(*) from public.content_package_evidence where content_package_id=(current_setting('test.package')::jsonb->>'packageId')::uuid),1::bigint,'package citation is relational');
select ok(not (public.create_content_package_version(
  '71000000-1000-4000-8000-000000000001','71000000-5000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','package-version-one','demo-v1','package-v1',
  '{"titles":["Evidence-led title"],"thumbnailConcepts":[{"concept":"Visual concept","visualDescription":"A detailed visual description.","overlayText":null}],"hooks":["A useful opening hook"],"outline":[{"section":"One"},{"section":"Two"},{"section":"Three"}],"script":"This is a long enough package script that explains the idea, evidence, and practical action without making unsupported claims to the viewer.","citations":["71000000-4000-4000-8000-000000000001"]}')->>'created')::boolean,'package generation is idempotent');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select set_config('test.approval',public.request_content_package_approval((current_setting('test.package')::jsonb->>'packageId')::uuid)::text,true);
select is(current_setting('test.approval')::jsonb->>'state','pending','editor may request package approval');
select is((select state from public.content_packages where id=(current_setting('test.package')::jsonb->>'packageId')::uuid),'awaiting_approval','request transitions draft exactly once');
select throws_ok(format('select public.decide_content_package_approval(%L,%L,null)',(current_setting('test.approval')::jsonb->>'approvalId')::uuid,'approved'),
  '42501','content_package_approval_forbidden','editor cannot approve');
select set_config('request.jwt.claim.sub','72000000-0000-4000-8000-000000000003',true);
select throws_ok(format('select public.decide_content_package_approval(%L,%L,null)',(current_setting('test.approval')::jsonb->>'approvalId')::uuid,'approved'),
  '42501','content_package_approval_forbidden','other tenant cannot decide');
select is((select count(*) from public.content_packages),0::bigint,'RLS hides other-tenant package history');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select lives_ok(format('select public.decide_content_package_approval(%L,%L,%L)',(current_setting('test.approval')::jsonb->>'approvalId')::uuid,'approved','ready'),
  'owner approves package');
select is((select state from public.content_packages where id=(current_setting('test.package')::jsonb->>'packageId')::uuid),'approved','approved package becomes immutable');
select set_config('test.v2',public.create_next_content_package_version((current_setting('test.package')::jsonb->>'packageId')::uuid,'manual-revision-v2')::text,true);
select is((current_setting('test.v2')::jsonb->>'version')::integer,2,'next-version RPC allocates version two');
select is(current_setting('test.v2')::jsonb->>'state','draft','next version is a new draft');
select set_config('test.approval2',public.request_content_package_approval((current_setting('test.v2')::jsonb->>'packageId')::uuid)::text,true);
select set_config('test.reject',public.decide_content_package_approval((current_setting('test.approval2')::jsonb->>'approvalId')::uuid,'rejected','revise')::text,true);
select is((select state from public.content_packages where id=(current_setting('test.v2')::jsonb->>'packageId')::uuid),'rejected','rejected history is retained');
select ok((current_setting('test.reject')::jsonb->>'nextDraftId') is not null,'rejection atomically creates a replacement draft');
select is((select version from public.content_packages where id=(current_setting('test.reject')::jsonb->>'nextDraftId')::uuid),3,'replacement draft receives the next version');
select is((select count(*) from public.content_package_evidence where content_package_id=(current_setting('test.reject')::jsonb->>'nextDraftId')::uuid),1::bigint,'replacement draft preserves evidence relation');
reset role;

select throws_ok(format('update public.content_packages set script=%L where id=%L','rewritten history',(current_setting('test.package')::jsonb->>'packageId')::uuid),
  'P0001','content_package_version_is_immutable','approved content cannot be rewritten');
select throws_ok(format('delete from public.approvals where id=%L',(current_setting('test.approval2')::jsonb->>'approvalId')::uuid),
  'P0001','approval_evidence_is_append_only','approval history cannot be deleted');
select is((select count(*) from public.audit_events where action='content_package.approved'),1::bigint,'approval is audited');
select is((select count(*) from public.audit_events where action='content_package.rejected'),1::bigint,'rejection is audited');
select is((select count(*) from public.content_packages where idea_id='71000000-5000-4000-8000-000000000001'),3::bigint,'exactly three immutable versions exist');

select * from finish();
rollback;
