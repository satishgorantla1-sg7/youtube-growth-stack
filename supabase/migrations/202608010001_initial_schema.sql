create extension if not exists pgcrypto;
create schema if not exists app_private;
revoke all on schema app_private from anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  owner_id uuid not null references public.profiles(id),
  plan text not null default 'starter' check (plan in ('starter','creator','studio')),
  daily_credit_limit integer not null default 100 check (daily_credit_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'youtube' check (provider = 'youtube'),
  external_id text not null,
  title text not null,
  handle text,
  thumbnail_url text,
  connection_state text not null default 'active' check (connection_state in ('active','expired','revoked')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, provider, external_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  name text not null,
  niche text,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null default 'New conversation',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  modality text not null default 'text' check (modality in ('text','voice','mixed')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.voice_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  storage_path text,
  transcript text,
  duration_ms integer check (duration_ms >= 0),
  retention_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  prompt text not null,
  mode text not null default 'quick' check (mode in ('quick','deep')),
  state text not null default 'draft' check (state in ('draft','awaiting_approval','queued','running','completed','failed','cancelled')),
  estimated_credits integer not null default 0 check (estimated_credits >= 0),
  actual_credits integer check (actual_credits >= 0),
  requested_by uuid not null references public.profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  provider text not null check (provider in ('youtube_api','apify','firecrawl','manual','demo')),
  source_type text not null check (source_type in ('youtube','web')),
  url text not null,
  title text,
  content text,
  content_hash text,
  provenance jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  research_run_id uuid references public.research_runs(id) on delete set null,
  title text not null,
  premise text not null,
  score numeric(5,2) check (score between 0 and 100),
  scoring_reason jsonb not null default '{}'::jsonb,
  status text not null default 'candidate' check (status in ('candidate','shortlisted','approved','rejected','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_packages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idea_id uuid not null references public.ideas(id) on delete cascade,
  version integer not null default 1,
  state text not null default 'draft' check (state in ('draft','awaiting_approval','approved','rejected','exported')),
  titles jsonb not null default '[]'::jsonb,
  thumbnail_concepts jsonb not null default '[]'::jsonb,
  hooks jsonb not null default '[]'::jsonb,
  outline jsonb not null default '[]'::jsonb,
  script text,
  citations jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, version)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null check (entity_type in ('research_plan','content_package','channel_action','data_deletion')),
  entity_id uuid not null,
  state text not null default 'pending' check (state in ('pending','approved','rejected','expired')),
  risk_summary text not null,
  estimated_credits integer not null default 0 check (estimated_credits >= 0),
  requested_by uuid not null references public.profiles(id),
  decided_by uuid references public.profiles(id),
  decision_note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  research_run_id uuid references public.research_runs(id) on delete cascade,
  kind text not null,
  state text not null default 'queued' check (state in ('queued','leased','completed','failed','dead_letter')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_ledger (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id),
  provider text not null,
  operation text not null,
  credits integer not null check (credits >= 0),
  provider_cost_usd numeric(12,6) check (provider_cost_usd >= 0),
  correlation_id uuid,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table app_private.provider_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  encrypted_credentials text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

create or replace function app_private.is_workspace_member(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = target and m.user_id = auth.uid());
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))); return new; end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

do $$ declare table_name text; begin
  foreach table_name in array array['workspaces','projects','conversations','research_runs','ideas','content_packages','jobs'] loop
    execute format('create trigger touch_%I before update on public.%I for each row execute function public.touch_updated_at()', table_name, table_name);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.channels enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.voice_assets enable row level security;
alter table public.research_runs enable row level security;
alter table public.research_sources enable row level security;
alter table public.ideas enable row level security;
alter table public.content_packages enable row level security;
alter table public.approvals enable row level security;
alter table public.jobs enable row level security;
alter table public.usage_ledger enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles_self_read" on public.profiles for select using (id = auth.uid());
create policy "profiles_self_update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "workspaces_members_read" on public.workspaces for select using (app_private.is_workspace_member(id) or owner_id = auth.uid());
create policy "workspaces_create" on public.workspaces for insert with check (owner_id = auth.uid());
create policy "workspace_members_read" on public.workspace_members for select using (app_private.is_workspace_member(workspace_id));

do $$ declare table_name text; begin
  foreach table_name in array array['channels','projects','conversations','messages','voice_assets','research_runs','research_sources','ideas','content_packages','approvals'] loop
    execute format('create policy %I on public.%I for all using (app_private.is_workspace_member(workspace_id)) with check (app_private.is_workspace_member(workspace_id))', table_name || '_workspace_access', table_name);
  end loop;
end $$;

create policy "jobs_members_read" on public.jobs for select using (app_private.is_workspace_member(workspace_id));
create policy "usage_members_read" on public.usage_ledger for select using (app_private.is_workspace_member(workspace_id));
create policy "audit_members_read" on public.audit_events for select using (app_private.is_workspace_member(workspace_id));

create index workspace_members_user_idx on public.workspace_members(user_id);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index research_runs_workspace_state_idx on public.research_runs(workspace_id, state);
create index research_sources_run_idx on public.research_sources(research_run_id);
create index ideas_workspace_score_idx on public.ideas(workspace_id, score desc);
create index approvals_workspace_state_idx on public.approvals(workspace_id, state, requested_at desc);
create index jobs_queue_idx on public.jobs(state, available_at) where state in ('queued','failed');
create index usage_workspace_created_idx on public.usage_ledger(workspace_id, created_at desc);
create index audit_workspace_created_idx on public.audit_events(workspace_id, created_at desc);
