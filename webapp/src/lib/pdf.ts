// Minimal text-and-lines PDF writer (US Letter, Helvetica). Enough for statements and tax summaries. No deps.

const W = 612
const H = 792
// Helvetica advance widths (per 1000 em) for the characters we print most; others use 556.
const WIDTHS: Record<string, number> = {
  ' ': 278, '.': 278, ',': 278, ':': 278, ';': 278, '-': 333, '+': 584, '$': 556, '%': 889, '(': 333, ')': 333, '/': 278, "'": 191, '&': 667, '#': 556,
  i: 222, l: 222, j: 222, f: 278, t: 278, r: 333, I: 278, m: 833, w: 722, M: 833, W: 944,
}
const BOLD_FACTOR = 1.06

/** Map typographic characters to WinAnsi-safe ones and escape PDF string syntax. */
export function pdfText(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/•/g, '*')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/([\\()])/g, '\\$1')
}

export function textWidth(s: string, size: number, bold = false): number {
  let w = 0
  for (const ch of s) w += WIDTHS[ch] ?? (/[0-9]/.test(ch) ? 556 : /[a-z]/.test(ch) ? 520 : /[A-Z]/.test(ch) ? 667 : 556)
  return (w / 1000) * size * (bold ? BOLD_FACTOR : 1)
}

export class Pdf {
  private pages: string[][] = []
  private ops: string[] = []
  y = H - 56
  readonly margin = 48
  readonly width = W

  constructor(private title = 'Davey') {
    this.addPage()
  }

  addPage() {
    this.ops = []
    this.pages.push(this.ops)
    this.y = H - 56
  }

  /** Ensure `h` points remain above the bottom margin, else start a new page. */
  room(h: number) {
    if (this.y - h < 56) this.addPage()
  }

  text(x: number, y: number, s: string, size = 10, opts: { bold?: boolean; align?: 'left' | 'right'; gray?: boolean } = {}) {
    const tx = opts.align === 'right' ? x - textWidth(s, size, opts.bold) : x
    const color = opts.gray ? '0.33 0.4 0.48 rg ' : '0.11 0.16 0.22 rg '
    this.ops.push(`BT ${color}/${opts.bold ? 'F2' : 'F1'} ${size} Tf ${tx.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(s)}) Tj ET`)
  }

  line(x1: number, y1: number, x2: number, y2: number, gray = 0.8) {
    this.ops.push(`${gray} G 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`)
  }

  rect(x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
    this.ops.push(`${rgb.join(' ')} rg ${x} ${y} ${w} ${h} re f`)
  }

  /** Flowing paragraph helper: writes one line at the cursor and moves down. */
  writeLine(s: string, size = 10, opts: { bold?: boolean; gray?: boolean; gap?: number } = {}) {
    this.room(size + 4)
    this.text(this.margin, this.y, s, size, opts)
    this.y -= size + (opts.gap ?? 5)
  }

  /** Table with column x-positions; numeric columns right-aligned at their x. */
  table(cols: { label: string; x: number; align?: 'left' | 'right'; max?: number }[], rows: string[][], size = 9) {
    const head = () => {
      this.room(size * 3)
      cols.forEach((c) => this.text(c.x, this.y, c.label.toUpperCase(), size - 1, { bold: true, align: c.align, gray: true }))
      this.y -= 6
      this.line(this.margin, this.y, W - this.margin, this.y)
      this.y -= size + 4
    }
    head()
    for (const r of rows) {
      if (this.y - size < 56) {
        this.addPage()
        head()
      }
      cols.forEach((c, i) => {
        let v = r[i] ?? ''
        if (c.max && v.length > c.max) v = v.slice(0, c.max - 1) + '...'
        this.text(c.x, this.y, v, size, { align: c.align })
      })
      this.y -= size + 5
    }
    this.y -= 6
  }

  output(): Uint8Array {
    const total = this.pages.length
    const objs: string[] = []
    // 1 catalog, 2 pages, 3 F1, 4 F2, then per page: page + content.
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    const kids: string[] = []
    this.pages.forEach((ops, i) => {
      const pageId = 5 + i * 2
      const contentId = pageId + 1
      const footer = `BT 0.33 0.4 0.48 rg /F1 8 Tf ${this.margin} 32 Td (${pdfText(`${this.title} - page ${i + 1} of ${total}`)}) Tj ET`
      const stream = [...ops, footer].join('\n')
      kids.push(`${pageId} 0 R`)
      objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`
      objs[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    })
    objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${total} >>`
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
    const offsets: number[] = []
    for (let i = 1; i < objs.length; i++) {
      offsets[i] = out.length
      out += `${i} 0 obj\n${objs[i]}\nendobj\n`
    }
    const xref = out.length
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
    for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info << /Producer (Davey) /Title (${pdfText(this.title)}) >> >>\nstartxref\n${xref}\n%%EOF\n`
    // Latin-1 bytes (all content is ASCII after pdfText, plus the binary comment line).
    const bytes = new Uint8Array(out.length)
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
    return bytes
  }
}
