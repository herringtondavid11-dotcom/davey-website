// Household Future-page assumptions.
// The table is added by supabase-changes/migrations/20261112_future_settings.sql.
// Until that migration is applied, assumptions stay in localStorage on this
// browser and the page still projects from the household's balances.

import { assumptionsFromUnknown, type FutureAssumptions } from './future'
import { supabase } from './supabase'

export interface FutureSettingsLoad {
  householdId: string
  assumptions: FutureAssumptions | null
  id: string | null
  /** Where a later save should go. `table` means the table exists (a row may still be absent). */
  storage: 'table' | 'local'
  error: string
}

const LOCAL_PREFIX = 'davey.future.'

function localKey(householdId: string): string {
  return LOCAL_PREFIX + (householdId || 'local')
}

export function readLocalAssumptions(householdId: string): FutureAssumptions | null {
  try {
    const raw = localStorage.getItem(localKey(householdId))
    if (!raw) return null
    return assumptionsFromUnknown(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writeLocalAssumptions(householdId: string, assumptions: FutureAssumptions) {
  try {
    localStorage.setItem(localKey(householdId), JSON.stringify(assumptions))
  } catch {
    // Private mode and a full disk both leave the in-memory controls working.
  }
}

function schemaMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message ?? ''
  return error.code === 'PGRST205' || error.code === '42P01' || /schema cache|could not find the table|does not exist/i.test(message)
}

function readOnly(error: { code?: string; message?: string }): boolean {
  return error.code === '42501' || /42501|row-level security/i.test(error.message ?? '')
}

function fromRow(row: Record<string, unknown>): FutureAssumptions | null {
  return assumptionsFromUnknown({
    investmentReturnPercent: row.investment_return_percent,
    cashYieldPercent: row.cash_yield_percent,
    inflationPercent: row.inflation_percent,
    realDollars: row.real_dollars,
    incomeGrowthPercent: row.income_growth_percent,
    monthlyInvestment: Number(row.monthly_investment),
    monthlyCash: Number(row.monthly_cash),
    contributionBasis: row.contribution_basis,
    debtPayment: Number(row.debt_payment),
    events: row.events,
  })
}

function fields(assumptions: FutureAssumptions) {
  return {
    investment_return_percent: assumptions.investmentReturnPercent,
    cash_yield_percent: assumptions.cashYieldPercent,
    inflation_percent: assumptions.inflationPercent,
    real_dollars: assumptions.realDollars,
    income_growth_percent: assumptions.incomeGrowthPercent,
    monthly_investment: assumptions.monthlyInvestment,
    monthly_cash: assumptions.monthlyCash,
    contribution_basis: assumptions.contributionBasis,
    debt_payment: assumptions.debtPayment,
    events: assumptions.events,
    updated_at: new Date().toISOString(),
  }
}

export async function loadFutureSettings(): Promise<FutureSettingsLoad> {
  const members = await supabase.from('household_members').select('household_id').limit(1)
  if (members.error) {
    return { householdId: '', assumptions: readLocalAssumptions(''), id: null, storage: 'local', error: "Couldn't load saved assumptions." }
  }
  const householdId = (members.data?.[0]?.household_id as string | undefined) ?? ''
  const local = readLocalAssumptions(householdId)
  if (!householdId) return { householdId: '', assumptions: local, id: null, storage: 'local', error: '' }

  const table = await supabase.from('future_settings')
    .select('id,investment_return_percent,cash_yield_percent,inflation_percent,real_dollars,income_growth_percent,monthly_investment,monthly_cash,contribution_basis,debt_payment,events')
    .eq('household_id', householdId)
    .limit(1)
  if (table.error) {
    if (schemaMissing(table.error)) return { householdId, assumptions: local, id: null, storage: 'local', error: '' }
    return { householdId, assumptions: local, id: null, storage: 'local', error: "Couldn't load saved assumptions." }
  }
  const row = (table.data?.[0] ?? null) as Record<string, unknown> | null
  if (!row) return { householdId, assumptions: local, id: null, storage: 'table', error: '' }
  const assumptions = fromRow(row)
  return { householdId, assumptions: assumptions ?? local, id: assumptions ? String(row.id) : null, storage: 'table', error: '' }
}

export async function saveFutureSettings(
  householdId: string,
  assumptions: FutureAssumptions,
  id: string | null,
  storage: 'table' | 'local',
): Promise<{ id: string | null; storage: 'table' | 'local'; error: string }> {
  const clean = assumptionsFromUnknown(assumptions) ?? assumptions
  if (!householdId || storage === 'local') {
    writeLocalAssumptions(householdId, clean)
    return { id: null, storage: 'local', error: '' }
  }
  const nextId = id ?? crypto.randomUUID()
  const write = id
    ? supabase.from('future_settings').update(fields(clean)).eq('id', id)
    : supabase.from('future_settings').insert({ ...fields(clean), id: nextId, household_id: householdId })
  const { error } = await write
  if (error) {
    if (schemaMissing(error)) {
      writeLocalAssumptions(householdId, clean)
      return { id: null, storage: 'local', error: '' }
    }
    if (readOnly(error)) return { id, storage: 'table', error: 'Your household is read-only right now.' }
    return { id, storage: 'table', error: "Couldn't save these assumptions." }
  }
  writeLocalAssumptions(householdId, clean)
  return { id: nextId, storage: 'table', error: '' }
}
