import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Answer } from '../components/AskAI'
import { viewContext } from './ai'
import { normalizeAccount, normalizeTransaction } from './schema'

describe('Ask AI', () => {
  it('renders paragraphs and lists as text, never HTML', () => {
    const { container } = render(<Answer text={'Intro line:\n- one\n- **two**\n\n<img src=x onerror=alert(1)> done\n1. a\n2. b'} />)
    expect(container.querySelectorAll('ul')).toHaveLength(2)
    expect([...container.querySelectorAll('li')].map((l) => l.textContent)).toEqual(['one', 'two', 'a', 'b'])
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)> done')
  })
  it('builds the app’s view context (screen, mode, scope, account ids only)', () => {
    const month = new Date().toISOString().slice(0, 7)
    void month
    void normalizeTransaction
    const ctx = viewContext('/credit-cards', { accounts: [normalizeAccount({ id: 'a', name: 'Checking', mask: '1234', type: 'depository', current_balance: 1000 })] })
    expect(ctx).toMatchObject({ screen: 'card_detail', mode: 'personal', scope: 'this_view', account_ids: ['a'] })
    expect(JSON.stringify(ctx)).not.toMatch(/1234|Checking/)
  })
})
