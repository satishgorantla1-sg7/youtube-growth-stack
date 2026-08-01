begin;

-- Research relations must never point across tenants, even when written by a
-- privileged worker. The existing single-column foreign keys remain in place;
-- these composite keys add the tenant invariant without rewriting history.
alter table public.research_runs
  add constraint research_runs_workspace_id_unique unique (workspace_id, id);
alter table public.jobs
  add constraint jobs_workspace_id_unique unique (workspace_id, id);
alter table public.jobs
  add constraint jobs_workspace_run_id_unique unique (workspace_id, research_run_id, id);
alter table public.research_sources
  add constraint research_sources_workspace_run_fk
  foreign key (workspace_id, research_run_id)
  references public.research_runs(workspace_id, id) on delete cascade;
alter table public.jobs
  add constraint jobs_workspace_run_fk
  foreign key (workspace_id, research_run_id)
  references public.research_runs(workspace_id, id) on delete cascade;
alter table public.job_events
  add constraint job_events_workspace_job_fk
  foreign key (workspace_id, job_id)
  references public.jobs(workspace_id, id) on delete cascade;

alter table public.research_runs drop constraint research_runs_state_check;
alter table public.research_runs add constraint research_runs_state_check
  check (state in ('draft','awaiting_approval','queued','running','cancelling','completed','failed','cancelled'));
alter table public.research_runs
  add column cancellation_requested_at timestamptz,
  add column cancellation_requested_by uuid references public.profiles(id),
  add column cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 500);
alter table public.research_runs
  add constraint research_runs_cancellation_actor_workspace_fk
  foreign key (workspace_id, cancellation_requested_by)
  references public.workspace_members(workspace_id, user_id);

alter table public.jobs drop constraint jobs_state_check;
alter table public.jobs add constraint jobs_state_check
  check (state in ('queued','leased','cancelling','cancelled','completed','failed','dead_letter'));
alter table public.jobs
  add column cancellation_requested_at timestamptz;

alter table public.job_events drop constraint job_events_event_type_check;
alter table public.job_events add constraint job_events_event_type_check
  check (event_type in (
    'queued','leased','acknowledged','retry_scheduled','dead_lettered',
    'cancellation_requested','cancelled','budget_reserved','budget_settled','budget_released'
  ));

create table public.research_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  research_run_id uuid not null,
  estimated_credits integer not null check (estimated_credits between 0 and 1000000),
  actual_credits integer check (actual_credits between 0 and 1000000),
  state text not null default 'reserved' check (state in ('reserved','settled','released')),
  idempotency_key text not null,
  reserved_at timestamptz not null default now(),
  settled_at timestamptz,
  release_reason text check (release_reason is null or char_length(release_reason) <= 200),
  unique (research_run_id),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, research_run_id)
    references public.research_runs(workspace_id, id) on delete cascade,
  check (
    (state = 'reserved' and settled_at is null and actual_credits is null)
    or (state = 'settled' and settled_at is not null and actual_credits is not null)
    or (state = 'released' and settled_at is not null)
  )
);

-- Reject sensitive logging keys at any nesting depth. Provider metadata is
-- operational telemetry only; prompts, content, credentials, and transcripts
-- must never be persisted through this ledger.
create or replace function app_private.jsonb_has_sensitive_key(document jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  entry record;
  item jsonb;
begin
  if document is null then return false; end if;
  if pg_catalog.jsonb_typeof(document) = 'object' then
    for entry in select key, value from pg_catalog.jsonb_each(document)
    loop
      if pg_catalog.lower(entry.key) = any(array[
        'prompt','content','token','api_key','authorization','transcript'
      ]) or app_private.jsonb_has_sensitive_key(entry.value) then
        return true;
      end if;
    end loop;
  elsif pg_catalog.jsonb_typeof(document) = 'array' then
    for item in select value from pg_catalog.jsonb_array_elements(document)
    loop
      if app_private.jsonb_has_sensitive_key(item) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

create table public.provider_invocations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  research_run_id uuid not null,
  job_id uuid not null,
  provider text not null check (provider in ('apify','firecrawl','youtube_api')),
  operation text not null check (char_length(operation) between 1 and 80),
  state text not null default 'started' check (state in ('started','succeeded','failed','cancelled')),
  requested_units integer not null check (requested_units between 1 and 25),
  actual_units integer check (actual_units between 0 and 25),
  credits integer check (credits between 0 and 1000000),
  provider_cost_usd numeric(12,6) check (provider_cost_usd >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 200),
  correlation_id uuid not null,
  idempotency_key text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, research_run_id)
    references public.research_runs(workspace_id, id) on delete cascade,
  foreign key (workspace_id, research_run_id, job_id)
    references public.jobs(workspace_id, research_run_id, id) on delete cascade,
  check (
    (state = 'started' and completed_at is null)
    or (state <> 'started' and completed_at is not null)
  ),
  check (not app_private.jsonb_has_sensitive_key(metadata))
);

-- Operational controls and counters are intentionally private. Tenant members
-- receive safe status through application-owned RPCs, never direct mutation.
create table app_private.research_operational_controls (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','provider','workspace')),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text check (provider is null or provider in ('apify','firecrawl','youtube_api')),
  disabled boolean not null default false,
  reason text check (reason is null or char_length(reason) <= 300),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'global' and workspace_id is null and provider is null)
    or (scope = 'provider' and workspace_id is null and provider is not null)
    or (scope = 'workspace' and workspace_id is not null and provider is null)
  )
);
create unique index research_operational_controls_scope_key
  on app_private.research_operational_controls (
    scope, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(provider, '')
  );

create table app_private.research_safety_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','provider','workspace')),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  provider text check (provider is null or provider in ('apify','firecrawl','youtube_api')),
  max_concurrent integer not null check (max_concurrent between 1 and 1000),
  requests_per_minute integer not null check (requests_per_minute between 1 and 10000),
  check (
    (scope = 'global' and workspace_id is null and provider is null)
    or (scope = 'provider' and workspace_id is null and provider is not null)
    or (scope = 'workspace' and workspace_id is not null and provider is null)
  )
);
create unique index research_safety_limits_scope_key
  on app_private.research_safety_limits (
    scope, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(provider, '')
  );

create table app_private.research_rate_limit_counters (
  scope_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (scope_key, window_started_at)
);

insert into app_private.research_operational_controls (scope, disabled, reason)
values ('global', false, null);
insert into app_private.research_operational_controls (scope, provider, disabled)
values ('provider', 'apify', false), ('provider', 'firecrawl', false), ('provider', 'youtube_api', false);
insert into app_private.research_safety_limits (scope, max_concurrent, requests_per_minute)
values ('global', 10, 120);
insert into app_private.research_safety_limits (scope, provider, max_concurrent, requests_per_minute)
values ('provider', 'apify', 5, 60), ('provider', 'firecrawl', 5, 60), ('provider', 'youtube_api', 5, 60);

alter table public.research_credit_reservations enable row level security;
alter table public.provider_invocations enable row level security;
create policy research_credit_reservations_member_select
  on public.research_credit_reservations for select to authenticated
  using (app_private.is_workspace_member(workspace_id));
create policy provider_invocations_member_select
  on public.provider_invocations for select to authenticated
  using (app_private.is_workspace_member(workspace_id));

revoke all on public.research_credit_reservations, public.provider_invocations from public, anon, authenticated;
grant select on public.research_credit_reservations, public.provider_invocations to authenticated;
revoke all on app_private.research_operational_controls, app_private.research_safety_limits,
  app_private.research_rate_limit_counters from public, anon, authenticated;

create index research_credit_reservations_daily_idx
  on public.research_credit_reservations(workspace_id, reserved_at, state);
create index provider_invocations_active_global_idx
  on public.provider_invocations(state, started_at) where state = 'started';
create index provider_invocations_active_provider_idx
  on public.provider_invocations(provider, state, started_at) where state = 'started';
create index provider_invocations_workspace_created_idx
  on public.provider_invocations(workspace_id, started_at desc);
create index provider_invocations_job_idx on public.provider_invocations(job_id, started_at);
create index jobs_cancellation_idx on public.jobs(state, cancellation_requested_at)
  where state in ('leased','cancelling');

create or replace function app_private.research_control_disabled(target_workspace_id uuid, target_provider text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app_private.research_operational_controls c
    where c.disabled
      and (c.scope = 'global'
        or (c.scope = 'workspace' and c.workspace_id = target_workspace_id)
        or (c.scope = 'provider' and c.provider = target_provider))
  );
$$;

create or replace function app_private.consume_research_rate_limit(
  target_workspace_id uuid, target_user_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  current_window timestamptz := date_trunc('minute', now());
  workspace_limit integer;
  global_limit integer;
  current_count integer;
begin
  select requests_per_minute into global_limit
  from app_private.research_safety_limits where scope = 'global';
  select requests_per_minute into workspace_limit
  from app_private.research_safety_limits
  where scope = 'workspace' and workspace_id = target_workspace_id;
  global_limit := coalesce(global_limit, 120);
  workspace_limit := coalesce(workspace_limit, least(global_limit, 30));

  insert into app_private.research_rate_limit_counters(scope_key, window_started_at, request_count)
  values ('research-request:global', current_window, 1)
  on conflict (scope_key, window_started_at) do update
  set request_count = app_private.research_rate_limit_counters.request_count + 1
  returning request_count into current_count;
  if current_count > global_limit then raise exception 'global_rate_limit_exceeded'; end if;

  insert into app_private.research_rate_limit_counters(scope_key, window_started_at, request_count)
  values ('workspace:' || target_workspace_id::text, current_window, 1)
  on conflict (scope_key, window_started_at) do update
  set request_count = app_private.research_rate_limit_counters.request_count + 1
  returning request_count into current_count;
  if current_count > workspace_limit then raise exception 'workspace_rate_limit_exceeded'; end if;

  insert into app_private.research_rate_limit_counters(scope_key, window_started_at, request_count)
  values ('user:' || target_workspace_id::text || ':' || target_user_id::text, current_window, 1)
  on conflict (scope_key, window_started_at) do update
  set request_count = app_private.research_rate_limit_counters.request_count + 1
  returning request_count into current_count;
  if current_count > least(workspace_limit, 10) then raise exception 'user_rate_limit_exceeded'; end if;
end;
$$;

create or replace function app_private.consume_provider_rate_limit(
  target_workspace_id uuid, target_provider text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  current_window timestamptz := date_trunc('minute', now());
  global_limit integer;
  provider_limit integer;
  workspace_limit integer;
  current_count integer;
begin
  select requests_per_minute into global_limit
  from app_private.research_safety_limits where scope = 'global';
  select requests_per_minute into provider_limit
  from app_private.research_safety_limits
  where scope = 'provider' and provider = target_provider;
  select requests_per_minute into workspace_limit
  from app_private.research_safety_limits
  where scope = 'workspace' and workspace_id = target_workspace_id;
  global_limit := coalesce(global_limit, 120);
  provider_limit := coalesce(provider_limit, least(global_limit, 60));
  workspace_limit := coalesce(workspace_limit, least(provider_limit, 30));

  insert into app_private.research_rate_limit_counters(scope_key, window_started_at, request_count)
  values ('provider-call:global', current_window, 1)
  on conflict (scope_key, window_started_at) do update
  set request_count = app_private.research_rate_limit_counters.request_count + 1
  returning request_count into current_count;
  if current_count > global_limit then raise exception 'global_provider_rate_limit_exceeded'; end if;

  insert into app_private.research_rate_limit_counters(scope_key, window_started_at, request_count)
  values ('provider-call:' || target_provider, current_window, 1)
  on conflict (scope_key, window_started_at) do update
  set request_count = app_private.research_rate_limit_counters.request_count + 1
  returning request_count into current_count;
  if current_count > provider_limit then raise exception 'provider_rate_limit_exceeded'; end if;

  insert into app_private.research_rate_limit_counters(scope_key, window_started_at, request_count)
  values ('provider-call:' || target_workspace_id::text, current_window, 1)
  on conflict (scope_key, window_started_at) do update
  set request_count = app_private.research_rate_limit_counters.request_count + 1
  returning request_count into current_count;
  if current_count > workspace_limit then raise exception 'workspace_provider_rate_limit_exceeded'; end if;
end;
$$;

-- Replaces the public authorization wrapper. Budget reservation, approval,
-- and queue insertion occur in one transaction under a workspace lock.
create or replace function public.decide_research_approval(
  target_approval_id uuid,
  approval_decision text,
  approval_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_approval public.approvals;
  target_run public.research_runs;
  new_job public.jobs;
  actor_role text;
  daily_limit integer;
  committed_credits bigint;
  reservation public.research_credit_reservations;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if approval_decision not in ('approved','rejected') then raise exception 'invalid_approval_decision'; end if;

  select * into target_approval from public.approvals where id = target_approval_id for update;
  if not found or target_approval.entity_type <> 'research_plan' then raise exception 'research_approval_forbidden'; end if;
  select role into actor_role from public.workspace_members
    where workspace_id = target_approval.workspace_id and user_id = auth.uid();
  if actor_role is null or actor_role not in ('owner','admin') then raise exception 'research_approval_forbidden'; end if;
  if target_approval.state <> 'pending' then raise exception 'approval_not_pending'; end if;

  select * into target_run from public.research_runs
    where id = target_approval.entity_id and workspace_id = target_approval.workspace_id for update;
  if not found or target_run.state <> 'awaiting_approval' then raise exception 'approval_bypass_prevented'; end if;

  if approval_decision = 'rejected' then
    update public.approvals set state = 'rejected', decided_by = auth.uid(),
      decision_note = approval_note, decided_at = now() where id = target_approval.id;
    update public.research_runs set state = 'cancelled', completed_at = now() where id = target_run.id;
    insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
    values (target_run.workspace_id, auth.uid(), 'research.rejected', 'research_run', target_run.id::text,
      jsonb_build_object('correlation_id', target_run.correlation_id));
    return jsonb_build_object('approvalId', target_approval.id, 'runId', target_run.id,
      'state', 'cancelled', 'correlationId', target_run.correlation_id, 'decidedAt', now());
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('research-budget:' || target_run.workspace_id::text, 0));
  if app_private.research_control_disabled(target_run.workspace_id, null) then
    raise exception 'research_disabled';
  end if;
  perform app_private.consume_research_rate_limit(target_run.workspace_id, auth.uid());
  select daily_credit_limit into daily_limit from public.workspaces where id = target_run.workspace_id for update;
  select coalesce(sum(case when state = 'settled' then actual_credits else estimated_credits end), 0)
    into committed_credits
  from public.research_credit_reservations
  where workspace_id = target_run.workspace_id and reserved_at >= date_trunc('day', now())
    and state in ('reserved','settled');
  if committed_credits + target_run.estimated_credits > daily_limit then
    raise exception 'workspace_daily_credit_limit_exceeded';
  end if;

  insert into public.research_credit_reservations(
    workspace_id, research_run_id, estimated_credits, idempotency_key
  ) values (
    target_run.workspace_id, target_run.id, target_run.estimated_credits,
    'research:' || target_run.id::text
  ) returning * into reservation;

  update public.approvals set state = 'approved', decided_by = auth.uid(),
    decision_note = approval_note, decided_at = now() where id = target_approval.id;
  insert into public.jobs(workspace_id, research_run_id, kind, payload, idempotency_key, correlation_id)
  values (target_run.workspace_id, target_run.id, 'research.collect',
    jsonb_build_object('prompt', target_run.prompt, 'mode', target_run.mode,
      'sources', target_run.requested_sources, 'maxSources', target_run.max_sources,
      'estimatedCredits', target_run.estimated_credits),
    'research:' || target_run.id::text, target_run.correlation_id)
  returning * into new_job;
  update public.research_runs set state = 'queued' where id = target_run.id;
  insert into public.job_events(workspace_id, job_id, correlation_id, event_type, attempt, metadata)
  values
    (new_job.workspace_id, new_job.id, new_job.correlation_id, 'budget_reserved', 0,
      jsonb_build_object('credits', reservation.estimated_credits)),
    (new_job.workspace_id, new_job.id, new_job.correlation_id, 'queued', 0, '{}'::jsonb);
  insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_run.workspace_id, auth.uid(), 'research.approved_and_queued', 'research_run', target_run.id::text,
    jsonb_build_object('correlation_id', target_run.correlation_id, 'job_id', new_job.id,
      'reserved_credits', reservation.estimated_credits));
  return jsonb_build_object('approvalId', target_approval.id, 'runId', target_run.id,
    'state', 'queued', 'jobId', new_job.id, 'correlationId', target_run.correlation_id,
    'reservedCredits', reservation.estimated_credits, 'decidedAt', now());
end;
$$;

create or replace function public.cancel_research_run(
  target_run_id uuid, cancellation_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_run public.research_runs; target_job public.jobs; actor_role text; next_state text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into target_run from public.research_runs where id = target_run_id for update;
  if not found then raise exception 'research_cancel_forbidden'; end if;
  select role into actor_role from public.workspace_members
    where workspace_id = target_run.workspace_id and user_id = auth.uid();
  if actor_role is null or actor_role not in ('owner','admin') then raise exception 'research_cancel_forbidden'; end if;
  if target_run.state not in ('queued','running') then raise exception 'research_not_cancellable'; end if;
  if cancellation_note is not null and char_length(cancellation_note) > 500 then raise exception 'invalid_cancellation_note'; end if;

  select * into target_job from public.jobs
    where workspace_id = target_run.workspace_id and research_run_id = target_run.id
      and kind = 'research.collect' for update;
  if not found or target_job.state not in ('queued','leased') then raise exception 'research_not_cancellable'; end if;
  next_state := case when target_job.state = 'leased' then 'cancelling' else 'cancelled' end;
  update public.jobs set state = next_state, cancellation_requested_at = now(),
    lease_token = case when next_state = 'cancelled' then null else lease_token end,
    lease_expires_at = case when next_state = 'cancelled' then null else lease_expires_at end,
    leased_by = case when next_state = 'cancelled' then null else leased_by end
    where id = target_job.id;
  update public.research_runs set state = case when next_state = 'cancelled' then 'cancelled' else 'cancelling' end,
    cancellation_requested_at = now(), cancellation_requested_by = auth.uid(),
    cancellation_reason = cancellation_note,
    completed_at = case when next_state = 'cancelled' then now() else completed_at end
    where id = target_run.id;
  if next_state = 'cancelled' then
    update public.research_credit_reservations set state = 'released', settled_at = now(),
      actual_credits = 0, release_reason = 'cancelled_before_provider_start'
      where research_run_id = target_run.id and state = 'reserved';
    insert into public.job_events(workspace_id, job_id, correlation_id, event_type, attempt, metadata)
    values (target_job.workspace_id, target_job.id, target_job.correlation_id,
      'budget_released', target_job.attempts,
      jsonb_build_object('reason', 'cancelled_before_provider_start'));
  end if;
  insert into public.job_events(workspace_id, job_id, correlation_id, event_type, attempt, metadata)
  values (target_job.workspace_id, target_job.id, target_job.correlation_id,
    case when next_state = 'cancelled' then 'cancelled' else 'cancellation_requested' end,
    target_job.attempts, '{}'::jsonb);
  insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_run.workspace_id, auth.uid(), 'research.cancellation_requested', 'research_run', target_run.id::text,
    jsonb_build_object('correlation_id', target_run.correlation_id, 'job_state', next_state));
  return jsonb_build_object('runId', target_run.id,
    'state', case when next_state = 'cancelled' then 'cancelled' else 'cancelling' end,
    'correlationId', target_run.correlation_id);
end;
$$;

create or replace function public.lease_research_job(worker_id text, lease_seconds integer default 60)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  leased_job public.jobs;
  expired_job public.jobs;
  reservation public.research_credit_reservations;
  incurred_credits integer;
  reconciled_credits integer;
  had_uncertain_invocation boolean;
  terminal_job_state text;
  terminal_run_state text;
  terminal_event text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if char_length(worker_id) not between 1 and 128 or lease_seconds not between 15 and 300 then raise exception 'invalid_lease_request'; end if;
  -- Serialize count plus transition. Row locks alone do not prevent workers
  -- choosing different queued rows in one workspace from exceeding the cap.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('research-job-lease:global', 0)
  );

  -- Close orphaned provider attempts for every expired lease. Terminal work
  -- reconciles completed charges; indeterminate calls retain the estimate.
  for expired_job in
    select * from public.jobs where kind = 'research.collect'
      and state in ('leased','cancelling') and lease_expires_at < now()
    order by lease_expires_at for update skip locked limit 25
  loop
    perform 1 from public.provider_invocations where job_id = expired_job.id for update;
    select coalesce(sum(coalesce(credits, 0)) filter (where state <> 'started'), 0)::integer,
      coalesce(bool_or(state = 'started' or error_code in (
        'lease_expired_before_invocation_settlement',
        'worker_failure_before_invocation_settlement'
      )), false)
    into incurred_credits, had_uncertain_invocation
    from public.provider_invocations where job_id = expired_job.id;

    update public.provider_invocations set state = 'failed', actual_units = coalesce(actual_units, 0),
      credits = coalesce(credits, 0), error_code = 'lease_expired_before_invocation_settlement',
      completed_at = now(),
      duration_ms = greatest(0, floor(extract(epoch from (now() - started_at)) * 1000)::integer)
    where job_id = expired_job.id and state = 'started';

    if expired_job.state = 'cancelling' or expired_job.attempts >= expired_job.max_attempts then
      select * into reservation from public.research_credit_reservations
        where research_run_id = expired_job.research_run_id for update;
      if not found then raise exception 'credit_reservation_not_found'; end if;
      reconciled_credits := greatest(
        incurred_credits,
        case when had_uncertain_invocation then reservation.estimated_credits else 0 end
      );
      if reservation.state = 'reserved' then
        if reconciled_credits = 0 and not had_uncertain_invocation then
          update public.research_credit_reservations set state = 'released', actual_credits = 0,
            settled_at = now(), release_reason = 'lease_expired_without_incurred_usage'
          where id = reservation.id;
          insert into public.job_events(workspace_id, job_id, correlation_id, event_type, attempt, metadata)
          values (expired_job.workspace_id, expired_job.id, expired_job.correlation_id,
            'budget_released', expired_job.attempts,
            jsonb_build_object('reason', 'lease_expired_without_incurred_usage'));
        else
          update public.research_credit_reservations set state = 'settled',
            actual_credits = reconciled_credits, settled_at = now()
          where id = reservation.id;
          insert into public.usage_ledger(workspace_id, user_id, provider, operation, credits, correlation_id)
          select expired_job.workspace_id, r.requested_by, 'research', 'research.collect',
            reconciled_credits, expired_job.correlation_id
          from public.research_runs r
          where r.id = expired_job.research_run_id and r.workspace_id = expired_job.workspace_id;
          update public.research_runs set actual_credits = reconciled_credits
            where id = expired_job.research_run_id and workspace_id = expired_job.workspace_id;
          insert into public.job_events(workspace_id, job_id, correlation_id, event_type, attempt, metadata)
          values (expired_job.workspace_id, expired_job.id, expired_job.correlation_id,
            'budget_settled', expired_job.attempts,
            jsonb_build_object('actual_credits', reconciled_credits,
              'estimate_retained', had_uncertain_invocation));
        end if;
      end if;

      terminal_job_state := case when expired_job.state = 'cancelling' then 'cancelled' else 'dead_letter' end;
      terminal_run_state := case when expired_job.state = 'cancelling' then 'cancelled' else 'failed' end;
      terminal_event := case when expired_job.state = 'cancelling' then 'cancelled' else 'dead_lettered' end;
      update public.jobs set state = terminal_job_state,
        last_error = case when terminal_job_state = 'dead_letter' then 'lease_expired_at_max_attempts' else last_error end,
        lease_token = null, lease_expires_at = null, leased_by = null where id = expired_job.id;
      update public.research_runs set state = terminal_run_state,
        error_code = case when terminal_run_state = 'failed' then 'lease_expired_at_max_attempts' else null end,
        completed_at = now()
        where id = expired_job.research_run_id and workspace_id = expired_job.workspace_id;
      insert into public.job_events(workspace_id, job_id, correlation_id, event_type, attempt, metadata)
      values (expired_job.workspace_id, expired_job.id, expired_job.correlation_id,
        terminal_event, expired_job.attempts,
        jsonb_build_object('error_code',
          case when terminal_job_state = 'dead_letter' then 'lease_expired_at_max_attempts' else null end));
    end if;
  end loop;

  select j.* into leased_job from public.jobs j
  join public.approvals a on a.workspace_id = j.workspace_id and a.entity_type = 'research_plan'
    and a.entity_id = j.research_run_id and a.state = 'approved'
  where j.kind = 'research.collect' and j.cancellation_requested_at is null
    and ((j.state = 'queued' and j.available_at <= now()) or (j.state = 'leased' and j.lease_expires_at < now()))
    and j.attempts < j.max_attempts
    and not app_private.research_control_disabled(j.workspace_id, null)
    and (select count(*) from public.jobs active
      where active.state = 'leased' and active.lease_expires_at >= now())
      < coalesce((select max_concurrent from app_private.research_safety_limits
        where scope = 'global'), 10)
    and (select count(*) from public.jobs active
      where active.workspace_id = j.workspace_id and active.state = 'leased' and active.lease_expires_at >= now())
      < coalesce((select max_concurrent from app_private.research_safety_limits
        where scope = 'workspace' and workspace_id = j.workspace_id), 2)
  order by j.available_at, j.created_at for update of j skip locked limit 1;
  if not found then return null; end if;
  update public.jobs set state = 'leased', attempts = attempts + 1, leased_by = worker_id,
    lease_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => lease_seconds)
    where id = leased_job.id returning * into leased_job;
  update public.research_runs set state = 'running', started_at = coalesce(started_at, now()) where id = leased_job.research_run_id;
  insert into public.job_events(workspace_id, job_id, correlation_id, event_type, attempt, metadata)
  values (leased_job.workspace_id, leased_job.id, leased_job.correlation_id, 'leased', leased_job.attempts,
    jsonb_build_object('worker_id', worker_id, 'lease_expires_at', leased_job.lease_expires_at));
  return jsonb_build_object('id', leased_job.id, 'runId', leased_job.research_run_id,
    'workspaceId', leased_job.workspace_id, 'correlationId', leased_job.correlation_id,
    'state', 'leased', 'attempt', leased_job.attempts, 'maxAttempts', leased_job.max_attempts,
    'leaseToken', leased_job.lease_token, 'plan', leased_job.payload);
end;
$$;

create or replace function public.begin_provider_invocation(
  target_job_id uuid, target_lease_token uuid, target_provider text,
  target_operation text, target_requested_units integer, request_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_job public.jobs; existing public.provider_invocations; created public.provider_invocations;
  reservation public.research_credit_reservations;
  global_cap integer; provider_cap integer; workspace_cap integer;
  committed_credits integer;
  invocation_credit_bound integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if target_provider not in ('apify','firecrawl','youtube_api')
    or char_length(target_operation) not between 1 and 80
    or target_requested_units not between 1 and 25
    or char_length(request_idempotency_key) not between 8 and 160 then raise exception 'invalid_provider_invocation'; end if;
  select * into target_job from public.jobs where id = target_job_id for update;
  if not found or target_job.state <> 'leased' or target_job.lease_token <> target_lease_token
    or target_job.lease_expires_at < now() then raise exception 'lease_lost'; end if;
  if target_job.cancellation_requested_at is not null then raise exception 'research_cancellation_requested'; end if;
  if app_private.research_control_disabled(target_job.workspace_id, target_provider) then raise exception 'research_provider_disabled'; end if;

  -- This row lock serializes the approved budget across retries and concurrent starts.
  select * into reservation from public.research_credit_reservations
    where research_run_id = target_job.research_run_id for update;
  if not found or reservation.state <> 'reserved' then
    raise exception 'research_approval_budget_exhausted';
  end if;

  select * into existing from public.provider_invocations
    where workspace_id = target_job.workspace_id and idempotency_key = request_idempotency_key;
  if found then
    if existing.job_id <> target_job.id or existing.provider <> target_provider
      or existing.operation <> target_operation or existing.requested_units <> target_requested_units
      then raise exception 'provider_invocation_idempotency_conflict'; end if;
    return jsonb_build_object('id', existing.id, 'state', existing.state, 'created', false);
  end if;

  invocation_credit_bound := pg_catalog.ceil(target_requested_units / 5.0)::integer
    * case when target_job.payload->>'mode' = 'deep' then 2 else 1 end;
  select coalesce(sum(
    case when state = 'started'
      then pg_catalog.ceil(requested_units / 5.0)::integer
        * case when target_job.payload->>'mode' = 'deep' then 2 else 1 end
      else coalesce(credits, 0)
    end
  ), 0)::integer into committed_credits
  from public.provider_invocations where job_id = target_job.id;
  if committed_credits + invocation_credit_bound > reservation.estimated_credits then
    raise exception 'research_approval_budget_exhausted';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('provider-cap:global', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('provider-cap:' || target_provider, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('workspace-cap:' || target_job.workspace_id::text, 0));
  perform app_private.consume_provider_rate_limit(target_job.workspace_id, target_provider);
  select max_concurrent into global_cap from app_private.research_safety_limits where scope = 'global';
  select max_concurrent into provider_cap from app_private.research_safety_limits
    where scope = 'provider' and provider = target_provider;
  select max_concurrent into workspace_cap from app_private.research_safety_limits
    where scope = 'workspace' and workspace_id = target_job.workspace_id;
  if (select count(*) from public.provider_invocations where state = 'started') >= coalesce(global_cap, 10)
    then raise exception 'global_concurrency_limit_exceeded'; end if;
  if (select count(*) from public.provider_invocations where state = 'started' and provider = target_provider) >= coalesce(provider_cap, 5)
    then raise exception 'provider_concurrency_limit_exceeded'; end if;
  if (select count(*) from public.provider_invocations where state = 'started' and workspace_id = target_job.workspace_id) >= coalesce(workspace_cap, 2)
    then raise exception 'workspace_concurrency_limit_exceeded'; end if;

  insert into public.provider_invocations(workspace_id, research_run_id, job_id, provider, operation,
    requested_units, correlation_id, idempotency_key)
  values (target_job.workspace_id, target_job.research_run_id, target_job.id, target_provider,
    target_operation, target_requested_units, target_job.correlation_id, request_idempotency_key)
  returning * into created;
  return jsonb_build_object('id', created.id, 'state', created.state, 'created', true,
    'correlationId', created.correlation_id);
end;
$$;

create or replace function public.finish_provider_invocation(
  target_invocation_id uuid, target_state text, target_actual_units integer,
  target_credits integer default 0, target_provider_cost_usd numeric default null,
  target_error_code text default null, safe_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare target_invocation public.provider_invocations; target_job public.jobs; invocation_credit_bound integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if target_state not in ('succeeded','failed','cancelled') or target_actual_units not between 0 and 25
    or target_credits not between 0 and 1000000 or jsonb_typeof(safe_metadata) <> 'object'
    or app_private.jsonb_has_sensitive_key(safe_metadata)
    then raise exception 'invalid_invocation_result'; end if;
  select * into target_invocation from public.provider_invocations where id = target_invocation_id for update;
  if not found then raise exception 'provider_invocation_not_found'; end if;
  select * into target_job from public.jobs where id = target_invocation.job_id;
  if not found then raise exception 'provider_invocation_job_not_found'; end if;
  invocation_credit_bound := pg_catalog.ceil(target_invocation.requested_units / 5.0)::integer
    * case when target_job.payload->>'mode' = 'deep' then 2 else 1 end;
  if target_actual_units > target_invocation.requested_units
    or target_credits > invocation_credit_bound then
    raise exception 'provider_invocation_approved_bound_exceeded';
  end if;
  if target_invocation.state <> 'started' then
    if target_invocation.state = target_state and target_invocation.actual_units = target_actual_units
      and target_invocation.credits = target_credits then return; end if;
    raise exception 'provider_invocation_already_finished';
  end if;
  update public.provider_invocations set state = target_state, actual_units = target_actual_units,
    credits = target_credits, provider_cost_usd = target_provider_cost_usd,
    error_code = left(target_error_code, 200), metadata = safe_metadata, completed_at = now(),
    duration_ms = greatest(0, floor(extract(epoch from (now() - started_at)) * 1000)::integer)
    where id = target_invocation.id;
end;
$$;

create or replace function public.settle_research_usage(
  target_job_id uuid, target_lease_token uuid, target_actual_credits integer
) returns void language plpgsql security definer set search_path = '' as $$
declare
  target_job public.jobs;
  reservation public.research_credit_reservations;
  recorded_credits integer;
  reconciled_credits integer;
  had_uncertain_invocation boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if target_actual_credits not between 0 and 1000000 then raise exception 'invalid_actual_credits'; end if;
  select * into target_job from public.jobs where id = target_job_id for update;
  if not found or target_job.state not in ('leased','cancelling') or target_job.lease_token <> target_lease_token
    then raise exception 'lease_lost'; end if;
  select * into reservation from public.research_credit_reservations
    where research_run_id = target_job.research_run_id for update;
  if not found then raise exception 'credit_reservation_not_found'; end if;
  perform 1 from public.provider_invocations where job_id = target_job.id for update;
  select coalesce(sum(coalesce(credits, 0)) filter (where state <> 'started'), 0)::integer,
    coalesce(bool_or(state = 'started' or error_code in (
      'lease_expired_before_invocation_settlement',
      'worker_failure_before_invocation_settlement'
    )), false)
  into recorded_credits, had_uncertain_invocation
  from public.provider_invocations where job_id = target_job.id;
  reconciled_credits := greatest(
    target_actual_credits,
    recorded_credits,
    case when had_uncertain_invocation then reservation.estimated_credits else 0 end
  );
  if reservation.state = 'settled' then
    if reservation.actual_credits = reconciled_credits then return; end if;
    raise exception 'credit_settlement_conflict';
  end if;
  if reservation.state = 'released' then raise exception 'credit_reservation_released'; end if;
  update public.research_credit_reservations set state = 'settled', actual_credits = reconciled_credits,
    settled_at = now() where id = reservation.id;
  insert into public.usage_ledger(workspace_id, user_id, provider, operation, credits, correlation_id)
  select target_job.workspace_id, r.requested_by, 'research', 'research.collect', reconciled_credits,
    target_job.correlation_id from public.research_runs r
    where r.id = target_job.research_run_id and r.workspace_id = target_job.workspace_id;
  update public.research_runs set actual_credits = reconciled_credits
    where id = target_job.research_run_id and workspace_id = target_job.workspace_id;
  insert into public.job_events(workspace_id, job_id, correlation_id, event_type, attempt, metadata)
  values (target_job.workspace_id, target_job.id, target_job.correlation_id,
    'budget_settled', target_job.attempts,
    jsonb_build_object('actual_credits', reconciled_credits,
      'estimate_retained', had_uncertain_invocation));
end;
$$;

create or replace function public.research_cancellation_requested(target_job_id uuid, target_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target_job public.jobs;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into target_job from public.jobs where id = target_job_id;
  if not found or target_job.lease_token <> target_lease_token then raise exception 'lease_lost'; end if;
  return target_job.cancellation_requested_at is not null or target_job.state = 'cancelling';
end;
$$;

create or replace function public.acknowledge_research_cancellation(
  target_job_id uuid, target_lease_token uuid, target_actual_credits integer default 0
) returns void language plpgsql security definer set search_path = '' as $$
declare target_job public.jobs;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into target_job from public.jobs where id = target_job_id for update;
  if not found or target_job.state <> 'cancelling' or target_job.lease_token <> target_lease_token
    then raise exception 'lease_lost'; end if;
  perform public.settle_research_usage(target_job_id, target_lease_token, target_actual_credits);
  update public.jobs set state = 'cancelled', lease_token = null, lease_expires_at = null,
    leased_by = null where id = target_job.id;
  update public.research_runs set state = 'cancelled', completed_at = now(), error_code = null
    where id = target_job.research_run_id;
  insert into public.job_events(workspace_id, job_id, correlation_id, event_type, attempt, metadata)
  values (target_job.workspace_id, target_job.id, target_job.correlation_id, 'cancelled', target_job.attempts,
    jsonb_build_object('actual_credits', target_actual_credits));
end;
$$;

-- Existing workers remain compatible: acknowledgement/failure settle the
-- reservation to the estimated amount until the worker adopts explicit usage.
create or replace function public.ack_research_job(target_job_id uuid, target_lease_token uuid, normalized_sources jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare target_job public.jobs; reservation public.research_credit_reservations;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into target_job from public.jobs where id = target_job_id for update;
  if not found or target_job.state <> 'leased' or target_job.lease_token <> target_lease_token
    or target_job.lease_expires_at < now() then raise exception 'lease_lost'; end if;
  if target_job.cancellation_requested_at is not null then raise exception 'research_cancellation_requested'; end if;
  if jsonb_typeof(normalized_sources) <> 'array' or jsonb_array_length(normalized_sources) > 25 then raise exception 'invalid_normalized_sources'; end if;
  insert into public.research_sources(workspace_id, research_run_id, provider, source_type, url, title, content, provenance, captured_at)
  select target_job.workspace_id, target_job.research_run_id, source.provider, source.source_type,
    source.url, source.title, source.content, source.provenance, source.captured_at
  from jsonb_to_recordset(normalized_sources) as source(
    provider text, source_type text, url text, title text, content text, provenance jsonb, captured_at timestamptz
  );
  select * into reservation from public.research_credit_reservations
    where research_run_id = target_job.research_run_id for update;
  if not found then raise exception 'credit_reservation_not_found'; end if;
  if reservation.state = 'reserved' then
    perform public.settle_research_usage(target_job.id, target_lease_token, reservation.estimated_credits);
  elsif reservation.state = 'released' then
    raise exception 'credit_reservation_released';
  end if;
  update public.jobs set state = 'completed', lease_token = null, lease_expires_at = null, leased_by = null where id = target_job.id;
  update public.research_runs set state = 'completed', completed_at = now(), error_code = null where id = target_job.research_run_id;
  insert into public.job_events(workspace_id, job_id, correlation_id, event_type, attempt, metadata)
  values (target_job.workspace_id, target_job.id, target_job.correlation_id, 'acknowledged', target_job.attempts,
    jsonb_build_object('source_count', jsonb_array_length(normalized_sources)));
end;
$$;

create or replace function public.fail_research_job(
  target_job_id uuid, target_lease_token uuid, failure_code text, is_retryable boolean
) returns text language plpgsql security definer set search_path = '' as $$
declare target_job public.jobs; next_state text; incurred_credits integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into target_job from public.jobs where id = target_job_id for update;
  if not found or target_job.state not in ('leased','cancelling') or target_job.lease_token <> target_lease_token
    then raise exception 'lease_lost'; end if;
  update public.provider_invocations set state = 'failed', actual_units = coalesce(actual_units, 0),
    credits = coalesce(credits, 0), error_code = 'worker_failure_before_invocation_settlement',
    completed_at = now(),
    duration_ms = greatest(0, floor(extract(epoch from (now() - started_at)) * 1000)::integer)
  where job_id = target_job.id and state = 'started';
  if target_job.state = 'cancelling' then
    select coalesce(sum(credits), 0)::integer into incurred_credits
      from public.provider_invocations where job_id = target_job.id and state <> 'started';
    perform public.acknowledge_research_cancellation(target_job.id, target_lease_token, incurred_credits);
    return 'cancelled';
  end if;
  next_state := case when is_retryable and target_job.attempts < target_job.max_attempts then 'queued' else 'dead_letter' end;
  if next_state = 'dead_letter' then
    select coalesce(sum(credits), 0)::integer into incurred_credits
      from public.provider_invocations where job_id = target_job.id and state <> 'started';
    perform public.settle_research_usage(target_job.id, target_lease_token, incurred_credits);
  end if;
  update public.jobs set state = next_state, last_error = left(failure_code, 200),
    available_at = case when next_state = 'queued' then now() + make_interval(secs => least(300, (power(2, attempts) * 5)::integer)) else available_at end,
    lease_token = null, lease_expires_at = null, leased_by = null where id = target_job.id;
  update public.research_runs set state = case when next_state = 'queued' then 'queued' else 'failed' end,
    error_code = left(failure_code, 200), completed_at = case when next_state = 'dead_letter' then now() else completed_at end
    where id = target_job.research_run_id;
  insert into public.job_events(workspace_id, job_id, correlation_id, event_type, attempt, metadata)
  values (target_job.workspace_id, target_job.id, target_job.correlation_id,
    case when next_state = 'queued' then 'retry_scheduled' else 'dead_lettered' end,
    target_job.attempts, jsonb_build_object('error_code', left(failure_code, 200)));
  return next_state;
end;
$$;

revoke all on function public.decide_research_approval(uuid,text,text) from public, anon;
grant execute on function public.decide_research_approval(uuid,text,text) to authenticated;
revoke all on function public.cancel_research_run(uuid,text) from public, anon;
grant execute on function public.cancel_research_run(uuid,text) to authenticated;

revoke all on function public.lease_research_job(text,integer),
  public.begin_provider_invocation(uuid,uuid,text,text,integer,text),
  public.finish_provider_invocation(uuid,text,integer,integer,numeric,text,jsonb),
  public.settle_research_usage(uuid,uuid,integer),
  public.research_cancellation_requested(uuid,uuid),
  public.acknowledge_research_cancellation(uuid,uuid,integer),
  public.ack_research_job(uuid,uuid,jsonb),
  public.fail_research_job(uuid,uuid,text,boolean)
from public, anon, authenticated;
grant execute on function public.lease_research_job(text,integer),
  public.begin_provider_invocation(uuid,uuid,text,text,integer,text),
  public.finish_provider_invocation(uuid,text,integer,integer,numeric,text,jsonb),
  public.settle_research_usage(uuid,uuid,integer),
  public.research_cancellation_requested(uuid,uuid),
  public.acknowledge_research_cancellation(uuid,uuid,integer),
  public.ack_research_job(uuid,uuid,jsonb),
  public.fail_research_job(uuid,uuid,text,boolean)
to service_role;

revoke all on function app_private.jsonb_has_sensitive_key(jsonb),
  app_private.research_control_disabled(uuid,text),
  app_private.consume_research_rate_limit(uuid,uuid),
  app_private.consume_provider_rate_limit(uuid,text)
from public, anon, authenticated;

commit;
