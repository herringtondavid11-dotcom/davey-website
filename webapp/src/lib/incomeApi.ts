// Household income, stored per household so both partners see the same sources.
// The tables are added by supabase-changes/migrations/20261112_income_sources.sql.

import type { IncomeCategory, IncomeSource } from './income'
import { INCOME_CATEGORIES, clampCents, isMonthKey } from './income'
import type { FilingStatus } from './incomeTax'
import { FILING_STATUSES } from './incomeTax'
import { supabase } from './supabase'

export interface IncomeSettings {
  id: string | null
  filingStatus: FilingStatus
  /** Percent of expected income, or null to use the tax brackets. */
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
}

export async function loadIncome(): Promise<IncomeBundle> {
  const members = await supabase.from('household_members').select('household_id').limit(1)
  if (members.error) throw friendly(members.error, 'load')
  const householdId = (members.data?.[0]?.household_id as string | undefined) ?? ''
  if (!householdId) return { householdId: '', sources: [], settings: defaultIncomeSettings() }

  const [sources, settings] = await Promise.all([
    supabase.from('income_sources').select('id,name,category,monthly_cents,amount_basis,starts_on,ends_on,month_overrides,created_at').eq('household_id', householdId),
    supabase.from('income_settings').select('id,filing_status,effective_rate_override').eq('household_id', householdId).limit(1),
  ])
  if (sources.error) throw friendly(sources.error, 'load')
  if (settings.error) throw friendly(settings.error, 'load')

  const rows = ((sources.data ?? []) as Record<string, unknown>[]).map(toSource)
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name))
  const settingRow = (settings.data?.[0] ?? null) as Record<string, unknown> | null
  return { householdId, sources: rows, settings: settingRow ? toSettings(settingRow) : defaultIncomeSettings() }
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
    updated_at: row.updated_at,
  }).eq('id', source.id)
  if (error) throw friendly(error, 'save')
}

export async function deleteSource(id: string): Promise<void> {
  const { error } = await supabase.from('income_sources').delete().eq('id', id)
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
    created_at: source.createdAt,
    updated_at: new Date().toISOString(),
  }
}

function toSource(row: Record<string, unknown>): IncomeSource {
  const category = INCOME_CATEGORIES.some((item) => item.id === row.category) ? row.category as IncomeCategory : 'other'
  return {
    id: String(row.id),
    name: typeof row.name === 'string' && row.name.trim() ? row.name : 'Income',
    category,
    monthlyCents: clampCents(typeof row.monthly_cents === 'number' ? row.monthly_cents : Number(row.monthly_cents)),
    amountBasis: row.amount_basis === 'annual' ? 'annual' : 'monthly',
    startsOn: typeof row.starts_on === 'string' && isMonthKey(row.starts_on) ? row.starts_on : null,
    endsOn: typeof row.ends_on === 'string' && isMonthKey(row.ends_on) ? row.ends_on : null,
    overrides: asOverrides(row.month_overrides),
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  }
}

function toSettings(row: Record<string, unknown>): IncomeSettings {
  const filing = FILING_STATUSES.some((item) => item.id === row.filing_status) ? row.filing_status as FilingStatus : 'mfj'
  return { id: String(row.id), filingStatus: filing, effectiveRatePercent: asRate(row.effective_rate_override) }
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
  if (error.code === 'PGRST205' || /schema cache|could not find the table/i.test(message)) return new IncomeSchemaError()
  if (error.code === '42501' || /42501|row-level security/i.test(message)) return new Error('Your household is read-only right now.')
  return new Error(action === 'load' ? "Couldn't load your income. Try again in a moment." : "Couldn't save your income. Try again in a moment.")
}
