'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock3, DollarSign, Gauge, Landmark, Timer } from 'lucide-react'
import { dateKey, fmtHours, fmtMoney, fmtShort, goalTarget, paymentClientId, type Client, type Goal, type Payment, type Project, type Task } from '@/lib/game'
import { GoalPanel } from './goal-panel'
import { effectiveRate } from '@/lib/finance'
import { PERIODS, buildEntries, computeStats, groupEntries, type Bin, type GroupBy, type Period } from '@/lib/stats'

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'cliente', label: 'Plataforma' },
  { id: 'proyecto', label: 'Proyecto' },
  { id: 'etiqueta', label: 'Etiqueta' },
  { id: 'tarea', label: 'Tarea' },
]

type Props = { tasks: Task[]; payments: Payment[]; projects: Project[]; clients: Client[]; goal: Goal | null; setGoal: (g: Goal | null) => void; today: string }

/** Tope del eje redondeado a 1, 2 o 5 × 10ⁿ para que las marcas queden prolijas. */
function niceMax(v: number) {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

type ChartProps = { title: string; money: boolean; bins: Bin[]; byMonth: boolean; lineGoal: number; binTargets: number[] }

/** Barras por día o mes; en dinero marca el ritmo de la meta mensual. */
function BarChart({ title, money, bins, byMonth, lineGoal, binTargets }: ChartProps) {
  const value = (b: { seconds: number; amount: number }) => (money ? b.amount : b.seconds / 3600)
  const fmtValue = (v: number) => (money ? `$${fmtShort(Math.round(v))}` : `${Math.round(v * 10) / 10}h`)
  const yMax = niceMax(Math.max(...bins.map(value), lineGoal * 1.15, ...binTargets.map((t) => t * 1.05), 0))
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => yMax * f)
  const labelEvery = bins.length > 16 ? Math.ceil(bins.length / 10) : 1
  const hasData = bins.some((b) => value(b) > 0)
  return (
    <article className="panel">
      <div className="panel-heading"><h3>{title}</h3>{byMonth && money && binTargets.some(Boolean) && <span className="legend"><i className="legend-target" /> objetivo del mes</span>}</div>
      {!hasData ? <p className="empty-list">No hay {money ? 'ingresos' : 'tiempo registrado'} en este período.</p> : (
        <div className="schart">
          <div className="schart-y">{ticks.map((t, i) => <span key={i}>{fmtValue(t)}</span>)}</div>
          <div className="schart-main">
            <div className="schart-area">
              {lineGoal > 0 && <div className="schart-goal" style={{ bottom: `${(lineGoal / yMax) * 100}%` }}><span>Ritmo meta ${fmtShort(Math.round(lineGoal))}/día</span></div>}
              {bins.map((b, i) => {
                const v = value(b)
                const target = binTargets[i] ?? 0
                const hit = lineGoal ? v >= lineGoal : target ? v >= target : false
                return (
                  <div className="schart-col" key={b.key} title={`${b.title}: ${fmtHours(b.seconds)} · US$ ${fmtMoney(b.amount)}${target ? ` · objetivo US$ ${fmtShort(target)}` : ''}`}>
                    {target > 0 && <i className="schart-target" style={{ bottom: `${(target / yMax) * 100}%` }} />}
                    <div className={`schart-bar ${hit ? 'bar-hit' : ''} ${b.isCurrent ? 'bar-current' : ''}`} style={{ height: `${Math.min(100, (v / yMax) * 100)}%` }}>
                      {v > 0 && bins.length <= 10 && <em>{money ? fmtShort(Math.round(v)) : v.toFixed(1)}</em>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="schart-x">{bins.map((b, i) => <span key={b.key}>{i % labelEvery === 0 ? b.label : ''}</span>)}</div>
          </div>
        </div>
      )}
    </article>
  )
}

export function StatsView({ tasks, payments, projects, clients, goal, setGoal, today }: Props) {
  const [period, setPeriod] = useState<Period>('semana')
  const [offset, setOffset] = useState(0)
  const [groupBy, setGroupBy] = useState<GroupBy>('cliente')
  const [clientFilter, setClientFilter] = useState('')
  const [billableOnly, setBillableOnly] = useState(false)

  const all = useMemo(() => buildEntries(tasks, payments, projects, clients), [tasks, payments, projects, clients])
  const clientNames = useMemo(() => [...new Set([...clients.map((c) => c.name), ...all.map((t) => t.client)])].sort(), [clients, all])
  const clientColors = useMemo(() => new Map(clients.map((c) => [c.name, c.color])), [clients])
  const filtered = useMemo(() => all.filter((t) => (!clientFilter || t.client === clientFilter) && (!billableOnly || t.billable)), [all, clientFilter, billableOnly])
  const s = useMemo(() => computeStats(filtered, period, offset, today), [filtered, period, offset, today])
  // Lo que de verdad te pagaron en el período (por horas, cobros y bonus), a diferencia de lo ganado, que es estimado.
  const collected = useMemo(() => {
    const from = dateKey(s.range.from)
    const to = dateKey(s.range.to)
    const nameOf = (p: Payment) => clients.find((c) => c.id === paymentClientId(p, projects))?.name ?? ''
    const list = payments.filter((p) => p.paid && p.date >= from && p.date <= to && (!clientFilter || nameOf(p) === clientFilter))
    return { gross: list.reduce((a, p) => a + p.amount, 0), fees: list.reduce((a, p) => a + (p.fee ?? 0), 0), count: list.length }
  }, [payments, projects, clients, s.range, clientFilter])
  const groups = useMemo(() => {
    const gs = groupEntries(s.entries, groupBy, clientColors)
    return gs.filter((g) => g.seconds > 0 || g.amount > 0).sort((x, y) => y.amount - x.amount || y.seconds - x.seconds)
  }, [s.entries, groupBy, clientColors])

  // Meta mensual del gráfico de dinero: ritmo por día (semana, mes, hoy) o objetivo de cada mes (año, todo).
  const goalMonth = period === 'mes' ? dateKey(s.range.from).slice(0, 7) : today.slice(0, 7)
  const monthTarget = goalTarget(goal, goalMonth)
  const daysInMonth = new Date(Number(goalMonth.slice(0, 4)), Number(goalMonth.slice(5, 7)), 0).getDate()
  const lineGoal = !s.byMonth && period !== 'trimestre' && monthTarget ? monthTarget / daysInMonth : 0
  const binTargets = s.byMonth ? s.bins.map((b) => goalTarget(goal, b.key)) : []

  return (
    <section className="view">
      <div className="view-heading">
        <div><h2>Estadísticas</h2><p className="view-sub">Tiempo y plata por día, mes, plataforma y proyecto. <b>Ganado</b> es lo estimado (horas × tarifa + cobros y bonus); <b>Cobrado</b> es lo que te pagaron de verdad.</p></div>
      </div>

      <GoalPanel goal={goal} setGoal={setGoal} tasks={tasks} payments={payments} today={today} hourRate={effectiveRate(projects, tasks, payments, today, 90)} />

      <div className="stats-toolbar">
        <div className="segmented wrap" role="tablist" aria-label="Período">
          {PERIODS.map((p) => <button key={p.id} role="tab" aria-selected={period === p.id} className={period === p.id ? 'seg-on' : ''} onClick={() => { setPeriod(p.id); setOffset(0) }}>{p.label}</button>)}
        </div>
        <div className="range-nav">
          <button onClick={() => setOffset((o) => o - 1)} disabled={period === 'todo'} aria-label="Período anterior"><ChevronLeft /></button>
          <strong>{s.range.label}</strong>
          <button onClick={() => setOffset((o) => o + 1)} disabled={period === 'todo' || offset >= 0} aria-label="Período siguiente"><ChevronRight /></button>
        </div>
        <div className="filters">
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Filtrar por plataforma"><option value="">Todas las plataformas</option>{clientNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <button className={`chip ${billableOnly ? 'chip-on' : ''}`} onClick={() => setBillableOnly((b) => !b)} aria-pressed={billableOnly}>Sólo facturable</button>
        </div>
      </div>

      <div className="summary-grid four">
        <div className="summary-card"><span><Clock3 /> Horas</span><strong>{fmtHours(s.seconds)}</strong><small>{fmtHours(s.avgDaily)} por día · {s.workedDays} día{s.workedDays === 1 ? '' : 's'} con trabajo · {s.billablePct}% facturable</small></div>
        <div className="summary-card"><span><DollarSign /> Ganado (estimado)</span><strong>US$ {fmtMoney(s.amount)}</strong><small>US$ {fmtMoney(s.avgDailyAmount)} por día · {s.paymentsAmount > 0 ? `incluye US$ ${fmtMoney(s.paymentsAmount)} en pagos` : 'por horas facturadas'}</small></div>
        <div className="summary-card" title="Lo que las plataformas te pagaron de verdad en este período. Se carga desde la pestaña Pagos."><span><Landmark /> Cobrado</span><strong>US$ {fmtMoney(collected.gross)}</strong><small>{collected.count === 0 ? 'Todavía no registraste pagos en este período' : <>{collected.count} pago{collected.count === 1 ? '' : 's'}{collected.fees > 0 ? ` · comisiones US$ ${fmtMoney(collected.fees)} · neto US$ ${fmtMoney(collected.gross - collected.fees)}` : ''}{s.amount > 0 ? ` · ${collected.gross >= s.amount ? '+' : '−'}US$ ${fmtMoney(Math.abs(collected.gross - s.amount))} vs. estimado` : ''}</>}</small></div>
        <div className="summary-card" title="Lo ganado en plataformas ÷ TODAS las horas que pasaste en ellas, incluido el tiempo no facturable (assessments, onboarding sin pago, esperas)."><span><Timer /> Tarifa efectiva</span><strong>{s.effectiveRate > 0 ? `US$ ${fmtMoney(s.effectiveRate)}/h` : '—'}</strong><small>{s.unpaidSeconds > 0 ? `incluye ${fmtHours(s.unpaidSeconds)} sin pago` : 'todo el tiempo en plataformas'}{s.perHour > 0 && s.effectiveRate > 0 && s.perHour - s.effectiveRate > 0.005 ? ` · tu hora facturable rinde US$ ${fmtMoney(s.perHour)}` : ''}</small></div>
        <div className="summary-card" title="En proyectos por presupuesto o entrega se usa lo cobrado ÷ las horas del proyecto, así el valor no salta según cuándo te pagan."><span><Gauge /> Valor de tu hora</span><strong>{s.perHour > 0 ? `US$ ${fmtMoney(s.perHour)}` : '—'}</strong><small>ganado ÷ horas facturables{s.perHour > 0 ? ' (sin contar el tiempo no pago)' : ' (todavía sin horas cobradas)'}</small></div>
      </div>

      <div className="stats-grid even">
        <BarChart title={`Horas por ${s.byMonth ? 'mes' : 'día'}`} money={false} bins={s.bins} byMonth={s.byMonth} lineGoal={0} binTargets={[]} />
        <BarChart title={`Ganado por ${s.byMonth ? 'mes' : 'día'}`} money bins={s.bins} byMonth={s.byMonth} lineGoal={lineGoal} binTargets={binTargets} />
      </div>

      <article className="panel group-panel">
        <div className="panel-heading"><h3>Tiempo y plata por {GROUPS.find((g) => g.id === groupBy)!.label.toLowerCase()}</h3>
          <select className="group-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Agrupar por">{GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
        </div>
        {groups.length === 0 ? <p className="empty-list">No hay datos para mostrar.</p> : (
          <>
            <div className="group-table" role="table">
              <div className="group-row group-head" role="row"><span>{GROUPS.find((g) => g.id === groupBy)!.label}</span><span>Horas</span><span>US$</span><span>US$/hora</span></div>
              {groups.map((g) => (
                <div className="group-row" role="row" key={g.key}>
                  <div className="group-name"><div className="group-top"><i className="dot" style={{ background: g.color }} /><strong>{g.name}</strong>{g.count > 0 && <small>{g.count} tarea{g.count === 1 ? '' : 's'}</small>}</div>
                    <div className="group-bar" title={`${g.pct}% del tiempo`}><div style={{ width: `${g.pct}%`, background: g.color }} /></div></div>
                  <span><b>{fmtHours(g.seconds)}</b><small>{g.pct}%</small></span>
                  <span><b>{g.amount > 0 ? fmtMoney(g.amount) : '—'}</b><small>{g.amountPct}%</small></span>
                  <span><b>{g.valueSeconds > 0 ? fmtMoney(g.imputed / (g.valueSeconds / 3600)) : '—'}</b></span>
                </div>
              ))}
              <div className="group-row group-foot" role="row"><span>Total</span><span><b>{fmtHours(s.seconds)}</b></span><span><b>{fmtMoney(s.amount)}</b></span><span><b>{s.perHour > 0 ? fmtMoney(s.perHour) : '—'}</b></span></div>
            </div>
            <p className="group-note">US$/hora = ganado ÷ horas facturables. En presupuestos o entregas se calcula con lo cobrado ÷ las horas de todo el proyecto (no cambia según cuándo te pagan); si todavía no cobraste o el presupuesto no terminó, queda en “—”.</p>
          </>
        )}
      </article>

    </section>
  )
}
