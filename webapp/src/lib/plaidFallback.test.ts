import { describe, expect, it } from 'vitest'
import { isFallbackExit, linkTokenBody } from './plaid'

describe('Plaid fallback token (Shellpoint fix)', () => {
  it('retries only for Plaid’s own failures', () => {
    expect(isFallbackExit('API_ERROR', 'INTERNAL_SERVER_ERROR')).toBe(true)
    expect(isFallbackExit('INSTITUTION_ERROR', 'INTERNAL_SERVER_ERROR')).toBe(true)
    expect(isFallbackExit('API_ERROR', undefined)).toBe(true)
    expect(isFallbackExit('ITEM_ERROR', 'INVALID_CREDENTIALS')).toBe(false)
    expect(isFallbackExit(undefined, undefined)).toBe(false)
  })
  it('builds the token body: loans mode, fallback, institution, update mode', () => {
    expect(linkTokenBody()).toEqual({ platform: 'web', redirect_uri: 'https://daveypersonalfinance.com/app/oauth' })
    expect(linkTokenBody({ mode: 'loans' })).toMatchObject({ mode: 'loans' })
    expect(linkTokenBody({ mode: 'loans', fallback: true, institutionId: 'ins_119891' })).toMatchObject({ mode: 'loans', fallback: true, institution_id: 'ins_119891' })
    expect(linkTokenBody({ institutionId: 'nope; drop table' })).not.toHaveProperty('institution_id')
    expect(linkTokenBody({ itemId: 'item-1', fallback: true, mode: 'loans' })).toEqual({ platform: 'web', redirect_uri: 'https://daveypersonalfinance.com/app/oauth', item_id: 'item-1', mode: 'update' })
  })
})
