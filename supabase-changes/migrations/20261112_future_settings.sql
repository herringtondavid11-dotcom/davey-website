-- Future page assumptions (daveypersonalfinance.com/app/future).
-- Additive only: one new table, household RLS, and grants. Does not change
-- existing tables or rows. Apply this file on its own. Do not run it as part
-- of a broader db push that rewrites other objects.
--
-- The web app works without this table: it keeps assumptions in localStorage
-- until the table exists, then shares them with the household.
--
-- Both partners can read (is_household_member). Writes use the same gate as
-- household_records (can_write_household: the owner, or a member whose access
-- has not expired).

create table public.future_settings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households (id) on delete cascade,
  investment_return_percent numeric(6, 2) not null default 7 check (investment_return_percent between -20 and 40),
  cash_yield_percent numeric(6, 2) not null default 4 check (cash_yield_percent between -5 and 20),
  inflation_percent numeric(6, 2) not null default 3 check (inflation_percent between -5 and 20),
  real_dollars boolean not null default false,
  income_growth_percent numeric(6, 2) not null default 3 check (income_growth_percent between -20 and 40),
  -- Dollars per month at today's income. contribution_basis 'rate' scales them
  -- with income growth; 'fixed' keeps the dollars constant.
  monthly_investment numeric(14, 2) not null default 0 check (monthly_investment between -100000000 and 100000000),
  monthly_cash numeric(14, 2) not null default 0 check (monthly_cash between -100000000 and 100000000),
  contribution_basis text not null default 'rate' check (contribution_basis in ('fixed', 'rate')),
  debt_payment numeric(14, 2) not null default 0 check (debt_payment >= 0 and debt_payment <= 100000000),
  -- [{ "id", "year" (1-40), "amount" }] Positive is a windfall; negative is an expense.
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

comment on table public.future_settings is
  'Future-page assumptions shared by a household. Read by every member; writes follow can_write_household.';

alter table public.future_settings enable row level security;

create policy future_settings_select on public.future_settings
  for select to authenticated
  using ((select public.is_household_member(household_id)));

create policy future_settings_insert on public.future_settings
  for insert to authenticated
  with check ((select public.can_write_household(household_id)));

create policy future_settings_update on public.future_settings
  for update to authenticated
  using ((select public.can_write_household(household_id)))
  with check ((select public.can_write_household(household_id)));

create policy future_settings_delete on public.future_settings
  for delete to authenticated
  using ((select public.can_write_household(household_id)));

revoke all on table public.future_settings from public, anon;
grant select, insert, update, delete on table public.future_settings to authenticated, service_role;
