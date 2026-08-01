alter function public.create_research_run(uuid,text,text,text[],integer,integer,text)
  rename to create_research_run_unchecked;
alter function public.decide_research_approval(uuid,text,text)
  rename to decide_research_approval_unchecked;

revoke all on function public.create_research_run_unchecked(uuid,text,text,text[],integer,integer,text)
  from public, anon, authenticated, service_role;
revoke all on function public.decide_research_approval_unchecked(uuid,text,text)
  from public, anon, authenticated, service_role;

create function public.create_research_run(
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
declare actor_role text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select role into actor_role from public.workspace_members
    where workspace_id = target_workspace_id and user_id = auth.uid();
  if actor_role is null or actor_role not in ('owner', 'admin', 'editor') then
    raise exception 'research_create_forbidden';
  end if;
  return public.create_research_run_unchecked(
    target_workspace_id, request_prompt, request_mode, request_sources,
    request_max_sources, request_estimated_credits, request_idempotency_key
  );
end;
$$;

create function public.decide_research_approval(
  target_approval_id uuid,
  approval_decision text,
  approval_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target_workspace_id uuid; actor_role text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select workspace_id into target_workspace_id from public.approvals where id = target_approval_id;
  if target_workspace_id is null then raise exception 'approval_not_found'; end if;
  select role into actor_role from public.workspace_members
    where workspace_id = target_workspace_id and user_id = auth.uid();
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'research_approval_forbidden';
  end if;
  return public.decide_research_approval_unchecked(target_approval_id, approval_decision, approval_note);
end;
$$;

revoke all on function public.create_research_run(uuid,text,text,text[],integer,integer,text) from public, anon;
revoke all on function public.decide_research_approval(uuid,text,text) from public, anon;
grant execute on function public.create_research_run(uuid,text,text,text[],integer,integer,text) to authenticated;
grant execute on function public.decide_research_approval(uuid,text,text) to authenticated;
