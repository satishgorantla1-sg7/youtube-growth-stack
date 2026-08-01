-- Workspace onboarding must go through one atomic, authenticated operation.
drop policy if exists "workspaces_create" on public.workspaces;
revoke insert on table public.workspaces from anon, authenticated;
grant select on table public.profiles, public.workspaces, public.workspace_members to authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

create or replace function public.create_workspace(workspace_name text, workspace_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
  existing_workspace_id uuid;
  clean_name text := btrim(workspace_name);
  clean_slug text := btrim(workspace_slug);
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if clean_name is null or char_length(clean_name) not between 1 and 80 then
    raise exception using errcode = '22023', message = 'invalid workspace name';
  end if;

  if clean_slug is null or char_length(clean_slug) not between 1 and 63
    or clean_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'invalid workspace slug';
  end if;

  -- Email callbacks and retries may race. Serialize first-workspace creation per user
  -- and return the existing membership so onboarding remains idempotent.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 0));
  select m.workspace_id into existing_workspace_id
  from public.workspace_members m
  where m.user_id = auth.uid()
  order by m.created_at
  limit 1;

  if existing_workspace_id is not null then
    return existing_workspace_id;
  end if;

  insert into public.workspaces (name, slug, owner_id)
  values (clean_name, clean_slug, auth.uid())
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
