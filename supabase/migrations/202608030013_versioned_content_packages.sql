-- Immutable, evidence-grounded content-package versions with append-only approval history.

alter table public.ideas
  add constraint ideas_workspace_id_key unique (workspace_id, id),
  add constraint ideas_workspace_research_id_key unique (workspace_id, research_run_id, id);

alter table public.content_packages
  add column research_run_id uuid,
  add column source_package_id uuid,
  add column idempotency_key text,
  add column model_version text,
  add column prompt_version text;

update public.content_packages p set research_run_id=i.research_run_id
from public.ideas i where i.id=p.idea_id and i.workspace_id=p.workspace_id;

alter table public.content_packages
  add constraint content_packages_workspace_idea_fk foreign key (workspace_id,idea_id)
    references public.ideas(workspace_id,id) on delete cascade,
  add constraint content_packages_workspace_research_idea_fk foreign key (workspace_id,research_run_id,idea_id)
    references public.ideas(workspace_id,research_run_id,id) on delete restrict,
  add constraint content_packages_source_fk foreign key (workspace_id,idea_id,source_package_id)
    references public.content_packages(workspace_id,idea_id,id) on delete restrict,
  add constraint content_packages_source_not_self check (source_package_id is null or source_package_id<>id),
  add constraint content_packages_idempotency_length check (idempotency_key is null or char_length(idempotency_key) between 8 and 128),
  add constraint content_packages_generation_metadata check (
    idempotency_key is null or (research_run_id is not null
      and model_version is not null and prompt_version is not null
      and char_length(model_version) between 1 and 100
      and char_length(prompt_version) between 1 and 100)
  ),
  add constraint content_packages_workspace_id_key unique(workspace_id,id),
  add constraint content_packages_workspace_idea_id_key unique(workspace_id,idea_id,id),
  add constraint content_packages_workspace_research_id_key unique(workspace_id,research_run_id,id),
  add constraint content_packages_workspace_idempotency_key unique(workspace_id,idempotency_key);

create table public.content_package_evidence (
  workspace_id uuid not null,
  research_run_id uuid not null,
  content_package_id uuid not null,
  research_source_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(content_package_id,research_source_id),
  constraint content_package_evidence_package_fk foreign key(workspace_id,research_run_id,content_package_id)
    references public.content_packages(workspace_id,research_run_id,id) on delete cascade,
  constraint content_package_evidence_source_fk foreign key(workspace_id,research_run_id,research_source_id)
    references public.research_sources(workspace_id,research_run_id,id) on delete restrict
);

create index content_packages_workspace_idea_version_idx
  on public.content_packages(workspace_id,idea_id,version desc);
create index content_packages_workspace_state_idx
  on public.content_packages(workspace_id,state,updated_at desc);
create index content_package_evidence_source_idx on public.content_package_evidence(research_source_id);

alter table public.content_package_evidence enable row level security;
create policy content_package_evidence_member_select on public.content_package_evidence
  for select to authenticated using(app_private.is_workspace_member(workspace_id));

drop policy if exists content_packages_editor_insert on public.content_packages;
drop policy if exists content_packages_editor_update on public.content_packages;
drop policy if exists content_packages_editor_delete on public.content_packages;
revoke insert,update,delete on public.content_packages from anon,authenticated;
revoke all on public.content_package_evidence from anon,authenticated;
grant select on public.content_package_evidence to authenticated;
grant select on public.content_packages,public.content_package_evidence to service_role;

create function app_private.protect_content_package_version()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'content_package_history_is_immutable'; end if;
  if row(new.id,new.workspace_id,new.idea_id,new.research_run_id,new.version,new.titles,new.thumbnail_concepts,
      new.hooks,new.outline,new.script,new.citations,new.created_by,new.created_at,new.source_package_id,
      new.idempotency_key,new.model_version,new.prompt_version)
    is distinct from
    row(old.id,old.workspace_id,old.idea_id,old.research_run_id,old.version,old.titles,old.thumbnail_concepts,
      old.hooks,old.outline,old.script,old.citations,old.created_by,old.created_at,old.source_package_id,
      old.idempotency_key,old.model_version,old.prompt_version)
  then raise exception 'content_package_version_is_immutable'; end if;
  if not ((old.state='draft' and new.state='awaiting_approval')
    or (old.state='awaiting_approval' and new.state in ('approved','rejected')))
  then raise exception 'invalid_content_package_transition'; end if;
  return new;
end $$;

create trigger protect_content_package_version before update or delete on public.content_packages
for each row execute function app_private.protect_content_package_version();

create function public.create_content_package_version(
  target_workspace_id uuid,target_idea_id uuid,target_requested_by uuid,
  request_idempotency_key text,request_model_version text,request_prompt_version text,
  generated_package jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target_idea public.ideas%rowtype;
declare existing public.content_packages%rowtype;
declare created public.content_packages%rowtype;
declare next_version integer;
declare citation_count integer;
declare citation text;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if request_idempotency_key is null or request_model_version is null or request_prompt_version is null
    or char_length(request_idempotency_key) not between 8 and 128
    or char_length(request_model_version) not between 1 and 100
    or char_length(request_prompt_version) not between 1 and 100
  then raise exception 'invalid_content_package_request' using errcode='22023'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=target_workspace_id
    and user_id=target_requested_by and role in('owner','admin','editor'))
  then raise exception 'content_package_forbidden' using errcode='42501'; end if;
  select * into target_idea from public.ideas where id=target_idea_id and workspace_id=target_workspace_id for share;
  if not found or target_idea.status<>'approved' or target_idea.research_run_id is null
  then raise exception 'approved_idea_required' using errcode='P0001'; end if;
  if jsonb_typeof(generated_package)<>'object'
    or not (generated_package ?& array['titles','thumbnailConcepts','hooks','outline','script','citations'])
    or jsonb_typeof(generated_package->'titles')<>'array' or jsonb_array_length(generated_package->'titles') not between 1 and 10
    or jsonb_typeof(generated_package->'thumbnailConcepts')<>'array' or jsonb_array_length(generated_package->'thumbnailConcepts') not between 1 and 6
    or jsonb_typeof(generated_package->'hooks')<>'array' or jsonb_array_length(generated_package->'hooks') not between 1 and 10
    or jsonb_typeof(generated_package->'outline')<>'array' or jsonb_array_length(generated_package->'outline') not between 3 and 20
    or char_length(generated_package->>'script') not between 100 and 30000
    or jsonb_typeof(generated_package->'citations')<>'array' or jsonb_array_length(generated_package->'citations') not between 1 and 10
    or exists(select 1 from jsonb_array_elements_text(generated_package->'titles') x where char_length(trim(x)) not between 5 and 120)
    or exists(select 1 from jsonb_array_elements_text(generated_package->'hooks') x where char_length(trim(x)) not between 5 and 300)
  then raise exception 'invalid_generated_content_package' using errcode='22023'; end if;
  select count(distinct value) into citation_count from jsonb_array_elements_text(generated_package->'citations');
  if citation_count<>jsonb_array_length(generated_package->'citations')
    or citation_count<>(select count(*) from public.research_sources s where s.workspace_id=target_workspace_id
      and s.research_run_id=target_idea.research_run_id
      and s.id in(select value::uuid from jsonb_array_elements_text(generated_package->'citations')))
  then raise exception 'invalid_content_package_evidence' using errcode='P0001'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('content-package:'||target_workspace_id::text||':'||target_idea_id::text,0));
  select * into existing from public.content_packages where workspace_id=target_workspace_id
    and idempotency_key=request_idempotency_key;
  if found then
    if existing.idea_id<>target_idea_id or existing.source_package_id is not null
      or existing.model_version<>request_model_version
      or existing.prompt_version<>request_prompt_version
    then raise exception 'content_package_idempotency_conflict' using errcode='P0001'; end if;
    return jsonb_build_object('packageId',existing.id,'workspaceId',existing.workspace_id,'ideaId',existing.idea_id,
      'version',existing.version,'state',existing.state,'created',false);
  end if;
  select coalesce(max(version),0)+1 into next_version from public.content_packages
    where workspace_id=target_workspace_id and idea_id=target_idea_id;
  insert into public.content_packages(workspace_id,idea_id,research_run_id,version,state,titles,thumbnail_concepts,
    hooks,outline,script,citations,created_by,idempotency_key,model_version,prompt_version)
  values(target_workspace_id,target_idea_id,target_idea.research_run_id,next_version,'draft',
    generated_package->'titles',generated_package->'thumbnailConcepts',generated_package->'hooks',
    generated_package->'outline',generated_package->>'script',generated_package->'citations',target_requested_by,
    request_idempotency_key,request_model_version,request_prompt_version) returning * into created;
  for citation in select value from jsonb_array_elements_text(generated_package->'citations') loop
    insert into public.content_package_evidence(workspace_id,research_run_id,content_package_id,research_source_id)
    values(target_workspace_id,target_idea.research_run_id,created.id,citation::uuid);
  end loop;
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_workspace_id,target_requested_by,'content_package.version_created','content_package',created.id::text,
    jsonb_build_object('idea_id',target_idea_id,'version',next_version,'evidence_count',citation_count,
      'model_version',request_model_version,'prompt_version',request_prompt_version));
  return jsonb_build_object('packageId',created.id,'workspaceId',created.workspace_id,'ideaId',created.idea_id,
    'version',created.version,'state',created.state,'created',true);
exception when invalid_text_representation then
  raise exception 'invalid_generated_content_package' using errcode='22023';
end $$;

create function public.request_content_package_approval(target_package_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare package public.content_packages%rowtype;
declare actor_role text;
declare approval public.approvals%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into package from public.content_packages where id=target_package_id for update;
  if not found then raise exception 'content_package_forbidden' using errcode='42501'; end if;
  select role into actor_role from public.workspace_members where workspace_id=package.workspace_id and user_id=auth.uid();
  if actor_role is null or actor_role not in('owner','admin','editor') then raise exception 'content_package_forbidden' using errcode='42501'; end if;
  if package.state<>'draft' then raise exception 'content_package_not_draft' using errcode='P0001'; end if;
  insert into public.approvals(workspace_id,entity_type,entity_id,state,risk_summary,estimated_credits,requested_by)
  values(package.workspace_id,'content_package',package.id,'pending',
    format('Review content package version %s before approval.',package.version),0,auth.uid()) returning * into approval;
  update public.content_packages set state='awaiting_approval',updated_at=now() where id=package.id;
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(package.workspace_id,auth.uid(),'content_package.approval_requested','content_package',package.id::text,
    jsonb_build_object('approval_id',approval.id,'version',package.version));
  return jsonb_build_object('approvalId',approval.id,'packageId',package.id,'workspaceId',package.workspace_id,
    'state','pending','requestedAt',approval.requested_at);
end $$;

create function app_private.copy_content_package_version(source public.content_packages, revision_key text, actor uuid)
returns public.content_packages language plpgsql security definer set search_path='' as $$
declare existing public.content_packages%rowtype;
declare created public.content_packages%rowtype;
declare next_version integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('content-package:'||source.workspace_id::text||':'||source.idea_id::text,0));
  select * into existing from public.content_packages where workspace_id=source.workspace_id and idempotency_key=revision_key;
  if found then
    if existing.source_package_id is distinct from source.id then raise exception 'content_package_idempotency_conflict'; end if;
    return existing;
  end if;
  select coalesce(max(version),0)+1 into next_version from public.content_packages
    where workspace_id=source.workspace_id and idea_id=source.idea_id;
  insert into public.content_packages(workspace_id,idea_id,research_run_id,source_package_id,version,state,titles,
    thumbnail_concepts,hooks,outline,script,citations,created_by,idempotency_key,model_version,prompt_version)
  values(source.workspace_id,source.idea_id,source.research_run_id,source.id,next_version,'draft',source.titles,
    source.thumbnail_concepts,source.hooks,source.outline,source.script,source.citations,actor,revision_key,
    source.model_version,source.prompt_version) returning * into created;
  insert into public.content_package_evidence(workspace_id,research_run_id,content_package_id,research_source_id)
  select workspace_id,research_run_id,created.id,research_source_id from public.content_package_evidence
    where content_package_id=source.id;
  return created;
end $$;

create function public.decide_content_package_approval(target_approval_id uuid,approval_decision text,approval_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare approval public.approvals%rowtype;
declare package public.content_packages%rowtype;
declare actor_role text;
declare next_draft public.content_packages%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if approval_decision not in('approved','rejected') then raise exception 'invalid_approval_decision' using errcode='22023'; end if;
  select * into approval from public.approvals where id=target_approval_id and entity_type='content_package' for update;
  if not found then raise exception 'content_package_approval_forbidden' using errcode='42501'; end if;
  select role into actor_role from public.workspace_members where workspace_id=approval.workspace_id and user_id=auth.uid();
  if actor_role is null or actor_role not in('owner','admin') then raise exception 'content_package_approval_forbidden' using errcode='42501'; end if;
  if approval.state<>'pending' then raise exception 'approval_not_pending' using errcode='P0001'; end if;
  select * into package from public.content_packages where id=approval.entity_id and workspace_id=approval.workspace_id for update;
  if not found or package.state<>'awaiting_approval' then raise exception 'content_package_approval_invalid' using errcode='P0001'; end if;
  update public.approvals set state=approval_decision,decided_by=auth.uid(),decision_note=left(approval_note,500),decided_at=now()
    where id=approval.id;
  update public.content_packages set state=approval_decision,updated_at=now() where id=package.id;
  if approval_decision='rejected' then
    next_draft:=app_private.copy_content_package_version(package,'rejected:'||approval.id::text,auth.uid());
  end if;
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  values(package.workspace_id,auth.uid(),'content_package.'||approval_decision,'content_package',package.id::text,
    jsonb_build_object('approval_id',approval.id,'version',package.version,'next_draft_id',next_draft.id));
  return jsonb_build_object('approvalId',approval.id,'packageId',package.id,'workspaceId',package.workspace_id,
    'state',approval_decision,'decidedAt',now(),'nextDraftId',next_draft.id);
end $$;

create function public.create_next_content_package_version(target_package_id uuid,request_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source public.content_packages%rowtype;
declare actor_role text;
declare created public.content_packages%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if char_length(request_idempotency_key) not between 8 and 128 then raise exception 'invalid_content_package_request' using errcode='22023'; end if;
  select * into source from public.content_packages where id=target_package_id;
  if not found then raise exception 'content_package_forbidden' using errcode='42501'; end if;
  select role into actor_role from public.workspace_members where workspace_id=source.workspace_id and user_id=auth.uid();
  if actor_role is null or actor_role not in('owner','admin','editor') then raise exception 'content_package_forbidden' using errcode='42501'; end if;
  if source.state not in('approved','rejected') or source.model_version is null or source.prompt_version is null
  then raise exception 'content_package_not_versionable' using errcode='P0001'; end if;
  created:=app_private.copy_content_package_version(source,request_idempotency_key,auth.uid());
  insert into public.audit_events(workspace_id,actor_id,action,entity_type,entity_id,metadata)
  select source.workspace_id,auth.uid(),'content_package.next_version_created','content_package',created.id::text,
    jsonb_build_object('source_package_id',source.id,'version',created.version)
  where not exists(select 1 from public.audit_events where workspace_id=source.workspace_id
    and action='content_package.next_version_created' and entity_id=created.id::text);
  return jsonb_build_object('packageId',created.id,'workspaceId',created.workspace_id,'ideaId',created.idea_id,
    'version',created.version,'state',created.state,'sourcePackageId',source.id);
end $$;

revoke all on function public.create_content_package_version(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_content_package_version(uuid,uuid,uuid,text,text,text,jsonb) to service_role;
revoke all on function app_private.copy_content_package_version(public.content_packages,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.request_content_package_approval(uuid) from public,anon;
revoke all on function public.decide_content_package_approval(uuid,text,text) from public,anon;
revoke all on function public.create_next_content_package_version(uuid,text) from public,anon;
grant execute on function public.request_content_package_approval(uuid) to authenticated;
grant execute on function public.decide_content_package_approval(uuid,text,text) to authenticated;
grant execute on function public.create_next_content_package_version(uuid,text) to authenticated;
