create or replace function public.decide_research_approval(
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
  if target_workspace_id is not null then
    select role into actor_role from public.workspace_members
      where workspace_id = target_workspace_id and user_id = auth.uid();
  end if;
  if target_workspace_id is null or actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'research_approval_forbidden';
  end if;
  return public.decide_research_approval_unchecked(target_approval_id, approval_decision, approval_note);
end;
$$;

revoke all on function public.decide_research_approval(uuid,text,text) from public, anon;
grant execute on function public.decide_research_approval(uuid,text,text) to authenticated;
