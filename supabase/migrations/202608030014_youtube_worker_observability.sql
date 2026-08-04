-- Durable, non-sensitive proof that the separately deployed YouTube worker is polling.
-- Worker instance identifiers stay private; browser callers receive only a coarse status.

create table app_private.worker_heartbeats (
  worker_kind text not null check (worker_kind in ('youtube_sync')),
  worker_instance_id uuid not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_status text not null check (last_status in ('starting','idle','working','completed','failed','stopping')),
  primary key (worker_kind, worker_instance_id)
);

create index worker_heartbeats_kind_seen_idx
  on app_private.worker_heartbeats(worker_kind, last_seen_at desc);

revoke all on table app_private.worker_heartbeats from public, anon, authenticated;

create or replace function public.record_worker_heartbeat(
  target_worker_kind text,
  target_worker_instance_id uuid,
  target_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_worker_kind <> 'youtube_sync'
    or target_status not in ('starting','idle','working','completed','failed','stopping')
  then
    raise exception 'worker_heartbeat_invalid' using errcode = '22023';
  end if;

  insert into app_private.worker_heartbeats(
    worker_kind, worker_instance_id, started_at, last_seen_at, last_status
  ) values (
    target_worker_kind, target_worker_instance_id, now(), now(), target_status
  )
  on conflict (worker_kind, worker_instance_id) do update set
    last_seen_at = excluded.last_seen_at,
    last_status = excluded.last_status;

  delete from app_private.worker_heartbeats
  where worker_kind = target_worker_kind
    and last_seen_at < now() - interval '7 days';
end $$;

create or replace function public.get_youtube_worker_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare latest app_private.worker_heartbeats%rowtype;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into latest
  from app_private.worker_heartbeats
  where worker_kind = 'youtube_sync'
  order by last_seen_at desc
  limit 1;

  if not found then
    return jsonb_build_object('status', 'not_seen', 'lastSeenAt', null);
  end if;

  return jsonb_build_object(
    'status', case when latest.last_seen_at >= now() - interval '30 seconds' then 'healthy' else 'stale' end,
    'lastSeenAt', latest.last_seen_at
  );
end $$;

revoke all on function public.record_worker_heartbeat(text,uuid,text) from public, anon, authenticated;
grant execute on function public.record_worker_heartbeat(text,uuid,text) to service_role;
revoke all on function public.get_youtube_worker_status() from public, anon;
grant execute on function public.get_youtube_worker_status() to authenticated, service_role;
