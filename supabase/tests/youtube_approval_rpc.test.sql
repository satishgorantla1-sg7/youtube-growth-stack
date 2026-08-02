begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('43000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approval-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('43000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approval-viewer@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.workspaces(id, name, slug, owner_id) values
  ('43000000-1000-4000-8000-000000000001', 'Approval Workspace', 'approval-workspace', '43000000-0000-4000-8000-000000000001');
insert into public.workspace_members(workspace_id, user_id, role) values
  ('43000000-1000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000001', 'owner'),
  ('43000000-1000-4000-8000-000000000001', '43000000-0000-4000-8000-000000000002', 'viewer');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '43000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.create_youtube_connection_approval('43000000-1000-4000-8000-000000000001')$$,
  '42501', 'youtube_approval_forbidden', 'viewer cannot request a connection approval'); -- 1

select set_config('request.jwt.claim.sub', '43000000-0000-4000-8000-000000000001', true);
select set_config('test.youtube_approval', public.create_youtube_connection_approval(
  '43000000-1000-4000-8000-000000000001')::text, true);
select is(current_setting('test.youtube_approval')::jsonb->>'state', 'pending',
  'owner creates a pending approval'); -- 2
select is(current_setting('test.youtube_approval')::jsonb->>'scope',
  'https://www.googleapis.com/auth/youtube.readonly', 'approval evidence declares the read-only scope'); -- 3
select is((public.create_youtube_connection_approval(
    '43000000-1000-4000-8000-000000000001')->>'approvalId'),
  current_setting('test.youtube_approval')::jsonb->>'approvalId',
  'repeated request returns the existing pending approval'); -- 4
select is((select count(*) from public.approvals where workspace_id =
  '43000000-1000-4000-8000-000000000001' and state = 'pending'), 1::bigint,
  'idempotent request creates one pending row'); -- 5
select set_config('test.youtube_decision', public.decide_youtube_connection_approval(
  (current_setting('test.youtube_approval')::jsonb->>'approvalId')::uuid,
  'approved', 'Read-only access confirmed')::text, true);
select is(current_setting('test.youtube_decision')::jsonb->>'state', 'approved',
  'owner approves the channel action'); -- 6
select is((public.decide_youtube_connection_approval(
    (current_setting('test.youtube_approval')::jsonb->>'approvalId')::uuid,
    'approved', 'same decision')->>'state'), 'approved',
  'same approval decision is idempotent'); -- 7
select throws_ok(
  format('select public.decide_youtube_connection_approval(%L,%L,null)',
    (current_setting('test.youtube_approval')::jsonb->>'approvalId')::uuid, 'rejected'),
  'P0001', 'approval_not_pending', 'opposite decision cannot replace final evidence'); -- 8
select is((select count(*) from public.audit_events where workspace_id =
    '43000000-1000-4000-8000-000000000001' and action = 'youtube.approval.requested'),
  1::bigint, 'approval request is append-only audit evidence'); -- 9
select is((select count(*) from public.audit_events where workspace_id =
    '43000000-1000-4000-8000-000000000001' and action = 'youtube.approval.approved'),
  1::bigint, 'approval decision is append-only audit evidence'); -- 10

select * from finish();
rollback;
