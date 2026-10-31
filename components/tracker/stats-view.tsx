'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ClipboardCopy, Clock3, Download, FileSpreadsheet, FileText, Landmark, Printer, Timer } from 'lucide-react'
import { dateKey, fmtHours, fmtMoney, fmtShort, goalTarget, paymentClientId, type Client, type Goal, type Payment, type Project, type Task } from '@/lib/game'
import { GoalPanel } from './goal-panel'
import { MultiFilter } from './multi-filter'
import { effectiveRate } from '@/lib/finance'
import { EXT_LATEST, type Distraction } from '@/lib/focus'
import { WEEKDAY_NAMES, rhythm, type Rhythm } from '@/lib/rhythm'
import { reportHtml, reportMarkdown, type ReportInput } from '@/lib/report'
import { distractionsToCsv, download, paymentsToCsv, slug, tasksToCsv } from '@/lib/export'
import { PERIODS, buildEntries, change, computeStats, groupEntries, previousStats, type Bin, type GroupBy, type Period } from '@/lib/stats'

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

type ChartProps = { money: boolean; setMoney: (m: boolean) => void; bins: Bin[]; byMonth: boolean; lineGoal: number; binTargets: number[] }

/** Barras por día o mes, en horas o en plata (un solo gráfico con selector); en plata marca el ritmo de la meta mensual. */
function BarChart({ money, setMoney, bins, byMonth, lineGoal, binTargets }: ChartProps) {
  const value = (b: { seconds: number; amount: number }) => (money ? b.amount : b.seconds / 3600)
  const fmtValue = (v: number) => (money ? `$${fmtShort(Math.round(v))}` : `${Math.round(v * 10) / 10}h`)
  const yMax = niceMax(Math.max(...bins.map(value), lineGoal * 1.15, ...binTargets.map((t) => t * 1.05), 0))
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => yMax * f)
  const labelEvery = bins.length > 16 ? Math.ceil(bins.length / 10) : 1
  const hasData = bins.some((b) => value(b) > 0)
  return (
    <article className="panel">
      <div className="panel-heading"><h3>{money ? 'Ganado' : 'Horas'} por {byMonth ? 'mes' : 'día'}</h3>
        <div className="chart-head-right">{byMonth && money && binTargets.some(Boolean) && <span className="legend"><i className="legend-target" /> objetivo del mes</span>}
          <div className="segmented small" role="tablist" aria-label="Qué mostrar"><button role="tab" aria-selected={!money} className={!money ? 'seg-on' : ''} onClick={() => setMoney(false)}>Horas</button><button role="tab" aria-selected={money} className={money ? 'seg-on' : ''} onClick={() => setMoney(true)}>US$</button></div>
        </div>
      </div>
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
const cap = (w: string) => w[0].toUpperCase() + w.slice(1)
const num = (n: number) => n.toFixed(1).replace('.', ',')

/**
 * Responde dos preguntas con una sola grilla (día × hora): cuándo y qué días rendís más (verde, tiempo trabajado)
 * y cuándo y con qué perdés el foco (rojo, intentos de abrir sitios bloqueados).
 */
function RhythmPanel({ r, extVersion }: { r: Rhythm; extVersion: string }) {
  const max = Math.max(...r.work.grid.flat())
  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((v / max) * 4))))
  const dMax = Math.max(...r.distGrid.flat())
  const dayMax = Math.max(...r.byDay.map((d) => d.avg))
  const hMax = Math.max(...r.work.byHour)
  const xMax = Math.max(...r.dist.byHour)
  const outdated = !!extVersion && extVersion.localeCompare(EXT_LATEST, undefined, { numeric: true }) < 0
  const noFocusData = !extVersion ? 'Se mide con el modo foco de la extensión Tasker CRM Foco (no la detecto en este navegador).' : outdated ? 'Actualizá la extensión para medirlo.' : 'Sin intentos en este período: cargá sitios en Modo foco para medirlo.'
  const [best, second] = r.bestDays
  const top = r.dist.bySite[0]
  return (
    <article className="panel rhythm-panel">
      <div className="panel-heading"><h3>Tu ritmo</h3><span className="legend"><i className="lg-work" /> tiempo trabajado <i className="lg-dist" /> intentos de distraerte</span></div>
      <div className="rhythm-answers">
        <div><span>¿Cuándo rendís más?</span><strong>{r.work.best ? `${r.work.best.from} a ${r.work.best.to} h` : '—'}</strong><small>{r.work.best ? `${r.work.best.pct}% de tu tiempo` : 'Sin tareas con hora de inicio'}</small></div>
        <div><span>¿Qué días?</span><strong>{best ? cap(WEEKDAY_NAMES[best.day]) : '—'}</strong><small>{best ? `${fmtHours(best.avg)} promedio${second ? ` · después ${WEEKDAY_NAMES[second.day]} (${fmtHours(second.avg)})` : ''}` : 'Sin tiempo en este período'}</small></div>
        <div><span>¿Cuándo perdés el foco?</span><strong className={r.lossPeak ? 'neg' : ''}>{r.lossPeak ? `${r.lossPeak.from} a ${r.lossPeak.to} h` : '—'}</strong><small>{r.lossPeak ? `${r.lossPeak.count} intento${r.lossPeak.count === 1 ? '' : 's'} · ${num(r.lossPeak.rate)} por hora trabajada` : noFocusData}</small></div>
        <div><span>¿Con qué?</span><strong className={top ? 'neg' : ''}>{top ? top.site : '—'}</strong><small>{top ? `${top.n} de ${r.dist.total} intento${r.dist.total === 1 ? '' : 's'}${r.dist.bySite[1] ? ` · ${r.dist.bySite.slice(1, 3).map((x) => `${x.site} ${x.n}`).join(' · ')}` : ''}` : r.lossPeak ? '' : 'Ningún sitio todavía'}</small></div>
      </div>
      {r.work.total === 0 && r.dist.total === 0 ? <p className="empty-list">No hay tareas con hora de inicio en este período.</p> : (
        <div className="rhythm-scroll">
          <div className="rhythm-grid" role="img" aria-label="Tiempo trabajado e intentos de distraerte por día de la semana y hora">
            {r.work.grid.map((row, d) => (
              <div className="rhythm-row" key={d}>
                <span className="rlabel">{ROWS[d]}</span>
                {row.map((v, h) => {
                  const n = r.distGrid[d][h]
                  return <i key={h} className={`lv${level(v)}`} title={`${cap(WEEKDAY_NAMES[d])} ${h}:00 a ${h + 1}:00 · ${v > 0 ? fmtHours(v) : 'sin trabajo'}${n ? ` · ${n} intento${n === 1 ? '' : 's'} de distraerte` : ''}`}>{n > 0 && <b className="ddot" style={{ transform: `scale(${0.6 + 0.4 * (n / dMax)})` }} />}</i>
                })}
                <span className={`rday ${best?.day === d ? 'is-best' : ''}`} title={`${cap(WEEKDAY_NAMES[d])}: ${fmtHours(r.byDay[d].avg)} promedio · ${fmtHours(r.byDay[d].seconds)} en total`}><em style={{ width: `${dayMax ? (r.byDay[d].avg / dayMax) * 100 : 0}%` }} /><small>{r.byDay[d].avg > 0 ? fmtHours(r.byDay[d].avg) : ''}</small></span>
              </div>
            ))}
            <div className="rhythm-row rbars"><span className="rlabel" title="Tiempo trabajado por hora">Σ</span>{r.work.byHour.map((v, h) => <b key={h} title={`${h}:00 · ${fmtHours(v)}`}><em className={r.work.best && h >= r.work.best.from && h < r.work.best.to ? 'best' : ''} style={{ height: `${hMax ? (v / hMax) * 100 : 0}%` }} /></b>)}<span className="rday rhead">promedio por día</span></div>
            {r.dist.total > 0 && <div className="rhythm-row rbars rbars-dist"><span className="rlabel" title="Intentos de distraerte por hora">!</span>{r.dist.byHour.map((v, h) => <b key={h} title={`${h}:00 · ${v} intento${v === 1 ? '' : 's'}`}><em className="bad" style={{ height: `${xMax ? (v / xMax) * 100 : 0}%` }} /></b>)}<span className="rday" /></div>}
            <div className="rhythm-row raxis"><span className="rlabel" />{r.work.byHour.map((_, h) => <small key={h}>{h % 3 === 0 ? h : ''}</small>)}<span className="rday" /></div>
          </div>
        </div>
      )}
      <p className="group-note">{r.taskCount} tarea{r.taskCount === 1 ? '' : 's'} · sesión promedio {fmtHours(r.avgSession)}{r.dist.total > 0 ? ` · ${num(r.focusRate)} intentos de distraerte por hora trabajada` : ''}. Los días se comparan por promedio (cada lunes, cada martes…), no por total. La pérdida de foco se mide por hora trabajada: a la hora en que más trabajás también vas a tener más intentos.</p>
    </article>
  )
}

type ExportProps = { report: () => ReportInput; tasks: Task[]; payments: Payment[]; clientName: (p: Payment) => string; distractions: Distraction[]; name: string }

/** Exportar el período: informe (para leer, imprimir o pasarle a una IA) y los datos crudos en planillas. */
function StatsExport({ report, tasks, payments, clientName, distractions, name }: ExportProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  const md = () => reportMarkdown(report())
  const done = () => setOpen(false)
  async function copy() {
    try { await navigator.clipboard.writeText(md()); setCopied(true); window.setTimeout(() => { setCopied(false); done() }, 1200) } catch { download(`${name}.md`, md(), 'text/markdown;charset=utf-8'); done() }
  }
  function print() {
    const r = report()
    const w = window.open('', '_blank')
    if (!w) return download(`${name}.html`, reportHtml(reportMarkdown(r), r.title), 'text/html;charset=utf-8')
    w.document.write(reportHtml(reportMarkdown(r), r.title))
    w.document.close()
    w.focus()
    window.setTimeout(() => w.print(), 300)
    done()
  }
  return (
    <div className="export-wrap" ref={box}>
      <button className="ghost-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Download /> Exportar</button>
      {open && (
        <div className="export-pop" role="menu">
          <p className="picker-group">Informe del período y filtros elegidos</p>
          <button role="menuitem" onClick={print}><Printer /><span><b>Imprimir o guardar PDF</b><small>Resumen, comparación, plataformas y tu ritmo</small></span></button>
          <button role="menuitem" onClick={() => { download(`${name}.md`, md(), 'text/markdown;charset=utf-8'); done() }}><FileText /><span><b>Informe (.md)</b><small>El mismo informe en texto</small></span></button>
          <button role="menuitem" onClick={copy}>{copied ? <Check /> : <ClipboardCopy />}<span><b>{copied ? 'Copiado' : 'Copiar para una IA'}</b><small>Para pedirle que analice tus métricas</small></span></button>
          <p className="picker-group">Datos para una planilla</p>
          <button role="menuitem" disabled={!tasks.length} onClick={() => { download(`${name}-tareas.csv`, tasksToCsv(tasks), 'text/csv;charset=utf-8'); done() }}><FileSpreadsheet /><span><b>Tareas (.csv)</b><small>{tasks.length} del período, con notas</small></span></button>
          <button role="menuitem" disabled={!payments.length} onClick={() => { download(`${name}-pagos.csv`, paymentsToCsv(payments, clientName), 'text/csv;charset=utf-8'); done() }}><FileSpreadsheet /><span><b>Pagos (.csv)</b><small>{payments.length} del período</small></span></button>
          <button role="menuitem" disabled={!distractions.length} onClick={() => { download(`${name}-distracciones.csv`, distractionsToCsv(distractions), 'text/csv;charset=utf-8'); done() }}><FileSpreadsheet /><span><b>Distracciones (.csv)</b><small>{distractions.length} intento{distractions.length === 1 ? '' : 's'} del período</small></span></button>
        </div>
      )}
    </div>
  )
}

export function StatsView({ distractions, extVersion, tasks, payments, projects, clients, goal, setGoal, today }: Props) {
  const [period, setPeriod] = useState<Period>('semana')
  const [offset, setOffset] = useState(0)
  const [groupBy, setGroupBy] = useState<GroupBy>('cliente')
  const [clientFilter, setClientFilter] = useState<string[]>([])
  const [billableOnly, setBillableOnly] = useState(false)
  const [money, setMoney] = useState(false)

  const all = useMemo(() => buildEntries(tasks, payments, projects, clients), [tasks, payments, projects, clients])
  const clientNames = useMemo(() => [...new Set([...clients.map((c) => c.name), ...all.map((t) => t.client)])].sort(), [clients, all])
  const clientColors = useMemo(() => new Map(clients.map((c) => [c.name, c.color])), [clients])
  const filtered = useMemo(() => all.filter((t) => (!clientFilter.length || clientFilter.includes(t.client)) && (!billableOnly || t.billable)), [all, clientFilter, billableOnly])
  const s = useMemo(() => computeStats(filtered, period, offset, today), [filtered, period, offset, today])
  // Lo que de verdad te pagaron en el período (por horas, cobros y bonus), a diferencia de lo ganado, que es estimado.
  const collected = useMemo(() => {
    const from = dateKey(s.range.from)
    const to = dateKey(s.range.to)
    const nameOf = (p: Payment) => clients.find((c) => c.id === paymentClientId(p, projects))?.name ?? ''
    const list = payments.filter((p) => p.paid && p.date >= from && p.date <= to && (!clientFilter.length || clientFilter.includes(nameOf(p))))
    return { gross: list.reduce((a, p) => a + p.amount, 0), fees: list.reduce((a, p) => a + (p.fee ?? 0), 0), count: list.length }
  }, [payments, projects, clients, s.range, clientFilter])
  const prev = useMemo(() => previousStats(filtered, period, offset, today), [filtered, period, offset, today])
  const from = dateKey(s.range.from), to = dateKey(s.range.to)
  // Tareas y pagos del período con los mismos filtros: alimentan el ritmo y las exportaciones.
  const clientOfPayment = (p: Payment) => clients.find((c) => c.id === paymentClientId(p, projects))?.name ?? ''
  const periodTasks = useMemo(() => {
    const projectById = new Map(projects.map((p) => [p.id, p]))
    const clientName = (t: Task) => { const p = t.projectId ? projectById.get(t.projectId) : undefined; return p ? clients.find((c) => c.id === p.clientId)?.name ?? t.client : t.client }
    return tasks.filter((t) => t.date >= from && t.date <= to && (!billableOnly || t.billable) && (!clientFilter.length || clientFilter.includes(clientName(t))))
  }, [tasks, projects, clients, from, to, clientFilter, billableOnly])
  const periodPayments = payments.filter((p) => p.date >= from && p.date <= to && (!clientFilter.length || clientFilter.includes(clientOfPayment(p))))
  const periodDistractions = useMemo(() => distractions.filter((d) => { const k = dateKey(new Date(d.t)); return k >= from && k <= to }), [distractions, from, to])
  const r = useMemo(() => rhythm(periodTasks, distractions, from, to, today), [periodTasks, distractions, from, to, today])
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
        <div><h2>Estadísticas</h2><p className="view-sub">Cuánto trabajaste y ganaste, cuánto vale de verdad tu hora y en qué momentos rendís más o perdés el foco. <b>Estimado</b> = horas × tarifa + bonus; <b>Cobrado</b> = lo que te pagaron de verdad.</p></div>
        <div className="heading-actions">
          <StatsExport name={`tasker-crm-${slug(s.range.label)}`} tasks={periodTasks} payments={periodPayments} clientName={clientOfPayment} distractions={periodDistractions} report={() => ({
            title: `Informe Tasker CRM · ${s.range.label}`, periodLabel: `${s.range.label} (${from} al ${to})`, platforms: clientFilter, billableOnly,
            seconds: s.seconds, billableSeconds: s.billableSeconds, amount: s.amount, collected: collected.gross, collectedCount: collected.count, fees: collected.fees,
            effectiveRate: s.effectiveRate, perHour: s.perHour, workedDays: s.workedDays, prev,
            groupLabel: GROUPS.find((g) => g.id === groupBy)!.label, groups: groups.map((g) => ({ name: g.name, seconds: g.seconds, amount: g.amount, perHour: g.valueSeconds > 0 ? g.imputed / (g.valueSeconds / 3600) : 0 })), rhythm: r,
          })} />
        </div>
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
          <MultiFilter options={clientNames.map((n) => ({ id: n, label: n }))} value={clientFilter} onChange={setClientFilter} allLabel="Todas las plataformas" noun="plataformas" />
          <button className={`chip ${billableOnly ? 'chip-on' : ''}`} onClick={() => setBillableOnly((b) => !b)} aria-pressed={billableOnly}>Sólo facturable</button>
        </div>
      </div>

      {(() => {
        const unpaid = s.seconds - s.billableSeconds
        const diff = collected.gross - s.amount
        const gap = s.perHour > 0 && s.effectiveRate > 0 ? Math.round((1 - s.effectiveRate / s.perHour) * 100) : 0
        const delta = (now: number, before: number | undefined) => {
          const c = prev && before !== undefined ? change(now, before) : null
          return c === null ? null : <small className="delta"><b className={c >= 0 ? 'pos' : 'neg'}>{c >= 0 ? '▲' : '▼'} {Math.abs(c)}%</b> vs. {prev!.label}</small>
        }
        return (
          <div className="summary-grid">
            <div className="summary-card" title="Todo el tiempo registrado. “Sin pago” es lo que no se factura: leer la documentación, hacer pruebas, assessments, esperas, onboarding no pago y lo personal.">
              <span><Clock3 /> Tiempo trabajado</span>
              <strong>{fmtHours(s.seconds)}</strong>
              {s.seconds > 0 && <div className="split-bar" aria-hidden="true"><i style={{ width: `${s.billablePct}%` }} /></div>}
              <small>{s.seconds > 0 ? <><b>{fmtHours(s.billableSeconds)}</b> pagas · <b>{fmtHours(unpaid)}</b> sin pago (documentación, pruebas, assessments) · {s.workedDays} día{s.workedDays === 1 ? '' : 's'} · {r.taskCount} tarea{r.taskCount === 1 ? '' : 's'} de {fmtHours(r.avgSession)} en promedio</> : 'Sin tiempo registrado en este período'}</small>
              {delta(s.seconds, prev?.seconds)}
            </div>
            <div className="summary-card" title="Estimado = horas × tarifa + bonus. Cobrado = lo que te llegó de verdad (pestaña Pagos). Los pagos llegan con atraso: para comparar, mirá el mes o el trimestre.">
              <span><Landmark /> Cobrado vs. estimado</span>
              <strong>US$ {fmtMoney(collected.gross)} <em className="vs">/ {fmtMoney(s.amount)}</em></strong>
              <small>{collected.count === 0
                ? (s.amount > 0 ? 'Todavía no cargaste pagos de este período: cargalos en Pagos para ver si te pagaron lo que trabajaste' : 'Sin ingresos en este período')
                : <>{s.amount > 0 ? <><b className={diff < -0.005 ? 'neg' : 'pos'}>{diff >= 0 ? '+' : '−'}US$ {fmtMoney(Math.abs(diff))} ({Math.round((collected.gross / s.amount) * 100)}%)</b> vs. lo estimado</> : 'sin estimado para comparar'}{collected.fees > 0 ? ` · comisiones US$ ${fmtMoney(collected.fees)}` : ''}</>}</small>
              {delta(s.amount, prev?.amount)}
            </div>
            <div className="summary-card" title="Lo ganado en plataformas ÷ TODAS las horas en ellas, incluido lo que no te pagan. Es lo que de verdad vale tu hora.">
              <span><Timer /> Valor real de tu hora</span>
              <strong>{s.effectiveRate > 0 ? `US$ ${fmtMoney(s.effectiveRate)}/h` : '—'}</strong>
              <small>{s.perHour > 0 ? <>La plataforma paga <b>US$ {fmtMoney(s.perHour)}/h</b>{gap > 0 ? <> · el tiempo sin pago te la baja un <b className="neg">{gap}%</b></> : ' · no hay tiempo sin pago'}</> : 'Todavía sin horas pagas en este período'}</small>
              {delta(s.effectiveRate, prev?.effectiveRate)}
            </div>
          </div>
        )
      })()}

      <BarChart money={money} setMoney={setMoney} bins={s.bins} byMonth={s.byMonth} lineGoal={money ? lineGoal : 0} binTargets={money ? binTargets : []} />

      <RhythmPanel r={r} extVersion={extVersion} />

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
