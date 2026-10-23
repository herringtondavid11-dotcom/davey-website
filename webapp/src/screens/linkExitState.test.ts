import { describe, expect, it } from 'vitest'
import { linkExitState, unfinishedSignInMessage } from './usePlaidFlow'

describe('Link onExit when sign-in does not finish', () => {
  it('names the bank and asks to allow pop-ups', () => {
    expect(unfinishedSignInMessage('Chase')).toBe(
      "Chase sign-in didn't finish. Make sure pop-ups are allowed for this site, then try again.",
    )
    expect(unfinishedSignInMessage('  ')).toBe(
      "Bank sign-in didn't finish. Make sure pop-ups are allowed for this site, then try again.",
    )
    expect(unfinishedSignInMessage(null)).toMatch(/^Bank sign-in/)
  })

  it('shows that message for requires_oauth and any other status when Plaid reports no error', () => {
    const chase = { status: 'requires_oauth', institution: { name: 'Chase' } }
    expect(linkExitState(null, chase)).toEqual({
      step: 'unfinished',
      message: "Chase sign-in didn't finish. Make sure pop-ups are allowed for this site, then try again.",
    })
    expect(linkExitState(null, { status: 'requires_credentials' }).step).toBe('unfinished')
    const ally = linkExitState(undefined, { status: 'institution_not_found', institution: { name: 'Ally' } })
    expect(ally).toMatchObject({ step: 'unfinished', message: expect.stringMatching(/^Ally sign-in/) })
  })

  it('stays idle when Link closes with no status and no error', () => {
    expect(linkExitState(null, { status: null })).toEqual({ step: 'idle' })
    expect(linkExitState(null, null)).toEqual({ step: 'idle' })
    expect(linkExitState(null, {})).toEqual({ step: 'idle' })
  })

  it('keeps a real Plaid error on the error step, even when a status is set', () => {
    expect(linkExitState({ display_message: 'Wrong password.' }, { status: 'requires_credentials' })).toEqual({
      step: 'error',
      message: 'Wrong password.',
    })
    expect(linkExitState({ display_message: null }, { status: 'requires_oauth' })).toEqual({
      step: 'error',
      message: 'The bank connection was interrupted. Try again.',
    })
  })
})
