-- Research workspace explorer: tenant-safe history indexes and lifecycle retry.

alter table public.projects
  add constraint projects_workspace_id_id_key unique (workspace_id, id);

alter table public.research_runs
  add column retry_of_run_id uuid,
  add constraint research_runs_workspace_project_fk
    foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete cascade,
  add constraint research_runs_workspace_retry_fk
    foreign key (workspace_id, retry_of_run_id)
    references public.research_runs(workspace_id, id) on delete restrict,
  add constraint research_runs_retry_not_self
    check (retry_of_run_id is null or retry_of_run_id <> id);

create index research_runs_workspace_created_idx
  on public.research_runs(workspace_id, created_at desc, id desc);
create index research_runs_workspace_state_created_idx
  on public.research_runs(workspace_id, state, created_at desc, id desc);
create index research_runs_workspace_project_created_idx
  on public.research_runs(workspace_id, project_id, created_at desc, id desc)
  where project_id is not null;
create index research_sources_workspace_run_captured_idx
  on public.research_sources(workspace_id, research_run_id, captured_at desc, id desc);

create or replace function public.retry_research_run(
  target_run_id uuid,
  request_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare source_run public.research_runs%rowtype;
declare existing_run public.research_runs%rowtype;
declare new_run public.research_runs%rowtype;
declare new_approval public.approvals%rowtype;
declare actor_role text;
begin
  if actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if char_length(request_idempotency_key) not between 8 and 128
  then raise exception 'invalid_research_retry' using errcode = '22023'; end if;

  select * into source_run from public.research_runs where id = target_run_id;
  if not found then raise exception 'research_retry_forbidden' using errcode = '42501'; end if;
  select role into actor_role from public.workspace_members
    where workspace_id = source_run.workspace_id and user_id = actor;
  if actor_role is null or actor_role not in ('owner','admin')
  then raise exception 'research_retry_forbidden' using errcode = '42501'; end if;
  if source_run.state not in ('completed','failed','cancelled')
  then raise exception 'research_not_retryable' using errcode = 'P0001'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'research-retry:' || source_run.workspace_id::text || ':' || request_idempotency_key, 0));
  select * into existing_run from public.research_runs
    where workspace_id = source_run.workspace_id and idempotency_key = request_idempotency_key;
  if found then
    if existing_run.retry_of_run_id is distinct from source_run.id
    then raise exception 'research_retry_idempotency_conflict' using errcode = 'P0001'; end if;
    select * into new_approval from public.approvals
      where workspace_id = existing_run.workspace_id
        and entity_type = 'research_plan' and entity_id = existing_run.id
      order by requested_at desc limit 1;
    return jsonb_build_object(
      'runId', existing_run.id, 'approvalId', new_approval.id,
      'workspaceId', existing_run.workspace_id, 'sourceRunId', source_run.id,
      'projectId', existing_run.project_id, 'state', existing_run.state,
      'correlationId', existing_run.correlation_id, 'created', false);
  end if;

  insert into public.research_runs(
    workspace_id, project_id, prompt, mode, state, estimated_credits,
    requested_by, idempotency_key, requested_sources, max_sources, retry_of_run_id
  ) values (
    source_run.workspace_id, source_run.project_id, source_run.prompt, source_run.mode,
    'awaiting_approval', source_run.estimated_credits, actor, request_idempotency_key,
    source_run.requested_sources, source_run.max_sources, source_run.id
  ) returning * into new_run;

  insert into public.approvals(
    workspace_id, entity_type, entity_id, state, risk_summary, estimated_credits, requested_by
  ) values (
    new_run.workspace_id, 'research_plan', new_run.id, 'pending',
    format('Retry prior research with up to %s sources from: %s',
      new_run.max_sources, array_to_string(new_run.requested_sources, ', ')),
    new_run.estimated_credits, actor
  ) returning * into new_approval;

  insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values(new_run.workspace_id, actor, 'research.retry_requested', 'research_run', new_run.id::text,
    jsonb_build_object('source_run_id', source_run.id, 'correlation_id', new_run.correlation_id));

  return jsonb_build_object(
    'runId', new_run.id, 'approvalId', new_approval.id,
    'workspaceId', new_run.workspace_id, 'sourceRunId', source_run.id,
    'projectId', new_run.project_id, 'state', new_run.state,
    'correlationId', new_run.correlation_id, 'created', true);
exception when unique_violation then
  raise exception 'research_retry_idempotency_conflict' using errcode = 'P0001';
end $$;

revoke all on function public.retry_research_run(uuid,text) from public, anon;
grant execute on function public.retry_research_run(uuid,text) to authenticated;
