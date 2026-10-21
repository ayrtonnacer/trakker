'use client'

import { useMemo, useState } from 'react'
import { Carrot, Check, ChevronLeft, ChevronRight, Play, Plus, X } from 'lucide-react'
import {
  addMonths,
  dateKey,
  fmtHours,
  fmtShort,
  goalTarget,
  milestonesFor,
  monthEarnings,
  monthKey,
  parseAmount,
  suggestedBaseline,
  uid,
  type Client,
  type Goal,
  type Payment,
  type PlanItem,
  type Project,
  type Task,
} from '@/lib/game'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

type Props = {
  goal: Goal | null
  setGoal: (g: Goal | null) => void
  plan: PlanItem[]
  setPlan: (fn: (p: PlanItem[]) => PlanItem[]) => void
  tasks: Task[]
  payments: Payment[]
  projects: Project[]
  clients: Client[]
  today: string
  onStart: (item: PlanItem) => void
}

type GoalDraft = { baseline: string; pct: string; months: string; start: string; milestones: string; custom: boolean }

function monthLabel(m: string) {
  const [y, mm] = m.split('-').map(Number)
  return `${MONTHS[mm - 1]} ${y}`
}

export function GoalsView({ goal, setGoal, plan, setPlan, tasks, payments, projects, clients, today, onStart }: Props) {
  const thisMonth = today.slice(0, 7)
  const [draft, setDraft] = useState<GoalDraft | null>(null)
  const [action, setAction] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [adding, setAdding] = useState<{ date: string; text: string; projectId: string; hours: string } | null>(null)
  const [backlogText, setBacklogText] = useState('')
  const [backlogProject, setBacklogProject] = useState('')

  const suggested = useMemo(() => suggestedBaseline(thisMonth, tasks, payments), [thisMonth, tasks, payments])

  function openDraft() {
    setDraft(goal
      ? { baseline: String(goal.baseline), pct: String(goal.pct), months: String(goal.months), start: goal.start, milestones: goal.milestones.join(', '), custom: goal.milestones.length > 0 }
      : { baseline: suggested ? String(suggested) : '', pct: '20', months: '3', start: thisMonth, milestones: '', custom: false })
  }

  function saveDraft() {
    if (!draft) return
    const baseline = parseAmount(draft.baseline)
    if (baseline <= 0) return
    setGoal({
      baseline,
      pct: Math.max(1, Number(draft.pct) || 0),
      months: Math.max(1, Math.round(Number(draft.months) || 1)),
      start: draft.start || thisMonth,
      milestones: !draft.custom ? [] : draft.milestones.split(/[,;\s]+/).map(parseAmount).filter((n) => n > 0),
      actions: goal?.actions ?? [],
    })
    setDraft(null)
  }

  function addAction() {
    const text = action.trim()
    if (!text || !goal) return
    setGoal({ ...goal, actions: [...goal.actions, { id: uid(), text, done: false }] })
    setAction('')
  }

  // ---- semana ----
  const base = new Date(`${today}T12:00:00`)
  const monday = new Date(base)
  monday.setDate(base.getDate() - ((base.getDay() + 6) % 7) + weekOffset * 7)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { key: dateKey(d), label: WEEKDAYS[i], day: d.getDate(), month: MONTHS[d.getMonth()] }
  })
  const weekKeys = new Set(week.map((w) => w.key))
  const weekItems = plan.filter((p) => weekKeys.has(p.date))
  const weekTasks = tasks.filter((t) => weekKeys.has(t.date))

  // Horas planificadas vs. reales por proyecto.
  const perProject = useMemo(() => {
    const map = new Map<string, { name: string; color: string; planned: number; actual: number }>()
    const key = (id: string | null) => id ?? '—'
    const info = (id: string | null) => {
      const p = projects.find((x) => x.id === id)
      return { name: p?.name ?? 'Sin proyecto', color: p?.color ?? 'var(--muted)' }
    }
    weekItems.forEach((i) => { const k = key(i.projectId); const g = map.get(k) ?? { ...info(i.projectId), planned: 0, actual: 0 }; g.planned += i.hours; map.set(k, g) })
    weekTasks.forEach((t) => { const k = key(t.projectId); const g = map.get(k) ?? { ...info(t.projectId), planned: 0, actual: 0 }; g.actual += t.seconds / 3600; map.set(k, g) })
    return [...map.values()].sort((a, b) => b.planned - a.planned || b.actual - a.actual)
  }, [weekItems, weekTasks, projects])

  function addItem() {
    if (!adding || !adding.text.trim()) return
    setPlan((cur) => [...cur, { id: uid(), date: adding.date, text: adding.text.trim(), projectId: adding.projectId || null, hours: Math.max(0, Number(adding.hours.replace(',', '.')) || 0), done: false }])
    setAdding({ ...adding, text: '', hours: '' })
  }

  // ---- backlog: pendientes sin día asignado ----
  const backlog = plan.filter((p) => !p.date)

  function addBacklog() {
    const text = backlogText.trim()
    if (!text) return
    setPlan((cur) => [...cur, { id: uid(), date: '', text, projectId: backlogProject || null, hours: 0, done: false }])
    setBacklogText('')
  }

  // ---- meta ----
  const months = goal ? Array.from({ length: goal.months + 1 }, (_, i) => addMonths(goal.start, i - 1)) : []
  const finalTarget = goal ? Math.round(goal.baseline * (1 + goal.pct / 100)) : 0
  const target = goalTarget(goal, thisMonth)
  const earned = monthEarnings(thisMonth, tasks, payments)
  const steps = milestonesFor(goal, target)
  const previewTarget = draft ? Math.round(parseAmount(draft.baseline) * (1 + ((Number(draft.pct) || 0) / 100) / Math.max(1, Math.round(Number(draft.months) || 1)))) : 0
  const maxMonth = Math.max(finalTarget, ...months.map((m) => monthEarnings(m, tasks, payments)), 1)

  return (
    <section className="view">
      <div className="view-heading">
        <div><h2>Metas</h2><p className="view-sub">Ponete un objetivo de ingresos, anotá qué acciones te acercan y planificá la semana. La meta aparece en Inicio y en Estadísticas.</p></div>
      </div>

      <div className="goals-grid">
        <article className="panel">
          <div className="panel-heading"><h3>Meta de ingresos</h3>{goal && <button className="text-button" onClick={openDraft}>Editar</button>}</div>
          {!goal ? (
            <div className="goal-empty">
              <p>Ej.: “Aumentar mis ingresos un 20% en 3 meses”. Tomamos como base tu promedio mensual{suggested ? ` (US$ ${fmtShort(suggested)} en los últimos meses)` : ''} y te armamos un objetivo para cada mes.</p>
              <button className="primary-button" onClick={openDraft}><Plus /> Definir meta</button>
            </div>
          ) : (
            <>
              <p className="goal-sentence">Pasar de <b>US$ {fmtShort(goal.baseline)}</b> a <b>US$ {fmtShort(finalTarget)}</b> por mes (+{goal.pct}%) para {monthLabel(addMonths(goal.start, goal.months - 1))}.</p>
              {target > 0 && (
                <div className="goal-now">
                  <div className="goal-now-top"><span>Este mes</span><strong>US$ {fmtShort(Math.round(earned))} <small>/ {fmtShort(target)}</small></strong></div>
                  <div className="thin-track big"><div style={{ width: `${Math.min(100, (earned / target) * 100)}%` }} />{steps.map((m) => <i key={m} className={`track-mark ${earned >= m ? 'done' : ''}`} style={{ left: `${(m / target) * 100}%` }} />)}</div>
                  <div className="goal-steps">{steps.map((m) => <span key={m} className={earned >= m ? 'done' : ''}>{earned >= m ? <Check /> : <Carrot />} {fmtShort(m)}</span>)}</div>
                </div>
              )}
              <div className="month-bars">
                {months.map((m, i) => {
                  const actual = monthEarnings(m, tasks, payments)
                  const t = i === 0 ? goal.baseline : goalTarget(goal, m)
                  return (
                    <div key={m} className={`month-bar ${m === thisMonth ? 'is-current' : ''}`} title={`${monthLabel(m)}: US$ ${fmtShort(Math.round(actual))}${i === 0 ? ' (mes anterior al plan)' : ` · objetivo ${fmtShort(t)}`}`}>
                      <div className="month-bar-area">
                        <i className="month-target" style={{ bottom: `${(t / maxMonth) * 100}%` }} />
                        <div className={`month-fill ${actual >= t && i > 0 ? 'hit' : ''}`} style={{ height: `${(actual / maxMonth) * 100}%` }} />
                      </div>
                      <span>{monthLabel(m)}</span>
                      <small>{i === 0 ? 'base' : `${fmtShort(t)}`}</small>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading"><h3>Acciones para llegar</h3>{goal && <span className="muted">{goal.actions.filter((a) => a.done).length}/{goal.actions.length}</span>}</div>
          {!goal ? <p className="empty-list">Primero definí la meta.</p> : (
            <>
              <ul className="check-list">
                {goal.actions.map((a) => (
                  <li key={a.id} className={a.done ? 'done' : ''}>
                    <button className={`pay-check ${a.done ? 'on' : ''}`} onClick={() => setGoal({ ...goal, actions: goal.actions.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)) })} aria-label={a.done ? 'Marcar pendiente' : 'Marcar hecha'}>{a.done && <Check />}</button>
                    <span>{a.text}</span>
                    <button className="icon-button danger" onClick={() => setGoal({ ...goal, actions: goal.actions.filter((x) => x.id !== a.id) })} aria-label="Quitar"><X /></button>
                  </li>
                ))}
              </ul>
              <div className="inline-add"><input value={action} onChange={(e) => setAction(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addAction()} placeholder="Ej. Mandar 5 propuestas por semana" /><button className="ghost-button" onClick={addAction} disabled={!action.trim()}><Plus /></button></div>
              {goal.actions.length === 0 && <p className="field-help">Ideas: subir la tarifa a clientes nuevos, mandar propuestas, mejorar el portfolio, pedir referidos, sumar horas en la plataforma mejor paga.</p>}
            </>
          )}
        </article>
      </div>

      <article className="panel backlog-panel">
        <div className="panel-heading"><h3>Backlog</h3><span className="muted">{backlog.length} pendiente{backlog.length === 1 ? '' : 's'}</span></div>
        <div className="inline-add">
          <input value={backlogText} onChange={(e) => setBacklogText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addBacklog()} placeholder="Ej. Actualizar mi perfil de LinkedIn" aria-label="Nueva tarea para el backlog" />
          <select value={backlogProject} onChange={(e) => setBacklogProject(e.target.value)} aria-label="Proyecto"><option value="">Sin proyecto</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.clientId ? ` · ${clients.find((c) => c.id === p.clientId)?.name ?? ''}` : ''}</option>)}</select>
          <button className="ghost-button" onClick={addBacklog} disabled={!backlogText.trim()} aria-label="Agregar al backlog"><Plus /></button>
        </div>
        {backlog.length === 0 ? <p className="empty-list">Anotá acá lo que tenés que hacer, sin fecha ni tiempo. Después lo pasás a un día o lo arrancás con el timer.</p> : (
          <ul className="check-list">
            {backlog.map((i) => {
              const p = projects.find((x) => x.id === i.projectId)
              return (
                <li key={i.id}>
                  <span>{i.text}{p && <small> · {p.name}</small>}</span>
                  <select className="move-select" value="" onChange={(e) => e.target.value && setPlan((cur) => cur.map((x) => (x.id === i.id ? { ...x, date: e.target.value } : x)))} aria-label="Pasar a un día">
                    <option value="">Pasar a…</option>
                    {week.map((d) => <option key={d.key} value={d.key}>{d.key === today ? 'Hoy' : `${d.label} ${d.day}`}</option>)}
                  </select>
                  <button className="icon-button" onClick={() => onStart(i)} aria-label="Empezar timer" title="Empezar timer"><Play /></button>
                  <button className="icon-button danger" onClick={() => setPlan((cur) => cur.filter((x) => x.id !== i.id))} aria-label="Quitar"><X /></button>
                </li>
              )
            })}
          </ul>
        )}
      </article>

      <article className="panel plan-panel">
        <div className="panel-heading">
          <h3>Plan semanal</h3>
          <div className="range-nav">
            <button onClick={() => setWeekOffset((o) => o - 1)} aria-label="Semana anterior"><ChevronLeft /></button>
            <strong>{weekOffset === 0 ? 'Esta semana' : weekOffset === 1 ? 'Semana que viene' : weekOffset === -1 ? 'Semana pasada' : `${week[0].day} ${week[0].month} – ${week[6].day} ${week[6].month}`}</strong>
            <button onClick={() => setWeekOffset((o) => o + 1)} aria-label="Semana siguiente"><ChevronRight /></button>
          </div>
        </div>
        <div className="week-plan">
          {week.map((d) => {
            const items = plan.filter((p) => p.date === d.key)
            const worked = weekTasks.filter((t) => t.date === d.key).reduce((s, t) => s + t.seconds, 0)
            return (
              <div key={d.key} className={`plan-day ${d.key === today ? 'is-today' : ''}`}>
                <div className="plan-day-head"><strong>{d.label}</strong><span>{d.day} {d.month}</span></div>
                {worked > 0 && <small className="plan-worked">Trabajado {fmtHours(worked)}</small>}
                <ul>
                  {items.map((i) => {
                    const p = projects.find((x) => x.id === i.projectId)
                    return (
                      <li key={i.id} className={i.done ? 'done' : ''}>
                        <button className={`pay-check ${i.done ? 'on' : ''}`} onClick={() => setPlan((cur) => cur.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))} aria-label={i.done ? 'Marcar pendiente' : 'Marcar hecha'}>{i.done && <Check />}</button>
                        <div><span>{i.text}</span>{(p || i.hours > 0) && <small>{p && <><i className="dot" style={{ background: p.color }} /> {p.name}</>}{i.hours > 0 && ` · ${i.hours}h`}</small>}</div>
                        <div className="plan-actions">
                          <button className="icon-button" onClick={() => onStart(i)} aria-label="Empezar timer" title="Empezar timer"><Play /></button>
                          <button className="icon-button danger" onClick={() => setPlan((cur) => cur.filter((x) => x.id !== i.id))} aria-label="Quitar"><X /></button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {adding?.date === d.key ? (
                  <div className="plan-add">
                    <input autoFocus value={adding.text} onChange={(e) => setAdding({ ...adding, text: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); if (e.key === 'Escape') setAdding(null) }} placeholder="¿Qué vas a hacer?" />
                    <select value={adding.projectId} onChange={(e) => setAdding({ ...adding, projectId: e.target.value })} aria-label="Proyecto"><option value="">Sin proyecto</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.clientId ? ` · ${clients.find((c) => c.id === p.clientId)?.name ?? ''}` : ''}</option>)}</select>
                    <div className="plan-add-row"><input value={adding.hours} onChange={(e) => setAdding({ ...adding, hours: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addItem()} placeholder="Horas" inputMode="decimal" aria-label="Horas estimadas" /><button className="primary-button" onClick={addItem}>Agregar</button><button className="icon-button" onClick={() => setAdding(null)} aria-label="Cerrar"><X /></button></div>
                  </div>
                ) : <button className="plan-new" onClick={() => setAdding({ date: d.key, text: '', projectId: '', hours: '' })}><Plus /> Agregar</button>}
              </div>
            )
          })}
        </div>
        {perProject.length > 0 && (
          <div className="plan-summary">
            <h4>Planificado vs. trabajado</h4>
            {perProject.map((g) => (
              <div key={g.name} className="plan-sum-row">
                <span><i className="dot" style={{ background: g.color }} /> {g.name}</span>
                {g.planned > 0 ? <div className="thin-track"><div style={{ width: `${Math.min(100, (g.actual / g.planned) * 100)}%` }} /></div> : <span className="muted">sin planificar</span>}
                <small>{fmtHours(g.actual * 3600)}{g.planned > 0 && ` / ${g.planned}h`}</small>
              </div>
            ))}
          </div>
        )}
      </article>

      {draft && (
        <div className="modal-backdrop" onClick={() => setDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDraft(null)} aria-label="Cerrar"><X /></button>
            <h2>Meta de ingresos</h2>
            <p>Quiero aumentar mis ingresos un <b>{draft.pct || 0}%</b> en <b>{draft.months || 1}</b> mes{draft.months === '1' ? '' : 'es'}.</p>
            <div className="form-grid">
              <label>Ingreso mensual actual (base)<span className="rate-input"><span>US$</span><input autoFocus inputMode="decimal" value={draft.baseline} onChange={(e) => setDraft({ ...draft, baseline: e.target.value })} placeholder="1000" /><span>/mes</span></span>
                {suggested > 0 && <small className="field-help">Tu promedio de los últimos 3 meses es US$ {fmtShort(suggested)}. <button type="button" className="text-button" onClick={() => setDraft({ ...draft, baseline: String(suggested) })}>Usar</button></small>}
              </label>
              <div className="modal-fields three">
                <label>Aumento %<input inputMode="decimal" value={draft.pct} onChange={(e) => setDraft({ ...draft, pct: e.target.value })} /></label>
                <label>En meses<input inputMode="numeric" value={draft.months} onChange={(e) => setDraft({ ...draft, months: e.target.value })} /></label>
                <label>Desde<input type="month" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></label>
              </div>
              <div className="field">
                <span>Micro objetivos de cada mes</span>
                {!draft.custom ? (
                  <small className="field-help">Ya vienen puestos: 25%, 50% y 75% de la meta de cada mes{previewTarget > 0 ? <> (el primer mes: <b>US$ {fmtShort(Math.round(previewTarget * 0.25))}, {fmtShort(Math.round(previewTarget * 0.5))} y {fmtShort(Math.round(previewTarget * 0.75))}</b>)</> : ''}. <button type="button" className="text-button" onClick={() => setDraft({ ...draft, custom: true })}>Personalizar</button></small>
                ) : (
                  <>
                    <input value={draft.milestones} onChange={(e) => setDraft({ ...draft, milestones: e.target.value })} placeholder="Ej. 300, 600, 900" />
                    <small className="field-help">Separados por coma. <button type="button" className="text-button" onClick={() => setDraft({ ...draft, custom: false, milestones: '' })}>Volver a 25 / 50 / 75%</button></small>
                  </>
                )}
              </div>
              {parseAmount(draft.baseline) > 0 && <small className="field-help">Meta final: US$ {fmtShort(Math.round(parseAmount(draft.baseline) * (1 + (Number(draft.pct) || 0) / 100)))} por mes en {monthLabel(addMonths(draft.start || monthKey(), Math.max(1, Number(draft.months) || 1) - 1))}.</small>}
            </div>
            <div className="modal-actions">
              {goal && <button className="ghost-button danger-text" onClick={() => { if (window.confirm('¿Borrar la meta y sus acciones?')) { setGoal(null); setDraft(null) } }}>Borrar meta</button>}
              <button className="ghost-button" onClick={() => setDraft(null)}>Cancelar</button>
              <button className="primary-button" onClick={saveDraft} disabled={parseAmount(draft.baseline) <= 0}>Guardar meta</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
