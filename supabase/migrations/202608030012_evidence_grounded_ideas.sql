-- Evidence-grounded idea generation. Generation writes are service-owned;
-- tenant members may read ideas and use narrow, audited lifecycle RPCs only.

create table public.idea_generation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  research_run_id uuid not null,
  requested_by uuid not null references public.profiles(id),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  state text not null default 'generating' check (state in ('generating','completed','failed')),
  max_ideas integer not null check (max_ideas between 1 and 10),
  model_version text not null check (char_length(model_version) between 1 and 100),
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  error_code text check (error_code is null or char_length(error_code) between 1 and 100),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, idempotency_key),
  unique (workspace_id, research_run_id, id),
  constraint idea_generation_runs_research_fk foreign key (workspace_id, research_run_id)
    references public.research_runs(workspace_id, id) on delete cascade,
  constraint idea_generation_runs_terminal_consistency check (
    (state = 'generating' and completed_at is null and error_code is null)
    or (state = 'completed' and completed_at is not null and error_code is null)
    or (state = 'failed' and completed_at is not null and error_code is not null)
  )
);

alter table public.research_sources
  add constraint research_sources_workspace_run_id_key unique (workspace_id, research_run_id, id);

alter table public.ideas
  add column generation_run_id uuid,
  add column demand_score numeric(5,2),
  add column relevance_score numeric(5,2),
  add column competition_score numeric(5,2),
  add column confidence_score numeric(5,2),
  add column provenance jsonb not null default '{}'::jsonb,
  add column model_version text,
  add column prompt_version text,
  add constraint ideas_workspace_research_generation_fk
    foreign key (workspace_id, research_run_id, generation_run_id)
    references public.idea_generation_runs(workspace_id, research_run_id, id) on delete restrict,
  add constraint ideas_workspace_run_generation_id_key
    unique (workspace_id, research_run_id, generation_run_id, id),
  add constraint ideas_generated_fields_complete check (
    generation_run_id is null or (
      research_run_id is not null
      and demand_score between 0 and 100
      and relevance_score between 0 and 100
      and competition_score between 0 and 100
      and confidence_score between 0 and 100
      and score between 0 and 100
      and jsonb_typeof(provenance) = 'object'
      and char_length(model_version) between 1 and 100
      and char_length(prompt_version) between 1 and 100
    )
  );

create table public.idea_evidence (
  workspace_id uuid not null,
  research_run_id uuid not null,
  generation_run_id uuid not null,
  idea_id uuid not null,
  research_source_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (idea_id, research_source_id),
  constraint idea_evidence_idea_fk foreign key
    (workspace_id, research_run_id, generation_run_id, idea_id)
    references public.ideas(workspace_id, research_run_id, generation_run_id, id) on delete cascade,
  constraint idea_evidence_source_fk foreign key
    (workspace_id, research_run_id, research_source_id)
    references public.research_sources(workspace_id, research_run_id, id) on delete restrict
);

create index idea_generation_runs_workspace_created_idx
  on public.idea_generation_runs(workspace_id, created_at desc, id desc);
create index idea_generation_runs_research_idx
  on public.idea_generation_runs(workspace_id, research_run_id, created_at desc);
create index ideas_generation_run_idx on public.ideas(generation_run_id, created_at, id);
create index idea_evidence_source_idx on public.idea_evidence(research_source_id);

alter table public.idea_generation_runs enable row level security;
alter table public.idea_evidence enable row level security;
create policy idea_generation_runs_member_select on public.idea_generation_runs
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy idea_evidence_member_select on public.idea_evidence
  for select to authenticated using (app_private.is_workspace_member(workspace_id));

drop policy if exists ideas_editor_write on public.ideas;
revoke insert, update, delete on public.ideas from anon, authenticated;
revoke all on public.idea_generation_runs, public.idea_evidence from anon, authenticated;
grant select on public.idea_generation_runs, public.idea_evidence to authenticated;
grant select on public.idea_generation_runs, public.idea_evidence, public.ideas to service_role;

create function public.begin_idea_generation(
  target_workspace_id uuid,
  target_research_run_id uuid,
  target_requested_by uuid,
  request_idempotency_key text,
  request_max_ideas integer,
  request_model_version text,
  request_prompt_version text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare source_run public.research_runs%rowtype;
declare existing public.idea_generation_runs%rowtype;
declare created public.idea_generation_runs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if char_length(request_idempotency_key) not between 8 and 128
    or request_max_ideas not between 1 and 10
    or char_length(request_model_version) not between 1 and 100
    or char_length(request_prompt_version) not between 1 and 100
  then raise exception 'invalid_idea_generation_request' using errcode='22023'; end if;
  if not exists (select 1 from public.workspace_members where workspace_id=target_workspace_id
    and user_id=target_requested_by and role in ('owner','admin','editor'))
  then raise exception 'idea_generation_forbidden' using errcode='42501'; end if;
  select * into source_run from public.research_runs where id=target_research_run_id
    and workspace_id=target_workspace_id;
  if not found or source_run.state <> 'completed'
    or not exists (select 1 from public.research_sources where workspace_id=target_workspace_id
      and research_run_id=target_research_run_id)
  then raise exception 'completed_research_required' using errcode='P0001'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'idea-generation:' || target_workspace_id::text || ':' || request_idempotency_key, 0));
  select * into existing from public.idea_generation_runs where workspace_id=target_workspace_id
    and idempotency_key=request_idempotency_key;
  if found then
    if existing.research_run_id <> target_research_run_id or existing.requested_by <> target_requested_by
      or existing.max_ideas <> request_max_ideas or existing.model_version <> request_model_version
      or existing.prompt_version <> request_prompt_version
    then raise exception 'idea_generation_idempotency_conflict' using errcode='P0001'; end if;
    return jsonb_build_object('id',existing.id,'workspaceId',existing.workspace_id,
      'researchRunId',existing.research_run_id,'state',existing.state,'created',false);
  end if;
  insert into public.idea_generation_runs(workspace_id,research_run_id,requested_by,idempotency_key,
    max_ideas,model_version,prompt_version)
  values(target_workspace_id,target_research_run_id,target_requested_by,request_idempotency_key,
    request_max_ideas,request_model_version,request_prompt_version) returning * into created;
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_workspace_id,target_requested_by,'ideas.generation_started','idea_generation_run',created.id::text,
    jsonb_build_object('research_run_id',target_research_run_id,'max_ideas',request_max_ideas,
      'model_version',request_model_version,'prompt_version',request_prompt_version));
  return jsonb_build_object('id',created.id,'workspaceId',created.workspace_id,
    'researchRunId',created.research_run_id,'state',created.state,'created',true);
end $$;

create function public.persist_generated_ideas(
  target_generation_run_id uuid,
  generated_ideas jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare generation public.idea_generation_runs%rowtype;
declare candidate jsonb;
declare evidence_value text;
declare new_idea public.ideas%rowtype;
declare idea_count integer;
declare citation_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  select * into generation from public.idea_generation_runs where id=target_generation_run_id for update;
  if not found then raise exception 'idea_generation_not_found' using errcode='P0001'; end if;
  if generation.state = 'completed' then
    return jsonb_build_object('generationRunId',generation.id,'state','completed','created',false,
      'ideaCount',(select count(*) from public.ideas where generation_run_id=generation.id));
  end if;
  if generation.state <> 'generating' then raise exception 'idea_generation_not_active' using errcode='P0001'; end if;
  if not exists (select 1 from public.research_runs where id=generation.research_run_id
    and workspace_id=generation.workspace_id and state='completed')
  then raise exception 'completed_research_required' using errcode='P0001'; end if;
  if jsonb_typeof(generated_ideas) <> 'array' then raise exception 'invalid_generated_ideas' using errcode='22023'; end if;
  idea_count := jsonb_array_length(generated_ideas);
  if idea_count < 1 or idea_count > generation.max_ideas then raise exception 'invalid_generated_ideas' using errcode='22023'; end if;

  for candidate in select value from jsonb_array_elements(generated_ideas) loop
    if jsonb_typeof(candidate) <> 'object'
      or char_length(trim(candidate->>'title')) not between 3 and 160
      or char_length(trim(candidate->>'premise')) not between 10 and 2000
      or jsonb_typeof(candidate->'evidenceSourceIds') <> 'array'
      or jsonb_array_length(candidate->'evidenceSourceIds') not between 1 and 10
      or (candidate->>'demandScore')::numeric not between 0 and 100
      or (candidate->>'relevanceScore')::numeric not between 0 and 100
      or (candidate->>'competitionScore')::numeric not between 0 and 100
      or (candidate->>'confidenceScore')::numeric not between 0 and 100
    then raise exception 'invalid_generated_ideas' using errcode='22023'; end if;

    select count(distinct value) into citation_count from jsonb_array_elements_text(candidate->'evidenceSourceIds');
    if citation_count <> jsonb_array_length(candidate->'evidenceSourceIds')
      or citation_count <> (select count(*) from public.research_sources s
        where s.workspace_id=generation.workspace_id and s.research_run_id=generation.research_run_id
          and s.id in (select value::uuid from jsonb_array_elements_text(candidate->'evidenceSourceIds')))
    then raise exception 'invalid_idea_evidence' using errcode='P0001'; end if;

    insert into public.ideas(workspace_id,project_id,research_run_id,generation_run_id,title,premise,
      score,scoring_reason,status,demand_score,relevance_score,competition_score,confidence_score,
      provenance,model_version,prompt_version)
    select generation.workspace_id,r.project_id,generation.research_run_id,generation.id,
      trim(candidate->>'title'),trim(candidate->>'premise'),
      round(((candidate->>'demandScore')::numeric * .30 + (candidate->>'relevanceScore')::numeric * .30
        + (100-(candidate->>'competitionScore')::numeric) * .15 + (candidate->>'confidenceScore')::numeric * .25),2),
      jsonb_build_object('demand',candidate->>'demandReason','relevance',candidate->>'relevanceReason',
        'competition',candidate->>'competitionReason','confidence',candidate->>'confidenceReason',
        'method','weighted-v1'),'candidate',
      (candidate->>'demandScore')::numeric,(candidate->>'relevanceScore')::numeric,
      (candidate->>'competitionScore')::numeric,(candidate->>'confidenceScore')::numeric,
      jsonb_build_object('research_run_id',generation.research_run_id,'evidence_count',citation_count),
      generation.model_version,generation.prompt_version
    from public.research_runs r where r.id=generation.research_run_id returning * into new_idea;

    for evidence_value in select value from jsonb_array_elements_text(candidate->'evidenceSourceIds') loop
      insert into public.idea_evidence(workspace_id,research_run_id,generation_run_id,idea_id,research_source_id)
      values(generation.workspace_id,generation.research_run_id,generation.id,new_idea.id,evidence_value::uuid);
    end loop;
  end loop;
  update public.idea_generation_runs set state='completed',completed_at=now() where id=generation.id;
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(generation.workspace_id,generation.requested_by,'ideas.generation_completed','idea_generation_run',generation.id::text,
    jsonb_build_object('idea_count',idea_count,'research_run_id',generation.research_run_id));
  return jsonb_build_object('generationRunId',generation.id,'state','completed','created',true,'ideaCount',idea_count);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid_generated_ideas' using errcode='22023';
end $$;

create function public.fail_idea_generation(target_generation_run_id uuid, failure_code text)
returns void language plpgsql security definer set search_path='' as $$
declare generation public.idea_generation_runs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if char_length(failure_code) not between 1 and 100 then raise exception 'invalid_failure_code' using errcode='22023'; end if;
  select * into generation from public.idea_generation_runs where id=target_generation_run_id for update;
  if not found or generation.state <> 'generating' then raise exception 'idea_generation_not_active' using errcode='P0001'; end if;
  update public.idea_generation_runs set state='failed',error_code=failure_code,completed_at=now() where id=generation.id;
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(generation.workspace_id,generation.requested_by,'ideas.generation_failed','idea_generation_run',generation.id::text,
    jsonb_build_object('error_code',failure_code));
end $$;

create function public.transition_idea_state(target_idea_id uuid, target_state text, transition_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.ideas%rowtype;
declare actor_role text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into target from public.ideas where id=target_idea_id for update;
  if not found then raise exception 'idea_transition_forbidden' using errcode='42501'; end if;
  select role into actor_role from public.workspace_members where workspace_id=target.workspace_id and user_id=auth.uid();
  if actor_role is null or actor_role not in ('owner','admin','editor') then raise exception 'idea_transition_forbidden' using errcode='42501'; end if;
  if target_state='approved' and actor_role not in ('owner','admin') then raise exception 'idea_approval_forbidden' using errcode='42501'; end if;
  if not ((target.status='candidate' and target_state in ('shortlisted','rejected','archived'))
    or (target.status='shortlisted' and target_state in ('approved','rejected','archived'))
    or (target.status in ('approved','rejected') and target_state='archived'))
  then raise exception 'invalid_idea_transition' using errcode='P0001'; end if;
  update public.ideas set status=target_state,updated_at=now() where id=target.id;
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.workspace_id,auth.uid(),'idea.state_changed','idea',target.id::text,
    jsonb_build_object('from',target.status,'to',target_state,'note',left(transition_note,500)));
  return jsonb_build_object('ideaId',target.id,'workspaceId',target.workspace_id,'state',target_state,'updatedAt',now());
end $$;

revoke all on function public.begin_idea_generation(uuid,uuid,uuid,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.persist_generated_ideas(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.fail_idea_generation(uuid,text) from public,anon,authenticated;
grant execute on function public.begin_idea_generation(uuid,uuid,uuid,text,integer,text,text) to service_role;
grant execute on function public.persist_generated_ideas(uuid,jsonb) to service_role;
grant execute on function public.fail_idea_generation(uuid,text) to service_role;
revoke all on function public.transition_idea_state(uuid,text,text) from public,anon;
grant execute on function public.transition_idea_state(uuid,text,text) to authenticated;
