begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

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
 ('45000000-3000-4000-8000-000000000001','45000000-1000-4000-8000-000000000001','channel_action','45000000-2000-4000-8000-000000000001','approved','Reconnect','45000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001',now()),
 ('45000000-3000-4000-8000-000000000002','45000000-1000-4000-8000-000000000001','channel_action','45000000-2000-4000-8000-000000000001','approved','Revoke','45000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001',now());

insert into app_private.youtube_oauth_states(state_hash,workspace_id,user_id,approval_id,expires_at)
values(repeat('a',64),'45000000-1000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001','45000000-3000-4000-8000-000000000001',now()+interval '5 minutes');
select throws_ok(
  $$insert into app_private.youtube_oauth_states(state_hash,workspace_id,user_id,approval_id,expires_at)
    values(repeat('b',64),'45000000-1000-4000-8000-000000000001','45000000-0000-4000-8000-000000000001','45000000-3000-4000-8000-000000000001',now()+interval '5 minutes')$$,
  'P0001','approval_already_used','connect approval can create only one OAuth state'); -- 1
select throws_ok(
  $$update app_private.youtube_connections set state='revoking',revocation_approval_id='45000000-3000-4000-8000-000000000001'
    where id='45000000-2000-4000-8000-000000000001'$$,
  'P0001','approval_already_used','connect approval cannot be replayed for revocation'); -- 2
select lives_ok(
  $$update app_private.youtube_connections set state='revoking',revocation_approval_id='45000000-3000-4000-8000-000000000002'
    where id='45000000-2000-4000-8000-000000000001'$$,
  'separate connection-bound approval claims revocation purpose'); -- 3

select * from finish();
rollback;
