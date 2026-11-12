import { describe, expect, it } from 'vitest'
import { emptyCategories, estimateIncomeTax, taxAssumptions, type TaxInput } from './incomeTax'

function input(partial: Partial<TaxInput> = {}): TaxInput {
  return { filingStatus: 'mfj', byCategory: emptyCategories(), effectiveRatePercent: null, ...partial }
}

describe('income tax estimate', () => {
  it('matches the published federal tax at the top of the 12% married-filing-jointly bracket', () => {
    // Rev. Proc. 2025-32: taxable income of $100,800 is $11,600.
    const estimate = estimateIncomeTax(input({
      byCategory: { ...emptyCategories(), w2: 10_080_000 + 3_220_000 },
    }))
    expect(estimate.federalTaxableCents).toBe(10_080_000)
    expect(estimate.federalTaxCents).toBe(1_160_000)
    expect(estimate.federalMarginal).toBe(0.12)
    expect(estimate.selfEmploymentTaxCents).toBe(0)
  })

  it('estimates $96,000 of W-2 wages for a California couple filing jointly', () => {
    const estimate = estimateIncomeTax(input({ byCategory: { ...emptyCategories(), w2: 9_600_000 } }))
    // Taxable federal: 96,000 − 32,200 = 63,800. Tax = 2,480 + 12% × 39,000 = 7,160.
    expect(estimate.federalTaxCents).toBe(716_000)
    // California taxable 84,200. 1% × 22,912 + 2% × 31,402 + 4% × 29,886 − $316 credit.
    expect(estimate.stateTaxCents).toBe(173_660)
    expect(estimate.totalCents).toBe(889_660)
    expect(estimate.usingOverride).toBe(false)
  })

  it('estimates $120,000 of W-2 wages for the same couple', () => {
    const estimate = estimateIncomeTax(input({ byCategory: { ...emptyCategories(), w2: 12_000_000 } }))
    expect(estimate.federalTaxCents).toBe(1_004_000)
    expect(estimate.stateTaxCents).toBe(314_616)
    expect(estimate.totalCents).toBe(1_318_616)
  })

  it('charges self-employment tax on self-employment income only, and deducts half before income tax', () => {
    const estimate = estimateIncomeTax(input({
      byCategory: { ...emptyCategories(), self_employment: 10_000_000 },
    }))
    // 92.35% × $100,000 = $92,350. Social Security 12.4% + Medicare 2.9%.
    expect(estimate.selfEmploymentTaxCents).toBe(1_145_140 + 267_815)
    expect(estimate.deductibleHalfCents).toBe(706_478)
    expect(estimate.federalTaxableCents).toBe(10_000_000 - 706_478 - 3_220_000)
  })

  it('does not charge more Social Security tax once W-2 wages fill the wage base', () => {
    const estimate = estimateIncomeTax(input({
      byCategory: { ...emptyCategories(), w2: 20_000_000, self_employment: 5_000_000 },
    }))
    // Net earnings $46,175. Wage base is already full, so only Medicare (2.9%).
    expect(estimate.selfEmploymentTaxCents).toBe(133_908)
  })

  it('adds Additional Medicare tax once combined earnings pass the single threshold', () => {
    const estimate = estimateIncomeTax(input({
      filingStatus: 'single',
      byCategory: { ...emptyCategories(), w2: 20_000_000, self_employment: 5_000_000 },
    }))
    // All $46,175 of net self-employment earnings sit above $200,000.
    expect(estimate.selfEmploymentTaxCents).toBe(133_908 + 41_558)
  })

  it('does not treat real estate or other income as self-employment', () => {
    const estimate = estimateIncomeTax(input({
      byCategory: { ...emptyCategories(), real_estate: 2_400_000, other: 100_000 },
    }))
    expect(estimate.selfEmploymentTaxCents).toBe(0)
    expect(estimate.grossCents).toBe(2_500_000)
  })

  it('taxes 1099 and side gig as self-employment and leaves support untaxed', () => {
    const estimate = estimateIncomeTax(input({
      byCategory: { ...emptyCategories(), contract_1099: 1_000_000, side_gig: 200_000, support: 500_000 },
    }))
    expect(estimate.selfEmploymentIncomeCents).toBe(1_200_000)
    expect(estimate.grossCents).toBe(1_200_000)
  })

  it('uses an effective-rate override for the total and still reports the bracket estimate', () => {
    const estimate = estimateIncomeTax(input({
      byCategory: { ...emptyCategories(), w2: 9_600_000 },
      effectiveRatePercent: 25,
    }))
    expect(estimate.usingOverride).toBe(true)
    expect(estimate.totalCents).toBe(2_400_000)
    expect(estimate.bracketTotalCents).toBe(889_660)
  })

  it('states the assumptions, including that it is not tax advice', () => {
    const notes = taxAssumptions('mfj')
    expect(notes.join(' ')).toContain('not tax advice')
    expect(notes.join(' ')).toContain('California')
    expect(notes.join(' ')).toContain('$32,200')
    expect(notes.join(' ')).toContain('$184,500')
    expect(notes.join(' ')).toContain('Married filing jointly')
  })
})
