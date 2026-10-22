import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Meter } from './BarChart'

describe('Meter status (the app: green / gold at 80% / terracotta over)', () => {
  it('is plain under 80%, near at 80%+, over past the limit', () => {
    const cls = (props: { value: number; over?: boolean; near?: boolean }) =>
      render(<Meter label="x" {...props} />).container.firstElementChild!.className
    expect(cls({ value: 0.5 })).toBe('meter')
    expect(cls({ value: 0.85, near: true })).toBe('meter near')
    expect(cls({ value: 1.2, over: true, near: true })).toBe('meter over')
  })
})
