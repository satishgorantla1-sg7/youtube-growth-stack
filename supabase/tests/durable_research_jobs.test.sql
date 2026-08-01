begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'viewer@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-owner@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.workspaces (id, name, slug, owner_id) values
  ('10000000-1000-4000-8000-000000000001', 'Tenant One', 'tenant-one', '10000000-0000-4000-8000-000000000001'),
  ('20000000-2000-4000-8000-000000000002', 'Tenant Two', 'tenant-two', '20000000-0000-4000-8000-000000000005');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('10000000-1000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('10000000-1000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'admin'),
  ('10000000-1000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'editor'),
  ('10000000-1000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'viewer'),
  ('20000000-2000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005', 'owner');

insert into public.approvals (id, workspace_id, entity_type, entity_id, state, risk_summary, estimated_credits, requested_by)
values ('20000000-2000-4000-8000-000000000099', '20000000-2000-4000-8000-000000000002', 'research_plan',
  '20000000-2000-4000-8000-000000000098', 'pending', 'Foreign tenant research', 1,
  '20000000-0000-4000-8000-000000000005');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.create_research_run('10000000-1000-4000-8000-000000000001', 'Viewer research', 'quick', array['web'], 5, 1, 'viewer-request')$$,
  'P0001', 'research_create_forbidden', 'viewer cannot create a paid research plan'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.create_research_run('10000000-1000-4000-8000-000000000001', 'Editor research', 'quick', array['web'], 5, 1, 'editor-request')$$,
  'editor can create an approval-gated research plan'
);
select throws_ok(
  $$select public.decide_research_approval((select id from public.approvals where entity_id = (select id from public.research_runs where idempotency_key = 'editor-request')), 'approved', null)$$,
  'P0001', 'research_approval_forbidden', 'editor cannot approve paid research'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.decide_research_approval((select id from public.approvals where entity_id = (select id from public.research_runs where idempotency_key = 'editor-request')), 'approved', null)$$,
  'admin can approve paid research'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_research_run('10000000-1000-4000-8000-000000000001', 'Owner research', 'quick', array['youtube'], 5, 1, 'owner-request')$$,
  'owner can create an approval-gated research plan'
);
select lives_ok(
  $$select public.decide_research_approval((select id from public.approvals where entity_id = (select id from public.research_runs where idempotency_key = 'owner-request')), 'approved', null)$$,
  'owner can approve paid research'
);
select throws_ok(
  $$select public.create_research_run('20000000-2000-4000-8000-000000000002', 'Cross-tenant research', 'quick', array['web'], 5, 1, 'cross-tenant-request')$$,
  'P0001', 'research_create_forbidden', 'role checks do not disclose or cross tenant boundaries'
);

select throws_ok(
  $$select public.decide_research_approval('99999999-9999-4999-8999-999999999999', 'approved', null)$$,
  'P0001', 'research_approval_forbidden', 'missing approval IDs do not disclose existence'
);
select throws_ok(
  $$select public.decide_research_approval('20000000-2000-4000-8000-000000000099', 'approved', null)$$,
  'P0001', 'research_approval_forbidden', 'foreign approval IDs match the missing-ID error'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.research_runs where workspace_id = '10000000-1000-4000-8000-000000000001'), 2::bigint,
  'viewer can read research records in their workspace');
select is((select count(*) from public.approvals where workspace_id = '10000000-1000-4000-8000-000000000001'), 2::bigint,
  'viewer can read approval records in their workspace');
select is((select count(*) from public.research_runs where workspace_id = '20000000-2000-4000-8000-000000000002'), 0::bigint,
  'RLS hides the other tenant records from viewer');

select ok(
  not has_table_privilege('authenticated', 'public.approvals', 'UPDATE'),
  'authenticated users cannot directly update approvals'
);
select ok(
  not has_table_privilege('authenticated', 'public.approvals', 'DELETE'),
  'authenticated users cannot delete approval evidence'
);
select ok(
  not has_table_privilege('authenticated', 'public.research_runs', 'INSERT'),
  'authenticated users cannot bypass the research RPC'
);

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$insert into public.projects (workspace_id, name, created_by)
    values ('10000000-1000-4000-8000-000000000001', 'Editor project', '10000000-0000-4000-8000-000000000003')$$,
  'editor can create an ordinary workspace draft'
);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$insert into public.projects (workspace_id, name, created_by)
    values ('10000000-1000-4000-8000-000000000001', 'Viewer project', '10000000-0000-4000-8000-000000000004')$$,
  '42501', null, 'viewer cannot create workspace records'
);

reset role;
select throws_ok(
  $$update public.approvals set risk_summary = 'rewritten evidence'
    where workspace_id = '10000000-1000-4000-8000-000000000001'$$,
  'P0001', 'approval_request_is_immutable',
  'approval request evidence remains immutable even for privileged SQL'
);
insert into public.audit_events (workspace_id, action, entity_type, entity_id)
values ('10000000-1000-4000-8000-000000000001', 'tamper-fixture', 'test', 'security-test');
select throws_ok(
  $$update public.audit_events set metadata = '{"tampered":true}'::jsonb where action = 'tamper-fixture'$$,
  'P0001', 'audit_evidence_is_append_only',
  'audit events are append-only even for privileged SQL'
);

select * from finish();
rollback;
