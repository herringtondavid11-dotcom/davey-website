import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { SUGGESTIONS, askAi, viewContext, type ChatTurn } from '../lib/ai'
import { useData } from '../lib/DataProvider'
import { CloseIcon, SparkleIcon } from './Icons'

/** Renders plain text as paragraphs and "- " / "1. " lists. Server text is never injected as HTML. */
export function Answer({ text }: { text: string }) {
  const out: { list: boolean; lines: string[] }[] = []
  for (const raw of text.replace(/\*\*/g, '').split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*([-*•]|\d+\.)\s+/.test(line)
    if (!line.trim()) {
      out.push({ list: false, lines: [] })
      continue
    }
    const last = out[out.length - 1]
    if (last && last.list === bullet && last.lines.length) last.lines.push(bullet ? line.replace(/^\s*([-*•]|\d+\.)\s+/, '') : line)
    else out.push({ list: bullet, lines: [bullet ? line.replace(/^\s*([-*•]|\d+\.)\s+/, '') : line] })
  }
  return (
    <>
      {out.filter((b) => b.lines.length).map((b, i) =>
        b.list ? <ul key={i}>{b.lines.map((l, j) => <li key={j}>{l}</li>)}</ul> : <p key={i}>{b.lines.join(' ')}</p>,
      )}
    </>
  )
}

export function AskAI() {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const location = useLocation()
  const { accounts, transactions } = useData()
  const context = useMemo(() => viewContext(location.pathname, accounts ?? [], transactions ?? []), [location.pathname, accounts, transactions])
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
  }, [turns, busy])

  async function send(question: string) {
    const q = question.trim()
    if (!q || busy) return
    setError('')
    setInput('')
    const history = [...turns, { role: 'user' as const, text: q }]
    setTurns(history)
    setBusy(true)
    try {
      const answer = await askAi(q, turns, context)
      setTurns([...history, { role: 'assistant', text: answer }])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const suggestions = SUGGESTIONS[context.view] ?? SUGGESTIONS.overview

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
            {turns.length === 0 && (
              <div className="ai-intro">
                <p>Ask about your money. Davey AI sees a summary of this screen and your accounts.</p>
                <div className="ai-suggest">
                  {suggestions.map((s) => <button key={s} type="button" className="chip-btn" onClick={() => send(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={'bubble ' + t.role}>
                {t.role === 'assistant' ? <Answer text={t.text} /> : <p>{t.text}</p>}
              </div>
            ))}
            {busy && <div className="bubble assistant typing" role="status"><span /><span /><span /><span className="visually-hidden">Thinking</span></div>}
            {error && <p className="notice" role="alert">{error}</p>}
          </div>
          <form
            className="ai-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              void send(input)
            }}
          >
            <label className="visually-hidden" htmlFor="ai-input">Ask a question</label>
            <textarea
              id="ai-input"
              ref={inputRef}
              className="input"
              rows={2}
              maxLength={500}
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
