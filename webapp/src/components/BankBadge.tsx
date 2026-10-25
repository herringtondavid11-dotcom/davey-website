/** Readable text on a background: navy on light colours, white on dark ones (WCAG relative luminance). */
function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#1C2838' : '#FFFFFF'
}

/** The bank's mark: its initials on its brand colour (Plaid's), or slate for manual accounts. Decorative; the name is shown beside it. */
export function BankBadge({ name, color, logo }: { name: string; color?: string; logo?: string }) {
  // Plaid's logo when the app has shared it (same as the iPhone and Mac), else the initials on the brand colour.
  if (logo && /^[A-Za-z0-9+/=]+$/.test(logo)) return <img className="bank-badge bank-logo" src={`data:image/png;base64,${logo}`} alt="" aria-hidden="true" />
  const initials = name === 'Manual' ? '✎' : name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
  const bg = color && /^#?[0-9a-f]{6}$/i.test(color) ? (color.startsWith('#') ? color : `#${color}`) : undefined
  return <span className="bank-badge" aria-hidden="true" style={bg ? { background: bg, color: textOn(bg) } : undefined}>{initials}</span>
}
