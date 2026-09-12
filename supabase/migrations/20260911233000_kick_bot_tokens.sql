create table if not exists public.kick_bot_tokens (
  role text primary key check (role in ('channel', 'bot')),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  kick_user_id bigint,
  kick_username text,
  updated_at timestamptz not null default now()
);

alter table public.kick_bot_tokens enable row level security;

create table if not exists public.kick_oauth_states (
  state text primary key,
  role text not null check (role in ('channel', 'bot')),
  code_verifier text not null,
  created_at timestamptz not null default now()
);

alter table public.kick_oauth_states enable row level security;

create table if not exists public.kick_bot_seen_events (
  message_id text primary key,
  received_at timestamptz not null default now()
);

alter table public.kick_bot_seen_events enable row level security;

create table if not exists public.kick_bot_rate_limit (
  id boolean primary key default true check (id),
  last_sent_at timestamptz
);

alter table public.kick_bot_rate_limit enable row level security;

insert into public.kick_bot_rate_limit (id, last_sent_at)
values (true, null)
on conflict (id) do nothing;

create index if not exists kick_oauth_states_created_at_idx
  on public.kick_oauth_states (created_at);

create index if not exists kick_bot_seen_events_received_at_idx
  on public.kick_bot_seen_events (received_at);

-- These tables contain OAuth credentials and webhook bookkeeping. There are
-- intentionally no client-facing policies; only the Edge Functions use them
-- through the Supabase service-role key.
