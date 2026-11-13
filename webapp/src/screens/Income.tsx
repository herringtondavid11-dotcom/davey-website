import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { BarChart, compact } from '../components/BarChart'
import { Donut, type DonutSlice } from '../components/Donut'
import { Stat } from '../components/Controls'
import { LineChart } from '../components/LineChart'
import { Spinner } from '../components/Spinner'
import { currentMonth, monthLabel } from '../lib/budget'
import { fetchTransactionsBetween } from '../lib/data'
import { money, moneyWhole } from '../lib/format'
import { useBackToClose } from '../lib/useBackToClose'
import {
  CADENCES,
  DURATIONS,
  INCOME_CATEGORIES,
  actualIncomeCents,
  amountToCents,
  applyPerson,
  applyRaise,
  blankSource,
  cadenceLabel,
  categorySwatch,
  categoryTotals,
  centsToDollars,
  forecastYear,
  formatAmount,
  isMonthKey,
  isShortTerm,
  mixBy,
  monthCents,
  personChoices,
  personLabel,
  projectIncome,
  sortByMonthly,
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
  type PersonChoice,
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
  const [form, setForm] = useState<IncomeSource | null>(null)
  const [formIsNew, setFormIsNew] = useState(false)
  const [rateText, setRateText] = useState<string | null>(null)
  const [actuals, setActuals] = useState<Record<string, number>>({})
  const [includePlanned, setIncludePlanned] = useState(true)
  const [loading, setLoading] = useState(true)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [error, setError] = useState('')
  const savedIds = useRef(new Set<string>())

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

  const shown = sources
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
  const palette = (rows: MixSlice[], byType = false): DonutSlice[] => rows.map((row, index) => ({
    ...row,
    className: `donut-slice ${byType ? categorySwatch(row.id as IncomeCategory) : COLORS[index % COLORS.length]}`,
  }))

  function openNew(status: 'confirmed' | 'planned') {
    const source = { ...blankSource(selfId || null), status, name: '', personUserId: selfId || null }
    setForm(source)
    setFormIsNew(true)
  }

  async function saveForm(source: IncomeSource) {
    if (!householdId) return
    const isNew = formIsNew && !savedIds.current.has(source.id)
    if (isNew) setSources((list) => [...list, source])
    else setSources((list) => list.map((item) => (item.id === source.id ? source : item)))
    setForm(null)
    try {
      if (isNew) {
        await insertSource(householdId, source)
        savedIds.current.add(source.id)
      } else await updateSource(source)
      setError('')
    } catch (e) {
      if (isNew) setSources((list) => list.filter((item) => item.id !== source.id))
      setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
    }
  }

  async function remove(source: IncomeSource) {
    setSources((list) => list.filter((item) => item.id !== source.id))
    setForm(null)
    if (!savedIds.current.has(source.id)) return
    try {
      await deleteSource(source.id)
      savedIds.current.delete(source.id)
      setError('')
    } catch (e) {
      setSources((list) => [...list, source])
      setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
    }
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
      setSources((list) => list.map((item) => (item.id === raised.id ? raised : item)))
      try { await updateSource(raised) } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
      }
    }
    if (scenario.kind === 'hypothetical' && scenario.hypothetical) {
      const source = { ...scenario.hypothetical, id: crypto.randomUUID(), status: 'confirmed' as const, name: scenario.hypothetical.name || scenario.name }
      setSources((list) => [...list, source])
      try {
        await insertSource(householdId, source)
        savedIds.current.add(source.id)
      } catch (e) {
        setSources((list) => list.filter((item) => item.id !== source.id))
        setError(e instanceof Error ? e.message : "Couldn't save your income. Try again in a moment.")
      }
    }
    await removeScenario(scenario)
  }

  if (loading) return <Spinner label="Loading income" />

  const confirmed = shown.filter((source) => source.status === 'confirmed')

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
              <button type="button" className="btn btn-primary" onClick={() => openNew('confirmed')}>Add income</button>
              <button type="button" className="btn btn-secondary" onClick={() => openNew('planned')}>Add planned</button>
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
              <Donut title="By type" slices={palette(mixBy(forecastSources, year, (source) => ({ id: source.category, name: labelOf(source.category) })), true)} />
              <Donut title="By person" slices={palette(mixBy(forecastSources, year, (source) => ({ id: personLabel(source, people), name: personLabel(source, people) })))} />
              <Donut title="By source" slices={palette(mixBy(forecastSources, year, (source) => ({ id: source.id, name: source.name || 'Income' })))} />
              <Donut title="Ongoing vs short" slices={palette(mixBy(forecastSources, year, (source) => isShortTerm(source) ? { id: 'short', name: 'Short-term' } : { id: 'recurring', name: 'Ongoing' }))} />
            </div>
          </section>

          <section className="card card-pad" aria-labelledby="compare-title">
            <div className="card-head income-section-head">
              <h2 id="compare-title">Current and forecast</h2>
              <button type="button" className="btn btn-secondary btn-sm" aria-pressed={includePlanned} onClick={() => setIncludePlanned((value) => !value)}>Include planned</button>
            </div>
            <div className="income-bars">
              <BarChart
                label="Each month"
                height={240}
                tickCount={3}
                series={COMPARE}
                format={compact}
                groups={months.map((month, index) => ({
                  label: monthLabel(month.key, 'short'),
                  title: monthLabel(month.key),
                  values: { current: centsToDollars(currentMonths[index]?.totalCents ?? 0), forecast: centsToDollars(month.totalCents) },
                }))}
              />
              <BarChart
                label="Full year"
                height={240}
                tickCount={3}
                series={COMPARE}
                format={compact}
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
                  height={240}
                  tickCount={3}
                  label={`Forecast, ${year}`}
                  format={compact}
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
            </>
          )}

          <section className="card" aria-labelledby="sources-title">
            <div className="card-head"><h2 id="sources-title">All income</h2></div>
            {shown.length === 0 && <div className="empty"><p>No income sources yet.</p></div>}
            {shown.length > 0 && <IncomeLines year={year} people={people} sources={sortByMonthly(shown, year)} onOpen={(source) => { setForm(source); setFormIsNew(false) }} />}
          </section>

          {forecastSources.length > 0 && (
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
          )}

          {form && (
            <IncomeForm
              key={form.id}
              year={year}
              initial={form}
              isNew={formIsNew}
              people={people}
              selfId={selfId}
              onCancel={() => setForm(null)}
              onSave={(source) => void saveForm(source)}
              onDelete={() => void remove(form)}
            />
          )}

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

function IncomeLines({ year, people, sources, onOpen }: {
  year: number
  people: HouseholdPerson[]
  sources: IncomeSource[]
  onOpen: (source: IncomeSource) => void
}) {
  const cells = (source: IncomeSource) => ({
    name: source.name || 'Income',
    type: labelOf(source.category),
    person: personLabel(source, people),
    frequency: cadenceLabel(source.cadence),
    each: money(centsToDollars(source.occurrenceCents || source.monthlyCents)),
    monthly: money(centsToDollars(Math.round(yearTotalCents(source, year) / 12))),
    yearly: money(centsToDollars(yearTotalCents(source, year))),
    term: source.status === 'planned' ? 'Planned' : (DURATIONS.find((item) => item.id === source.duration)?.label ?? source.duration),
    planned: source.status === 'planned',
  })
  return (
    <>
      <div className="table-wrap income-lines-table">
        <table className="data-table" aria-label="All income">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
              <th scope="col">Person</th>
              <th scope="col">Frequency</th>
              <th scope="col">Each payment</th>
              <th scope="col">Monthly</th>
              <th scope="col">Yearly</th>
              <th scope="col">Term</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => {
              const row = cells(source)
              return (
                <tr key={source.id} className="income-row" tabIndex={0} onClick={() => onOpen(source)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(source) } }}>
                  <th scope="row">{row.name}</th>
                  <td>{row.type}</td>
                  <td>{row.person}</td>
                  <td>{row.frequency}</td>
                  <td className="num">{row.each}</td>
                  <td className="num">{row.monthly}</td>
                  <td className="num">{row.yearly}</td>
                  <td>{row.planned ? <span className="income-flag">Planned</span> : row.term}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="income-line-list">
        {sources.map((source) => {
          const row = cells(source)
          return (
            <button key={source.id} type="button" className="income-line" onClick={() => onOpen(source)}>
              <strong>{row.name}{row.planned && <span className="income-flag">Planned</span>}</strong>
              <span>{row.type} · {row.person}{row.planned ? '' : ` · ${row.term}`}</span>
              <span>{row.frequency} · {row.each} each</span>
              <b className="num">{row.monthly} / mo · {row.yearly} / yr</b>
            </button>
          )
        })}
      </div>
    </>
  )
}

function IncomeForm({ year, initial, isNew, people, selfId, onCancel, onSave, onDelete }: {
  year: number
  initial: IncomeSource
  isNew: boolean
  people: HouseholdPerson[]
  selfId: string
  onCancel: () => void
  onSave: (source: IncomeSource) => void
  onDelete: () => void
}) {
  useBackToClose(onCancel)
  const choices = personChoices(people, selfId)
  const [source, setSource] = useState(initial)
  const [name, setName] = useState(initial.name)
  const [each, setEach] = useState(formatAmount(initial.occurrenceCents || initial.monthlyCents))
  const [monthly, setMonthly] = useState(formatAmount(initial.monthlyCents))
  const [yearly, setYearly] = useState(formatAmount(yearTotalCents(initial, year)))
  const [personValue, setPersonValue] = useState(personValueOf(initial, choices))
  const [otherName, setOtherName] = useState(initial.personOther ?? '')
  const [problem, setProblem] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function sync(next: IncomeSource, editing?: 'each' | 'monthly' | 'yearly') {
    setSource(next)
    if (editing !== 'each') setEach(formatAmount(next.occurrenceCents || next.monthlyCents))
    if (editing !== 'monthly') setMonthly(formatAmount(next.monthlyCents))
    if (editing !== 'yearly') setYearly(formatAmount(yearTotalCents(next, year)))
  }

  function save() {
    const trimmed = name.trim()
    if (!trimmed) { setProblem('Enter a name'); return }
    if (personValue === 'other' && !otherName.trim()) { setProblem('Enter a name'); return }
    const choice = choices.find((item) => item.value === personValue) ?? choices[0]
    onSave(applyPerson({ ...source, name: trimmed.slice(0, 120) }, choice, otherName))
  }

  return (
    <div className="overlay" onMouseDown={onCancel}>
      <div className="sheet income-sheet" role="dialog" aria-modal="true" aria-labelledby="income-form-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id="income-form-title">{isNew ? 'Add income' : 'Edit income'}</h2>
          <button type="button" className="btn btn-ghost icon-btn" aria-label="Close" onClick={onCancel}>×</button>
        </div>
        {problem && <p className="error" role="alert">{problem}</p>}
        <label className="field"><span>Name</span><input className="input" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">
          <span>Category</span>
          <select className="input" value={source.category} onChange={(e) => setSource({ ...source, category: e.target.value as IncomeCategory })}>
            {INCOME_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Person</span>
          <select className="input" value={personValue} onChange={(e) => setPersonValue(e.target.value)}>
            {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
          </select>
        </label>
        {personValue === 'other' && (
          <label className="field"><span>Other name</span><input className="input" maxLength={80} value={otherName} onChange={(e) => setOtherName(e.target.value)} /></label>
        )}
        <label className="field">
          <span>Pay frequency</span>
          <select className="input" value={source.cadence} onChange={(e) => sync(withCadence(source, e.target.value as Cadence, year))}>
            {CADENCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        {source.cadence === 'custom' && (
          <label className="field"><span>Times each month</span><input className="input" type="number" min={1} max={31} value={source.timesPerMonth} onChange={(e) => sync(withTimes(source, Number(e.target.value), year))} /></label>
        )}
        <label className="field">
          <span>Term</span>
          <select className="input" value={source.duration} onChange={(e) => sync(withDuration(source, e.target.value as Duration, year))}>
            {DURATIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select className="input" value={source.status} onChange={(e) => setSource({ ...source, status: e.target.value as 'confirmed' | 'planned' })}>
            <option value="confirmed">Confirmed</option>
            <option value="planned">Planned</option>
          </select>
        </label>
        {source.duration === 'repeat' && (
          <label className="field"><span>Payments</span><input className="input" type="number" min={1} max={366} value={source.occurrenceCount} onChange={(e) => sync(withDuration({ ...source, occurrenceCount: Math.max(1, Number(e.target.value) || 1) }, 'repeat', year))} /></label>
        )}
        <label className="field num-field"><span>Amount each time</span><span className="affix"><i aria-hidden>$</i><input className="input" inputMode="decimal" value={each} onChange={(e) => { setEach(e.target.value); const cents = amountToCents(e.target.value); if (cents !== null) sync(withOccurrence(source, cents, year), 'each') }} /></span></label>
        <label className="field num-field"><span>Per month</span><span className="affix"><i aria-hidden>$</i><input className="input" inputMode="decimal" value={monthly} onChange={(e) => { setMonthly(e.target.value); const cents = amountToCents(e.target.value); if (cents !== null) sync(withMonthly(source, cents), 'monthly') }} /></span></label>
        <label className="field num-field"><span>Per year</span><span className="affix"><i aria-hidden>$</i><input className="input" inputMode="decimal" value={yearly} onChange={(e) => { setYearly(e.target.value); const cents = amountToCents(e.target.value); if (cents !== null) sync(withAnnual(source, year, cents), 'yearly') }} /></span></label>
        <div className="field-row">
          <label className="field"><span>Starts</span><input className="input" type="month" value={source.startsOn ?? ''} onChange={(e) => sync(withRange(source, year, monthOrNull(e.target.value), source.endsOn))} /></label>
          <label className="field"><span>Ends</span><input className="input" type="month" value={source.endsOn ?? ''} onChange={(e) => sync(withRange(source, year, source.startsOn, monthOrNull(e.target.value)))} /></label>
        </div>
        <details className="month-adjust">
          <summary>Adjust a single month</summary>
          <div className="month-grid">
            {MONTHS.map((label, index) => {
              const key = `${year}-${String(index + 1).padStart(2, '0')}`
              return (
                <label key={key} className="field num-field month-field">
                  <span>{label}<span className="visually-hidden"> {MONTH_NAMES[index]} {year}</span></span>
                  <span className="affix"><i aria-hidden>$</i><input className="input" inputMode="decimal" value={formatAmount(monthCents(source, key))} onChange={(e) => { const cents = amountToCents(e.target.value); if (cents !== null) sync(withOverride(source, key, cents)) }} /></span>
                </label>
              )
            })}
          </div>
        </details>
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={save}>Save</button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          {!isNew && !confirmDelete && <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>}
          {confirmDelete && <button type="button" className="btn btn-danger" onClick={onDelete}>Confirm delete</button>}
          {confirmDelete && <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>Keep</button>}
        </div>
      </div>
    </div>
  )
}

function personValueOf(source: IncomeSource, choices: PersonChoice[]): string {
  if (source.personUserId && choices.some((choice) => choice.userId === source.personUserId && choice.value !== 'other')) return source.personUserId
  const named = choices.find((choice) => choice.other && choice.other === source.personOther && choice.value !== 'other')
  if (named) return named.value
  if (source.personOther != null && source.personOther !== '') return 'other'
  return choices[0]?.value ?? 'other'
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
