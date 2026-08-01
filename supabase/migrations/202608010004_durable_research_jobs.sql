alter table public.research_runs
  add column idempotency_key text,
  add column correlation_id uuid not null default gen_random_uuid(),
  add column requested_sources text[] not null default array['youtube', 'web']::text[],
  add column max_sources integer not null default 10 check (max_sources between 1 and 25);

alter table public.research_runs
  add constraint research_runs_workspace_idempotency_unique unique (workspace_id, idempotency_key),
  add constraint research_runs_requested_sources_valid check (
    cardinality(requested_sources) between 1 and 2
    and requested_sources <@ array['youtube', 'web']::text[]
  );

alter table public.jobs
  add column correlation_id uuid not null default gen_random_uuid(),
  add column lease_token uuid,
  add column leased_by text;

create table public.job_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  correlation_id uuid not null,
  event_type text not null check (event_type in ('queued','leased','acknowledged','retry_scheduled','dead_lettered')),
  attempt integer not null check (attempt >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.job_events enable row level security;
create policy "job_events_members_read" on public.job_events for select
  using (app_private.is_workspace_member(workspace_id));

create index jobs_lease_idx on public.jobs(state, available_at, lease_expires_at)
  where state in ('queued','leased');
create index job_events_job_created_idx on public.job_events(job_id, created_at);
create index research_runs_correlation_idx on public.research_runs(correlation_id);

create or replace function public.create_research_run(
  target_workspace_id uuid,
  request_prompt text,
  request_mode text,
  request_sources text[],
  request_max_sources integer,
  request_estimated_credits integer,
  request_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_run public.research_runs;
  new_run public.research_runs;
  new_approval public.approvals;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not app_private.is_workspace_member(target_workspace_id) then raise exception 'workspace_forbidden'; end if;
  if request_mode not in ('quick', 'deep')
     or char_length(trim(request_prompt)) not between 3 and 2000
     or request_max_sources not between 1 and 25
     or request_estimated_credits not between 0 and 100
     or cardinality(request_sources) not between 1 and 2
     or not (request_sources <@ array['youtube', 'web']::text[])
     or char_length(request_idempotency_key) not between 8 and 128 then
    raise exception 'invalid_research_request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_workspace_id::text || ':' || request_idempotency_key, 0));

  select * into existing_run from public.research_runs
  where workspace_id = target_workspace_id and idempotency_key = request_idempotency_key;
  if found then
    if existing_run.prompt <> trim(request_prompt)
       or existing_run.mode <> request_mode
       or existing_run.requested_sources <> request_sources
       or existing_run.max_sources <> request_max_sources then
      raise exception 'idempotency_conflict';
    end if;
    select * into new_approval from public.approvals
    where entity_type = 'research_plan' and entity_id = existing_run.id
    order by requested_at desc limit 1;
    return jsonb_build_object(
      'id', existing_run.id, 'approvalId', new_approval.id, 'workspaceId', existing_run.workspace_id,
      'correlationId', existing_run.correlation_id, 'idempotencyKey', existing_run.idempotency_key,
      'state', existing_run.state, 'created', false,
      'plan', jsonb_build_object('prompt', existing_run.prompt, 'mode', existing_run.mode,
        'sources', existing_run.requested_sources, 'maxSources', existing_run.max_sources,
        'estimatedCredits', existing_run.estimated_credits)
    );
  end if;

  insert into public.research_runs (
    workspace_id, prompt, mode, state, estimated_credits, requested_by,
    idempotency_key, requested_sources, max_sources
  ) values (
    target_workspace_id, trim(request_prompt), request_mode, 'awaiting_approval', request_estimated_credits,
    auth.uid(), request_idempotency_key, request_sources, request_max_sources
  ) returning * into new_run;

  insert into public.approvals (
    workspace_id, entity_type, entity_id, risk_summary, estimated_credits, requested_by
  ) values (
    target_workspace_id, 'research_plan', new_run.id,
    format('Collect up to %s sources from: %s', request_max_sources, array_to_string(request_sources, ', ')),
    request_estimated_credits, auth.uid()
  ) returning * into new_approval;

  insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_workspace_id, auth.uid(), 'research.approval_requested', 'research_run', new_run.id::text,
    jsonb_build_object('correlation_id', new_run.correlation_id, 'estimated_credits', request_estimated_credits));

  return jsonb_build_object(
    'id', new_run.id, 'approvalId', new_approval.id, 'workspaceId', new_run.workspace_id,
    'correlationId', new_run.correlation_id, 'idempotencyKey', new_run.idempotency_key,
    'state', new_run.state, 'created', true,
    'plan', jsonb_build_object('prompt', new_run.prompt, 'mode', new_run.mode,
      'sources', new_run.requested_sources, 'maxSources', new_run.max_sources,
      'estimatedCredits', new_run.estimated_credits)
  );
exception when unique_violation then
  raise exception 'idempotency_conflict';
end;
$$;

create or replace function public.decide_research_approval(
  target_approval_id uuid,
  approval_decision text,
  approval_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_approval public.approvals;
  target_run public.research_runs;
  new_job public.jobs;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if approval_decision not in ('approved', 'rejected') then raise exception 'invalid_approval_decision'; end if;

  select * into target_approval from public.approvals where id = target_approval_id for update;
  if not found or target_approval.entity_type <> 'research_plan' then raise exception 'approval_not_found'; end if;
  if not app_private.is_workspace_member(target_approval.workspace_id) then raise exception 'workspace_forbidden'; end if;
  if target_approval.state <> 'pending' then raise exception 'approval_not_pending'; end if;

  select * into target_run from public.research_runs where id = target_approval.entity_id for update;
  if not found or target_run.state <> 'awaiting_approval' then raise exception 'approval_bypass_prevented'; end if;

  update public.approvals set state = approval_decision, decided_by = auth.uid(),
    decision_note = approval_note, decided_at = now() where id = target_approval_id;

  if approval_decision = 'rejected' then
    update public.research_runs set state = 'cancelled' where id = target_run.id;
    insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
    values (target_run.workspace_id, auth.uid(), 'research.rejected', 'research_run', target_run.id::text,
      jsonb_build_object('correlation_id', target_run.correlation_id));
    return jsonb_build_object('approvalId', target_approval_id, 'runId', target_run.id, 'state', 'cancelled',
      'correlationId', target_run.correlation_id, 'decidedAt', now());
  end if;

  insert into public.jobs (workspace_id, research_run_id, kind, payload, idempotency_key, correlation_id)
  values (target_run.workspace_id, target_run.id, 'research.collect',
    jsonb_build_object('prompt', target_run.prompt, 'mode', target_run.mode,
      'sources', target_run.requested_sources, 'maxSources', target_run.max_sources,
      'estimatedCredits', target_run.estimated_credits),
    'research:' || target_run.id::text, target_run.correlation_id)
  returning * into new_job;
  update public.research_runs set state = 'queued' where id = target_run.id;
  insert into public.job_events (workspace_id, job_id, correlation_id, event_type, attempt)
  values (new_job.workspace_id, new_job.id, new_job.correlation_id, 'queued', 0);
  insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_run.workspace_id, auth.uid(), 'research.approved_and_queued', 'research_run', target_run.id::text,
    jsonb_build_object('correlation_id', target_run.correlation_id, 'job_id', new_job.id));
  return jsonb_build_object('approvalId', target_approval_id, 'runId', target_run.id, 'state', 'queued',
    'jobId', new_job.id, 'correlationId', target_run.correlation_id, 'decidedAt', now());
end;
$$;

create or replace function public.lease_research_job(worker_id text, lease_seconds integer default 60)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare leased_job public.jobs; expired_job public.jobs;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if char_length(worker_id) not between 1 and 128 or lease_seconds not between 15 and 300 then
    raise exception 'invalid_lease_request';
  end if;
  for expired_job in
    select * from public.jobs
    where kind = 'research.collect' and state = 'leased' and lease_expires_at < now() and attempts >= max_attempts
    order by lease_expires_at for update skip locked limit 25
  loop
    update public.jobs set state = 'dead_letter', last_error = 'lease_expired_at_max_attempts',
      lease_token = null, lease_expires_at = null, leased_by = null where id = expired_job.id;
    update public.research_runs set state = 'failed', error_code = 'lease_expired_at_max_attempts'
      where id = expired_job.research_run_id;
    insert into public.job_events (workspace_id, job_id, correlation_id, event_type, attempt, metadata)
    values (expired_job.workspace_id, expired_job.id, expired_job.correlation_id, 'dead_lettered', expired_job.attempts,
      jsonb_build_object('error_code', 'lease_expired_at_max_attempts'));
  end loop;
  select j.* into leased_job from public.jobs j
  join public.approvals a on a.entity_type = 'research_plan' and a.entity_id = j.research_run_id and a.state = 'approved'
  where j.kind = 'research.collect'
    and ((j.state = 'queued' and j.available_at <= now()) or (j.state = 'leased' and j.lease_expires_at < now()))
    and j.attempts < j.max_attempts
  order by j.available_at, j.created_at for update of j skip locked limit 1;
  if not found then return null; end if;
  update public.jobs set state = 'leased', attempts = attempts + 1, leased_by = worker_id,
    lease_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => lease_seconds)
  where id = leased_job.id returning * into leased_job;
  update public.research_runs set state = 'running', started_at = coalesce(started_at, now()) where id = leased_job.research_run_id;
  insert into public.job_events (workspace_id, job_id, correlation_id, event_type, attempt, metadata)
  values (leased_job.workspace_id, leased_job.id, leased_job.correlation_id, 'leased', leased_job.attempts,
    jsonb_build_object('worker_id', worker_id, 'lease_expires_at', leased_job.lease_expires_at));
  return jsonb_build_object('id', leased_job.id, 'runId', leased_job.research_run_id,
    'workspaceId', leased_job.workspace_id, 'correlationId', leased_job.correlation_id,
    'state', 'leased', 'attempt', leased_job.attempts, 'maxAttempts', leased_job.max_attempts,
    'leaseToken', leased_job.lease_token, 'plan', leased_job.payload);
end;
$$;

create or replace function public.ack_research_job(target_job_id uuid, target_lease_token uuid, normalized_sources jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare target_job public.jobs;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into target_job from public.jobs where id = target_job_id for update;
  if not found or target_job.state <> 'leased' or target_job.lease_token <> target_lease_token
     or target_job.lease_expires_at < now() then raise exception 'lease_lost'; end if;
  if jsonb_typeof(normalized_sources) <> 'array' or jsonb_array_length(normalized_sources) > 25 then
    raise exception 'invalid_normalized_sources';
  end if;
  insert into public.research_sources (workspace_id, research_run_id, provider, source_type, url, title, content, provenance, captured_at)
  select target_job.workspace_id, target_job.research_run_id, source.provider, source.source_type,
    source.url, source.title, source.content, source.provenance, source.captured_at
  from jsonb_to_recordset(normalized_sources) as source(
    provider text, source_type text, url text, title text, content text, provenance jsonb, captured_at timestamptz
  );
  update public.jobs set state = 'completed', lease_token = null, lease_expires_at = null, leased_by = null where id = target_job.id;
  update public.research_runs set state = 'completed', completed_at = now(), actual_credits = estimated_credits where id = target_job.research_run_id;
  insert into public.job_events (workspace_id, job_id, correlation_id, event_type, attempt, metadata)
  values (target_job.workspace_id, target_job.id, target_job.correlation_id, 'acknowledged', target_job.attempts,
    jsonb_build_object('source_count', jsonb_array_length(normalized_sources)));
end;
$$;

create or replace function public.fail_research_job(
  target_job_id uuid, target_lease_token uuid, failure_code text, is_retryable boolean
) returns text language plpgsql security definer set search_path = '' as $$
declare target_job public.jobs; next_state text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into target_job from public.jobs where id = target_job_id for update;
  if not found or target_job.state <> 'leased' or target_job.lease_token <> target_lease_token then raise exception 'lease_lost'; end if;
  next_state := case when is_retryable and target_job.attempts < target_job.max_attempts then 'queued' else 'dead_letter' end;
  update public.jobs set state = next_state, last_error = left(failure_code, 200),
    available_at = case when next_state = 'queued' then now() + make_interval(secs => least(300, (power(2, attempts) * 5)::integer)) else available_at end,
    lease_token = null, lease_expires_at = null, leased_by = null where id = target_job.id;
  update public.research_runs set state = case when next_state = 'queued' then 'queued' else 'failed' end,
    error_code = left(failure_code, 200) where id = target_job.research_run_id;
  insert into public.job_events (workspace_id, job_id, correlation_id, event_type, attempt, metadata)
  values (target_job.workspace_id, target_job.id, target_job.correlation_id,
    case when next_state = 'queued' then 'retry_scheduled' else 'dead_lettered' end,
    target_job.attempts, jsonb_build_object('error_code', left(failure_code, 200)));
  return next_state;
end;
$$;

revoke all on function public.create_research_run(uuid,text,text,text[],integer,integer,text) from public;
revoke all on function public.decide_research_approval(uuid,text,text) from public;
grant execute on function public.create_research_run(uuid,text,text,text[],integer,integer,text) to authenticated;
grant execute on function public.decide_research_approval(uuid,text,text) to authenticated;
revoke all on function public.lease_research_job(text,integer) from public, anon, authenticated;
revoke all on function public.ack_research_job(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.fail_research_job(uuid,uuid,text,boolean) from public, anon, authenticated;
grant select on public.research_runs, public.approvals, public.jobs, public.job_events to authenticated;
grant execute on function public.lease_research_job(text,integer) to service_role;
grant execute on function public.ack_research_job(uuid,uuid,jsonb) to service_role;
grant execute on function public.fail_research_job(uuid,uuid,text,boolean) to service_role;
