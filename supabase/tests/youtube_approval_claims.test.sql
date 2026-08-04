begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('45000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','claim@example.test','',now(),'{}','{}',now(),now());
insert into public.workspaces(id,name,slug,owner_id)
values ('45000000-1000-4000-8000-000000000001','Claim Workspace','claim-workspace','45000000-0000-4000-8000-000000000001');
insert into public.workspace_members(workspace_id,user_id,role)
values ('45000000-1000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001','owner');
insert into app_private.youtube_connections(
  id,workspace_id,provider_subject_hash,encrypted_credentials,credential_version_number,scopes,expires_at,state
) values ('45000000-2000-4000-8000-000000000001','45000000-1000-4000-8000-000000000001',repeat('a',64),'cipher','v1',array['https://www.googleapis.com/auth/youtube.readonly'],now()+interval '1 hour','connected');
insert into public.approvals(id,workspace_id,entity_type,entity_id,state,risk_summary,requested_by,decided_by,decided_at)
values
 ('45000000-3000-4000-8000-000000000001','45000000-1000-4000-8000-000000000001','channel_action','45000000-1000-4000-8000-000000000001','approved','Connect','45000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001',now()),
 ('45000000-3000-4000-8000-000000000002','45000000-1000-4000-8000-000000000001','channel_action','45000000-2000-4000-8000-000000000001','approved','Revoke','45000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001',now());
insert into app_private.youtube_approval_claims(approval_id,workspace_id,connection_id,purpose)
values
 ('45000000-3000-4000-8000-000000000001','45000000-1000-4000-8000-000000000001',null,'connect'),
 ('45000000-3000-4000-8000-000000000002','45000000-1000-4000-8000-000000000001','45000000-2000-4000-8000-000000000001','revoke');

insert into app_private.youtube_oauth_states(state_hash,workspace_id,user_id,approval_id,expires_at)
values(repeat('a',64),'45000000-1000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001','45000000-3000-4000-8000-000000000001',now()+interval '5 minutes');
select is((select claim_state from app_private.youtube_approval_claims
    where approval_id='45000000-3000-4000-8000-000000000001'),
  'in_progress','OAuth state atomically claims connect approval'); -- 1
select throws_ok(
  $$insert into app_private.youtube_oauth_states(state_hash,workspace_id,user_id,approval_id,expires_at)
    values(repeat('b',64),'45000000-1000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001','45000000-3000-4000-8000-000000000001',now()+interval '5 minutes')$$,
  'P0001','approval_already_used','connect approval can create only one OAuth state'); -- 2

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select * from public.lease_youtube_revocation(
    '45000000-1000-4000-8000-000000000001','45000000-3000-4000-8000-000000000001',
    gen_random_uuid(),now()+interval '30 seconds')$$,
  'P0001','approval_required','connect-purpose approval cannot authorize revocation'); -- 3
select set_config('test.first_revoke_lease',gen_random_uuid()::text,true);
select isnt((select row_to_json(lease)::text from public.lease_youtube_revocation(
  '45000000-1000-4000-8000-000000000001','45000000-3000-4000-8000-000000000002',
  current_setting('test.first_revoke_lease')::uuid,now()+interval '30 seconds') lease),
  null,'approved revoke-purpose claim leases credentials'); -- 4
reset role;
update app_private.youtube_connections set refresh_lock_expires_at=now()-interval '1 second'
where id='45000000-2000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('test.retry_revoke_lease',gen_random_uuid()::text,true);
select isnt((select row_to_json(lease)::text from public.lease_youtube_revocation(
  '45000000-1000-4000-8000-000000000001','45000000-3000-4000-8000-000000000002',
  current_setting('test.retry_revoke_lease')::uuid,now()+interval '30 seconds') lease),
  null,'same revoke approval retries while revocation remains in progress'); -- 5
select lives_ok(format('select public.complete_youtube_revocation(%L,%L)',
  '45000000-1000-4000-8000-000000000001'::uuid,current_setting('test.retry_revoke_lease')::uuid),
  'revocation completion succeeds with retry lease'); -- 6
reset role;
select is((select claim_state from app_private.youtube_approval_claims
    where approval_id='45000000-3000-4000-8000-000000000002'),
  'completed','revocation completion permanently consumes approval'); -- 7
update app_private.youtube_connections set state='connected',encrypted_credentials='reconnected',
  expires_at=now()+interval '1 hour',revocation_approval_id=null
where id='45000000-2000-4000-8000-000000000001';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok(
  $$select * from public.lease_youtube_revocation(
    '45000000-1000-4000-8000-000000000001','45000000-3000-4000-8000-000000000002',
    gen_random_uuid(),now()+interval '30 seconds')$$,
  'P0001','approval_required','completed revoke approval cannot be reused after reconnect'); -- 8

select * from finish();
rollback;
