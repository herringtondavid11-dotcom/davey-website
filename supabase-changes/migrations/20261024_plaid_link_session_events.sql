-- Link session events from Plaid webhooks (LINK/EVENTS, SESSION_FINISHED) and from /link/token/get.
-- Service role only. Payloads must already have tokens redacted by the Edge Functions.
create table if not exists public.plaid_link_session_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('webhook', 'token_get')),
  link_session_id text,
  event_id text not null,
  event_name text,
  webhook_code text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists plaid_link_session_events_source_event
  on public.plaid_link_session_events (source, event_id);

alter table public.plaid_link_session_events enable row level security;

revoke all on public.plaid_link_session_events from public, anon, authenticated;
grant select, insert, update, delete on public.plaid_link_session_events to service_role;
