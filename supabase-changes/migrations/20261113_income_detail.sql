-- Income detail: pay frequency, who receives it, short-term vs ongoing, planned rows, and what-if scenarios.
-- Additive. Existing income_sources rows keep their values; new columns have defaults.
-- The category check is replaced so new type names are allowed. Every value already stored
-- (w2, self_employment, real_estate, other) still passes. No row is updated or deleted.
-- Apply this file on its own. Do not run it as part of a broader db push.

alter table public.income_sources
  add column if not exists cadence text not null default 'monthly'
    check (cadence in ('monthly', 'twice', 'four', 'biweekly', 'weekly', 'custom')),
  add column if not exists times_per_month numeric(6, 2) not null default 1
    check (times_per_month > 0 and times_per_month <= 31),
  add column if not exists occurrence_cents bigint
    check (occurrence_cents is null or (occurrence_cents >= 0 and occurrence_cents <= 100000000000)),
  add column if not exists duration text not null default 'ongoing'
    check (duration in ('ongoing', 'once', 'repeat', 'range')),
  add column if not exists occurrence_count integer
    check (occurrence_count is null or (occurrence_count >= 1 and occurrence_count <= 366)),
  add column if not exists status text not null default 'confirmed'
    check (status in ('confirmed', 'planned')),
  add column if not exists person_user_id uuid references auth.users (id) on delete set null,
  add column if not exists person_other text
    check (person_other is null or char_length(person_other) <= 80);

alter table public.income_sources drop constraint if exists income_sources_category_check;
alter table public.income_sources add constraint income_sources_category_check
  check (category in (
    'w2', 'self_employment', 'real_estate', 'other',
    'contract_1099', 'k1', 'side_gig', 'investment', 'retirement', 'support'
  ));

create table if not exists public.income_scenarios (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null default 'Scenario' check (char_length(btrim(name)) between 1 and 120),
  kind text not null check (kind in ('raise', 'hypothetical')),
  source_id uuid references public.income_sources (id) on delete cascade,
  raise_percent numeric(6, 2) check (raise_percent is null or (raise_percent >= -100 and raise_percent <= 1000)),
  raise_cents bigint check (raise_cents is null or (raise_cents >= -100000000000 and raise_cents <= 100000000000)),
  effective_month text check (effective_month is null or effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists income_scenarios_household_id_idx on public.income_scenarios (household_id);

comment on table public.income_scenarios is
  'What-if raises and hypothetical income. They do not change confirmed sources until applied.';

alter table public.income_scenarios enable row level security;

drop policy if exists income_scenarios_select on public.income_scenarios;
drop policy if exists income_scenarios_insert on public.income_scenarios;
drop policy if exists income_scenarios_update on public.income_scenarios;
drop policy if exists income_scenarios_delete on public.income_scenarios;

create policy income_scenarios_select on public.income_scenarios
  for select to authenticated
  using ((select public.is_household_member(household_id)));

create policy income_scenarios_insert on public.income_scenarios
  for insert to authenticated
  with check ((select public.can_write_household(household_id)));

create policy income_scenarios_update on public.income_scenarios
  for update to authenticated
  using ((select public.can_write_household(household_id)))
  with check ((select public.can_write_household(household_id)));

create policy income_scenarios_delete on public.income_scenarios
  for delete to authenticated
  using ((select public.can_write_household(household_id)));

revoke all on table public.income_scenarios from public, anon;
grant select, insert, update, delete on table public.income_scenarios to authenticated, service_role;
