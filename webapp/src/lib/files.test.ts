import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'
import { Pdf, pdfText, textWidth } from './pdf'
import { crc32, zip } from './zip'

describe('csv', () => {
  it('quotes, escapes and neutralizes formulas', () => {
    const out = toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['=SUM(A1)', -12.5], [null, '-5'], ['@cmd', true]])
    expect(out.startsWith('﻿a,b\r\n')).toBe(true)
    expect(out).toContain('"x,y","say ""hi"""')
    expect(out).toContain("'=SUM(A1),-12.5")
    expect(out).toContain(',-5\r\n')
    expect(out).toContain("'@cmd,true")
  })
})

describe('zip', () => {
  it('computes CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('writes a valid archive layout', () => {
    const z = zip([{ name: 'a.txt', data: 'hello' }, { name: 'b/c.csv', data: 'x,y' }])
    const v = new DataView(z.buffer)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    const end = z.length - 22
    expect(v.getUint32(end, true)).toBe(0x06054b50)
    expect(v.getUint16(end + 10, true)).toBe(2)
    const cdOffset = v.getUint32(end + 16, true)
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50)
    expect(new TextDecoder().decode(z.slice(30, 35))).toBe('a.txt')
    expect(new TextDecoder().decode(z.slice(35, 40))).toBe('hello')
  })
})

describe('pdf', () => {
  it('escapes and maps text', () => {
    expect(pdfText('Trader Joe’s (SF) – 50%\\')).toBe("Trader Joe's \\(SF\\) - 50%\\\\")
    expect(textWidth('$1,000.00', 10)).toBeGreaterThan(40)
  })
  it('produces a parseable multi-page document', () => {
    const pdf = new Pdf('Test report')
    pdf.writeLine('Hello', 18, { bold: true })
    pdf.table([{ label: 'Item', x: 48 }, { label: 'Amount', x: 564, align: 'right' }], Array.from({ length: 120 }, (_, i) => [`Row ${i}`, `$${i}.00`]))
    const bytes = pdf.output()
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toMatch(/\/Count [3-9]/)
    // xref offsets point at "n 0 obj"
    const xref = Number(text.match(/startxref\n(\d+)/)![1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    const firstOffset = Number(text.slice(xref).split('\n')[3].slice(0, 10))
    expect(text.slice(firstOffset, firstOffset + 7)).toBe('1 0 obj')
  })
})
