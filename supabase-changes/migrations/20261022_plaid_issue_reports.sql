-- Report to Plaid (web + app). Users can insert and read their own reports; support reads all with the service role.
create table if not exists public.plaid_issue_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  platform text not null default 'web',
  institution text,
  kind text,
  details text,
  link_session_id text,
  request_id text,
  institution_id text,
  error_code text,
  error_message text,
  status text not null default 'new'
);
alter table public.plaid_issue_reports enable row level security;
create policy "insert own reports" on public.plaid_issue_reports for insert to authenticated with check (user_id = auth.uid());
create policy "read own reports" on public.plaid_issue_reports for select to authenticated using (user_id = auth.uid());
