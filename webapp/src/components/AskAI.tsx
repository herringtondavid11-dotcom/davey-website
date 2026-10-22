import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SUGGESTIONS, ask, deeplinkToRoute, viewContext, type ChatTurn, type Envelope } from '../lib/ai'
import { useData } from '../lib/DataProvider'
import { money, shortDate } from '../lib/format'
import type { Transaction } from '../lib/schema'
import { CloseIcon, SparkleIcon } from './Icons'

type Block = Record<string, unknown>

/** **bold** and plain text only; server text is never injected as HTML. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part.replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1$2')}</Fragment>,
  )
}

/** Paragraphs and "- " / "1. " lists. */
export function Answer({ text }: { text: string }) {
  const out: { list: boolean; lines: string[] }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*([-*•]|\d+\.)\s+/.test(line)
    if (!line.trim()) {
      out.push({ list: false, lines: [] })
      continue
    }
    const content = bullet ? line.replace(/^\s*([-*•]|\d+\.)\s+/, '') : line.replace(/^#+\s*/, '')
    const last = out[out.length - 1]
    if (last && last.list === bullet && last.lines.length) last.lines.push(content)
    else out.push({ list: bullet, lines: [content] })
  }
  return (
    <>
      {out.filter((b) => b.lines.length).map((b, i) =>
        b.list ? <ul key={i}>{b.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}</ul> : <p key={i}>{inline(b.lines.join(' '))}</p>,
      )}
    </>
  )
}

function ChartBlock({ chart }: { chart: Block }) {
  const series = (chart.series as { name: string; points: { x: string; y: string }[] }[]) ?? []
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))]
  const val = (s: { points: { x: string; y: string }[] }, x: string) => Number(String(s.points.find((p) => p.x === x)?.y ?? '0').replace(/[$,%]/g, '')) || 0
  const max = Math.max(1, ...series.flatMap((s) => xs.map((x) => Math.abs(val(s, x)))))
  return (
    <figure className="ai-chart">
      {typeof chart.title === 'string' && <figcaption>{chart.title}</figcaption>}
      <table className="ai-bars">
        <tbody>
          {xs.map((x) => (
            <tr key={x}>
              <th scope="row">{x}</th>
              <td>
                {series.map((s, i) => (
                  <span key={s.name} className="ai-bar-row" title={`${s.name}: ${s.points.find((p) => p.x === x)?.y ?? ''}`}>
                    <i className={`ai-bar alloc-${i % 5}`} style={{ width: `${(Math.abs(val(s, x)) / max) * 100}%` }} />
                    <b className="num">{s.points.find((p) => p.x === x)?.y ?? ''}</b>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {series.length > 1 && <div className="legend">{series.map((s, i) => <span key={s.name}><i className={`swatch alloc-${i % 5}`} />{s.name}</span>)}</div>}
    </figure>
  )
}

function EnvelopeView({ envelope, byId, onFollow, onNavigate }: { envelope: Envelope; byId: Map<string, Transaction>; onFollow: (q: string) => void; onNavigate: (to: string) => void }) {
  return (
    <>
      {envelope.blocks.map((b, i) => {
        switch (b.type) {
          case 'text':
            return <Answer key={i} text={String(b.text ?? '')} />
          case 'metric_cards':
            return (
              <div key={i} className="ai-cards">
                {((b.cards as Block[]) ?? []).map((c, j) => (
                  <div key={j} className={'ai-card ' + (c.tone === 'positive' ? 'positive' : c.tone === 'negative' ? 'negative' : '')}>
                    <span>{String(c.label)}</span>
                    <strong className="num">{String(c.value)}</strong>
                    {typeof c.delta === 'string' && <small>{c.delta}</small>}
                  </div>
                ))}
              </div>
            )
          case 'chart':
            return b.chart ? <ChartBlock key={i} chart={b.chart as Block} /> : null
          case 'table': {
            const t = (b.table ?? b) as { columns?: string[]; rows?: string[][] }
            return (
              <div key={i} className="table-wrap ai-table">
                <table className="data-table">
                  <thead><tr>{(t.columns ?? []).map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                  <tbody>{(t.rows ?? []).map((r, j) => <tr key={j}>{r.map((c, k) => (k === 0 ? <th key={k} scope="row">{c}</th> : <td key={k}>{c}</td>))}</tr>)}</tbody>
                </table>
              </div>
            )
          }
          case 'transactions': {
            const list = ((b.transaction_ids as string[]) ?? []).map((id) => byId.get(id)).filter(Boolean) as Transaction[]
            return (
              <ul key={i} className="ai-txns">
                {list.slice(0, 12).map((t) => <li key={t.id}><span>{shortDate(t.date)} · {t.name}</span><b className="num">{money(t.amount)}</b></li>)}
              </ul>
            )
          }
          case 'actions':
            return (
              <div key={i} className="ai-actions">
                {((b.actions as Block[]) ?? []).map((a, j) => {
                  const to = deeplinkToRoute(String(a.deeplink))
                  return to ? <button key={j} type="button" className="btn btn-secondary btn-sm" onClick={() => onNavigate(to)}>{String(a.label)}</button> : null
                })}
              </div>
            )
          default:
            return null
        }
      })}
      {envelope.follow_ups?.length > 0 && (
        <div className="ai-suggest">{envelope.follow_ups.map((f) => <button key={f} type="button" className="chip-btn" onClick={() => onFollow(f)}>{f}</button>)}</div>
      )}
    </>
  )
}

interface Entry {
  question: string
  envelope?: Envelope
  streaming: string
  progress: string
  error?: string
}

export function AskAI() {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { accounts, transactions } = useData()
  const data = useMemo(() => ({ accounts: accounts ?? [], transactions: transactions ?? [], scope: (accounts ?? []).map((a) => a.id) }), [accounts, transactions])
  const context = useMemo(() => viewContext(location.pathname, data), [location.pathname, data])
  const byId = useMemo(() => new Map((transactions ?? []).map((t) => [t.id, t])), [transactions])
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener.current?.focus()
    }
  }, [open])
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [entries])

  async function send(question: string) {
    const q = question.trim()
    if (!q || busy) return
    setInput('')
    setBusy(true)
    const history: ChatTurn[] = entries.flatMap((e) => (e.envelope ? [{ role: 'user' as const, text: e.question }, { role: 'assistant' as const, text: e.envelope.blocks.filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n') }] : []))
    const index = entries.length
    setEntries((es) => [...es, { question: q, streaming: '', progress: 'Thinking' }])
    const update = (fn: (e: Entry) => Entry) => setEntries((es) => es.map((e, i) => (i === index ? fn(e) : e)))
    try {
      const envelope = await ask(q, history, context, data, {
        onProgress: (label) => update((e) => ({ ...e, progress: label })),
        onDelta: (text) => update((e) => ({ ...e, streaming: e.streaming + text })),
      })
      update((e) => ({ ...e, envelope, streaming: '' }))
    } catch (err) {
      update((e) => ({ ...e, error: (err as Error).message, streaming: '' }))
    } finally {
      setBusy(false)
    }
  }

  const suggestions = SUGGESTIONS[context.screen] ?? SUGGESTIONS.overview

  return (
    <>
      <button ref={opener} type="button" className="ai-fab" aria-label="Ask AI" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="ask-ai">
        <SparkleIcon size={20} />
        <span>Ask AI</span>
      </button>
      {open && (
        <aside id="ask-ai" className="ai-panel" role="dialog" aria-modal="false" aria-labelledby="ai-title">
          <div className="ai-head">
            <h2 id="ai-title"><SparkleIcon size={20} /> Davey AI</h2>
            <button type="button" className="btn btn-ghost icon-btn" onClick={() => setOpen(false)} aria-label="Close Ask AI"><CloseIcon /></button>
          </div>
          <div className="ai-log" ref={log} aria-live="polite">
            {entries.length === 0 && (
              <div className="ai-intro">
                <p>Ask about your money. Davey AI works out the numbers from your accounts in this browser; your data isn't stored.</p>
                <div className="ai-suggest">{suggestions.map((s) => <button key={s} type="button" className="chip-btn" onClick={() => send(s)}>{s}</button>)}</div>
              </div>
            )}
            {entries.map((e, i) => (
              <Fragment key={i}>
                <div className="bubble user"><p>{e.question}</p></div>
                {e.envelope ? (
                  <div className="bubble assistant">
                    <EnvelopeView envelope={e.envelope} byId={byId} onFollow={send} onNavigate={(to) => { navigate(to); if (window.innerWidth < 900) setOpen(false) }} />
                  </div>
                ) : e.error ? (
                  <p className="notice" role="alert">{e.error}</p>
                ) : (
                  <div className="bubble assistant" role="status">
                    {e.streaming ? <Answer text={e.streaming} /> : <div className="typing"><span /><span /><span /></div>}
                    <p className="muted small">{e.progress}…</p>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
          <form className="ai-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void send(input) }}>
            <label className="visually-hidden" htmlFor="ai-input">Ask a question</label>
            <textarea
              id="ai-input"
              ref={inputRef}
              className="input"
              rows={2}
              maxLength={1000}
              placeholder="Ask about your spending, budgets, debt…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
            />
            <button className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
          </form>
          <p className="ai-foot">AI can make mistakes. Not financial or tax advice.</p>
        </aside>
      )}
    </>
  )
}
