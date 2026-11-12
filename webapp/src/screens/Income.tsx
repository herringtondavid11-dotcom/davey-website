import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { BarChart } from '../components/BarChart'
import { Donut, type DonutSlice } from '../components/Donut'
import { Stat } from '../components/Controls'
import { LineChart } from '../components/LineChart'
import { Spinner } from '../components/Spinner'
import { currentMonth, monthLabel } from '../lib/budget'
import { fetchTransactionsBetween } from '../lib/data'
import { money, moneyWhole } from '../lib/format'
import {
  CADENCES,
  DURATIONS,
  INCOME_CATEGORIES,
  actualIncomeCents,
  amountToCents,
  applyRaise,
  blankSource,
  categoryTotals,
  centsToDollars,
  forecastYear,
  formatAmount,
  isMonthKey,
  isShortTerm,
  mixBy,
  monthCents,
  personLabel,
  projectIncome,
  withAnnual,
  withCadence,
  withDuration,
  withMonthly,
  withOccurrence,
  withOverride,
  withRange,
  withTimes,
  yearTotalCents,
  type Cadence,
  type Duration,
  type HouseholdPerson,
  type IncomeCategory,
  type IncomeScenario,
  type IncomeSource,
  type MixSlice,
} from '../lib/income'
import {
  IncomeSchemaError,
  defaultIncomeSettings,
  deleteScenario,
  deleteSource,
  insertScenario,
  insertSource,
  loadIncome,
  saveSettings,
  updateSource,
  type IncomeSettings,
} from '../lib/incomeApi'
import { FILING_STATUSES, estimateIncomeTax, type FilingStatus } from '../lib/incomeTax'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const COLORS = ['src-0', 'src-1', 'src-2', 'src-3', 'src-4', 'src-5']
const COMPARE = [
  { key: 'current', name: 'Current', className: 's-income' },
  { key: 'forecast', name: 'Forecast', className: 's-spend' },
]

type DraftField = 'name' | 'monthly' | 'annual' | 'occurrence' | 'other' | `month:${string}`
interface Draft { id: string; field: DraftField; text: string }

export function Income() {
  const { session } = useAuth()
  const selfId = session?.user.id ?? ''
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [householdId, setHouseholdId] = useState('')
  const [sources, setSources] = useState<IncomeSource[]>([])
  const [scenarios, setScenarios] = useState<IncomeScenario[]>([])
  const [people, setPeople] = useState<HouseholdPerson[]>([])
  const [settings, setSettings] = useState<IncomeSettings>(defaultIncomeSettings)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [rateText, setRateText] = useState<string | null>(null)
  const [actuals, setActuals] = useState<Record<string, number>>({})
  const [includePlanned, setIncludePlanned] = useState(true)
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
        setScenarios(bundle.scenarios)
        setPeople(bundle.people)
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

  const shown = useMemo(() => sources.map((source) => previewSource(source, draft, year)), [sources, draft, year])
  const currentSources = useMemo(() => shown.filter((source) => source.status === 'confirmed'), [shown])
  const forecastSources = useMemo(() => projectIncome(shown, scenarios, year, includePlanned), [shown, scenarios, year, includePlanned])
  const currentMonths = useMemo(() => forecastYear(currentSources, year), [currentSources, year])
  const months = useMemo(() => forecastYear(forecastSources, year), [forecastSources, year])
  const currentYearTotal = currentMonths.reduce((sum, month) => sum + month.totalCents, 0)
  const yearTotal = months.reduce((sum, month) => sum + month.totalCents, 0)
  const focusKey = year === thisYear ? currentMonth() : `${year}-01`
  const focus = months.find((month) => month.key === focusKey) ?? months[0]
  const rate = rateFrom(rateText, settings.effectiveRatePercent)
  const estimate = useMemo(
    () => estimateIncomeTax({ filingStatus: settings.filingStatus, byCategory: categoryTotals(forecastSources, year), effectiveRatePercent: rate }),
    [settings.filingStatus, forecastSources, year, rate],
  )
  const today = currentMonth()
  const palette = (rows: MixSlice[]): DonutSlice[] => rows.map((row, index) => ({ ...row, className: `donut-slice ${COLORS[index % COLORS.length]}` }))

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
    if (field === 'other') {
      const next = { ...source, personOther: text.trim().slice(0, 80) || null, personUserId: null }
      replace(next)
      void persist(next)
      return
    }
    const cents = amountToCents(text)
    if (cents === null) return
    const next = field === 'monthly' ? withMonthly(source, cents)
      : field === 'annual' ? withAnnual(source, year, cents)
        : field === 'occurrence' ? withOccurrence(source, cents, year)
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
    const text = field === 'name' ? source.name
      : field === 'other' ? source.personOther ?? ''
        : field === 'monthly' ? formatAmount(source.monthlyCents)
          : field === 'annual' ? formatAmount(yearTotalCents(source, year))
            : field === 'occurrence' ? formatAmount(source.occurrenceCents || source.monthlyCents)
              : formatAmount(monthCents(source, field.slice(6)))
    setDraft({ id: source.id, field, text })
  }

  async function add(status: 'confirmed' | 'planned') {
    if (!householdId) return
    const source = { ...blankSource(selfId || null), status, personUserId: selfId || null }
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

  function change(next: IncomeSource) {
    replace(next)
    void persist(next)
  }

  async function changeSettings(next: IncomeSettings) {
    setSettings(next)
    if (!householdId) return
    try {
      setSettings(await saveSettings(householdId, next))
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
    }
  }

  async function addRaise(input: { sourceId: string; mode: 'percent' | 'dollars'; amount: number; month: string }) {
    if (!householdId) return
    const scenario: IncomeScenario = {
      id: crypto.randomUUID(),
      name: input.mode === 'percent' ? `${input.amount}% raise` : 'Dollar raise',
      kind: 'raise',
      sourceId: input.sourceId,
      raisePercent: input.mode === 'percent' ? input.amount : null,
      raiseCents: input.mode === 'dollars' ? Math.round(input.amount * 100) : null,
      effectiveMonth: isMonthKey(input.month) ? input.month : null,
      enabled: true,
      hypothetical: null,
      createdAt: new Date().toISOString(),
    }
    setScenarios((list) => [...list, scenario])
    try {
      await insertScenario(householdId, scenario)
      setError('')
    } catch (e) {
      setScenarios((list) => list.filter((item) => item.id !== scenario.id))
      setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
    }
  }

  async function addHypothetical(name: string, occurrenceCents: number) {
    if (!householdId) return
    const hypo = { ...blankSource(selfId || null), name: name.trim() || 'Hypothetical', occurrenceCents, monthlyCents: occurrenceCents, status: 'planned' as const }
    const scenario: IncomeScenario = {
      id: crypto.randomUUID(),
      name: hypo.name,
      kind: 'hypothetical',
      sourceId: null,
      raisePercent: null,
      raiseCents: null,
      effectiveMonth: null,
      enabled: true,
      hypothetical: hypo,
      createdAt: new Date().toISOString(),
    }
    setScenarios((list) => [...list, scenario])
    try {
      await insertScenario(householdId, scenario)
      setError('')
    } catch (e) {
      setScenarios((list) => list.filter((item) => item.id !== scenario.id))
      setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
    }
  }

  async function removeScenario(scenario: IncomeScenario) {
    setScenarios((list) => list.filter((item) => item.id !== scenario.id))
    try {
      await deleteScenario(scenario.id)
    } catch (e) {
      setScenarios((list) => [...list, scenario])
      setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
    }
  }

  async function applyScenario(scenario: IncomeScenario) {
    if (scenario.kind === 'raise' && scenario.sourceId) {
      const source = sources.find((item) => item.id === scenario.sourceId)
      if (!source) return
      const raised = applyRaise(source, scenario, year)
      change(raised)
    }
    if (scenario.kind === 'hypothetical' && scenario.hypothetical) {
      const source = { ...scenario.hypothetical, id: crypto.randomUUID(), status: 'confirmed' as const, name: scenario.hypothetical.name || scenario.name }
      setSources((list) => [...list, source])
      await persist(source)
    }
    await removeScenario(scenario)
  }

  if (loading) return <Spinner label="Loading income" />

  const confirmed = shown.filter((source) => source.status === 'confirmed')
  const planned = shown.filter((source) => source.status === 'planned')

  return (
    <div className="page">
      <div className="page-head">
        <h1>Income</h1>
        <div className="head-controls">
          <div className="segmented" role="group" aria-label="Forecast year">
            {[thisYear, thisYear + 1].map((value) => (
              <button key={value} type="button" aria-pressed={year === value} onClick={() => setYear(value)}>{value}</button>
            ))}
          </div>
          {householdId && !schemaMissing && (
            <>
              <button type="button" className="btn btn-primary" onClick={() => void add('confirmed')}>Add income</button>
              <button type="button" className="btn btn-secondary" onClick={() => void add('planned')}>Add planned</button>
            </>
          )}
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {schemaMissing ? (
        <section className="card card-pad"><p>Income can't be saved yet.</p></section>
      ) : !householdId ? (
        <section className="card card-pad"><p>No household.</p></section>
      ) : (
        <>
          <section className="card card-pad" aria-label="Income summary">
            <div className="stats">
              <Stat label="Expected per month" value={money(centsToDollars(focus?.totalCents ?? 0))} tone="positive" sub={monthLabel(focusKey)} />
              <Stat label="Expected per year" value={money(centsToDollars(yearTotal))} sub={String(year)} />
              <Stat label="Current per year" value={money(centsToDollars(currentYearTotal))} />
              <Stat label="Estimated tax" value={money(centsToDollars(estimate.totalCents))} sub={estimate.usingOverride ? 'Your rate' : 'Brackets'} />
            </div>
          </section>

          <section className="card card-pad" aria-labelledby="mix-title">
            <h2 id="mix-title">Mix</h2>
            <div className="income-charts">
              <Donut title="Income by type" slices={palette(mixBy(forecastSources, year, (source) => ({ id: source.category, name: labelOf(source.category) })))} />
              <Donut title="Income by person" slices={palette(mixBy(forecastSources, year, (source) => ({ id: personLabel(source, people), name: personLabel(source, people) })))} />
              <Donut title="Income by source" slices={palette(mixBy(forecastSources, year, (source) => ({ id: source.id, name: source.name || 'Income' })))} />
              <Donut title="Recurring and short-term" slices={palette(mixBy(forecastSources, year, (source) => isShortTerm(source) ? { id: 'short', name: 'Short-term' } : { id: 'recurring', name: 'Recurring' }))} />
            </div>
          </section>

          <section className="card card-pad" aria-labelledby="compare-title">
            <div className="card-head income-section-head">
              <h2 id="compare-title">Current and forecast</h2>
              <button type="button" className="btn btn-secondary btn-sm" aria-pressed={includePlanned} onClick={() => setIncludePlanned((value) => !value)}>Include planned</button>
            </div>
            <div className="income-bars">
              <BarChart
                label="Current and forecast by month"
                height={260}
                series={COMPARE}
                format={moneyWhole}
                groups={months.map((month, index) => ({
                  label: monthLabel(month.key, 'short'),
                  title: monthLabel(month.key),
                  values: { current: centsToDollars(currentMonths[index]?.totalCents ?? 0), forecast: centsToDollars(month.totalCents) },
                }))}
              />
              <BarChart
                label="Current and forecast for the year"
                height={260}
                series={COMPARE}
                format={moneyWhole}
                groups={[{ label: String(year), title: String(year), values: { current: centsToDollars(currentYearTotal), forecast: centsToDollars(yearTotal) } }]}
              />
            </div>
          </section>

          {forecastSources.length > 0 && (
            <>
              <section className="card card-pad" aria-labelledby="income-chart-title">
                <h2 id="income-chart-title">Forecast</h2>
                <LineChart
                  stacked
                  height={280}
                  label={`Forecast income by month, ${year}`}
                  format={moneyWhole}
                  series={forecastSources.map((source, index) => ({ key: source.id, name: source.name || 'Income', className: COLORS[index % COLORS.length] }))}
                  points={months.map((month) => ({
                    label: monthLabel(month.key, 'short'),
                    title: monthLabel(month.key),
                    values: Object.fromEntries(forecastSources.map((source) => [source.id, centsToDollars(month.bySource[source.id] ?? 0)])),
                  }))}
                  overlay={year > thisYear ? undefined : {
                    name: 'Actual',
                    className: 'mark-actual',
                    values: months.map((month) => (month.key > today ? null : centsToDollars(actuals[month.key] ?? 0))),
                  }}
                />
              </section>
              <section className="card" aria-labelledby="income-table-title">
                <div className="card-head"><h2 id="income-table-title">By month</h2></div>
                <div className="table-wrap">
                  <table className="data-table income-forecast" aria-label="Income forecast">
                    <thead>
                      <tr>
                        <th scope="col">Month</th>
                        {forecastSources.map((source) => <th scope="col" className="src-col" key={source.id}>{source.name || 'Income'}</th>)}
                        <th scope="col">Forecast</th>
                        <th scope="col">Actual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((month) => (
                        <tr key={month.key}>
                          <th scope="row">{monthLabel(month.key)}</th>
                          {forecastSources.map((source) => <td key={source.id} className="num src-col">{moneyWhole(centsToDollars(month.bySource[source.id] ?? 0))}</td>)}
                          <td className="num">{moneyWhole(centsToDollars(month.totalCents))}</td>
                          <td className="num">{month.key > today ? '—' : moneyWhole(centsToDollars(actuals[month.key] ?? 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="total-row">
                        <th scope="row">Year</th>
                        {forecastSources.map((source) => <td key={source.id} className="num src-col">{moneyWhole(centsToDollars(yearTotalCents(source, year)))}</td>)}
                        <td className="num">{moneyWhole(centsToDollars(yearTotal))}</td>
                        <td className="num">{moneyWhole(centsToDollars(months.reduce((sum, month) => sum + (month.key <= today ? (actuals[month.key] ?? 0) : 0), 0)))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </>
          )}

          <section className="income-block" aria-labelledby="sources-title">
            <h2 id="sources-title" className="income-section-title">Income sources</h2>
            {confirmed.length === 0 && <section className="card"><div className="empty"><p>No income sources yet.</p></div></section>}
            <div className="income-sources">
              {confirmed.map((view) => (
                <SourceCard
                  key={view.id}
                  source={sources.find((item) => item.id === view.id) ?? view}
                  view={view}
                  year={year}
                  people={people}
                  selfId={selfId}
                  draft={draft?.id === view.id ? draft : null}
                  autoFocus={view.id === focusId}
                  onFocus={(field) => focusField(sources.find((item) => item.id === view.id) ?? view, field)}
                  onText={(field, text) => setDraft({ id: view.id, field, text })}
                  onCommit={(field, text) => commit(sources.find((item) => item.id === view.id) ?? view, field, text)}
                  onChange={(next) => change(next)}
                  onRemove={() => void remove(sources.find((item) => item.id === view.id) ?? view)}
                />
              ))}
            </div>
          </section>

          <section className="income-block" aria-labelledby="planned-title">
            <h2 id="planned-title" className="income-section-title">Planned</h2>
            <div className="income-sources">
              {planned.map((view) => (
                <SourceCard
                  key={view.id}
                  source={sources.find((item) => item.id === view.id) ?? view}
                  view={view}
                  year={year}
                  people={people}
                  selfId={selfId}
                  draft={draft?.id === view.id ? draft : null}
                  autoFocus={view.id === focusId}
                  onFocus={(field) => focusField(sources.find((item) => item.id === view.id) ?? view, field)}
                  onText={(field, text) => setDraft({ id: view.id, field, text })}
                  onCommit={(field, text) => commit(sources.find((item) => item.id === view.id) ?? view, field, text)}
                  onChange={(next) => change(next)}
                  onRemove={() => void remove(sources.find((item) => item.id === view.id) ?? view)}
                  onConfirm={() => change({ ...(sources.find((item) => item.id === view.id) ?? view), status: 'confirmed' })}
                />
              ))}
            </div>
          </section>

          <ScenarioPanel
            year={year}
            sources={confirmed}
            scenarios={scenarios}
            onAddRaise={addRaise}
            onAddHypothetical={addHypothetical}
            onRemove={(scenario) => void removeScenario(scenario)}
            onApply={(scenario) => void applyScenario(scenario)}
          />

          <TaxCard
            estimate={estimate}
            settings={settings}
            rateText={rateText}
            onRateText={setRateText}
            onFiling={(filingStatus) => void changeSettings({ ...settings, filingStatus })}
            onRate={(effectiveRatePercent) => void changeSettings({ ...settings, effectiveRatePercent })}
          />
        </>
      )}
    </div>
  )
}

function SourceCard({ source, view, year, people, selfId, draft, autoFocus, onFocus, onText, onCommit, onChange, onRemove, onConfirm }: {
  source: IncomeSource
  view: IncomeSource
  year: number
  people: HouseholdPerson[]
  selfId: string
  draft: Draft | null
  autoFocus: boolean
  onFocus: (field: DraftField) => void
  onText: (field: DraftField, text: string) => void
  onCommit: (field: DraftField, text: string) => void
  onChange: (next: IncomeSource) => void
  onRemove: () => void
  onConfirm?: () => void
}) {
  const name = source.name || 'Income'
  const personValue = source.personOther != null ? 'other' : source.personUserId || selfId
  return (
    <section className="card income-card" aria-label={`Income source ${name}`}>
      <div className="income-card-head">
        <h3>{name}{source.status === 'planned' ? ' · Planned' : ''}</h3>
        <span className="income-card-actions">
          {onConfirm && <button type="button" className="btn btn-secondary btn-sm" onClick={onConfirm}>Move to confirmed</button>}
          <button type="button" className="btn btn-danger btn-sm" aria-label={`Remove ${name}`} onClick={onRemove}>Remove</button>
        </span>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input className="input" maxLength={120} autoFocus={autoFocus} value={draft?.field === 'name' ? draft.text : source.name} onFocus={() => onFocus('name')} onChange={(e) => onText('name', e.target.value)} onBlur={() => draft?.field === 'name' && onCommit('name', draft.text)} />
        </label>
        <label className="field">
          <span>Category</span>
          <select className="input" value={source.category} onChange={(e) => onChange({ ...source, category: e.target.value as IncomeCategory })}>
            {INCOME_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Person</span>
          <select className="input" value={personValue} onChange={(e) => onChange(e.target.value === 'other' ? { ...source, personUserId: null, personOther: source.personOther ?? '' } : { ...source, personUserId: e.target.value, personOther: null })}>
            {people.map((person) => <option key={person.userId} value={person.userId}>{person.name}</option>)}
            <option value="other">Other</option>
          </select>
        </label>
        {personValue === 'other' && (
          <label className="field">
            <span>Other name</span>
            <input className="input" maxLength={80} value={draft?.field === 'other' ? draft.text : source.personOther ?? ''} onFocus={() => onFocus('other')} onChange={(e) => onText('other', e.target.value)} onBlur={() => draft?.field === 'other' && onCommit('other', draft.text)} />
          </label>
        )}
        <label className="field">
          <span>Pay frequency</span>
          <select className="input" value={source.cadence} onChange={(e) => onChange(withCadence(source, e.target.value as Cadence, year))}>
            {CADENCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {source.cadence === 'custom' && (
          <label className="field">
            <span>Times each month</span>
            <input className="input" type="number" min={1} max={31} value={source.timesPerMonth} onChange={(e) => onChange(withTimes(source, Number(e.target.value), year))} />
          </label>
        )}
        <label className="field">
          <span>Term</span>
          <select className="input" value={source.duration} onChange={(e) => onChange(withDuration(source, e.target.value as Duration, year))}>
            {DURATIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {source.duration === 'repeat' && (
          <label className="field">
            <span>Payments</span>
            <input className="input" type="number" min={1} max={366} value={source.occurrenceCount} onChange={(e) => onChange(withDuration({ ...source, occurrenceCount: Math.max(1, Number(e.target.value) || 1) }, 'repeat', year))} />
          </label>
        )}
      </div>
      <div className="form-grid">
        <AmountField label="Amount each time" cents={view.occurrenceCents || view.monthlyCents} active={draft?.field === 'occurrence'} text={draft?.text ?? ''} onFocus={() => onFocus('occurrence')} onText={(text) => onText('occurrence', text)} onBlur={() => draft?.field === 'occurrence' && onCommit('occurrence', draft.text)} />
        <AmountField label="Per month" cents={view.monthlyCents} active={draft?.field === 'monthly'} text={draft?.text ?? ''} onFocus={() => onFocus('monthly')} onText={(text) => onText('monthly', text)} onBlur={() => draft?.field === 'monthly' && onCommit('monthly', draft.text)} />
        <AmountField label="Per year" cents={yearTotalCents(view, year)} active={draft?.field === 'annual'} text={draft?.text ?? ''} onFocus={() => onFocus('annual')} onText={(text) => onText('annual', text)} onBlur={() => draft?.field === 'annual' && onCommit('annual', draft.text)} />
      </div>
      <div className="field-row">
        <label className="field">
          <span>Starts</span>
          <input className="input" type="month" value={source.startsOn ?? ''} onChange={(e) => onChange(withRange(source, year, monthOrNull(e.target.value), source.endsOn))} />
        </label>
        <label className="field">
          <span>Ends</span>
          <input className="input" type="month" value={source.endsOn ?? ''} onChange={(e) => onChange(withRange(source, year, source.startsOn, monthOrNull(e.target.value)))} />
        </label>
      </div>
      <details className="month-adjust">
        <summary>Adjust a single month</summary>
        <div className="month-grid">
          {MONTHS.map((label, index) => {
            const key = `${year}-${String(index + 1).padStart(2, '0')}`
            const field = `month:${key}` as const
            return (
              <AmountField
                key={key}
                label={label}
                amountLabel={`${MONTH_NAMES[index]} ${year}`}
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
        <input className="input" inputMode="decimal" autoComplete="off" value={active ? text : formatAmount(cents)} onFocus={onFocus} onChange={(e) => onText(e.target.value)} onBlur={onBlur} />
      </span>
    </label>
  )
}

function ScenarioPanel({ year, sources, scenarios, onAddRaise, onAddHypothetical, onRemove, onApply }: {
  year: number
  sources: IncomeSource[]
  scenarios: IncomeScenario[]
  onAddRaise: (input: { sourceId: string; mode: 'percent' | 'dollars'; amount: number; month: string }) => Promise<void>
  onAddHypothetical: (name: string, occurrenceCents: number) => Promise<void>
  onRemove: (scenario: IncomeScenario) => void
  onApply: (scenario: IncomeScenario) => void
}) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '')
  const chosen = sources.some((source) => source.id === sourceId) ? sourceId : sources[0]?.id ?? ''
  const [mode, setMode] = useState<'percent' | 'dollars'>('percent')
  const [amount, setAmount] = useState('10')
  const [month, setMonth] = useState(`${year}-01`)
  const [hypoName, setHypoName] = useState('')
  const [hypoAmount, setHypoAmount] = useState('')
  return (
    <section className="card card-pad" aria-labelledby="scenario-title">
      <h2 id="scenario-title">Scenarios</h2>
      <div className="form-grid">
        <label className="field">
          <span>Raise on</span>
          <select className="input" value={chosen} onChange={(e) => setSourceId(e.target.value)}>
            {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Raise as</span>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'percent' | 'dollars')}>
            <option value="percent">Percent</option>
            <option value="dollars">Dollars</option>
          </select>
        </label>
        <label className="field">
          <span>Raise amount</span>
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="field">
          <span>Effective month</span>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn btn-secondary" disabled={!chosen || !Number(amount)} onClick={() => void onAddRaise({ sourceId: chosen, mode, amount: Number(amount), month })}>Add raise</button>
      <div className="form-grid">
        <label className="field">
          <span>Hypothetical name</span>
          <input className="input" value={hypoName} onChange={(e) => setHypoName(e.target.value)} />
        </label>
        <label className="field">
          <span>Hypothetical amount</span>
          <input className="input" inputMode="decimal" value={hypoAmount} onChange={(e) => setHypoAmount(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn btn-secondary" disabled={!hypoName.trim()} onClick={() => { const cents = amountToCents(hypoAmount) ?? 0; void onAddHypothetical(hypoName, cents); setHypoName(''); setHypoAmount('') }}>Add hypothetical</button>
      <ul className="list">
        {scenarios.map((scenario) => (
          <li key={scenario.id} className="income-scenario">
            <span>{scenario.name}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onApply(scenario)}>{scenario.kind === 'raise' ? 'Apply raise' : 'Add to income'}</button>
            <button type="button" className="btn btn-danger btn-sm" aria-label={`Remove scenario ${scenario.name}`} onClick={() => onRemove(scenario)}>Remove</button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TaxCard({ estimate, settings, rateText, onRateText, onFiling, onRate }: {
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
        <label className="field">
          <span>Filing status</span>
          <select className="input" value={settings.filingStatus} onChange={(e) => onFiling(e.target.value as FilingStatus)}>
            {FILING_STATUSES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
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
              <tr className="total-row"><th scope="row">{estimate.usingOverride ? 'Your effective rate' : 'Estimated total'}</th><td className="num">{dollars(estimate.totalCents)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function previewSource(source: IncomeSource, draft: Draft | null, year: number): IncomeSource {
  if (!draft || draft.id !== source.id) return source
  if (draft.field === 'name') return { ...source, name: draft.text.trim() || source.name }
  if (draft.field === 'other') return { ...source, personOther: draft.text }
  const cents = amountToCents(draft.text)
  if (cents === null) return source
  if (draft.field === 'monthly') return withMonthly(source, cents)
  if (draft.field === 'annual') return withAnnual(source, year, cents)
  if (draft.field === 'occurrence') return withOccurrence(source, cents, year)
  if (draft.field.startsWith('month:')) return withOverride(source, draft.field.slice(6), cents)
  return source
}

function samePlan(a: IncomeSource, b: IncomeSource): boolean {
  return a.monthlyCents === b.monthlyCents && a.occurrenceCents === b.occurrenceCents && a.amountBasis === b.amountBasis
    && a.startsOn === b.startsOn && a.endsOn === b.endsOn && a.cadence === b.cadence && a.duration === b.duration
    && a.category === b.category && a.name === b.name && a.personUserId === b.personUserId && a.personOther === b.personOther
    && JSON.stringify(a.overrides) === JSON.stringify(b.overrides)
}

function monthOrNull(value: string): string | null {
  return isMonthKey(value) ? value : null
}

function labelOf(category: IncomeCategory): string {
  return INCOME_CATEGORIES.find((item) => item.id === category)?.label ?? category
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
