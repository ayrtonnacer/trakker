'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock3, Coins, DollarSign, Gauge, ListChecks } from 'lucide-react'
import { DAILY_GOAL_HOURS, fmtHours, fmtMoney, type Client, type Task } from '@/lib/game'
import { PERIODS, computeStats, groupTasks, type GroupBy, type Period } from '@/lib/stats'

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'cliente', label: 'Cliente' },
  { id: 'proyecto', label: 'Proyecto' },
  { id: 'etiqueta', label: 'Etiqueta' },
  { id: 'tarea', label: 'Tarea' },
]

export function StatsView({ tasks, clients, today }: { tasks: Task[]; clients: Client[]; today: string }) {
  const [period, setPeriod] = useState<Period>('semana')
  const [offset, setOffset] = useState(0)
  const [groupBy, setGroupBy] = useState<GroupBy>('proyecto')
  const [clientFilter, setClientFilter] = useState('')
  const [billableOnly, setBillableOnly] = useState(false)

  const clientNames = useMemo(() => [...new Set([...clients.map((c) => c.name), ...tasks.map((t) => t.client)])].sort(), [clients, tasks])
  const clientColors = useMemo(() => new Map(clients.map((c) => [c.name, c.color])), [clients])
  const filtered = useMemo(() => tasks.filter((t) => (!clientFilter || t.client === clientFilter) && (!billableOnly || t.billable)), [tasks, clientFilter, billableOnly])
  const s = useMemo(() => computeStats(filtered, period, offset, today), [filtered, period, offset, today])
  const groups = useMemo(() => groupTasks(s.tasks, groupBy, clientColors), [s.tasks, groupBy, clientColors])

  const maxBin = Math.max(...s.bins.map((b) => b.seconds), 0) / 3600
  const daily = !s.byMonth
  const yMax = Math.max(2, Math.ceil(Math.max(maxBin, daily ? DAILY_GOAL_HOURS + 1 : 0) / 2) * 2)
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(yMax * f * 10) / 10)
  const labelEvery = s.bins.length > 16 ? Math.ceil(s.bins.length / 10) : 1

  let acc = 0
  const donut = groups.length
    ? `conic-gradient(${groups.slice(0, 8).map((g) => { const from = acc; acc += g.pct; return `${g.color} ${from}% ${acc}%` }).join(', ')}${acc < 100 ? `, #3a4655 ${acc}% 100%` : ''})`
    : 'conic-gradient(#25303c 0 100%)'

  return (
    <section className="view">
      <div className="view-heading">
        <div><p className="eyebrow">REPORTES</p><h2>Estadísticas</h2></div>
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
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Filtrar por cliente"><option value="">Todos los clientes</option>{clientNames.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <button className={`chip ${billableOnly ? 'chip-on' : ''}`} onClick={() => setBillableOnly((b) => !b)} aria-pressed={billableOnly}><DollarSign /> Sólo facturable</button>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card"><span><Clock3 /> Horas totales</span><strong>{fmtHours(s.seconds)}</strong><small>{s.workedDays} día{s.workedDays === 1 ? '' : 's'} con trabajo</small></div>
        <div className="summary-card"><span><DollarSign /> Horas facturables</span><strong>{fmtHours(s.billableSeconds)}</strong><small>{s.billablePct}% del total</small></div>
        <div className="summary-card summary-gold"><span><Coins /> Ganado</span><strong>US$ {fmtMoney(s.amount)}</strong><small>{s.billableSeconds ? `US$ ${fmtMoney(s.amount / (s.billableSeconds / 3600))} por hora facturable` : 'Sin horas facturables'}</small></div>
        <div className="summary-card"><span><Gauge /> Promedio diario</span><strong>{fmtHours(s.avgDaily)}</strong><small>Meta {DAILY_GOAL_HOURS}h</small></div>
        <div className="summary-card"><span><ListChecks /> Tareas</span><strong>{s.count}</strong><small>+{s.xp.toLocaleString('es-AR')} XP</small></div>
      </div>

      <div className="stats-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">DURACIÓN</p><h2>{s.byMonth ? 'Horas por mes' : 'Horas por día'}</h2></div></div>
          {s.seconds === 0 ? <p className="empty-list">No hay tareas en este período.</p> : (
            <div className="schart">
              <div className="schart-y">{ticks.map((t) => <span key={t}>{t}h</span>)}</div>
              <div className="schart-main">
                <div className="schart-area">
                  {daily && <div className="schart-goal" style={{ bottom: `${(DAILY_GOAL_HOURS / yMax) * 100}%` }}><span>Meta {DAILY_GOAL_HOURS}h</span></div>}
                  {s.bins.map((b, i) => (
                    <div className="schart-col" key={i} title={`${b.title}: ${fmtHours(b.seconds)} · US$ ${fmtMoney(b.amount)}`}>
                      <div className={`schart-bar ${daily && b.seconds / 3600 >= DAILY_GOAL_HOURS ? 'bar-hit' : ''} ${b.isCurrent ? 'bar-current' : ''}`} style={{ height: `${Math.min(100, (b.seconds / 3600 / yMax) * 100)}%` }}>
                        {b.seconds > 0 && s.bins.length <= 16 && <em>{(b.seconds / 3600).toFixed(1)}</em>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="schart-x">{s.bins.map((b, i) => <span key={i}>{i % labelEvery === 0 ? b.label : ''}</span>)}</div>
              </div>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">DISTRIBUCIÓN</p><h2>Por {GROUPS.find((g) => g.id === groupBy)!.label.toLowerCase()}</h2></div>
            <select className="group-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Agrupar por">{GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</select>
          </div>
          {groups.length === 0 ? <p className="empty-list">No hay datos para mostrar.</p> : (
            <div className="distribution">
              <div className="donut" style={{ background: donut }}><div><strong>{fmtHours(s.seconds)}</strong><span>US$ {fmtMoney(s.amount)}</span></div></div>
              <ul className="group-list">
                {groups.slice(0, 8).map((g) => (
                  <li key={g.key}>
                    <div className="group-top"><i className="dot" style={{ background: g.color }} /><strong>{g.name}</strong><span>{fmtHours(g.seconds)}</span><em>{g.amount > 0 ? `US$ ${fmtMoney(g.amount)}` : '—'}</em></div>
                    <div className="group-bar"><div style={{ width: `${g.pct}%`, background: g.color }} /></div>
                    <small>{g.pct}% · {g.count} tarea{g.count === 1 ? '' : 's'}{g.billableSeconds < g.seconds ? ` · ${fmtHours(g.seconds - g.billableSeconds)} no facturable` : ''}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
