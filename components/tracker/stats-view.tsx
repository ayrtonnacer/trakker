'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock3, Landmark, Timer } from 'lucide-react'
import { dateKey, fmtHours, fmtMoney, fmtShort, goalTarget, paymentClientId, type Client, type Goal, type Payment, type Project, type Task } from '@/lib/game'
import { GoalPanel } from './goal-panel'
import { effectiveRate } from '@/lib/finance'
import { EXT_LATEST, distractionStats, type Distraction } from '@/lib/focus'
import { PERIODS, buildEntries, computeStats, groupEntries, hourProfile, type Bin, type GroupBy, type HourProfile, type Period } from '@/lib/stats'

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'cliente', label: 'Plataforma' },
  { id: 'proyecto', label: 'Proyecto' },
  { id: 'etiqueta', label: 'Etiqueta' },
  { id: 'tarea', label: 'Tarea' },
]

type Props = { distractions: Distraction[]; extVersion: string; tasks: Task[]; payments: Payment[]; projects: Project[]; clients: Client[]; goal: Goal | null; setGoal: (g: Goal | null) => void; today: string }

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

const ROWS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

type Distracted = ReturnType<typeof distractionStats>

/** Qué sitios te distraen y a qué horas, al lado de las horas en que más trabajás. */
function DistractionPanel({ stats, work, best, extVersion, hasList }: { stats: Distracted; work: number[]; best: HourProfile['best']; extVersion: string; hasList: boolean }) {
  const wMax = Math.max(...work)
  const dMax = Math.max(...stats.byHour)
  const topSites = stats.bySite.slice(0, 6)
  const outdated = !!extVersion && extVersion.localeCompare(EXT_LATEST, undefined, { numeric: true }) < 0
  return (
    <article className="panel distraction-panel">
      <div className="panel-heading"><h3>¿Qué te distrae y cuándo?</h3>{stats.peak && <span className="legend">Más intentos: <b>{stats.peak.from} a {stats.peak.to} h</b> · {stats.peak.pct}%</span>}</div>
      {stats.total === 0 ? (
        <p className="empty-list">{outdated ? <>Tu extensión es de una versión anterior y no registra los intentos: actualizala (README de la carpeta <code>extension</code>).</> : !extVersion ? <>Se registra con la extensión <b>Tasker CRM Foco</b> cuando tu modo foco bloquea un sitio. Todavía no la detecto en este navegador.</> : !hasList ? <>Cargá sitios en <b>Modo foco</b> (debajo del timer): cada vez que intentes abrir uno mientras trabajás, queda anotado.</> : 'Sin intentos en este período. Buena señal.'}</p>
      ) : (
        <div className="distraction">
          <div className="dist-sites">
            <h4>{stats.total} intento{stats.total === 1 ? '' : 's'} de abrir sitios bloqueados</h4>
            {topSites.map((x) => <div className="dist-site" key={x.site}><span>{x.site}</span><div className="group-bar"><div style={{ width: `${x.pct}%`, background: 'var(--danger)' }} /></div><b>{x.n}</b></div>)}
            {stats.bySite.length > topSites.length && <small className="field-help">y {stats.bySite.length - topSites.length} sitio{stats.bySite.length - topSites.length === 1 ? '' : 's'} más</small>}
          </div>
          <div className="dist-hours" role="img" aria-label="Horas de trabajo e intentos de distracción por hora">
            <div className="hours-row dist-row"><span title="Tiempo trabajado">Trab.</span>{work.map((v, h) => <b key={h} title={`${h}:00 · ${fmtHours(v)} trabajado`}><em className={best && h >= best.from && h < best.to ? 'best' : ''} style={{ height: `${wMax ? (v / wMax) * 100 : 0}%` }} /></b>)}</div>
            <div className="hours-row dist-row"><span title="Intentos de abrir sitios bloqueados">Dist.</span>{stats.byHour.map((v, h) => <b key={h} title={`${h}:00 · ${v} intento${v === 1 ? '' : 's'}`}><em className="bad" style={{ height: `${dMax ? (v / dMax) * 100 : 0}%` }} /></b>)}</div>
            <div className="hours-row hours-axis"><span />{work.map((_, h) => <small key={h}>{h % 3 === 0 ? h : ''}</small>)}</div>
            {stats.peak && best && <p className="dist-insight">Rendís más entre las <b>{best.from} y las {best.to} h</b> y te distraés más entre las <b>{stats.peak.from} y las {stats.peak.to} h</b>. {stats.peak.from < best.to && stats.peak.to > best.from ? 'Se pisan: probá mover lo que más te cuesta a otra franja.' : 'Reservá tu mejor franja para las tareas que más te cuestan.'}</p>}
          </div>
        </div>
      )}
    </article>
  )
}

/** Tiempo por día de la semana y hora: dónde se concentra tu trabajo. */
function HoursPanel({ profile }: { profile: HourProfile }) {
  const max = Math.max(...profile.grid.flat())
  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((v / max) * 4))))
  const hMax = Math.max(...profile.byHour)
  return (
    <article className="panel hours-panel">
      <div className="panel-heading"><h3>¿A qué hora trabajás más?</h3>{profile.best && <span className="legend">Tu mejor franja: <b>{profile.best.from} a {profile.best.to} h</b> · {profile.best.pct}% de tu tiempo</span>}</div>
      {profile.total === 0 ? <p className="empty-list">No hay tareas con hora de inicio en este período.</p> : (
        <div className="hours">
          <div className="hours-grid" role="img" aria-label="Tiempo por día y hora">
            {profile.grid.map((row, r) => <div className="hours-row" key={r}><span>{ROWS[r]}</span>{row.map((v, h) => <i key={h} className={`lv${level(v)}`} title={`${ROWS[r]} ${h}:00 a ${h + 1}:00 · ${v > 0 ? fmtHours(v) : 'nada'}`} />)}</div>)}
            <div className="hours-row hours-total"><span>Σ</span>{profile.byHour.map((v, h) => <b key={h} title={`${h}:00 a ${h + 1}:00 · ${fmtHours(v)}`}><em style={{ height: `${hMax ? (v / hMax) * 100 : 0}%` }} className={profile.best && h >= profile.best.from && h < profile.best.to ? 'best' : ''} /></b>)}</div>
            <div className="hours-row hours-axis"><span />{profile.byHour.map((_, h) => <small key={h}>{h % 3 === 0 ? h : ''}</small>)}</div>
          </div>
        </div>
      )}
    </article>
  )
}

export function StatsView({ distractions, extVersion, tasks, payments, projects, clients, goal, setGoal, today }: Props) {
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
  // Las franjas salen de las tareas con hora de inicio, con los mismos filtros que el resto.
  const profile = useMemo(() => {
    const from = dateKey(s.range.from), to = dateKey(s.range.to)
    const projectById = new Map(projects.map((p) => [p.id, p]))
    const clientName = (projectId: string | null, fallback: string) => {
      const p = projectId ? projectById.get(projectId) : undefined
      return p ? clients.find((c) => c.id === p.clientId)?.name ?? fallback : fallback
    }
    return hourProfile(tasks.filter((t) => t.date >= from && t.date <= to && (!billableOnly || t.billable) && (!clientFilter || clientName(t.projectId, t.client) === clientFilter)))
  }, [tasks, projects, clients, s.range, clientFilter, billableOnly])
  const distracted = useMemo(() => distractionStats(distractions, dateKey(s.range.from), dateKey(s.range.to)), [distractions, s.range])
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

      {(() => {
        const unpaid = s.seconds - s.billableSeconds
        const diff = collected.gross - s.amount
        const gap = s.perHour > 0 && s.effectiveRate > 0 ? Math.round((1 - s.effectiveRate / s.perHour) * 100) : 0
        return (
          <div className="summary-grid">
            <div className="summary-card" title="Todo el tiempo registrado. “Sin pago” es lo que no se factura: leer la documentación, hacer pruebas, assessments, esperas, onboarding no pago y lo personal.">
              <span><Clock3 /> Tiempo trabajado</span>
              <strong>{fmtHours(s.seconds)}</strong>
              {s.seconds > 0 && <div className="split-bar" aria-hidden="true"><i style={{ width: `${s.billablePct}%` }} /></div>}
              <small>{s.seconds > 0 ? <><b>{fmtHours(s.billableSeconds)}</b> pagas · <b>{fmtHours(unpaid)}</b> sin pago (documentación, pruebas, assessments) · {s.workedDays} día{s.workedDays === 1 ? '' : 's'}</> : 'Sin tiempo registrado en este período'}</small>
            </div>
            <div className="summary-card" title="Estimado = horas × tarifa + bonus. Cobrado = lo que te llegó de verdad (pestaña Pagos). Los pagos llegan con atraso: para comparar, mirá el mes o el trimestre.">
              <span><Landmark /> Cobrado vs. estimado</span>
              <strong>US$ {fmtMoney(collected.gross)} <em className="vs">/ {fmtMoney(s.amount)}</em></strong>
              <small>{collected.count === 0
                ? (s.amount > 0 ? 'Todavía no cargaste pagos de este período: cargalos en Pagos para ver si te pagaron lo que trabajaste' : 'Sin ingresos en este período')
                : <>{s.amount > 0 ? <><b className={diff < -0.005 ? 'neg' : 'pos'}>{diff >= 0 ? '+' : '−'}US$ {fmtMoney(Math.abs(diff))} ({Math.round((collected.gross / s.amount) * 100)}%)</b> vs. lo estimado</> : 'sin estimado para comparar'}{collected.fees > 0 ? ` · comisiones US$ ${fmtMoney(collected.fees)}` : ''}</>}</small>
            </div>
            <div className="summary-card" title="Lo ganado en plataformas ÷ TODAS las horas en ellas, incluido lo que no te pagan. Es lo que de verdad vale tu hora.">
              <span><Timer /> Valor real de tu hora</span>
              <strong>{s.effectiveRate > 0 ? `US$ ${fmtMoney(s.effectiveRate)}/h` : '—'}</strong>
              <small>{s.perHour > 0 ? <>La plataforma paga <b>US$ {fmtMoney(s.perHour)}/h</b>{gap > 0 ? <> · el tiempo sin pago te la baja un <b className="neg">{gap}%</b></> : ' · no hay tiempo sin pago'}</> : 'Todavía sin horas pagas en este período'}</small>
            </div>
          </div>
        )
      })()}

      <div className="stats-grid even">
        <BarChart title={`Horas por ${s.byMonth ? 'mes' : 'día'}`} money={false} bins={s.bins} byMonth={s.byMonth} lineGoal={0} binTargets={[]} />
        <BarChart title={`Ganado por ${s.byMonth ? 'mes' : 'día'}`} money bins={s.bins} byMonth={s.byMonth} lineGoal={lineGoal} binTargets={binTargets} />
      </div>

      <HoursPanel profile={profile} />
      <DistractionPanel stats={distracted} work={profile.byHour} best={profile.best} extVersion={extVersion} hasList={distractions.length > 0} />

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
