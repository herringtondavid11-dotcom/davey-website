-- Income sources for the web app (daveypersonalfinance.com/app/income).
-- Additive only: new tables, indexes, and household RLS. Does not change existing tables or rows.
-- Apply this file on its own. Do not run it as part of a broader db push that rewrites other objects.
--
-- Both partners in a household can read. Writes use the same gate as household_records
-- (can_write_household: the owner, or a member whose access has not expired).

create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null check (category in ('w2', 'self_employment', 'real_estate', 'other')),
  -- Recurring amount for an active month, in cents. The year total is this times the
  -- active months, with month_overrides (YYYY-MM → cents) replacing individual months.
  monthly_cents bigint not null default 0 check (monthly_cents >= 0 and monthly_cents <= 100000000000),
  amount_basis text not null default 'monthly' check (amount_basis in ('monthly', 'annual')),
  -- Inclusive YYYY-MM. Null start = already active in January. Null end = still active in December.
  starts_on text check (starts_on is null or starts_on ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ends_on text check (ends_on is null or ends_on ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint income_sources_range_ok check (starts_on is null or ends_on is null or starts_on <= ends_on),
  month_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(month_overrides) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

create index income_sources_household_id_idx on public.income_sources (household_id);

create table public.income_settings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households (id) on delete cascade,
  filing_status text not null default 'mfj' check (filing_status in ('single', 'mfj', 'mfs', 'hoh')),
  -- Null uses the bracket estimate. Otherwise a percent of expected annual income (0–100).
  effective_rate_override numeric(5, 2) check (
    effective_rate_override is null
    or (effective_rate_override >= 0 and effective_rate_override <= 100)
  ),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

comment on table public.income_sources is
  'Income sources shared by a household. Read by every member; writes follow can_write_household.';
comment on table public.income_settings is
  'Filing status and optional effective-rate override for the household income tax estimate.';

alter table public.income_sources enable row level security;
alter table public.income_settings enable row level security;

create policy income_sources_select on public.income_sources
  for select to authenticated
  using ((select public.is_household_member(household_id)));

create policy income_sources_insert on public.income_sources
  for insert to authenticated
  with check ((select public.can_write_household(household_id)));

create policy income_sources_update on public.income_sources
  for update to authenticated
  using ((select public.can_write_household(household_id)))
  with check ((select public.can_write_household(household_id)));

create policy income_sources_delete on public.income_sources
  for delete to authenticated
  using ((select public.can_write_household(household_id)));

create policy income_settings_select on public.income_settings
  for select to authenticated
  using ((select public.is_household_member(household_id)));

create policy income_settings_insert on public.income_settings
  for insert to authenticated
  with check ((select public.can_write_household(household_id)));

create policy income_settings_update on public.income_settings
  for update to authenticated
  using ((select public.can_write_household(household_id)))
  with check ((select public.can_write_household(household_id)));

create policy income_settings_delete on public.income_settings
  for delete to authenticated
  using ((select public.can_write_household(household_id)));

revoke all on table public.income_sources from public, anon;
revoke all on table public.income_settings from public, anon;
grant select, insert, update, delete on table public.income_sources to authenticated, service_role;
grant select, insert, update, delete on table public.income_settings to authenticated, service_role;
