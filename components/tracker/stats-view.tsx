'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock3, DollarSign, Gauge, ListChecks, Target } from 'lucide-react'
import { DAILY_GOAL_HOURS, dateKey, fmtHours, fmtMoney, fmtShort, goalTarget, monthEarnings, type Client, type Goal, type Payment, type Project, type Task } from '@/lib/game'
import { PERIODS, buildEntries, computeStats, groupEntries, type GroupBy, type Period } from '@/lib/stats'

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'cliente', label: 'Cliente' },
  { id: 'proyecto', label: 'Proyecto' },
  { id: 'etiqueta', label: 'Etiqueta' },
  { id: 'tarea', label: 'Tarea' },
]

type Metric = 'horas' | 'dinero'

type Props = { tasks: Task[]; payments: Payment[]; projects: Project[]; clients: Client[]; goal: Goal | null; today: string; onOpenGoals: () => void }

/** Tope del eje redondeado a 1, 2 o 5 × 10ⁿ para que las marcas queden prolijas. */
function niceMax(v: number) {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

export function StatsView({ tasks, payments, projects, clients, goal, today, onOpenGoals }: Props) {
  const [period, setPeriod] = useState<Period>('semana')
  const [offset, setOffset] = useState(0)
  const [metric, setMetric] = useState<Metric>('horas')
  const [groupBy, setGroupBy] = useState<GroupBy>('proyecto')
  const [clientFilter, setClientFilter] = useState('')
  const [billableOnly, setBillableOnly] = useState(false)

  const all = useMemo(() => buildEntries(tasks, payments, projects, clients), [tasks, payments, projects, clients])
  const clientNames = useMemo(() => [...new Set([...clients.map((c) => c.name), ...all.map((t) => t.client)])].sort(), [clients, all])
  const clientColors = useMemo(() => new Map(clients.map((c) => [c.name, c.color])), [clients])
  const filtered = useMemo(() => all.filter((t) => (!clientFilter || t.client === clientFilter) && (!billableOnly || t.billable)), [all, clientFilter, billableOnly])
  const s = useMemo(() => computeStats(filtered, period, offset, today), [filtered, period, offset, today])
  const groups = useMemo(() => {
    const gs = groupEntries(s.entries, groupBy, clientColors)
    return gs.filter((g) => (metric === 'horas' ? g.seconds > 0 : g.amount > 0)).sort((a, b) => (metric === 'horas' ? b.seconds - a.seconds : b.amount - a.amount))
  }, [s.entries, groupBy, clientColors, metric])

  const money = metric === 'dinero'
  const value = (b: { seconds: number; amount: number }) => (money ? b.amount : b.seconds / 3600)
  const fmtValue = (v: number) => (money ? `$${fmtShort(Math.round(v))}` : `${Math.round(v * 10) / 10}h`)

  // Meta del gráfico: horas por día, o ritmo de la meta de ingresos (mensual o repartida por día).
  const goalMonth = period === 'mes' ? dateKey(s.range.from).slice(0, 7) : today.slice(0, 7)
  const monthTarget = goalTarget(goal, goalMonth)
  const daysInMonth = new Date(Number(goalMonth.slice(0, 4)), Number(goalMonth.slice(5, 7)), 0).getDate()
  const lineGoal = !s.byMonth ? (money ? (monthTarget ? monthTarget / daysInMonth : 0) : DAILY_GOAL_HOURS) : 0
  const binTargets = s.byMonth && money ? s.bins.map((b) => goalTarget(goal, b.key)) : []

  const maxBin = Math.max(...s.bins.map(value), lineGoal * 1.15, ...binTargets.map((t) => t * 1.05), 0)
  const yMax = niceMax(maxBin)
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => yMax * f)
  const labelEvery = s.bins.length > 16 ? Math.ceil(s.bins.length / 10) : 1
  const hasData = money ? s.amount > 0 : s.seconds > 0

  let acc = 0
  const top = groups.slice(0, 8)
  const donut = top.length
    ? `conic-gradient(${top.map((g) => { const from = acc; acc += money ? g.amountPct : g.pct; return `${g.color} ${from}% ${acc}%` }).join(', ')}${acc < 100 ? `, var(--line) ${acc}% 100%` : ''})`
    : 'conic-gradient(var(--line) 0 100%)'

  const monthEarned = monthEarnings(goalMonth, tasks, payments)
  const goalPct = monthTarget ? Math.min(100, Math.round((monthEarned / monthTarget) * 100)) : 0

  return (
    <section className="view">
      <div className="view-heading">
        <div><h2>Estadísticas</h2><p className="view-sub">Tiempo y plata por día, mes, cliente y proyecto. Los pagos de proyectos a precio fijo o por entrega se suman en la fecha en que los cobraste.</p></div>
        <div className="segmented" role="tablist" aria-label="Período">
          {PERIODS.map((p) => <button key={p.id} role="tab" aria-selected={period === p.id} className={period === p.id ? 'seg-on' : ''} onClick={() => { setPeriod(p.id); setOffset(0) }}>{p.label}</button>)}
        </div>
      </div>

      <div className="stats-toolbar">
        <div className="range-nav">
          <button onClick={() => setOffset((o) => o - 1)} disabled={period === 'todo'} aria-label="Período anterior"><ChevronLeft /></button>
          <strong>{s.range.label}</strong>
          <button onClick={() => setOffset((o) => o + 1)} disabled={period === 'todo' || offset >= 0} aria-label="Período siguiente"><ChevronRight /></button>
        </div>
        <div className="filters">
          <div className="segmented small" role="tablist" aria-label="Medir">
            <button role="tab" aria-selected={!money} className={!money ? 'seg-on' : ''} onClick={() => setMetric('horas')}><Clock3 /> Horas</button>
            <button role="tab" aria-selected={money} className={money ? 'seg-on' : ''} onClick={() => setMetric('dinero')}><DollarSign /> Dinero</button>
          </div>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Filtrar por cliente"><option value="">Todos los clientes</option>{clientNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <button className={`chip ${billableOnly ? 'chip-on' : ''}`} onClick={() => setBillableOnly((b) => !b)} aria-pressed={billableOnly}>Sólo facturable</button>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card"><span><Clock3 /> Horas</span><strong>{fmtHours(s.seconds)}</strong><small>{s.workedDays} día{s.workedDays === 1 ? '' : 's'} con trabajo · {s.billablePct}% facturable</small></div>
        <div className="summary-card"><span><DollarSign /> Ganado</span><strong>US$ {fmtMoney(s.amount)}</strong><small>{s.paymentsAmount > 0 ? `incluye US$ ${fmtMoney(s.paymentsAmount)} en pagos` : 'por horas facturadas'}</small></div>
        <div className="summary-card"><span><Gauge /> Promedio diario</span><strong>{money ? `US$ ${fmtMoney(s.avgDailyAmount)}` : fmtHours(s.avgDaily)}</strong><small>{money ? `${fmtHours(s.avgDaily)} por día` : `US$ ${fmtMoney(s.avgDailyAmount)} por día`}</small></div>
        <div className="summary-card"><span><ListChecks /> Valor de tu hora</span><strong>US$ {fmtMoney(s.perHour)}</strong><small>{s.count} tarea{s.count === 1 ? '' : 's'} en el período</small></div>
        <button className="summary-card goal-card" onClick={onOpenGoals}>
          <span><Target /> Meta de {goalMonth === today.slice(0, 7) ? 'este mes' : 'ese mes'}</span>
          {monthTarget ? <><strong>{goalPct}%</strong><div className="thin-track"><div style={{ width: `${goalPct}%` }} /></div><small>US$ {fmtShort(Math.round(monthEarned))} de {fmtShort(monthTarget)}</small></> : <><strong>—</strong><small>Definí una meta de ingresos →</small></>}
        </button>
      </div>

      <div className="stats-grid">
        <article className="panel">
          <div className="panel-heading"><h3>{money ? 'Ganado' : 'Horas'} por {s.byMonth ? 'mes' : 'día'}</h3>{s.byMonth && money && binTargets.some(Boolean) && <span className="legend"><i className="legend-target" /> objetivo del mes</span>}</div>
          {!hasData ? <p className="empty-list">No hay {money ? 'ingresos' : 'tiempo registrado'} en este período.</p> : (
            <div className="schart">
              <div className="schart-y">{ticks.map((t, i) => <span key={i}>{fmtValue(t)}</span>)}</div>
              <div className="schart-main">
                <div className="schart-area">
                  {lineGoal > 0 && <div className="schart-goal" style={{ bottom: `${(lineGoal / yMax) * 100}%` }}><span>{money ? `Ritmo meta $${fmtShort(Math.round(lineGoal))}/día` : `Meta ${DAILY_GOAL_HOURS}h`}</span></div>}
                  {s.bins.map((b, i) => {
                    const v = value(b)
                    const target = binTargets[i] ?? 0
                    const hit = lineGoal ? v >= lineGoal : target ? v >= target : false
                    return (
                      <div className="schart-col" key={b.key} title={`${b.title}: ${fmtHours(b.seconds)} · US$ ${fmtMoney(b.amount)}${target ? ` · objetivo US$ ${fmtShort(target)}` : ''}`}>
                        {target > 0 && <i className="schart-target" style={{ bottom: `${(target / yMax) * 100}%` }} />}
                        <div className={`schart-bar ${hit ? 'bar-hit' : ''} ${b.isCurrent ? 'bar-current' : ''}`} style={{ height: `${Math.min(100, (v / yMax) * 100)}%` }}>
                          {v > 0 && s.bins.length <= 16 && <em>{money ? fmtShort(Math.round(v)) : v.toFixed(1)}</em>}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="schart-x">{s.bins.map((b, i) => <span key={b.key}>{i % labelEvery === 0 ? b.label : ''}</span>)}</div>
              </div>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading"><h3>{money ? 'Ganado' : 'Tiempo'} por {GROUPS.find((g) => g.id === groupBy)!.label.toLowerCase()}</h3>
            <select className="group-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Agrupar por">{GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
          </div>
          {groups.length === 0 ? <p className="empty-list">No hay datos para mostrar.</p> : (
            <div className="distribution">
              <div className="donut" style={{ background: donut }}><div><strong>{money ? `$${fmtShort(Math.round(s.amount))}` : fmtHours(s.seconds)}</strong><span>{money ? fmtHours(s.seconds) : `US$ ${fmtMoney(s.amount)}`}</span></div></div>
              <ul className="group-list">
                {top.map((g) => {
                  const pct = money ? g.amountPct : g.pct
                  return (
                    <li key={g.key}>
                      <div className="group-top"><i className="dot" style={{ background: g.color }} /><strong>{g.name}</strong><span>{fmtHours(g.seconds)}</span><em>{g.amount > 0 ? `US$ ${fmtMoney(g.amount)}` : '—'}</em></div>
                      <div className="group-bar"><div style={{ width: `${pct}%`, background: g.color }} /></div>
                      <small>{pct}%{g.count ? ` · ${g.count} tarea${g.count === 1 ? '' : 's'}` : ''}{g.seconds > 0 && g.amount > 0 ? ` · US$ ${fmtMoney(g.amount / (g.seconds / 3600))}/h` : ''}</small>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
