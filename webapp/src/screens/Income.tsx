import { useEffect, useMemo, useRef, useState } from 'react'
import { LineChart } from '../components/LineChart'
import { Stat } from '../components/Controls'
import { Spinner } from '../components/Spinner'
import { currentMonth, monthLabel } from '../lib/budget'
import { fetchTransactionsBetween } from '../lib/data'
import { money, moneyWhole } from '../lib/format'
import {
  INCOME_CATEGORIES,
  actualIncomeCents,
  amountToCents,
  blankSource,
  categoryTotals,
  centsToDollars,
  forecastYear,
  formatAmount,
  isMonthKey,
  monthCents,
  withAnnual,
  withMonthly,
  withOverride,
  withRange,
  yearKeys,
  yearTotalCents,
  type IncomeCategory,
  type IncomeSource,
} from '../lib/income'
import {
  IncomeSchemaError,
  defaultIncomeSettings,
  deleteSource,
  insertSource,
  loadIncome,
  saveSettings,
  updateSource,
  type IncomeSettings,
} from '../lib/incomeApi'
import {
  FILING_STATUSES,
  TAX_DISCLAIMER,
  estimateIncomeTax,
  taxAssumptions,
  type FilingStatus,
} from '../lib/incomeTax'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SOURCE_COLORS = ['src-0', 'src-1', 'src-2', 'src-3', 'src-4', 'src-5']

type DraftField = 'name' | 'monthly' | 'annual' | `month:${string}`
interface Draft { id: string; field: DraftField; text: string }

export function Income() {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [householdId, setHouseholdId] = useState('')
  const [sources, setSources] = useState<IncomeSource[]>([])
  const [settings, setSettings] = useState<IncomeSettings>(defaultIncomeSettings)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [rateText, setRateText] = useState<string | null>(null)
  const [actuals, setActuals] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [error, setError] = useState('')
  const [focusId, setFocusId] = useState<string | null>(null)
  const savedIds = useRef(new Set<string>())
  const writes = useRef(new Map<string, Promise<void>>())

  function enqueue(id: string, job: () => Promise<void>) {
    const prev = writes.current.get(id) ?? Promise.resolve()
    const next = prev.then(job, job)
    writes.current.set(id, next)
    return next
  }

  useEffect(() => {
    let live = true
    loadIncome().then(
      (bundle) => {
        if (!live) return
        setHouseholdId(bundle.householdId)
        setSources(bundle.sources)
        setSettings(bundle.settings)
        savedIds.current = new Set(bundle.sources.map((source) => source.id))
        setLoading(false)
      },
      (e: unknown) => {
        if (!live) return
        if (e instanceof IncomeSchemaError) setSchemaMissing(true)
        else setError(e instanceof Error ? e.message : "Couldn't load your income. Try again in a moment.")
        setLoading(false)
      },
    )
    return () => { live = false }
  }, [])

  useEffect(() => {
    let live = true
    fetchTransactionsBetween(`${year}-01-01`, `${year}-12-31`).then(
      (list) => { if (live) setActuals(actualIncomeCents(list, year)) },
      () => { if (live) setActuals({}) },
    )
    return () => { live = false }
  }, [year])

  const shown = useMemo(
    () => sources.map((source) => previewSource(source, draft, year)),
    [sources, draft, year],
  )
  const months = useMemo(() => forecastYear(shown, year), [shown, year])
  const yearTotal = months.reduce((sum, month) => sum + month.totalCents, 0)
  const focusKey = year === thisYear ? currentMonth() : `${year}-01`
  const focus = months.find((month) => month.key === focusKey) ?? months[0]
  const rate = rateFrom(rateText, settings.effectiveRatePercent)
  const estimate = useMemo(
    () => estimateIncomeTax({ filingStatus: settings.filingStatus, byCategory: categoryTotals(shown, year), effectiveRatePercent: rate }),
    [settings.filingStatus, shown, year, rate],
  )
  const today = currentMonth()

  async function persist(source: IncomeSource) {
    if (!householdId) return
    await enqueue(source.id, async () => {
      try {
        if (savedIds.current.has(source.id)) await updateSource(source)
        else {
          await insertSource(householdId, source)
          savedIds.current.add(source.id)
        }
        setError('')
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
      }
    })
  }

  function replace(next: IncomeSource) {
    setSources((list) => list.map((source) => (source.id === next.id ? next : source)))
  }

  function commit(source: IncomeSource, field: DraftField, text: string) {
    setDraft(null)
    if (field === 'name') {
      const name = text.trim().slice(0, 120)
      if (!name || name === source.name) return
      const next = { ...source, name }
      replace(next)
      void persist(next)
      return
    }
    const cents = amountToCents(text)
    if (cents === null) return
    const next = field === 'monthly'
      ? withMonthly(source, cents)
      : field === 'annual'
        ? withAnnual(source, year, cents)
        : withOverride(source, field.slice(6), cents)
    if (samePlan(source, next)) return
    replace(next)
    void persist(next)
  }

  function focusField(source: IncomeSource, field: DraftField) {
    if (draft && (draft.id !== source.id || draft.field !== field)) {
      const previous = sources.find((item) => item.id === draft.id)
      if (previous) commit(previous, draft.field, draft.text)
    }
    const text = field === 'name'
      ? source.name
      : field === 'monthly'
        ? formatAmount(source.monthlyCents)
        : field === 'annual'
          ? formatAmount(yearTotalCents(source, year))
          : formatAmount(monthCents(source, field.slice(6)))
    setDraft({ id: source.id, field, text })
  }

  async function add() {
    if (!householdId) return
    const source = blankSource()
    setSources((list) => [...list, source])
    setFocusId(source.id)
    await enqueue(source.id, async () => {
      try {
        await insertSource(householdId, source)
        savedIds.current.add(source.id)
        setError('')
      } catch (e) {
        setSources((list) => list.filter((item) => item.id !== source.id))
        setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
      }
    })
  }

  async function remove(source: IncomeSource) {
    setSources((list) => list.filter((item) => item.id !== source.id))
    if (draft?.id === source.id) setDraft(null)
    if (!savedIds.current.has(source.id) && !writes.current.has(source.id)) return
    try {
      await enqueue(source.id, async () => {
        if (!savedIds.current.has(source.id)) return
        await deleteSource(source.id)
        savedIds.current.delete(source.id)
      })
      setError('')
    } catch (e) {
      setSources((list) => [...list, source].sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
      setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
    }
  }

  function changeRange(source: IncomeSource, startsOn: string | null, endsOn: string | null) {
    const next = withRange(source, year, startsOn, endsOn)
    replace(next)
    void persist(next)
  }

  function changeCategory(source: IncomeSource, category: IncomeCategory) {
    const next = { ...source, category }
    replace(next)
    void persist(next)
  }

  async function changeSettings(next: IncomeSettings) {
    setSettings(next)
    if (!householdId) return
    try {
      const saved = await saveSettings(householdId, next)
      setSettings(saved)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
    }
  }

  if (loading) return <Spinner label="Loading income" />

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Income</h1>
          <p>What you expect to earn, month by month, and a rough California tax estimate.</p>
        </div>
        <div className="head-controls">
          <div className="segmented" role="group" aria-label="Forecast year">
            {[thisYear, thisYear + 1].map((value) => (
              <button key={value} type="button" aria-pressed={year === value} onClick={() => setYear(value)}>{value}</button>
            ))}
          </div>
          {householdId && !schemaMissing && (
            <button type="button" className="btn btn-primary" onClick={() => void add()}>Add income</button>
          )}
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {schemaMissing ? (
        <section className="card card-pad">
          <p>Income is shared with your household, and this database doesn't have that table yet. Apply the income sources migration, then reload this page.</p>
        </section>
      ) : !householdId ? (
        <section className="card card-pad">
          <p>Income is shared with your household, so you and your partner see the same sources here and on your phone. Turn on Household Sharing in the Davey app to add income.</p>
        </section>
      ) : (
        <>
          <section className="card card-pad" aria-label="Income summary">
            <div className="stats">
              <Stat
                label="Expected per month"
                value={money(centsToDollars(focus?.totalCents ?? 0))}
                tone="positive"
                sub={`${monthLabel(focusKey)} · ${money(centsToDollars(Math.round(yearTotal / 12)))} average`}
              />
              <Stat label="Expected per year" value={money(centsToDollars(yearTotal))} sub={String(year)} />
              <Stat
                label="Estimated tax"
                value={money(centsToDollars(estimate.totalCents))}
                sub={estimate.usingOverride ? 'Your rate · not tax advice' : 'Planning estimate · not tax advice'}
              />
            </div>
          </section>

          <div className={'income-main' + (shown.length ? ' with-forecast' : '')}>
            {shown.length > 0 && (
              <div className="income-forecast-col">
                <section className="card card-pad" aria-labelledby="income-chart-title">
                  <h2 id="income-chart-title">Forecast</h2>
                  <LineChart
                    stacked
                    height={280}
                    label={`Forecast income by month, ${year}`}
                    format={(value) => moneyWhole(value)}
                    series={shown.map((source, index) => ({
                      key: source.id,
                      name: source.name || 'Income',
                      className: SOURCE_COLORS[index % SOURCE_COLORS.length],
                    }))}
                    points={months.map((month) => ({
                      label: monthLabel(month.key, 'short'),
                      title: monthLabel(month.key),
                      values: Object.fromEntries(shown.map((source) => [source.id, centsToDollars(month.bySource[source.id] ?? 0)])),
                    }))}
                    overlay={year > thisYear ? undefined : {
                      name: 'Actual',
                      className: 'mark-actual',
                      values: months.map((month) => (month.key > today ? null : centsToDollars(actuals[month.key] ?? 0))),
                    }}
                  />
                  <p className="muted small income-note">The dashed line is income already recorded on linked accounts. Transfers and pending charges are left out, and it isn't matched to a source.</p>
                </section>
                <section className="card" aria-labelledby="income-table-title">
                  <div className="card-head"><h2 id="income-table-title">By month</h2></div>
                  <div className="table-wrap">
                    <table className="data-table income-forecast" aria-label="Income forecast">
                      <thead>
                        <tr>
                          <th scope="col">Month</th>
                          {shown.map((source) => <th scope="col" className="src-col" key={source.id}>{source.name || 'Income'}</th>)}
                          <th scope="col">Forecast</th>
                          <th scope="col">Actual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {months.map((month) => (
                          <tr key={month.key}>
                            <th scope="row">{monthLabel(month.key)}</th>
                            {shown.map((source) => <td key={source.id} className="num src-col">{moneyWhole(centsToDollars(month.bySource[source.id] ?? 0))}</td>)}
                            <td className="num">{moneyWhole(centsToDollars(month.totalCents))}</td>
                            <td className="num">{month.key > today ? '—' : moneyWhole(centsToDollars(actuals[month.key] ?? 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="total-row">
                          <th scope="row">Year</th>
                          {shown.map((source) => <td key={source.id} className="num src-col">{moneyWhole(centsToDollars(yearTotalCents(source, year)))}</td>)}
                          <td className="num">{moneyWhole(centsToDollars(yearTotal))}</td>
                          <td className="num">{moneyWhole(centsToDollars(yearKeys(year).filter((key) => key <= today).reduce((sum, key) => sum + (actuals[key] ?? 0), 0)))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              </div>
            )}

            <TaxCard
              year={year}
              estimate={estimate}
              settings={settings}
              rateText={rateText}
              onRateText={setRateText}
              onFiling={(filingStatus) => void changeSettings({ ...settings, filingStatus })}
              onRate={(effectiveRatePercent) => void changeSettings({ ...settings, effectiveRatePercent })}
            />
          </div>

          <section className="income-block" aria-labelledby="sources-title">
            <h2 id="sources-title" className="income-section-title">Income sources</h2>
            {shown.length === 0 && (
              <section className="card">
                <div className="empty"><p>No income sources yet. Add a job, a rental, or anything else you expect to receive.</p></div>
              </section>
            )}
            <div className="income-sources">
              {sources.map((source) => {
                const view = shown.find((item) => item.id === source.id) ?? source
                return (
                  <SourceCard
                    key={source.id}
                    source={source}
                    view={view}
                    year={year}
                    draft={draft?.id === source.id ? draft : null}
                    autoFocus={source.id === focusId}
                    onFocus={(field) => focusField(source, field)}
                    onText={(field, text) => setDraft({ id: source.id, field, text })}
                    onCommit={(field, text) => commit(source, field, text)}
                    onCategory={(category) => changeCategory(source, category)}
                    onRange={(startsOn, endsOn) => changeRange(source, startsOn, endsOn)}
                    onRemove={() => void remove(source)}
                  />
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function SourceCard({ source, view, year, draft, autoFocus, onFocus, onText, onCommit, onCategory, onRange, onRemove }: {
  source: IncomeSource
  view: IncomeSource
  year: number
  draft: Draft | null
  autoFocus: boolean
  onFocus: (field: DraftField) => void
  onText: (field: DraftField, text: string) => void
  onCommit: (field: DraftField, text: string) => void
  onCategory: (category: IncomeCategory) => void
  onRange: (startsOn: string | null, endsOn: string | null) => void
  onRemove: () => void
}) {
  const name = source.name || 'Income'
  return (
    <section className="card income-card" aria-label={`Income source ${name}`}>
      <div className="income-card-head">
        <h3>{name}</h3>
        <button type="button" className="btn btn-danger btn-sm" aria-label={`Remove ${name}`} onClick={onRemove}>Remove</button>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input
            className="input"
            value={draft?.field === 'name' ? draft.text : source.name}
            autoFocus={autoFocus}
            maxLength={120}
            onFocus={() => onFocus('name')}
            onChange={(e) => onText('name', e.target.value)}
            onBlur={() => draft?.field === 'name' && onCommit('name', draft.text)}
          />
        </label>
        <label className="field">
          <span>Category</span>
          <select className="input" value={source.category} onChange={(e) => onCategory(e.target.value as IncomeCategory)}>
            {INCOME_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className="field-row">
        <AmountField
          label="Per month"
          cents={view.monthlyCents}
          active={draft?.field === 'monthly'}
          text={draft?.text ?? ''}
          onFocus={() => onFocus('monthly')}
          onText={(text) => onText('monthly', text)}
          onBlur={() => draft?.field === 'monthly' && onCommit('monthly', draft.text)}
        />
        <AmountField
          label="Per year"
          cents={yearTotalCents(view, year)}
          active={draft?.field === 'annual'}
          text={draft?.text ?? ''}
          onFocus={() => onFocus('annual')}
          onText={(text) => onText('annual', text)}
          onBlur={() => draft?.field === 'annual' && onCommit('annual', draft.text)}
        />
      </div>
      <p className="muted small income-note">Per year is the {year} forecast. A monthly amount fills each active month. Set the first and last month for a job that starts or ends mid-year, or a bonus that lands in one month.</p>
      <div className="field-row">
        <label className="field">
          <span>Starts</span>
          <input className="input" type="month" value={source.startsOn ?? ''} onChange={(e) => onRange(monthOrNull(e.target.value), source.endsOn)} />
        </label>
        <label className="field">
          <span>Ends</span>
          <input className="input" type="month" value={source.endsOn ?? ''} onChange={(e) => onRange(source.startsOn, monthOrNull(e.target.value))} />
        </label>
      </div>
      {source.startsOn && source.endsOn && source.startsOn > source.endsOn && (
        <p className="error small" role="alert">The end month is before the start month, so no month uses the regular amount.</p>
      )}
      <details className="month-adjust">
        <summary>Adjust a single month</summary>
        <div className="month-grid">
          {MONTHS.map((label, index) => {
            const key = `${year}-${String(index + 1).padStart(2, '0')}`
            const field = `month:${key}` as const
            return (
              <AmountField
                key={key}
                label={label.slice(0, 3)}
                amountLabel={`${label} ${year}`}
                cents={monthCents(view, key)}
                active={draft?.field === field}
                text={draft?.text ?? ''}
                onFocus={() => onFocus(field)}
                onText={(text) => onText(field, text)}
                onBlur={() => draft?.field === field && onCommit(field, draft.text)}
              />
            )
          })}
        </div>
      </details>
    </section>
  )
}

function AmountField({ label, amountLabel, cents, active, text, onFocus, onText, onBlur }: {
  label: string
  amountLabel?: string
  cents: number
  active: boolean
  text: string
  onFocus: () => void
  onText: (text: string) => void
  onBlur: () => void
}) {
  return (
    <label className="field num-field month-field">
      <span>{label}{amountLabel && <span className="visually-hidden"> {amountLabel}</span>}</span>
      <span className="affix">
        <i aria-hidden>$</i>
        <input
          className="input"
          inputMode="decimal"
          autoComplete="off"
          value={active ? text : formatAmount(cents)}
          onFocus={onFocus}
          onChange={(e) => onText(e.target.value)}
          onBlur={onBlur}
        />
      </span>
    </label>
  )
}

function TaxCard({ year, estimate, settings, rateText, onRateText, onFiling, onRate }: {
  year: number
  estimate: ReturnType<typeof estimateIncomeTax>
  settings: IncomeSettings
  rateText: string | null
  onRateText: (text: string | null) => void
  onFiling: (status: FilingStatus) => void
  onRate: (rate: number | null) => void
}) {
  const dollars = (cents: number) => money(centsToDollars(cents))
  return (
    <section className="card" aria-labelledby="tax-estimate-title">
      <div className="card-head"><h2 id="tax-estimate-title">Estimated tax</h2></div>
      <div className="card-pad income-tax">
        <p className="muted small" role="note">{TAX_DISCLAIMER}</p>
        <label className="field">
          <span>Filing status</span>
          <select className="input" value={settings.filingStatus} onChange={(e) => onFiling(e.target.value as FilingStatus)}>
            {FILING_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <p className="muted small income-note">Married filing jointly is the default.</p>
        <label className="field num-field">
          <span>Effective rate override</span>
          <span className="affix">
            <input
              className="input"
              inputMode="decimal"
              placeholder="Use brackets"
              autoComplete="off"
              value={rateText ?? (settings.effectiveRatePercent ?? '')}
              onFocus={() => onRateText(settings.effectiveRatePercent === null ? '' : String(settings.effectiveRatePercent))}
              onChange={(e) => onRateText(e.target.value)}
              onBlur={() => {
                if (rateText === null) return
                const parsed = parseRate(rateText)
                onRateText(null)
                if (parsed !== undefined && parsed !== settings.effectiveRatePercent) onRate(parsed)
              }}
            />
            <i aria-hidden>%</i>
          </span>
        </label>
        <p className="muted small income-note">Leave this blank to use the brackets. A number, such as 28, replaces the total with that percent of {year} income. The bracket breakdown stays so you can compare.</p>
        <div className="table-wrap">
          <table className="data-table" aria-label="Tax estimate breakdown">
            <tbody>
              <tr><th scope="row">Expected income</th><td className="num">{dollars(estimate.grossCents)}</td></tr>
              <tr><th scope="row">Self-employment tax</th><td className="num">{dollars(estimate.selfEmploymentTaxCents)}</td></tr>
              <tr><th scope="row">Half of self-employment tax deducted</th><td className="num">{dollars(estimate.deductibleHalfCents)}</td></tr>
              <tr><th scope="row">Federal taxable income</th><td className="num">{dollars(estimate.federalTaxableCents)}</td></tr>
              <tr><th scope="row">Federal income tax</th><td className="num">{dollars(estimate.federalTaxCents)}</td></tr>
              <tr><th scope="row">California taxable income</th><td className="num">{dollars(estimate.stateTaxableCents)}</td></tr>
              <tr><th scope="row">California income tax</th><td className="num">{dollars(estimate.stateTaxCents)}</td></tr>
              {estimate.usingOverride && <tr><th scope="row">Bracket estimate</th><td className="num">{dollars(estimate.bracketTotalCents)}</td></tr>}
              <tr className="total-row">
                <th scope="row">{estimate.usingOverride ? 'Your effective rate' : 'Estimated total'}</th>
                <td className="num">{dollars(estimate.totalCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {estimate.grossCents > 0 && (
          <p className="muted small">Bracket marginal rates: {rateLabel(estimate.federalMarginal)} federal, {rateLabel(estimate.stateMarginal)} California.</p>
        )}
        <h3>Assumptions</h3>
        <ul className="assumption-list">
          {taxAssumptions(settings.filingStatus).map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    </section>
  )
}

function previewSource(source: IncomeSource, draft: Draft | null, year: number): IncomeSource {
  if (!draft || draft.id !== source.id) return source
  if (draft.field === 'name') return { ...source, name: draft.text.trim() || source.name }
  const cents = amountToCents(draft.text)
  if (cents === null) return source
  if (draft.field === 'monthly') return withMonthly(source, cents)
  if (draft.field === 'annual') return withAnnual(source, year, cents)
  if (draft.field.startsWith('month:')) return withOverride(source, draft.field.slice(6), cents)
  return source
}

function samePlan(a: IncomeSource, b: IncomeSource): boolean {
  return a.monthlyCents === b.monthlyCents
    && a.amountBasis === b.amountBasis
    && a.startsOn === b.startsOn
    && a.endsOn === b.endsOn
    && JSON.stringify(a.overrides) === JSON.stringify(b.overrides)
    && a.category === b.category
    && a.name === b.name
}

function monthOrNull(value: string): string | null {
  return isMonthKey(value) ? value : null
}

function rateFrom(text: string | null, saved: number | null): number | null {
  if (text === null) return saved
  const parsed = parseRate(text)
  return parsed === undefined ? saved : parsed
}

function parseRate(text: string): number | null | undefined {
  const t = text.trim().replace(/%$/, '').replace(/\.$/, '')
  if (t === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined
  return Math.round(n * 100) / 100
}

function rateLabel(rate: number): string {
  const pct = Math.round(rate * 1000) / 10
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct}%`
}
