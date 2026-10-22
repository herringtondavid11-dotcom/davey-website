import { describe, expect, it } from 'vitest'
import { loadErrorMessage } from './loadError'

describe('load error wording', () => {
  it('never shows raw server text', () => {
    expect(loadErrorMessage(new Error('boom'))).toBe("Couldn't load your data. Try again in a moment.")
    expect(loadErrorMessage({ message: 'relation "x" does not exist' })).toBe("Couldn't load your data. Try again in a moment.")
  })
  it('names network and session problems', () => {
    expect(loadErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Check your connection/)
    expect(loadErrorMessage(new Error('JWT expired'))).toBe('Your session ended. Sign in again.')
  })
})
