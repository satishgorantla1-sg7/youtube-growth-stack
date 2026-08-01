create or replace function public.create_workspace(workspace_name text, workspace_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if char_length(workspace_name) not between 1 and 80 then raise exception 'invalid workspace name'; end if;
  if workspace_slug !~ '^[a-z0-9-]+$' then raise exception 'invalid workspace slug'; end if;

  insert into public.workspaces (name, slug, owner_id)
  values (workspace_name, workspace_slug, auth.uid())
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, auth.uid(), 'owner');

  insert into public.audit_events (workspace_id, actor_id, action, entity_type, entity_id)
  values (new_workspace_id, auth.uid(), 'workspace.created', 'workspace', new_workspace_id::text);

  return new_workspace_id;
end;
$$;

revoke all on function public.create_workspace(text, text) from public;
grant execute on function public.create_workspace(text, text) to authenticated;

create policy "workspace_owner_update" on public.workspaces for update
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "workspace_owner_manage_members" on public.workspace_members for all
using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))
with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));
