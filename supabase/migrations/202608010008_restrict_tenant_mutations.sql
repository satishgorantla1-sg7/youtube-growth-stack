begin;

create or replace function app_private.can_edit_workspace(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = target
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'editor')
  );
$$;

revoke all on function app_private.can_edit_workspace(uuid) from public, anon;
grant execute on function app_private.can_edit_workspace(uuid) to authenticated, service_role;

do $$ declare table_name text; begin
  foreach table_name in array array['channels','projects','conversations','messages','voice_assets','research_runs','research_sources','ideas','content_packages','approvals'] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_workspace_access', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (app_private.is_workspace_member(workspace_id))', table_name || '_member_select', table_name);
  end loop;
end $$;

revoke insert, update, delete on
  public.channels, public.projects, public.conversations, public.messages,
  public.voice_assets, public.research_runs, public.research_sources,
  public.ideas, public.content_packages, public.approvals,
  public.jobs, public.job_events, public.usage_ledger, public.audit_events
from anon, authenticated;

grant select on
  public.channels, public.projects, public.conversations, public.messages,
  public.voice_assets, public.research_runs, public.research_sources,
  public.ideas, public.content_packages, public.approvals,
  public.jobs, public.job_events, public.usage_ledger, public.audit_events
to authenticated;

grant insert, update, delete on public.projects, public.conversations, public.ideas, public.content_packages to authenticated;
grant insert on public.messages to authenticated;

create policy projects_editor_write on public.projects for all to authenticated
using (app_private.can_edit_workspace(workspace_id))
with check (app_private.can_edit_workspace(workspace_id));

create policy conversations_editor_write on public.conversations for all to authenticated
using (app_private.can_edit_workspace(workspace_id))
with check (app_private.can_edit_workspace(workspace_id));

create policy ideas_editor_write on public.ideas for all to authenticated
using (app_private.can_edit_workspace(workspace_id))
with check (app_private.can_edit_workspace(workspace_id));

create policy content_packages_editor_insert on public.content_packages for insert to authenticated
with check (app_private.can_edit_workspace(workspace_id) and state = 'draft' and created_by = auth.uid());

create policy content_packages_editor_update on public.content_packages for update to authenticated
using (app_private.can_edit_workspace(workspace_id) and state = 'draft')
with check (app_private.can_edit_workspace(workspace_id) and state = 'draft');

create policy content_packages_editor_delete on public.content_packages for delete to authenticated
using (app_private.can_edit_workspace(workspace_id) and state = 'draft');

create policy user_messages_editor_insert on public.messages for insert to authenticated
with check (
  app_private.can_edit_workspace(workspace_id)
  and role = 'user'
  and created_by = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.workspace_id = workspace_id
  )
);

create or replace function app_private.protect_workspace_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_identity_is_immutable';
  end if;
  return new;
end;
$$;

do $$ declare table_name text; begin
  foreach table_name in array array['projects','conversations','ideas','content_packages'] loop
    execute format('create trigger protect_%I_workspace before update on public.%I for each row execute function app_private.protect_workspace_identity()', table_name, table_name);
  end loop;
end $$;

create or replace function app_private.protect_approval_evidence()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'approval_evidence_is_append_only'; end if;
  if row(new.id, new.workspace_id, new.entity_type, new.entity_id, new.risk_summary, new.estimated_credits, new.requested_by, new.requested_at)
     is distinct from
     row(old.id, old.workspace_id, old.entity_type, old.entity_id, old.risk_summary, old.estimated_credits, old.requested_by, old.requested_at)
  then raise exception 'approval_request_is_immutable'; end if;
  if old.state <> 'pending' or new.state not in ('approved', 'rejected', 'expired') or new.state = old.state
  then raise exception 'approval_decision_is_final'; end if;
  if new.decided_at is null then raise exception 'approval_decision_requires_timestamp'; end if;
  if new.state in ('approved', 'rejected') and new.decided_by is null
  then raise exception 'approval_decision_requires_actor'; end if;
  return new;
end;
$$;

create trigger protect_approval_evidence
before update or delete on public.approvals
for each row execute function app_private.protect_approval_evidence();

create or replace function app_private.deny_audit_evidence_change()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'audit_evidence_is_append_only'; end;
$$;

create trigger protect_audit_evidence
before update or delete on public.audit_events
for each row execute function app_private.deny_audit_evidence_change();

drop policy if exists "workspace voice upload" on storage.objects;

commit;
