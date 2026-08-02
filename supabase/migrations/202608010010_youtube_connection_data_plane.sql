-- YouTube connection data plane: private token custody, tenant-safe channel data,
-- bounded sync coordination, immutable metric snapshots, and quota accounting.

create table app_private.youtube_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider_subject_hash text not null check (char_length(provider_subject_hash) between 32 and 128),
  encrypted_access_token text not null check (char_length(encrypted_access_token) > 0),
  encrypted_refresh_token text check (encrypted_refresh_token is null or char_length(encrypted_refresh_token) > 0),
  encryption_key_version integer not null check (encryption_key_version > 0),
  granted_scopes text[] not null,
  access_token_expires_at timestamptz,
  state text not null default 'active' check (state in ('active','expired','revoked')),
  refresh_lock_token uuid,
  refresh_lock_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider_subject_hash),
  unique (workspace_id, id),
  check (granted_scopes <@ array['https://www.googleapis.com/auth/youtube.readonly']::text[]),
  check ('https://www.googleapis.com/auth/youtube.readonly' = any(granted_scopes)),
  check ((refresh_lock_token is null) = (refresh_lock_expires_at is null))
);

revoke all on table app_private.youtube_connections from public, anon, authenticated;
create index youtube_connections_workspace_state_idx
  on app_private.youtube_connections(workspace_id, state, updated_at desc);

alter table public.channels
  add column youtube_connection_id uuid,
  add column account_kind text not null default 'personal'
    check (account_kind in ('personal','brand')),
  add column is_selected boolean not null default false,
  add column description text,
  add column uploads_playlist_id text,
  add column country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  add column published_at timestamptz,
  add column updated_at timestamptz not null default now();

alter table public.channels
  add constraint channels_workspace_id_id_key unique (workspace_id, id),
  add constraint channels_workspace_connection_fk
    foreign key (workspace_id, youtube_connection_id)
    references app_private.youtube_connections(workspace_id, id)
    on delete cascade;

create unique index channels_one_selected_per_workspace_idx
  on public.channels(workspace_id) where is_selected;
create index channels_connection_idx
  on public.channels(workspace_id, youtube_connection_id, connection_state);
create trigger touch_channels before update on public.channels
  for each row execute function public.touch_updated_at();

create table public.youtube_videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid not null,
  external_id text not null check (char_length(external_id) between 1 and 128),
  title text not null,
  description text,
  thumbnail_url text,
  published_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  privacy_status text check (privacy_status is null or privacy_status in ('public','unlisted','private')),
  live_broadcast_content text check (live_broadcast_content is null or live_broadcast_content in ('none','upcoming','live')),
  etag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, external_id),
  unique (workspace_id, id),
  constraint youtube_videos_workspace_channel_fk
    foreign key (workspace_id, channel_id)
    references public.channels(workspace_id, id)
    on delete cascade
);

create table public.youtube_channel_snapshots (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid not null,
  subscriber_count bigint check (subscriber_count is null or subscriber_count >= 0),
  view_count bigint check (view_count is null or view_count >= 0),
  video_count bigint check (video_count is null or video_count >= 0),
  hidden_subscriber_count boolean not null default false,
  captured_at timestamptz not null,
  source_etag text,
  created_at timestamptz not null default now(),
  unique (workspace_id, channel_id, captured_at),
  constraint youtube_channel_snapshots_workspace_channel_fk
    foreign key (workspace_id, channel_id)
    references public.channels(workspace_id, id)
    on delete cascade
);

create table public.youtube_video_snapshots (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  video_id uuid not null,
  view_count bigint check (view_count is null or view_count >= 0),
  like_count bigint check (like_count is null or like_count >= 0),
  comment_count bigint check (comment_count is null or comment_count >= 0),
  captured_at timestamptz not null,
  source_etag text,
  created_at timestamptz not null default now(),
  unique (workspace_id, video_id, captured_at),
  constraint youtube_video_snapshots_workspace_video_fk
    foreign key (workspace_id, video_id)
    references public.youtube_videos(workspace_id, id)
    on delete cascade
);

create table public.youtube_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_connection_id uuid not null,
  channel_id uuid,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  correlation_id uuid not null default gen_random_uuid(),
  state text not null default 'queued' check (state in ('queued','running','completed','failed','cancelled')),
  max_pages integer not null check (max_pages between 1 and 10),
  max_items integer not null check (max_items between 1 and 500),
  pages_fetched integer not null default 0 check (pages_fetched between 0 and 10),
  items_fetched integer not null default 0 check (items_fetched between 0 and 500),
  quota_units integer not null default 0 check (quota_units >= 0),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key),
  unique (workspace_id, id),
  constraint youtube_sync_runs_workspace_connection_fk
    foreign key (workspace_id, youtube_connection_id)
    references app_private.youtube_connections(workspace_id, id)
    on delete cascade,
  constraint youtube_sync_runs_workspace_channel_fk
    foreign key (workspace_id, channel_id)
    references public.channels(workspace_id, id)
    on delete cascade,
  check ((lease_token is null) = (lease_expires_at is null))
);

create table public.youtube_quota_ledger (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sync_run_id uuid not null,
  operation text not null check (char_length(operation) between 1 and 80),
  quota_units integer not null check (quota_units > 0),
  request_idempotency_key text not null check (char_length(request_idempotency_key) between 8 and 200),
  occurred_at timestamptz not null default now(),
  quota_date date generated always as ((occurred_at at time zone 'UTC')::date) stored,
  unique (workspace_id, request_idempotency_key),
  constraint youtube_quota_ledger_workspace_sync_fk
    foreign key (workspace_id, sync_run_id)
    references public.youtube_sync_runs(workspace_id, id)
    on delete cascade
);

create table app_private.youtube_sync_cursors (
  sync_run_id uuid primary key,
  workspace_id uuid not null,
  encrypted_page_token text,
  encryption_key_version integer check (encryption_key_version is null or encryption_key_version > 0),
  updated_at timestamptz not null default now(),
  constraint youtube_sync_cursors_workspace_sync_fk
    foreign key (workspace_id, sync_run_id)
    references public.youtube_sync_runs(workspace_id, id)
    on delete cascade,
  check ((encrypted_page_token is null) = (encryption_key_version is null))
);
revoke all on table app_private.youtube_sync_cursors from public, anon, authenticated;

alter table public.youtube_videos enable row level security;
alter table public.youtube_channel_snapshots enable row level security;
alter table public.youtube_video_snapshots enable row level security;
alter table public.youtube_sync_runs enable row level security;
alter table public.youtube_quota_ledger enable row level security;

create policy youtube_videos_member_select on public.youtube_videos
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy youtube_channel_snapshots_member_select on public.youtube_channel_snapshots
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy youtube_video_snapshots_member_select on public.youtube_video_snapshots
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy youtube_sync_runs_member_select on public.youtube_sync_runs
  for select to authenticated using (app_private.is_workspace_member(workspace_id));
create policy youtube_quota_ledger_member_select on public.youtube_quota_ledger
  for select to authenticated using (app_private.is_workspace_member(workspace_id));

revoke insert, update, delete on public.youtube_videos, public.youtube_channel_snapshots,
  public.youtube_video_snapshots, public.youtube_sync_runs, public.youtube_quota_ledger
  from anon, authenticated;
grant select on public.youtube_videos, public.youtube_channel_snapshots,
  public.youtube_video_snapshots, public.youtube_sync_runs, public.youtube_quota_ledger
  to authenticated;

create index youtube_videos_channel_published_idx
  on public.youtube_videos(workspace_id, channel_id, published_at desc);
create index youtube_channel_snapshots_channel_captured_idx
  on public.youtube_channel_snapshots(workspace_id, channel_id, captured_at desc);
create index youtube_video_snapshots_video_captured_idx
  on public.youtube_video_snapshots(workspace_id, video_id, captured_at desc);
create index youtube_sync_runs_queue_idx
  on public.youtube_sync_runs(state, created_at) where state in ('queued','running');
create index youtube_sync_runs_workspace_created_idx
  on public.youtube_sync_runs(workspace_id, created_at desc);
create index youtube_quota_workspace_date_idx
  on public.youtube_quota_ledger(workspace_id, quota_date, occurred_at desc);

create trigger touch_youtube_videos before update on public.youtube_videos
  for each row execute function public.touch_updated_at();
create trigger touch_youtube_sync_runs before update on public.youtube_sync_runs
  for each row execute function public.touch_updated_at();

create or replace function public.store_youtube_connection(
  target_workspace_id uuid,
  target_provider_subject_hash text,
  target_encrypted_access_token text,
  target_encrypted_refresh_token text,
  target_encryption_key_version integer,
  target_granted_scopes text[],
  target_access_token_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare connection_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if target_granted_scopes is null
    or not ('https://www.googleapis.com/auth/youtube.readonly' = any(target_granted_scopes))
    or not (target_granted_scopes <@ array['https://www.googleapis.com/auth/youtube.readonly']::text[])
  then raise exception 'youtube_readonly_scope_required' using errcode = '22023'; end if;
  insert into app_private.youtube_connections (
    workspace_id, provider_subject_hash, encrypted_access_token, encrypted_refresh_token,
    encryption_key_version, granted_scopes, access_token_expires_at, state
  ) values (
    target_workspace_id, target_provider_subject_hash, target_encrypted_access_token,
    target_encrypted_refresh_token, target_encryption_key_version, target_granted_scopes,
    target_access_token_expires_at, 'active'
  ) on conflict (workspace_id, provider_subject_hash) do update set
    encrypted_access_token = excluded.encrypted_access_token,
    encrypted_refresh_token = coalesce(excluded.encrypted_refresh_token, app_private.youtube_connections.encrypted_refresh_token),
    encryption_key_version = excluded.encryption_key_version,
    granted_scopes = excluded.granted_scopes,
    access_token_expires_at = excluded.access_token_expires_at,
    state = 'active', updated_at = now()
  returning id into connection_id;
  return connection_id;
end $$;

create or replace function public.read_youtube_connection(target_connection_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare connection app_private.youtube_connections%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  select * into strict connection from app_private.youtube_connections where id = target_connection_id;
  return jsonb_build_object(
    'id', connection.id, 'workspaceId', connection.workspace_id,
    'encryptedAccessToken', connection.encrypted_access_token,
    'encryptedRefreshToken', connection.encrypted_refresh_token,
    'encryptionKeyVersion', connection.encryption_key_version,
    'grantedScopes', connection.granted_scopes,
    'accessTokenExpiresAt', connection.access_token_expires_at,
    'state', connection.state
  );
end $$;

create or replace function public.claim_youtube_refresh_lock(
  target_connection_id uuid, lock_owner uuid, lock_seconds integer default 30
) returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if lock_seconds < 5 or lock_seconds > 120 then raise exception 'invalid_lock_duration' using errcode = '22023'; end if;
  update app_private.youtube_connections set
    refresh_lock_token = lock_owner,
    refresh_lock_expires_at = now() + make_interval(secs => lock_seconds),
    updated_at = now()
  where id = target_connection_id
    and state = 'active'
    and (refresh_lock_expires_at is null or refresh_lock_expires_at <= now() or refresh_lock_token = lock_owner);
  get diagnostics claimed_count = row_count;
  return claimed_count = 1;
end $$;

create or replace function public.release_youtube_refresh_lock(
  target_connection_id uuid,
  lock_owner uuid,
  replacement_encrypted_access_token text default null,
  replacement_encrypted_refresh_token text default null,
  replacement_key_version integer default null,
  replacement_expires_at timestamptz default null,
  mark_expired boolean default false
) returns boolean language plpgsql security definer set search_path = '' as $$
declare released_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if replacement_encrypted_access_token is not null and (replacement_key_version is null or replacement_key_version <= 0)
  then raise exception 'replacement_key_version_required' using errcode = '22023'; end if;
  update app_private.youtube_connections set
    encrypted_access_token = coalesce(replacement_encrypted_access_token, encrypted_access_token),
    encrypted_refresh_token = coalesce(replacement_encrypted_refresh_token, encrypted_refresh_token),
    encryption_key_version = coalesce(replacement_key_version, encryption_key_version),
    access_token_expires_at = coalesce(replacement_expires_at, access_token_expires_at),
    state = case when mark_expired then 'expired' else state end,
    refresh_lock_token = null, refresh_lock_expires_at = null, updated_at = now()
  where id = target_connection_id and refresh_lock_token = lock_owner;
  get diagnostics released_count = row_count;
  return released_count = 1;
end $$;

create or replace function public.begin_youtube_sync(
  target_workspace_id uuid,
  target_connection_id uuid,
  target_channel_id uuid,
  request_idempotency_key text,
  request_max_pages integer default 5,
  request_max_items integer default 250
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare sync public.youtube_sync_runs%rowtype; inserted_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if request_max_pages < 1 or request_max_pages > 10 or request_max_items < 1 or request_max_items > 500
  then raise exception 'youtube_sync_bounds_invalid' using errcode = '22023'; end if;
  if app_private.research_control_disabled(target_workspace_id, 'youtube_api')
  then raise exception 'youtube_sync_disabled' using errcode = 'P0001'; end if;
  insert into public.youtube_sync_runs (
    workspace_id, youtube_connection_id, channel_id, idempotency_key, max_pages, max_items
  ) values (
    target_workspace_id, target_connection_id, target_channel_id,
    request_idempotency_key, request_max_pages, request_max_items
  ) on conflict (workspace_id, idempotency_key) do nothing;
  get diagnostics inserted_count = row_count;
  select * into strict sync from public.youtube_sync_runs
    where workspace_id = target_workspace_id and idempotency_key = request_idempotency_key;
  return jsonb_build_object(
    'id', sync.id, 'workspaceId', sync.workspace_id, 'connectionId', sync.youtube_connection_id,
    'channelId', sync.channel_id, 'state', sync.state, 'maxPages', sync.max_pages,
    'maxItems', sync.max_items, 'correlationId', sync.correlation_id,
    'created', inserted_count = 1
  );
end $$;

create or replace function public.lease_youtube_sync(
  worker_id text, lease_seconds integer default 60
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare sync public.youtube_sync_runs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if char_length(worker_id) < 1 or lease_seconds < 10 or lease_seconds > 300
  then raise exception 'invalid_sync_lease' using errcode = '22023'; end if;
  select * into sync from public.youtube_sync_runs
  where (state = 'queued' or (state = 'running' and lease_expires_at <= now()))
    and attempt_count < 5
  order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.youtube_sync_runs set state = 'running', attempt_count = attempt_count + 1,
    lease_token = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => lease_seconds),
    started_at = coalesce(started_at, now()), last_error_code = null
  where id = sync.id returning * into sync;
  return jsonb_build_object(
    'id', sync.id, 'workspaceId', sync.workspace_id, 'connectionId', sync.youtube_connection_id,
    'channelId', sync.channel_id, 'state', sync.state, 'maxPages', sync.max_pages,
    'maxItems', sync.max_items, 'pagesFetched', sync.pages_fetched,
    'itemsFetched', sync.items_fetched, 'correlationId', sync.correlation_id,
    'leaseToken', sync.lease_token, 'attemptCount', sync.attempt_count
  );
end $$;

create or replace function public.record_youtube_quota(
  target_sync_run_id uuid,
  target_lease_token uuid,
  target_operation text,
  target_quota_units integer,
  request_idempotency_key text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare target_workspace_id uuid; inserted_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  select workspace_id into strict target_workspace_id from public.youtube_sync_runs
    where id = target_sync_run_id and state = 'running' and lease_token = target_lease_token and lease_expires_at > now()
    for update;
  if target_quota_units < 1 then raise exception 'invalid_quota_units' using errcode = '22023'; end if;
  if app_private.research_control_disabled(target_workspace_id, 'youtube_api')
  then raise exception 'youtube_sync_disabled' using errcode = 'P0001'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('youtube-quota:' || target_workspace_id::text, 0));
  insert into public.youtube_quota_ledger(workspace_id, sync_run_id, operation, quota_units, request_idempotency_key)
  values(target_workspace_id, target_sync_run_id, target_operation, target_quota_units, request_idempotency_key)
  on conflict on constraint youtube_quota_ledger_workspace_id_request_idempotency_key_key do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then
    perform app_private.consume_provider_rate_limit(target_workspace_id, 'youtube_api');
    update public.youtube_sync_runs set quota_units = quota_units + target_quota_units where id = target_sync_run_id;
  end if;
  return inserted_count = 1;
end $$;

create or replace function public.finish_youtube_sync(
  target_sync_run_id uuid,
  target_lease_token uuid,
  target_state text,
  target_pages_fetched integer,
  target_items_fetched integer,
  target_error_code text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if target_state not in ('completed','failed','cancelled') then raise exception 'invalid_sync_state' using errcode = '22023'; end if;
  update public.youtube_sync_runs set state = target_state,
    pages_fetched = least(greatest(target_pages_fetched, 0), max_pages),
    items_fetched = least(greatest(target_items_fetched, 0), max_items),
    last_error_code = target_error_code,
    completed_at = now(), lease_token = null, lease_expires_at = null
  where id = target_sync_run_id and state = 'running'
    and lease_token = target_lease_token and lease_expires_at > now();
  if not found then raise exception 'invalid_or_expired_sync_lease' using errcode = 'P0001'; end if;
end $$;

revoke all on function public.store_youtube_connection(uuid,text,text,text,integer,text[],timestamptz) from public, anon, authenticated;
revoke all on function public.read_youtube_connection(uuid) from public, anon, authenticated;
revoke all on function public.claim_youtube_refresh_lock(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.release_youtube_refresh_lock(uuid,uuid,text,text,integer,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.begin_youtube_sync(uuid,uuid,uuid,text,integer,integer) from public, anon, authenticated;
revoke all on function public.lease_youtube_sync(text,integer) from public, anon, authenticated;
revoke all on function public.record_youtube_quota(uuid,uuid,text,integer,text) from public, anon, authenticated;
revoke all on function public.finish_youtube_sync(uuid,uuid,text,integer,integer,text) from public, anon, authenticated;

grant execute on function public.store_youtube_connection(uuid,text,text,text,integer,text[],timestamptz) to service_role;
grant execute on function public.read_youtube_connection(uuid) to service_role;
grant execute on function public.claim_youtube_refresh_lock(uuid,uuid,integer) to service_role;
grant execute on function public.release_youtube_refresh_lock(uuid,uuid,text,text,integer,timestamptz,boolean) to service_role;
grant execute on function public.begin_youtube_sync(uuid,uuid,uuid,text,integer,integer) to service_role;
grant execute on function public.lease_youtube_sync(text,integer) to service_role;
grant execute on function public.record_youtube_quota(uuid,uuid,text,integer,text) to service_role;
grant execute on function public.finish_youtube_sync(uuid,uuid,text,integer,integer,text) to service_role;

-- OAuth lifecycle contract. State is private, one-use, short-lived, and bound to
-- the approving user/workspace. The token envelope remains private.
create table app_private.youtube_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique check (state_hash ~ '^[0-9a-f]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  approval_id uuid not null references public.approvals(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, approval_id, state_hash),
  check (expires_at <= created_at + interval '10 minutes')
);
revoke all on table app_private.youtube_oauth_states from public, anon, authenticated;
create index youtube_oauth_states_user_pending_idx
  on app_private.youtube_oauth_states(user_id, workspace_id, expires_at)
  where consumed_at is null;

alter table app_private.youtube_connections
  rename column encrypted_access_token to encrypted_credentials;
alter table app_private.youtube_connections
  rename column encryption_key_version to credential_version_number;
alter table app_private.youtube_connections
  drop constraint youtube_connections_encryption_key_version_check;
alter table app_private.youtube_connections
  alter column credential_version_number type text using credential_version_number::text;
alter table app_private.youtube_connections add constraint youtube_connections_credential_version_check
  check (char_length(credential_version_number) between 1 and 80);
alter table app_private.youtube_connections
  rename column granted_scopes to scopes;
alter table app_private.youtube_connections
  rename column access_token_expires_at to expires_at;
alter table app_private.youtube_connections
  drop column encrypted_refresh_token;
alter table app_private.youtube_connections
  alter column encrypted_credentials drop not null;
alter table app_private.youtube_connections
  drop constraint youtube_connections_state_check;
alter table app_private.youtube_connections
  add constraint youtube_connections_state_check
    check (state in ('connected','reconnect_required','revoking','revoked'));
alter table app_private.youtube_connections
  alter column state set default 'connected';
alter table app_private.youtube_connections
  add constraint youtube_connections_one_per_workspace unique (workspace_id);

alter table public.channels drop constraint channels_account_kind_check;
alter table public.channels add constraint channels_account_kind_check
  check (account_kind in ('unknown','personal','brand'));
alter table public.channels alter column account_kind set default 'unknown';

drop function public.store_youtube_connection(uuid,text,text,text,integer,text[],timestamptz);
drop function public.read_youtube_connection(uuid);
drop function public.claim_youtube_refresh_lock(uuid,uuid,integer);
drop function public.release_youtube_refresh_lock(uuid,uuid,text,text,integer,timestamptz,boolean);

create or replace function public.create_youtube_oauth_state(
  target_workspace_id uuid,
  target_approval_id uuid,
  target_state_hash text,
  target_expires_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not app_private.is_workspace_member(target_workspace_id)
  then raise exception 'workspace_access_denied' using errcode = '42501'; end if;
  if target_state_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'oauth_state_invalid' using errcode = '22023'; end if;
  if target_expires_at <= now() or target_expires_at > now() + interval '10 minutes'
  then raise exception 'oauth_state_expired' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.approvals approval
    where approval.id = target_approval_id and approval.workspace_id = target_workspace_id
      and approval.entity_type = 'channel_action' and approval.state = 'approved'
      and approval.decided_by = actor
  ) then raise exception 'approval_required' using errcode = 'P0001'; end if;
  insert into app_private.youtube_oauth_states(
    state_hash, workspace_id, user_id, approval_id, expires_at
  ) values (target_state_hash, target_workspace_id, actor, target_approval_id, target_expires_at);
  insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values(target_workspace_id, actor, 'youtube.oauth_state.created', 'approval', target_approval_id::text,
    jsonb_build_object('expires_at', target_expires_at));
end $$;

create or replace function public.consume_youtube_oauth_state(target_state_hash text)
returns table(workspace_id uuid, user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare oauth_state app_private.youtube_oauth_states%rowtype;
begin
  if actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into oauth_state from app_private.youtube_oauth_states
    where state_hash = target_state_hash for update;
  if not found then raise exception 'oauth_state_invalid' using errcode = 'P0001'; end if;
  if oauth_state.user_id <> actor
  then raise exception 'oauth_state_workspace_mismatch' using errcode = '42501'; end if;
  if oauth_state.consumed_at is not null
  then raise exception 'oauth_state_replayed' using errcode = 'P0001'; end if;
  if oauth_state.expires_at <= now()
  then raise exception 'oauth_state_expired' using errcode = 'P0001'; end if;
  if not app_private.is_workspace_member(oauth_state.workspace_id)
  then raise exception 'workspace_access_denied' using errcode = '42501'; end if;
  update app_private.youtube_oauth_states set consumed_at = now() where id = oauth_state.id;
  return query select oauth_state.workspace_id, oauth_state.user_id;
end $$;

create or replace function public.store_youtube_connection(
  target_workspace_id uuid,
  target_state_hash text,
  target_provider text,
  target_encrypted_credentials text,
  target_credential_version text,
  target_scopes text[],
  target_expires_at timestamptz,
  target_external_id text,
  target_title text,
  target_handle text,
  target_thumbnail_url text
) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare oauth_state_id uuid;
declare connection_id uuid;
begin
  if actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not app_private.is_workspace_member(target_workspace_id)
  then raise exception 'workspace_access_denied' using errcode = '42501'; end if;
  if target_provider <> 'youtube'
    or target_scopes is null
    or not ('https://www.googleapis.com/auth/youtube.readonly' = any(target_scopes))
    or not (target_scopes <@ array['https://www.googleapis.com/auth/youtube.readonly']::text[])
  then raise exception 'youtube_readonly_scope_required' using errcode = '22023'; end if;
  if char_length(target_encrypted_credentials) < 1 or char_length(target_credential_version) < 1
  then raise exception 'encrypted_credentials_required' using errcode = '22023'; end if;
  select state.id into oauth_state_id from app_private.youtube_oauth_states state
    join public.approvals approval on approval.id = state.approval_id
    where state.state_hash = target_state_hash
      and state.workspace_id = target_workspace_id and state.user_id = actor
      and state.consumed_at is not null and state.completed_at is null
      and state.consumed_at > now() - interval '10 minutes'
      and approval.state = 'approved' and approval.entity_type = 'channel_action'
    order by state.consumed_at desc for update of state limit 1;
  if oauth_state_id is null then raise exception 'oauth_state_invalid' using errcode = 'P0001'; end if;
  insert into app_private.youtube_connections(
    workspace_id, provider_subject_hash, encrypted_credentials, credential_version_number,
    scopes, expires_at, state
  ) values (
    target_workspace_id, encode(extensions.digest(target_external_id, 'sha256'), 'hex'),
    target_encrypted_credentials, target_credential_version, target_scopes,
    target_expires_at, 'connected'
  ) on conflict (workspace_id) do update set
    provider_subject_hash = excluded.provider_subject_hash,
    encrypted_credentials = excluded.encrypted_credentials,
    credential_version_number = excluded.credential_version_number,
    scopes = excluded.scopes, expires_at = excluded.expires_at, state = 'connected',
    refresh_lock_token = null, refresh_lock_expires_at = null, updated_at = now()
  returning id into connection_id;
  update public.channels set is_selected = false
    where workspace_id = target_workspace_id and provider = 'youtube';
  insert into public.channels(
    workspace_id, youtube_connection_id, provider, external_id, title, handle,
    thumbnail_url, account_kind, is_selected, connection_state, last_synced_at
  ) values (
    target_workspace_id, connection_id, 'youtube', target_external_id, target_title,
    target_handle, target_thumbnail_url, 'unknown', true, 'active', now()
  ) on conflict (workspace_id, provider, external_id) do update set
    youtube_connection_id = excluded.youtube_connection_id, title = excluded.title,
    handle = excluded.handle, thumbnail_url = excluded.thumbnail_url,
    connection_state = 'active', last_synced_at = now();
  update app_private.youtube_oauth_states set completed_at = now() where id = oauth_state_id;
  insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values(target_workspace_id, actor, 'youtube.connection.stored', 'channel', target_external_id,
    jsonb_build_object('provider', 'youtube', 'credential_version', target_credential_version,
      'scopes', target_scopes));
end $$;

create or replace function public.lease_youtube_token_refresh(
  target_workspace_id uuid, target_lease_token uuid, target_lease_expires_at timestamptz
) returns table(workspace_id uuid, lease_token uuid, encrypted_credentials text, credential_version text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if target_lease_expires_at <= now() or target_lease_expires_at > now() + interval '2 minutes'
  then raise exception 'invalid_refresh_lease' using errcode = '22023'; end if;
  return query update app_private.youtube_connections connection set
    refresh_lock_token = target_lease_token, refresh_lock_expires_at = target_lease_expires_at,
    updated_at = now()
  where connection.workspace_id = target_workspace_id and connection.state = 'connected'
    and connection.encrypted_credentials is not null
    and connection.expires_at <= now() + interval '5 minutes'
    and (connection.refresh_lock_expires_at is null or connection.refresh_lock_expires_at <= now())
  returning connection.workspace_id, connection.refresh_lock_token,
    connection.encrypted_credentials, connection.credential_version_number;
end $$;

create or replace function public.complete_youtube_token_refresh(
  target_workspace_id uuid, target_lease_token uuid, target_encrypted_credentials text,
  target_credential_version text, target_expires_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  update app_private.youtube_connections set encrypted_credentials = target_encrypted_credentials,
    credential_version_number = target_credential_version, expires_at = target_expires_at,
    state = 'connected', refresh_lock_token = null, refresh_lock_expires_at = null, updated_at = now()
  where workspace_id = target_workspace_id and refresh_lock_token = target_lease_token
    and refresh_lock_expires_at > now();
  if not found then raise exception 'invalid_or_expired_refresh_lease' using errcode = 'P0001'; end if;
end $$;

create or replace function public.mark_youtube_reconnect_required(
  target_workspace_id uuid, target_lease_token uuid, target_reason text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if target_reason !~ '^[a-z0-9_:-]{1,64}$'
  then raise exception 'unsafe_reconnect_reason' using errcode = '22023'; end if;
  update app_private.youtube_connections set state = 'reconnect_required',
    refresh_lock_token = null, refresh_lock_expires_at = null, updated_at = now()
  where workspace_id = target_workspace_id and refresh_lock_token = target_lease_token;
  if not found then raise exception 'invalid_refresh_lease' using errcode = 'P0001'; end if;
  update public.channels set connection_state = 'expired'
    where workspace_id = target_workspace_id and provider = 'youtube';
  insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values(target_workspace_id, null, 'youtube.connection.reconnect_required', 'workspace', target_workspace_id::text,
    jsonb_build_object('reason_code', target_reason));
end $$;

create or replace function public.lease_youtube_revocation(
  target_workspace_id uuid, target_lease_token uuid, target_lease_expires_at timestamptz
) returns table(workspace_id uuid, lease_token uuid, encrypted_credentials text, credential_version text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if target_lease_expires_at <= now() or target_lease_expires_at > now() + interval '2 minutes'
  then raise exception 'invalid_revocation_lease' using errcode = '22023'; end if;
  return query update app_private.youtube_connections connection set state = 'revoking',
    refresh_lock_token = target_lease_token, refresh_lock_expires_at = target_lease_expires_at,
    updated_at = now()
  where connection.workspace_id = target_workspace_id
    and connection.state in ('connected','reconnect_required')
    and connection.encrypted_credentials is not null
    and (connection.refresh_lock_expires_at is null or connection.refresh_lock_expires_at <= now())
  returning connection.workspace_id, connection.refresh_lock_token,
    connection.encrypted_credentials, connection.credential_version_number;
end $$;

create or replace function public.complete_youtube_revocation(
  target_workspace_id uuid, target_lease_token uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  update app_private.youtube_connections set state = 'revoked', encrypted_credentials = null,
    expires_at = null, refresh_lock_token = null, refresh_lock_expires_at = null, updated_at = now()
  where workspace_id = target_workspace_id and state = 'revoking'
    and refresh_lock_token = target_lease_token and refresh_lock_expires_at > now();
  if not found then raise exception 'invalid_or_expired_revocation_lease' using errcode = 'P0001'; end if;
  update public.channels set connection_state = 'revoked', is_selected = false
    where workspace_id = target_workspace_id and provider = 'youtube';
  insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values(target_workspace_id, null, 'youtube.connection.revoked', 'workspace', target_workspace_id::text, '{}'::jsonb);
end $$;

create or replace function public.persist_youtube_sync_page(
  target_sync_run_id uuid, target_lease_token uuid,
  channel_rows jsonb default '[]'::jsonb, video_rows jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare sync public.youtube_sync_runs%rowtype;
declare page_item_count integer;
declare next_pages integer;
declare next_items integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if jsonb_typeof(channel_rows) <> 'array' or jsonb_typeof(video_rows) <> 'array'
  then raise exception 'youtube_sync_page_must_be_arrays' using errcode = '22023'; end if;
  select * into strict sync from public.youtube_sync_runs
    where id = target_sync_run_id and state = 'running'
      and lease_token = target_lease_token and lease_expires_at > now() for update;
  page_item_count := jsonb_array_length(channel_rows) + jsonb_array_length(video_rows);
  next_pages := sync.pages_fetched + 1;
  next_items := sync.items_fetched + page_item_count;
  if next_pages > sync.max_pages or next_items > sync.max_items
  then raise exception 'youtube_sync_bounds_exceeded' using errcode = '22023'; end if;
  insert into public.channels(
    workspace_id, youtube_connection_id, provider, external_id, title, description, handle,
    thumbnail_url, uploads_playlist_id, country_code, published_at, account_kind,
    connection_state, last_synced_at
  ) select sync.workspace_id, sync.youtube_connection_id, 'youtube', row.external_id,
      row.title, row.description, row.handle, row.thumbnail_url, row.uploads_playlist_id,
      row.country_code, row.published_at, coalesce(row.account_kind, 'unknown'), 'active', now()
    from jsonb_to_recordset(channel_rows) as row(
      external_id text, title text, description text, handle text, thumbnail_url text,
      uploads_playlist_id text, country_code text, published_at timestamptz, etag text,
      account_kind text, subscriber_count bigint, view_count bigint, video_count bigint,
      hidden_subscriber_count boolean, captured_at timestamptz)
  on conflict (workspace_id, provider, external_id) do update set
    youtube_connection_id = excluded.youtube_connection_id, title = excluded.title,
    description = excluded.description, handle = excluded.handle,
    thumbnail_url = excluded.thumbnail_url, uploads_playlist_id = excluded.uploads_playlist_id,
    country_code = excluded.country_code, published_at = excluded.published_at,
    account_kind = excluded.account_kind, connection_state = 'active', last_synced_at = now();
  insert into public.youtube_channel_snapshots(
    workspace_id, channel_id, subscriber_count, view_count, video_count,
    hidden_subscriber_count, captured_at, source_etag
  ) select sync.workspace_id, channel.id, row.subscriber_count, row.view_count, row.video_count,
      coalesce(row.hidden_subscriber_count, false), row.captured_at, row.etag
    from jsonb_to_recordset(channel_rows) as row(
      external_id text, subscriber_count bigint, view_count bigint, video_count bigint,
      hidden_subscriber_count boolean, captured_at timestamptz, etag text)
    join public.channels channel on channel.workspace_id = sync.workspace_id
      and channel.youtube_connection_id = sync.youtube_connection_id and channel.external_id = row.external_id
  on conflict (workspace_id, channel_id, captured_at) do nothing;
  insert into public.youtube_videos(
    workspace_id, channel_id, external_id, title, description, thumbnail_url,
    published_at, duration_seconds, privacy_status, live_broadcast_content, etag
  ) select sync.workspace_id, channel.id, row.external_id, row.title, row.description,
      row.thumbnail_url, row.published_at, row.duration_seconds, row.privacy_status,
      row.live_broadcast_content, row.etag
    from jsonb_to_recordset(video_rows) as row(
      external_id text, channel_external_id text, title text, description text,
      thumbnail_url text, published_at timestamptz, duration_seconds integer,
      privacy_status text, live_broadcast_content text, etag text, view_count bigint,
      like_count bigint, comment_count bigint, captured_at timestamptz)
    join public.channels channel on channel.workspace_id = sync.workspace_id
      and channel.youtube_connection_id = sync.youtube_connection_id and channel.external_id = row.channel_external_id
  on conflict (workspace_id, external_id) do update set
    channel_id = excluded.channel_id, title = excluded.title, description = excluded.description,
    thumbnail_url = excluded.thumbnail_url, published_at = excluded.published_at,
    duration_seconds = excluded.duration_seconds, privacy_status = excluded.privacy_status,
    live_broadcast_content = excluded.live_broadcast_content, etag = excluded.etag;
  insert into public.youtube_video_snapshots(
    workspace_id, video_id, view_count, like_count, comment_count, captured_at, source_etag
  ) select sync.workspace_id, video.id, row.view_count, row.like_count, row.comment_count,
      row.captured_at, row.etag
    from jsonb_to_recordset(video_rows) as row(
      external_id text, view_count bigint, like_count bigint, comment_count bigint,
      captured_at timestamptz, etag text)
    join public.youtube_videos video on video.workspace_id = sync.workspace_id and video.external_id = row.external_id
  on conflict (workspace_id, video_id, captured_at) do nothing;
  update public.youtube_sync_runs set pages_fetched = next_pages, items_fetched = next_items where id = sync.id;
  return jsonb_build_object('pagesFetched', next_pages, 'itemsFetched', next_items);
end $$;

revoke all on function public.create_youtube_oauth_state(uuid,uuid,text,timestamptz) from public, anon;
revoke all on function public.consume_youtube_oauth_state(text) from public, anon;
revoke all on function public.store_youtube_connection(uuid,text,text,text,text,text[],timestamptz,text,text,text,text) from public, anon;
grant execute on function public.create_youtube_oauth_state(uuid,uuid,text,timestamptz) to authenticated;
grant execute on function public.consume_youtube_oauth_state(text) to authenticated;
grant execute on function public.store_youtube_connection(uuid,text,text,text,text,text[],timestamptz,text,text,text,text) to authenticated;
revoke all on function public.lease_youtube_token_refresh(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.complete_youtube_token_refresh(uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.mark_youtube_reconnect_required(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.lease_youtube_revocation(uuid,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.complete_youtube_revocation(uuid,uuid) from public, anon, authenticated;
revoke all on function public.persist_youtube_sync_page(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.lease_youtube_token_refresh(uuid,uuid,timestamptz) to service_role;
grant execute on function public.complete_youtube_token_refresh(uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.mark_youtube_reconnect_required(uuid,uuid,text) to service_role;
grant execute on function public.lease_youtube_revocation(uuid,uuid,timestamptz) to service_role;
grant execute on function public.complete_youtube_revocation(uuid,uuid) to service_role;
grant execute on function public.persist_youtube_sync_page(uuid,uuid,jsonb,jsonb) to service_role;

-- Revocation is a separate approved channel action. The approval remains bound
-- across transient provider failures so an expired lease can be retried safely.
revoke all on function public.lease_youtube_revocation(uuid,uuid,timestamptz) from service_role;
drop function public.lease_youtube_revocation(uuid,uuid,timestamptz);
alter table app_private.youtube_connections
  add column revocation_approval_id uuid references public.approvals(id) on delete restrict;

create or replace function public.lease_youtube_revocation(
  target_workspace_id uuid, target_approval_id uuid,
  target_lease_token uuid, target_lease_expires_at timestamptz
) returns table(workspace_id uuid, lease_token uuid, encrypted_credentials text, credential_version text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if target_lease_expires_at <= now() or target_lease_expires_at > now() + interval '2 minutes'
  then raise exception 'invalid_revocation_lease' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.approvals approval
    where approval.id = target_approval_id and approval.workspace_id = target_workspace_id
      and approval.entity_type = 'channel_action' and approval.state = 'approved'
      and approval.decided_by is not null
  ) then raise exception 'approval_required' using errcode = 'P0001'; end if;
  return query update app_private.youtube_connections connection set state = 'revoking',
    revocation_approval_id = target_approval_id,
    refresh_lock_token = target_lease_token, refresh_lock_expires_at = target_lease_expires_at,
    updated_at = now()
  where connection.workspace_id = target_workspace_id
    and (connection.state in ('connected','reconnect_required')
      or (connection.state = 'revoking' and connection.revocation_approval_id = target_approval_id))
    and connection.encrypted_credentials is not null
    and (connection.refresh_lock_expires_at is null or connection.refresh_lock_expires_at <= now())
  returning connection.workspace_id, connection.refresh_lock_token,
    connection.encrypted_credentials, connection.credential_version_number;
end $$;

revoke all on function public.lease_youtube_revocation(uuid,uuid,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.lease_youtube_revocation(uuid,uuid,uuid,timestamptz)
  to service_role;

create or replace function public.create_youtube_connection_approval(target_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare actor_role text;
declare approval public.approvals%rowtype;
declare connection_id uuid;
begin
  if actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select role into actor_role from public.workspace_members
    where workspace_id = target_workspace_id and user_id = actor;
  if actor_role is null or actor_role not in ('owner','admin')
  then raise exception 'youtube_approval_forbidden' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('youtube-approval:' || target_workspace_id::text, 0));
  select * into approval from public.approvals
    where workspace_id = target_workspace_id and entity_type = 'channel_action'
      and state = 'pending' order by requested_at desc for update limit 1;
  if not found then
    select id into connection_id from app_private.youtube_connections
      where workspace_id = target_workspace_id;
    insert into public.approvals(
      workspace_id, entity_type, entity_id, state, risk_summary,
      estimated_credits, requested_by
    ) values (
      target_workspace_id, 'channel_action', coalesce(connection_id, target_workspace_id),
      'pending',
      'Authorize a read-only YouTube connection or revoke an existing connection. No publishing, editing, or deletion scope is requested.',
      0, actor
    ) returning * into approval;
    insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
    values(target_workspace_id, actor, 'youtube.approval.requested', 'approval', approval.id::text,
      jsonb_build_object('scope', 'https://www.googleapis.com/auth/youtube.readonly',
        'requires_separate_revocation_approval', true));
  end if;
  return jsonb_build_object(
    'approvalId', approval.id, 'workspaceId', approval.workspace_id,
    'state', approval.state, 'riskSummary', approval.risk_summary,
    'scope', 'https://www.googleapis.com/auth/youtube.readonly',
    'requestedAt', approval.requested_at
  );
end $$;

create or replace function public.decide_youtube_connection_approval(
  target_approval_id uuid,
  approval_decision text,
  approval_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare actor_role text;
declare approval public.approvals%rowtype;
begin
  if actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if approval_decision not in ('approved','rejected')
  then raise exception 'invalid_approval_decision' using errcode = '22023'; end if;
  if approval_note is not null and char_length(approval_note) > 500
  then raise exception 'invalid_approval_note' using errcode = '22023'; end if;
  select * into approval from public.approvals where id = target_approval_id for update;
  if not found or approval.entity_type <> 'channel_action'
  then raise exception 'youtube_approval_forbidden' using errcode = '42501'; end if;
  select role into actor_role from public.workspace_members
    where workspace_id = approval.workspace_id and user_id = actor;
  if actor_role is null or actor_role not in ('owner','admin')
  then raise exception 'youtube_approval_forbidden' using errcode = '42501'; end if;
  if approval.state <> 'pending' then
    if approval.state = approval_decision then
      return jsonb_build_object(
        'approvalId', approval.id, 'workspaceId', approval.workspace_id,
        'state', approval.state, 'decidedAt', approval.decided_at);
    end if;
    raise exception 'approval_not_pending' using errcode = 'P0001';
  end if;
  update public.approvals set state = approval_decision, decided_by = actor,
    decision_note = approval_note, decided_at = now()
    where id = approval.id returning * into approval;
  insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values(approval.workspace_id, actor, 'youtube.approval.' || approval_decision,
    'approval', approval.id::text,
    jsonb_build_object('scope', 'https://www.googleapis.com/auth/youtube.readonly'));
  return jsonb_build_object(
    'approvalId', approval.id, 'workspaceId', approval.workspace_id,
    'state', approval.state, 'decidedAt', approval.decided_at);
end $$;

revoke all on function public.create_youtube_connection_approval(uuid) from public, anon;
revoke all on function public.decide_youtube_connection_approval(uuid,text,text) from public, anon;
grant execute on function public.create_youtube_connection_approval(uuid) to authenticated;
grant execute on function public.decide_youtube_connection_approval(uuid,text,text) to authenticated;

create table app_private.youtube_approval_claims (
  approval_id uuid primary key references public.approvals(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purpose text not null check (purpose in ('connect','revoke')),
  claimed_at timestamptz not null default now()
);
revoke all on table app_private.youtube_approval_claims from public, anon, authenticated;
alter table app_private.youtube_oauth_states
  add constraint youtube_oauth_states_approval_once unique (approval_id);

create or replace function app_private.claim_youtube_connect_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare inserted_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('youtube-approval-claim:' || new.approval_id::text, 0));
  insert into app_private.youtube_approval_claims(approval_id, workspace_id, purpose)
  values(new.approval_id, new.workspace_id, 'connect') on conflict (approval_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count <> 1 then raise exception 'approval_already_used' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger claim_youtube_connect_approval before insert on app_private.youtube_oauth_states
  for each row execute function app_private.claim_youtube_connect_approval();

create or replace function app_private.claim_youtube_revocation_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare claimed_purpose text;
begin
  if new.state <> 'revoking' then return new; end if;
  if new.revocation_approval_id is null then raise exception 'approval_required' using errcode = 'P0001'; end if;
  if not exists (
    select 1 from public.approvals approval
    where approval.id = new.revocation_approval_id and approval.workspace_id = new.workspace_id
      and approval.entity_type = 'channel_action' and approval.entity_id = old.id
      and approval.state = 'approved' and approval.decided_by is not null
  ) then raise exception 'approval_required' using errcode = 'P0001'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('youtube-approval-claim:' || new.revocation_approval_id::text, 0));
  insert into app_private.youtube_approval_claims(approval_id, workspace_id, purpose)
  values(new.revocation_approval_id, new.workspace_id, 'revoke')
  on conflict (approval_id) do nothing;
  select purpose into claimed_purpose from app_private.youtube_approval_claims
    where approval_id = new.revocation_approval_id;
  if claimed_purpose <> 'revoke' then raise exception 'approval_already_used' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger claim_youtube_revocation_approval before update of state, revocation_approval_id
  on app_private.youtube_connections for each row
  execute function app_private.claim_youtube_revocation_approval();

revoke all on function public.store_youtube_connection(
  uuid,text,text,text,text,text[],timestamptz,text,text,text,text) from authenticated;
drop function public.store_youtube_connection(
  uuid,text,text,text,text,text[],timestamptz,text,text,text,text);

create or replace function public.store_youtube_connection(
  target_workspace_id uuid,
  target_state_hash text,
  target_provider text,
  target_encrypted_credentials text,
  target_credential_version text,
  target_scopes text[],
  target_expires_at timestamptz,
  target_channels jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare oauth_state_id uuid;
declare connection_id uuid;
declare candidate jsonb;
declare candidate_count integer;
declare channel_ids text;
declare candidate_external_id text;
begin
  if actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not app_private.is_workspace_member(target_workspace_id)
  then raise exception 'workspace_access_denied' using errcode = '42501'; end if;
  if target_provider <> 'youtube'
    or target_scopes is null
    or not ('https://www.googleapis.com/auth/youtube.readonly' = any(target_scopes))
    or not (target_scopes <@ array['https://www.googleapis.com/auth/youtube.readonly']::text[])
  then raise exception 'youtube_readonly_scope_required' using errcode = '22023'; end if;
  if char_length(target_encrypted_credentials) < 1 or char_length(target_credential_version) < 1
  then raise exception 'encrypted_credentials_required' using errcode = '22023'; end if;
  if jsonb_typeof(target_channels) <> 'array' then raise exception 'youtube_channels_invalid' using errcode = '22023'; end if;
  candidate_count := jsonb_array_length(target_channels);
  if candidate_count < 1 or candidate_count > 50
  then raise exception 'youtube_channels_invalid' using errcode = '22023'; end if;
  select state.id into oauth_state_id from app_private.youtube_oauth_states state
    join public.approvals approval on approval.id = state.approval_id
    where state.state_hash = target_state_hash and state.workspace_id = target_workspace_id
      and state.user_id = actor and state.consumed_at is not null and state.completed_at is null
      and state.consumed_at > now() - interval '10 minutes'
      and approval.state = 'approved' and approval.entity_type = 'channel_action'
    for update of state;
  if oauth_state_id is null then raise exception 'oauth_state_invalid' using errcode = 'P0001'; end if;
  select string_agg(value->>'externalId', ',' order by value->>'externalId') into channel_ids
    from jsonb_array_elements(target_channels) value;
  if channel_ids is null or exists (
    select 1 from jsonb_array_elements(target_channels) value
    where coalesce(char_length(value->>'externalId'), 0) < 1
      or coalesce(char_length(value->>'title'), 0) < 1
  ) then raise exception 'youtube_channels_invalid' using errcode = '22023'; end if;
  insert into app_private.youtube_connections(
    workspace_id, provider_subject_hash, encrypted_credentials, credential_version_number,
    scopes, expires_at, state
  ) values (
    target_workspace_id, encode(extensions.digest(channel_ids, 'sha256'), 'hex'),
    target_encrypted_credentials, target_credential_version, target_scopes,
    target_expires_at, 'connected'
  ) on conflict (workspace_id) do update set
    provider_subject_hash = excluded.provider_subject_hash,
    encrypted_credentials = excluded.encrypted_credentials,
    credential_version_number = excluded.credential_version_number,
    scopes = excluded.scopes, expires_at = excluded.expires_at, state = 'connected',
    refresh_lock_token = null, refresh_lock_expires_at = null, updated_at = now()
  returning id into connection_id;
  update public.channels set is_selected = false, connection_state = 'expired'
    where workspace_id = target_workspace_id and provider = 'youtube';
  for candidate in select value from jsonb_array_elements(target_channels)
  loop
    candidate_external_id := candidate->>'externalId';
    insert into public.channels(
      workspace_id, youtube_connection_id, provider, external_id, title, handle,
      thumbnail_url, account_kind, is_selected, connection_state, last_synced_at
    ) values (
      target_workspace_id, connection_id, 'youtube', candidate_external_id, candidate->>'title',
      nullif(candidate->>'handle', ''), nullif(candidate->>'thumbnailUrl', ''),
      'unknown', candidate_count = 1, 'active', now()
    ) on conflict (workspace_id, provider, external_id) do update set
      youtube_connection_id = excluded.youtube_connection_id, title = excluded.title,
      handle = excluded.handle, thumbnail_url = excluded.thumbnail_url,
      is_selected = excluded.is_selected, connection_state = 'active', last_synced_at = now();
  end loop;
  update app_private.youtube_oauth_states set completed_at = now() where id = oauth_state_id;
  insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values(target_workspace_id, actor, 'youtube.connection.stored', 'workspace', target_workspace_id::text,
    jsonb_build_object('provider', 'youtube', 'credential_version', target_credential_version,
      'scope', 'https://www.googleapis.com/auth/youtube.readonly',
      'candidate_count', candidate_count, 'selection_required', candidate_count > 1));
end $$;

create or replace function public.select_youtube_channel(
  target_workspace_id uuid, target_channel_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare actor_role text;
declare selected public.channels%rowtype;
begin
  if actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select role into actor_role from public.workspace_members
    where workspace_id = target_workspace_id and user_id = actor;
  if actor_role is null or actor_role not in ('owner','admin','editor')
  then raise exception 'youtube_channel_selection_forbidden' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('youtube-channel-selection:' || target_workspace_id::text, 0));
  select * into selected from public.channels
    where id = target_channel_id and workspace_id = target_workspace_id
      and provider = 'youtube' and connection_state = 'active' for update;
  if not found then raise exception 'youtube_channel_selection_forbidden' using errcode = '42501'; end if;
  update public.channels set is_selected = false
    where workspace_id = target_workspace_id and provider = 'youtube' and is_selected;
  update public.channels set is_selected = true where id = selected.id;
  insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values(target_workspace_id, actor, 'youtube.channel.selected', 'channel', selected.id::text,
    jsonb_build_object('external_id', selected.external_id));
  return jsonb_build_object('workspaceId', target_workspace_id, 'channelId', selected.id,
    'externalId', selected.external_id, 'selected', true);
end $$;

revoke all on function public.store_youtube_connection(uuid,text,text,text,text,text[],timestamptz,jsonb)
  from public, anon;
revoke all on function public.select_youtube_channel(uuid,uuid) from public, anon;
grant execute on function public.store_youtube_connection(uuid,text,text,text,text,text[],timestamptz,jsonb)
  to authenticated;
grant execute on function public.select_youtube_channel(uuid,uuid) to authenticated;

create or replace function public.request_youtube_sync(
  target_workspace_id uuid,
  target_channel_id uuid,
  target_idempotency_key text,
  target_max_pages integer default 5,
  target_max_items integer default 250
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare actor_role text;
declare connection_id uuid;
declare sync public.youtube_sync_runs%rowtype;
declare inserted_count integer;
begin
  if actor is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select role into actor_role from public.workspace_members
    where workspace_id = target_workspace_id and user_id = actor;
  if actor_role is null or actor_role not in ('owner','admin','editor')
  then raise exception 'youtube_sync_forbidden' using errcode = '42501'; end if;
  if target_max_pages < 1 or target_max_pages > 10
    or target_max_items < 1 or target_max_items > 500
    or char_length(target_idempotency_key) < 8 or char_length(target_idempotency_key) > 200
  then raise exception 'youtube_sync_bounds_invalid' using errcode = '22023'; end if;
  if app_private.research_control_disabled(target_workspace_id, 'youtube_api')
  then raise exception 'youtube_sync_disabled' using errcode = 'P0001'; end if;
  select channel.youtube_connection_id into connection_id
    from public.channels channel
    join app_private.youtube_connections connection
      on connection.id = channel.youtube_connection_id and connection.workspace_id = channel.workspace_id
    where channel.id = target_channel_id and channel.workspace_id = target_workspace_id
      and channel.provider = 'youtube' and channel.connection_state = 'active'
      and channel.is_selected and connection.state = 'connected';
  if connection_id is null then raise exception 'youtube_sync_forbidden' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('youtube-sync-request:' || target_workspace_id::text || ':' || target_idempotency_key, 0));
  insert into public.youtube_sync_runs(
    workspace_id, youtube_connection_id, channel_id, idempotency_key, max_pages, max_items
  ) values (
    target_workspace_id, connection_id, target_channel_id,
    target_idempotency_key, target_max_pages, target_max_items
  ) on conflict (workspace_id, idempotency_key) do nothing;
  get diagnostics inserted_count = row_count;
  select * into strict sync from public.youtube_sync_runs
    where workspace_id = target_workspace_id and idempotency_key = target_idempotency_key;
  if sync.channel_id <> target_channel_id or sync.max_pages <> target_max_pages or sync.max_items <> target_max_items
  then raise exception 'youtube_sync_idempotency_conflict' using errcode = 'P0001'; end if;
  if inserted_count = 1 then
    insert into public.audit_events(workspace_id, actor_id, action, entity_type, entity_id, metadata)
    values(target_workspace_id, actor, 'youtube.sync.requested', 'youtube_sync_run', sync.id::text,
      jsonb_build_object('channel_id', target_channel_id, 'max_pages', target_max_pages,
        'max_items', target_max_items, 'correlation_id', sync.correlation_id));
  end if;
  return jsonb_build_object(
    'id', sync.id, 'workspaceId', sync.workspace_id, 'connectionId', sync.youtube_connection_id,
    'channelId', sync.channel_id, 'state', sync.state, 'maxPages', sync.max_pages,
    'maxItems', sync.max_items, 'correlationId', sync.correlation_id,
    'created', inserted_count = 1);
end $$;

revoke all on function public.request_youtube_sync(uuid,uuid,text,integer,integer) from public, anon;
grant execute on function public.request_youtube_sync(uuid,uuid,text,integer,integer) to authenticated;
