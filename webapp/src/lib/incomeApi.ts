// Household income. Tables: income_sources, income_settings (20261112) and the
// detail columns plus income_scenarios (20261113_income_detail.sql).

import type { Cadence, Duration, HouseholdPerson, IncomeCategory, IncomeScenario, IncomeSource, IncomeStatus } from './income'
import { CADENCES, DURATIONS, INCOME_CATEGORIES, blankSource, clampCents, isMonthKey } from './income'
import type { FilingStatus } from './incomeTax'
import { FILING_STATUSES } from './incomeTax'
import { supabase } from './supabase'

export interface IncomeSettings {
  id: string | null
  filingStatus: FilingStatus
  effectiveRatePercent: number | null
}

export function defaultIncomeSettings(): IncomeSettings {
  return { id: null, filingStatus: 'mfj', effectiveRatePercent: null }
}

export class IncomeSchemaError extends Error {
  constructor() {
    super("Income can't be saved yet. The household income table hasn't been added to the database.")
    this.name = 'IncomeSchemaError'
  }
}

export interface IncomeBundle {
  householdId: string
  sources: IncomeSource[]
  settings: IncomeSettings
  scenarios: IncomeScenario[]
  people: HouseholdPerson[]
}

const SOURCE_COLUMNS = 'id,name,category,monthly_cents,amount_basis,starts_on,ends_on,month_overrides,created_at,cadence,times_per_month,occurrence_cents,duration,occurrence_count,status,person_user_id,person_other'

export async function loadIncome(): Promise<IncomeBundle> {
  const members = await supabase.from('household_members').select('household_id,user_id,display_name,role')
  if (members.error) throw friendly(members.error, 'load')
  const memberRows = (members.data ?? []) as { household_id: string; user_id: string; display_name: string | null }[]
  const householdId = memberRows[0]?.household_id ?? ''
  const people = memberRows.map((row) => ({ userId: row.user_id, name: row.display_name?.trim() || 'Member' }))
  if (!householdId) return { householdId: '', sources: [], settings: defaultIncomeSettings(), scenarios: [], people }

  const [sources, settings, scenarios] = await Promise.all([
    supabase.from('income_sources').select(SOURCE_COLUMNS).eq('household_id', householdId),
    supabase.from('income_settings').select('id,filing_status,effective_rate_override').eq('household_id', householdId).limit(1),
    supabase.from('income_scenarios').select('id,name,kind,source_id,raise_percent,raise_cents,effective_month,payload,enabled,created_at').eq('household_id', householdId),
  ])
  if (sources.error) throw friendly(sources.error, 'load')
  if (settings.error) throw friendly(settings.error, 'load')
  if (scenarios.error) throw friendly(scenarios.error, 'load')

  const rows = ((sources.data ?? []) as Record<string, unknown>[]).map(toSource)
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name))
  const settingRow = (settings.data?.[0] ?? null) as Record<string, unknown> | null
  const plans = ((scenarios.data ?? []) as Record<string, unknown>[]).map(toScenario)
  return { householdId, sources: rows, settings: settingRow ? toSettings(settingRow) : defaultIncomeSettings(), scenarios: plans, people }
}

export async function insertSource(householdId: string, source: IncomeSource): Promise<void> {
  const { error } = await supabase.from('income_sources').insert(toRow(householdId, source))
  if (error) throw friendly(error, 'save')
}

export async function updateSource(source: IncomeSource): Promise<void> {
  const row = toRow('', source)
  const { error } = await supabase.from('income_sources').update({
    name: row.name,
    category: row.category,
    monthly_cents: row.monthly_cents,
    amount_basis: row.amount_basis,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    month_overrides: row.month_overrides,
    cadence: row.cadence,
    times_per_month: row.times_per_month,
    occurrence_cents: row.occurrence_cents,
    duration: row.duration,
    occurrence_count: row.occurrence_count,
    status: row.status,
    person_user_id: row.person_user_id,
    person_other: row.person_other,
    updated_at: row.updated_at,
  }).eq('id', source.id)
  if (error) throw friendly(error, 'save')
}

export async function deleteSource(id: string): Promise<void> {
  const { error } = await supabase.from('income_sources').delete().eq('id', id)
  if (error) throw friendly(error, 'save')
}

export async function insertScenario(householdId: string, scenario: IncomeScenario): Promise<void> {
  const { error } = await supabase.from('income_scenarios').insert(scenarioRow(householdId, scenario))
  if (error) throw friendly(error, 'save')
}

export async function deleteScenario(id: string): Promise<void> {
  const { error } = await supabase.from('income_scenarios').delete().eq('id', id)
  if (error) throw friendly(error, 'save')
}

export async function saveSettings(householdId: string, settings: IncomeSettings): Promise<IncomeSettings> {
  const fields = {
    household_id: householdId,
    filing_status: settings.filingStatus,
    effective_rate_override: settings.effectiveRatePercent,
    updated_at: new Date().toISOString(),
  }
  if (settings.id) {
    const { error } = await supabase.from('income_settings').update(fields).eq('id', settings.id)
    if (error) throw friendly(error, 'save')
    return settings
  }
  const id = crypto.randomUUID()
  const { error } = await supabase.from('income_settings').insert({ ...fields, id })
  if (error) throw friendly(error, 'save')
  return { ...settings, id }
}

function toRow(householdId: string, source: IncomeSource) {
  return {
    id: source.id,
    household_id: householdId,
    name: source.name.trim().slice(0, 120) || 'New income',
    category: source.category,
    monthly_cents: clampCents(source.monthlyCents),
    amount_basis: source.amountBasis,
    starts_on: source.startsOn,
    ends_on: source.endsOn,
    month_overrides: source.overrides,
    cadence: source.cadence,
    times_per_month: source.timesPerMonth,
    occurrence_cents: clampCents(source.occurrenceCents),
    duration: source.duration,
    occurrence_count: source.occurrenceCount,
    status: source.status,
    person_user_id: source.personUserId,
    person_other: source.personOther?.trim() ? source.personOther.trim().slice(0, 80) : null,
    created_at: source.createdAt,
    updated_at: new Date().toISOString(),
  }
}

function toSource(row: Record<string, unknown>): IncomeSource {
  const category = INCOME_CATEGORIES.some((item) => item.id === row.category) ? row.category as IncomeCategory : 'other'
  const cadence = CADENCES.some((item) => item.id === row.cadence) ? row.cadence as Cadence : 'monthly'
  const duration = DURATIONS.some((item) => item.id === row.duration) ? row.duration as Duration : 'ongoing'
  const status: IncomeStatus = row.status === 'planned' ? 'planned' : 'confirmed'
  return {
    id: String(row.id),
    name: typeof row.name === 'string' && row.name.trim() ? row.name : 'Income',
    category,
    monthlyCents: asCents(row.monthly_cents),
    amountBasis: row.amount_basis === 'annual' ? 'annual' : 'monthly',
    startsOn: typeof row.starts_on === 'string' && isMonthKey(row.starts_on) ? row.starts_on : null,
    endsOn: typeof row.ends_on === 'string' && isMonthKey(row.ends_on) ? row.ends_on : null,
    overrides: asOverrides(row.month_overrides),
    cadence,
    timesPerMonth: Number(row.times_per_month) > 0 ? Number(row.times_per_month) : 1,
    occurrenceCents: row.occurrence_cents == null ? asCents(row.monthly_cents) : asCents(row.occurrence_cents),
    duration,
    occurrenceCount: Number(row.occurrence_count) > 0 ? Number(row.occurrence_count) : 2,
    status,
    personUserId: typeof row.person_user_id === 'string' ? row.person_user_id : null,
    personOther: typeof row.person_other === 'string' && row.person_other.trim() ? row.person_other : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  }
}

function toScenario(row: Record<string, unknown>): IncomeScenario {
  const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload as Record<string, unknown> : {}
  const hypothetical = payload.source ? toSource({ ...payload.source as Record<string, unknown>, id: (payload.source as { id?: string }).id ?? row.id }) : null
  return {
    id: String(row.id),
    name: typeof row.name === 'string' && row.name.trim() ? row.name : 'Scenario',
    kind: row.kind === 'hypothetical' ? 'hypothetical' : 'raise',
    sourceId: typeof row.source_id === 'string' ? row.source_id : null,
    raisePercent: row.raise_percent == null || row.raise_percent === '' ? null : Number(row.raise_percent),
    raiseCents: row.raise_cents == null || row.raise_cents === '' ? null : asCents(row.raise_cents),
    effectiveMonth: typeof row.effective_month === 'string' && isMonthKey(row.effective_month) ? row.effective_month : null,
    enabled: row.enabled !== false,
    hypothetical: row.kind === 'hypothetical' ? hypothetical ?? blankSource() : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  }
}

function scenarioRow(householdId: string, scenario: IncomeScenario) {
  return {
    id: scenario.id,
    household_id: householdId,
    name: scenario.name.trim().slice(0, 120) || 'Scenario',
    kind: scenario.kind,
    source_id: scenario.sourceId,
    raise_percent: scenario.raisePercent,
    raise_cents: scenario.raiseCents,
    effective_month: scenario.effectiveMonth,
    payload: scenario.hypothetical ? { source: toRow('', scenario.hypothetical) } : {},
    enabled: scenario.enabled,
    created_at: scenario.createdAt,
    updated_at: new Date().toISOString(),
  }
}

function toSettings(row: Record<string, unknown>): IncomeSettings {
  const filing = FILING_STATUSES.some((item) => item.id === row.filing_status) ? row.filing_status as FilingStatus : 'mfj'
  return { id: String(row.id), filingStatus: filing, effectiveRatePercent: asRate(row.effective_rate_override) }
}

function asCents(value: unknown): number {
  return clampCents(typeof value === 'number' ? value : Number(value))
}

function asOverrides(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!isMonthKey(key) || !Number.isFinite(n)) continue
    out[key] = clampCents(n)
  }
  return out
}

function asRate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100) / 100
}

function friendly(error: { code?: string; message?: string }, action: 'load' | 'save'): Error {
  const message = error.message ?? ''
  if (error.code === 'PGRST204' || error.code === 'PGRST205' || /schema cache|could not find the table|does not exist/i.test(message)) return new IncomeSchemaError()
  if (error.code === '42501' || /42501|row-level security/i.test(message)) return new Error('Your household is read-only right now.')
  return new Error(action === 'load' ? "Couldn't load your income. Try again in a moment." : "Couldn't save your income. Try again in a moment.")
}
