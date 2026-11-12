// Planning estimate for a California household. Tax year 2026.
// Federal brackets and standard deduction: IRS Rev. Proc. 2025-32 (IR-2025-102).
// Social Security wage base: $184,500 (SSA / California EDD DE 202, 2026).
// California brackets, standard deduction, and exemption credit: 2026 FTB indexed amounts.
// This is not a tax return. It skips credits, QBI, itemizing, AMT, NIIT, and the senior deduction.

import { INCOME_CATEGORIES, SE_CATEGORIES, UNTAXED_CATEGORIES, type IncomeCategory } from './income'

export const TAX_YEAR = 2026
export const TAX_DISCLAIMER = 'Planning estimate only. This is not tax advice and it is not a tax return.'

export const FILING_STATUSES = [
  { id: 'mfj', label: 'Married filing jointly' },
  { id: 'single', label: 'Single' },
  { id: 'mfs', label: 'Married filing separately' },
  { id: 'hoh', label: 'Head of household' },
] as const

export type FilingStatus = (typeof FILING_STATUSES)[number]['id']

interface Band {
  /** Upper bound of taxable income, in dollars. Null is the top bracket. */
  upTo: number | null
  rate: number
}

/** Rev. Proc. 2025-32, section 4.01. Upper bounds are the "not over" amounts. */
const FEDERAL: Record<FilingStatus, Band[]> = {
  mfj: [
    { upTo: 24_800, rate: 0.1 },
    { upTo: 100_800, rate: 0.12 },
    { upTo: 211_400, rate: 0.22 },
    { upTo: 403_550, rate: 0.24 },
    { upTo: 512_450, rate: 0.32 },
    { upTo: 768_700, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  hoh: [
    { upTo: 17_700, rate: 0.1 },
    { upTo: 67_450, rate: 0.12 },
    { upTo: 105_700, rate: 0.22 },
    { upTo: 201_750, rate: 0.24 },
    { upTo: 256_200, rate: 0.32 },
    { upTo: 640_600, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  single: [
    { upTo: 12_400, rate: 0.1 },
    { upTo: 50_400, rate: 0.12 },
    { upTo: 105_700, rate: 0.22 },
    { upTo: 201_775, rate: 0.24 },
    { upTo: 256_225, rate: 0.32 },
    { upTo: 640_600, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
  mfs: [
    { upTo: 12_400, rate: 0.1 },
    { upTo: 50_400, rate: 0.12 },
    { upTo: 105_700, rate: 0.22 },
    { upTo: 201_775, rate: 0.24 },
    { upTo: 256_225, rate: 0.32 },
    { upTo: 384_350, rate: 0.35 },
    { upTo: null, rate: 0.37 },
  ],
}

/** 2026 FTB schedules. Joint thresholds are double the single ones. Head of household is its own schedule. */
const CALIFORNIA: Record<FilingStatus, Band[]> = {
  mfj: [
    { upTo: 22_912, rate: 0.01 },
    { upTo: 54_314, rate: 0.02 },
    { upTo: 85_722, rate: 0.04 },
    { upTo: 118_996, rate: 0.06 },
    { upTo: 150_394, rate: 0.08 },
    { upTo: 768_218, rate: 0.093 },
    { upTo: 921_854, rate: 0.103 },
    { upTo: 1_536_426, rate: 0.113 },
    { upTo: null, rate: 0.123 },
  ],
  single: [
    { upTo: 11_456, rate: 0.01 },
    { upTo: 27_157, rate: 0.02 },
    { upTo: 42_861, rate: 0.04 },
    { upTo: 59_498, rate: 0.06 },
    { upTo: 75_197, rate: 0.08 },
    { upTo: 384_109, rate: 0.093 },
    { upTo: 460_927, rate: 0.103 },
    { upTo: 768_213, rate: 0.113 },
    { upTo: null, rate: 0.123 },
  ],
  mfs: [
    { upTo: 11_456, rate: 0.01 },
    { upTo: 27_157, rate: 0.02 },
    { upTo: 42_861, rate: 0.04 },
    { upTo: 59_498, rate: 0.06 },
    { upTo: 75_197, rate: 0.08 },
    { upTo: 384_109, rate: 0.093 },
    { upTo: 460_927, rate: 0.103 },
    { upTo: 768_213, rate: 0.113 },
    { upTo: null, rate: 0.123 },
  ],
  hoh: [
    { upTo: 22_927, rate: 0.01 },
    { upTo: 54_316, rate: 0.02 },
    { upTo: 70_018, rate: 0.04 },
    { upTo: 86_654, rate: 0.06 },
    { upTo: 102_356, rate: 0.08 },
    { upTo: 522_385, rate: 0.093 },
    { upTo: 626_864, rate: 0.103 },
    { upTo: 1_044_771, rate: 0.113 },
    { upTo: null, rate: 0.123 },
  ],
}

/** Dollars. Rev. Proc. 2025-32 section 4.14. */
export const FEDERAL_STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  mfj: 32_200,
  hoh: 24_150,
  single: 16_100,
  mfs: 16_100,
}

/** Dollars. 2026 FTB standard deduction. */
export const CA_STANDARD_DEDUCTION: Record<FilingStatus, number> = {
  mfj: 11_800,
  hoh: 11_800,
  single: 5_900,
  mfs: 5_900,
}

/** Cents. Personal exemption credit, subtracted from California tax (not from income). */
const CA_EXEMPTION_CREDIT: Record<FilingStatus, number> = {
  mfj: 31_600,
  hoh: 15_800,
  single: 15_800,
  mfs: 15_800,
}

/** Additional Medicare Tax threshold, in cents. Not indexed. */
const ADDITIONAL_MEDICARE: Record<FilingStatus, number> = {
  mfj: 25_000_000,
  single: 20_000_000,
  hoh: 20_000_000,
  mfs: 12_500_000,
}

/** 2026 Social Security wage base, in cents. */
export const SS_WAGE_BASE_CENTS = 18_450_000

/** 1% Mental Health Services Tax starts at $1,000,000 of California taxable income, every filing status. */
const CA_SURTAX_CENTS = 100_000_000

export interface TaxEstimate {
  grossCents: number
  selfEmploymentIncomeCents: number
  selfEmploymentTaxCents: number
  deductibleHalfCents: number
  federalTaxableCents: number
  federalTaxCents: number
  federalMarginal: number
  stateTaxableCents: number
  stateTaxCents: number
  stateMarginal: number
  bracketTotalCents: number
  totalCents: number
  usingOverride: boolean
}

export interface TaxInput {
  filingStatus: FilingStatus
  byCategory: Record<IncomeCategory, number>
  /** Percent of expected income, or null to use the brackets. */
  effectiveRatePercent: number | null
}

export function emptyCategories(): Record<IncomeCategory, number> {
  return Object.fromEntries(INCOME_CATEGORIES.map((item) => [item.id, 0])) as Record<IncomeCategory, number>
}

export function estimateIncomeTax(input: TaxInput): TaxEstimate {
  const gross = INCOME_CATEGORIES.reduce((sum, item) => sum + (UNTAXED_CATEGORIES.has(item.id) ? 0 : Math.max(0, Math.round(input.byCategory[item.id] ?? 0))), 0)
  const seIncome = INCOME_CATEGORIES.reduce((sum, item) => sum + (SE_CATEGORIES.has(item.id) ? Math.max(0, Math.round(input.byCategory[item.id] ?? 0)) : 0), 0)
  const wages = Math.max(0, Math.round(input.byCategory.w2 ?? 0))
  const net = Math.round(seIncome * 0.9235)
  const socialSecurityBase = Math.min(net, Math.max(0, SS_WAGE_BASE_CENTS - wages))
  const socialSecurity = Math.round(socialSecurityBase * 0.124)
  const medicare = Math.round(net * 0.029)
  const extraBase = Math.min(net, Math.max(0, wages + net - ADDITIONAL_MEDICARE[input.filingStatus]))
  const additional = Math.round(extraBase * 0.009)
  const selfEmploymentTax = socialSecurity + medicare + additional
  const deductibleHalf = Math.round((socialSecurity + medicare) / 2)
  const agi = Math.max(0, gross - deductibleHalf)
  const federalTaxable = Math.max(0, agi - FEDERAL_STANDARD_DEDUCTION[input.filingStatus] * 100)
  const stateTaxable = Math.max(0, agi - CA_STANDARD_DEDUCTION[input.filingStatus] * 100)
  const federalTax = taxCents(federalTaxable, FEDERAL[input.filingStatus])
  const stateRegular = Math.max(0, taxCents(stateTaxable, CALIFORNIA[input.filingStatus]) - CA_EXEMPTION_CREDIT[input.filingStatus])
  const surtax = Math.round(Math.max(0, stateTaxable - CA_SURTAX_CENTS) * 0.01)
  const stateTax = stateRegular + surtax
  const bracketTotal = federalTax + selfEmploymentTax + stateTax
  const rate = input.effectiveRatePercent
  const usingOverride = rate !== null && Number.isFinite(rate) && rate >= 0 && rate <= 100
  const total = usingOverride ? Math.round(gross * (rate / 100)) : bracketTotal
  return {
    grossCents: gross,
    selfEmploymentIncomeCents: seIncome,
    selfEmploymentTaxCents: selfEmploymentTax,
    deductibleHalfCents: deductibleHalf,
    federalTaxableCents: federalTaxable,
    federalTaxCents: federalTax,
    federalMarginal: marginal(federalTaxable, FEDERAL[input.filingStatus]),
    stateTaxableCents: stateTaxable,
    stateTaxCents: stateTax,
    stateMarginal: marginal(stateTaxable, CALIFORNIA[input.filingStatus]),
    bracketTotalCents: bracketTotal,
    totalCents: total,
    usingOverride,
  }
}

export function taxAssumptions(status: FilingStatus): string[] {
  const filing = FILING_STATUSES.find((item) => item.id === status)?.label ?? status
  const federal = FEDERAL_STANDARD_DEDUCTION[status].toLocaleString('en-US')
  const state = CA_STANDARD_DEDUCTION[status].toLocaleString('en-US')
  return [
    `Filing status is ${filing}. Federal brackets and the $${federal} standard deduction are the 2026 amounts from IRS Revenue Procedure 2025-32.`,
    'Federal tax uses the standard deduction only. It does not itemize, and it leaves out tax credits, the qualified business income deduction, alternative minimum tax, the net investment income tax, and the extra deduction for people 65 or older.',
    'Self-employment tax applies to self-employment, 1099 contract, business / K-1, and side gig: 15.3% of 92.35% of that income. The Social Security portion stops at the $184,500 wage base for 2026, and W-2 income counts toward that cap. An extra 0.9% Medicare tax applies above the statutory threshold ($250,000 married filing jointly, $200,000 single or head of household, $125,000 married filing separately). Half of the 15.3% portion is deducted before income tax.',
    'W-2, real estate / rental, investments, retirement, and other income are not treated as self-employment. Alimony and child support are left out of the tax estimate. W-2 Social Security, Medicare, and California SDI already withheld by an employer are not included.',
    `California tax uses the 2026 Franchise Tax Board brackets, a $${state} standard deduction, the personal exemption credit, and the 1% Mental Health Services Tax on taxable income over $1,000,000. Other California credits are not included.`,
    'Calculated for a California resident. Another state would not match these figures.',
    TAX_DISCLAIMER,
  ]
}

function taxCents(taxableCents: number, bands: Band[]): number {
  let tax = 0
  let prev = 0
  const taxable = Math.max(0, Math.round(taxableCents))
  for (const band of bands) {
    const cap = band.upTo === null ? Number.POSITIVE_INFINITY : band.upTo * 100
    const slice = Math.max(0, Math.min(taxable, cap) - prev)
    tax += Math.round(slice * band.rate)
    prev = cap
    if (taxable <= cap) break
  }
  return tax
}

function marginal(taxableCents: number, bands: Band[]): number {
  const taxable = Math.max(0, Math.round(taxableCents))
  for (const band of bands) {
    const cap = band.upTo === null ? Number.POSITIVE_INFINITY : band.upTo * 100
    if (taxable <= cap) return band.rate
  }
  return bands[bands.length - 1]?.rate ?? 0
}
