begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('47000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','truth-owner@example.test','',now(),'{}','{}',now(),now()),
('47000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','truth-admin@example.test','',now(),'{}','{}',now(),now()),
('47000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','truth-other@example.test','',now(),'{}','{}',now(),now());
insert into public.workspaces(id,name,slug,owner_id) values
('47000000-1000-4000-8000-000000000001','Truth One','truth-one','47000000-0000-4000-8000-000000000001'),
('47000000-1000-4000-8000-000000000002','Truth Two','truth-two','47000000-0000-4000-8000-000000000003');
insert into public.workspace_members(workspace_id,user_id,role) values
('47000000-1000-4000-8000-000000000001','47000000-0000-4000-8000-000000000001','owner'),
('47000000-1000-4000-8000-000000000001','47000000-0000-4000-8000-000000000002','admin'),
('47000000-1000-4000-8000-000000000002','47000000-0000-4000-8000-000000000003','owner');

insert into public.approvals(id,workspace_id,entity_type,entity_id,state,risk_summary,requested_by,decided_by,decided_at) values
('47000000-5000-4000-8000-000000000001','47000000-1000-4000-8000-000000000001','channel_action','47000000-1000-4000-8000-000000000001','approved','Connect','47000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000001',now());
insert into app_private.youtube_approval_claims(approval_id,workspace_id,purpose) values
('47000000-5000-4000-8000-000000000001','47000000-1000-4000-8000-000000000001','connect');

update app_private.research_operational_controls
set disabled = false, reason = null where scope = 'provider' and provider = 'youtube_api';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','47000000-0000-4000-8000-000000000001',true);
select public.create_youtube_oauth_state('47000000-1000-4000-8000-000000000001','47000000-5000-4000-8000-000000000001',repeat('d',64),now()+interval '5 minutes');
select * from public.consume_youtube_oauth_state(repeat('d',64));
select public.store_youtube_connection('47000000-1000-4000-8000-000000000001',repeat('d',64),'youtube','cipher-truth','v1',array['https://www.googleapis.com/auth/youtube.readonly'],now()+interval '1 hour','[{"externalId":"UC-truth","title":"Truth channel","uploadsPlaylistId":"UU-truth"}]');
reset role;
select is((select last_synced_at from public.channels where workspace_id='47000000-1000-4000-8000-000000000001'),null::timestamptz,'new authorization is never reported as a synchronization');

update public.channels set last_synced_at='2026-08-03T10:00:00Z' where workspace_id='47000000-1000-4000-8000-000000000001';
insert into public.approvals(id,workspace_id,entity_type,entity_id,state,risk_summary,requested_by,decided_by,decided_at) values
('47000000-5000-4000-8000-000000000002','47000000-1000-4000-8000-000000000001','channel_action','47000000-1000-4000-8000-000000000001','approved','Reconnect','47000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-000000000001',now());
insert into app_private.youtube_approval_claims(approval_id,workspace_id,purpose) values
('47000000-5000-4000-8000-000000000002','47000000-1000-4000-8000-000000000001','connect');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','47000000-0000-4000-8000-000000000001',true);
select public.create_youtube_oauth_state('47000000-1000-4000-8000-000000000001','47000000-5000-4000-8000-000000000002',repeat('e',64),now()+interval '5 minutes');
select * from public.consume_youtube_oauth_state(repeat('e',64));
select public.store_youtube_connection('47000000-1000-4000-8000-000000000001',repeat('e',64),'youtube','cipher-truth-2','v1',array['https://www.googleapis.com/auth/youtube.readonly'],now()+interval '1 hour','[{"externalId":"UC-truth","title":"Truth channel reconnected","uploadsPlaylistId":"UU-truth"}]');
reset role;
select is((select last_synced_at from public.channels where workspace_id='47000000-1000-4000-8000-000000000001'),'2026-08-03T10:00:00Z'::timestamptz,'reconnect preserves the last real synchronization timestamp');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','47000000-0000-4000-8000-000000000001',true);
select set_config('test.truth_revoke',public.create_youtube_revocation_approval('47000000-1000-4000-8000-000000000001')::text,true);
select is(current_setting('test.truth_revoke')::jsonb->>'state','pending','first revocation request is pending');
select set_config('test.truth_revoke_decision',public.decide_youtube_connection_approval((current_setting('test.truth_revoke')::jsonb->>'approvalId')::uuid,'approved','Revoke')::text,true);
select is(current_setting('test.truth_revoke_decision')::jsonb->>'state','approved','owner explicitly approves revocation');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.truth_lease',gen_random_uuid()::text,true);
select isnt((select row_to_json(lease)::text from public.lease_youtube_revocation('47000000-1000-4000-8000-000000000001',(current_setting('test.truth_revoke')::jsonb->>'approvalId')::uuid,current_setting('test.truth_lease')::uuid,now()+interval '30 seconds') lease),null,'approved revocation obtains one service lease');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','47000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.create_youtube_revocation_approval('47000000-1000-4000-8000-000000000001')$$,'P0001','youtube_revocation_in_progress','active revocation lease remains in progress');
reset role;
update app_private.youtube_connections set refresh_lock_expires_at=now()-interval '1 second' where workspace_id='47000000-1000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','47000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.create_youtube_revocation_approval('47000000-1000-4000-8000-000000000001')$$,'42501','youtube_approval_forbidden','different admin cannot reuse another actor revocation');
select set_config('request.jwt.claim.sub','47000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.create_youtube_revocation_approval('47000000-1000-4000-8000-000000000001')$$,'42501','youtube_approval_forbidden','other workspace owner cannot reuse revocation');
select set_config('request.jwt.claim.sub','47000000-0000-4000-8000-000000000001',true);
select set_config('test.truth_connect',public.create_youtube_connection_approval('47000000-1000-4000-8000-000000000001')::text,true);
select is(current_setting('test.truth_connect')::jsonb->>'purpose','connect','connect approval remains purpose-bound');
select set_config('test.truth_reused',public.create_youtube_revocation_approval('47000000-1000-4000-8000-000000000001')::text,true);
select is(current_setting('test.truth_reused')::jsonb->>'approvalId',current_setting('test.truth_revoke')::jsonb->>'approvalId','expired retry returns the exact approved revocation');
select is(current_setting('test.truth_reused')::jsonb->>'state','approved','reused revocation remains approved');
select is((current_setting('test.truth_reused')::jsonb->>'reused')::boolean,true,'response marks safe approval reuse');
reset role;
select is((select count(*) from public.approvals item join app_private.youtube_approval_claims claim on claim.approval_id=item.id where item.workspace_id='47000000-1000-4000-8000-000000000001' and claim.purpose='revoke'),1::bigint,'retry never mints a second revocation approval');
select is((select claim_state from app_private.youtube_approval_claims where approval_id=(current_setting('test.truth_revoke')::jsonb->>'approvalId')::uuid),'in_progress','reused approval retains its in-progress claim');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select isnt((select row_to_json(lease)::text from public.lease_youtube_revocation('47000000-1000-4000-8000-000000000001',(current_setting('test.truth_reused')::jsonb->>'approvalId')::uuid,gen_random_uuid(),now()+interval '30 seconds') lease),null,'expired lease retries with the same approval');
reset role;
select is((select count(*) from app_private.youtube_approval_claims where workspace_id='47000000-1000-4000-8000-000000000001' and purpose='revoke' and connection_id=(select id from app_private.youtube_connections where workspace_id='47000000-1000-4000-8000-000000000001')),1::bigint,'reused claim stays bound to the same connection');

select * from finish();
rollback;
