'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, Pencil, Play, Plus, Repeat, Search, StickyNote, Trash2, X } from 'lucide-react'
import { PERSONAL, canBill, dateKey, fmtHours, fmtMoney, parseTags, uid, type Client, type PlanItem, type Project, type Routine, type Task } from '@/lib/game'
import { ExportMenu } from './export-menu'
import { ProjectPicker } from './project-picker'
import { TaskRow } from './task-row'

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
// Lunes primero, como se piensa la semana. El número es el de Date.getDay().
const WEEK: { day: number; letter: string }[] = [{ day: 1, letter: 'L' }, { day: 2, letter: 'M' }, { day: 3, letter: 'X' }, { day: 4, letter: 'J' }, { day: 5, letter: 'V' }, { day: 6, letter: 'S' }, { day: 0, letter: 'D' }]
const WEEKDAYS_ONLY = [1, 2, 3, 4, 5]
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

type RoutineDraft = { id?: string; text: string; projectId: string | null; days: number[]; tags: string }
type PlanDraft = { item: PlanItem; text: string; projectId: string | null; note: string }

function daysLabel(days: number[]) {
  if (days.length === 7) return 'Todos los días'
  if (days.length === 5 && WEEKDAYS_ONLY.every((d) => days.includes(d))) return 'Lunes a viernes'
  return WEEK.filter((w) => days.includes(w.day)).map((w) => w.letter).join(' ')
}

export function dayLabel(date: string, today: string) {
  if (date === today) return 'Hoy'
  const d = new Date(`${date}T12:00:00`)
  const y = new Date(`${today}T12:00:00`)
  y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Ayer'
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

type Range = 'todo' | 'hoy' | 'semana' | 'mes' | 'rango'
const RANGES: { id: Range; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes', label: 'Este mes' },
  { id: 'rango', label: 'Fechas…' },
]

function rangeKeys(range: Range, today: string, from: string, to: string): [string, string] {
  const t = new Date(`${today}T12:00:00`)
  if (range === 'hoy') return [today, today]
  if (range === 'semana') {
    const monday = new Date(t)
    monday.setDate(t.getDate() - ((t.getDay() + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return [dateKey(monday), dateKey(sunday)]
  }
  if (range === 'mes') return [`${today.slice(0, 7)}-01`, `${today.slice(0, 7)}-31`]
  if (range === 'rango') return [from || '0000-00-00', to || '9999-99-99']
  return ['0000-00-00', '9999-99-99']
}

type Props = {
  tasks: Task[]
  backlog: PlanItem[]
  routines: Routine[]
  setRoutines: (fn: (r: Routine[]) => Routine[]) => void
  onStartRoutine: (r: Routine) => void
  onCreateProject: (p: Project) => void
  projects: Project[]
  clients: Client[]
  onStartPlan: (item: PlanItem) => void
  onRemovePlan: (id: string) => void
  onUpdatePlan: (item: PlanItem) => void
  today: string
  onDelete: (id: number) => void
  onDeleteMany: (ids: number[]) => void
  onSetBillable: (ids: number[], billable: boolean) => void
  onRepeat: (task: Task) => void
  onEdit: (task: Task) => void
  onToggleBillable: (id: number) => void
  onAddManual: () => void
}

export function TasksView({ tasks, backlog, routines, setRoutines, onStartRoutine, onCreateProject, projects, clients, onStartPlan, onRemovePlan, onUpdatePlan, today, onDelete, onDeleteMany, onSetBillable, onRepeat, onEdit, onToggleBillable, onAddManual }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [range, setRange] = useState<Range>('todo')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [projectId, setProjectId] = useState('')
  const [clientId, setClientId] = useState('')
  const lastClicked = useRef<number | null>(null)
  const [routineDraft, setRoutineDraft] = useState<RoutineDraft | null>(null)
  const [routineError, setRoutineError] = useState('')
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null)
  const [planError, setPlanError] = useState('')

  const q = query.trim().toLowerCase()
  const [fromKey, toKey] = rangeKeys(range, today, from, to)
  const visible = useMemo(() => {
    const clientProjects = clientId === 'personal'
      ? new Set(projects.filter((p) => !p.clientId || !clients.some((c) => c.id === p.clientId)).map((p) => p.id))
      : clientId ? new Set(projects.filter((p) => p.clientId === clientId).map((p) => p.id)) : null
    return tasks.filter((t) =>
      t.date >= fromKey && t.date <= toKey &&
      (!projectId || t.projectId === projectId) &&
      // Las tareas sin proyecto cuentan como personales.
      (!clientProjects || (t.projectId ? clientProjects.has(t.projectId) : clientId === 'personal')) &&
      (!q || t.name.toLowerCase().includes(q) || t.project.toLowerCase().includes(q) || t.client.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q))))
  }, [tasks, q, fromKey, toKey, projectId, clientId, projects, clients])
  const filtering = !!(q || range !== 'todo' || projectId || clientId)
  const totalSeconds = visible.reduce((s, t) => s + t.seconds, 0)
  const totalAmount = visible.reduce((s, t) => s + t.amount, 0)
  const projectOptions = projects.filter((p) => !clientId || (clientId === 'personal' ? !p.clientId : p.clientId === clientId))
  const days = useMemo(() => [...new Set(visible.map((t) => t.date))].sort().reverse(), [visible])
  const byDay = useMemo(() => new Map(days.map((day) => [day, visible.filter((t) => t.date === day).sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '') || b.id - a.id)])), [days, visible])
  // Orden en pantalla, para seleccionar un rango con Shift.
  const ordered = useMemo(() => days.flatMap((d) => byDay.get(d)!.map((t) => t.id)), [days, byDay])

  // Si se borran tareas, se limpian de la selección.
  const ids = new Set(tasks.map((t) => t.id))
  const chosen = [...selected].filter((id) => ids.has(id))

  function toggle(id: number, shift: boolean) {
    // Se lee antes de actualizar: React puede correr el updater después de pisar lastClicked.
    const from = lastClicked.current !== null ? ordered.indexOf(lastClicked.current) : -1
    const to = ordered.indexOf(id)
    setSelected((cur) => {
      const next = new Set(cur)
      if (shift && from >= 0 && to >= 0) {
        const on = !cur.has(id)
        ordered.slice(Math.min(from, to), Math.max(from, to) + 1).forEach((x) => (on ? next.add(x) : next.delete(x)))
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastClicked.current = id
  }

  function toggleMany(list: number[]) {
    setSelected((cur) => {
      const next = new Set(cur)
      const all = list.every((id) => cur.has(id))
      list.forEach((id) => (all ? next.delete(id) : next.add(id)))
      return next
    })
  }

  function removeSelected() {
    if (!window.confirm(`¿Borrar ${chosen.length} tarea${chosen.length === 1 ? '' : 's'}? No se puede deshacer.`)) return
    onDeleteMany(chosen)
    setSelected(new Set())
  }

  function saveRoutine() {
    if (!routineDraft) return
    const text = routineDraft.text.trim()
    if (!text) return setRoutineError('Ponele un nombre a la rutina.')
    if (!routineDraft.projectId) return setRoutineError('Elegí un proyecto: de un cliente o personal.')
    if (!routineDraft.days.length) return setRoutineError('Elegí al menos un día.')
    const data = { text, projectId: routineDraft.projectId, days: [...routineDraft.days].sort(), tags: parseTags(routineDraft.tags) }
    if (routineDraft.id) setRoutines((cur) => cur.map((x) => (x.id === routineDraft.id ? { ...x, ...data } : x)))
    else setRoutines((cur) => [...cur, { id: uid(), ...data }])
    setRoutineDraft(null)
  }

  /** Guarda los cambios de una tarea del backlog. Devuelve la tarea actualizada, o null si falta algo. */
  function savePlan(): PlanItem | null {
    if (!planDraft) return null
    const text = planDraft.text.trim()
    if (!text) { setPlanError('Ponele un nombre a la tarea.'); return null }
    const note = planDraft.note.trim()
    const { note: _old, ...rest } = planDraft.item
    const item: PlanItem = { ...rest, text, projectId: planDraft.projectId, ...(note ? { note } : {}) }
    onUpdatePlan(item)
    setPlanDraft(null)
    return item
  }

  function openPlan(i: PlanItem) {
    setPlanDraft({ item: i, text: i.text, projectId: i.projectId, note: i.note ?? '' })
    setPlanError('')
  }

  function removeRoutine(x: Routine) {
    if (!window.confirm(`¿Borrar la rutina “${x.text}”? Las tareas ya registradas no cambian.`)) return
    setRoutines((cur) => cur.filter((y) => y.id !== x.id))
    setRoutineDraft(null)
  }

  const weekday = today ? new Date(`${today}T12:00:00`).getDay() : -1
  const doneToday = new Set(tasks.filter((t) => t.date === today && t.routineId).map((t) => t.routineId))
  const filterTitle = ['Tareas', clientId === 'personal' ? PERSONAL : clients.find((c) => c.id === clientId)?.name, projects.find((p) => p.id === projectId)?.name].filter(Boolean).join(' · ')

  const allVisibleSelected = ordered.length > 0 && ordered.every((id) => selected.has(id))
  const selTasks = tasks.filter((t) => selected.has(t.id))
  const selSeconds = selTasks.reduce((s, t) => s + t.seconds, 0)

  return (
    <section className="view">
      <div className="view-heading">
        <div><h2>Tareas</h2><p className="view-sub">Tocá una tarea para editarla y agregarle una nota, y ▶ para repetirla, como plantilla. Marcá varias con la casilla (Shift + clic para un rango) para borrarlas o cambiar si se cobran de una vez.</p></div>
        <div className="heading-actions">
          <ExportMenu tasks={visible} title={filterTitle} />
          <button className="primary-button" onClick={onAddManual}><Plus /> Cargar tiempo a mano</button>
        </div>
      </div>

      <div className="day-group routines-group">
        <div className="day-head"><strong><Repeat className="inline-icon" /> Rutinas</strong><button className="text-button" onClick={() => { setRoutineDraft({ text: '', projectId: null, days: WEEKDAYS_ONLY, tags: '' }); setRoutineError('') }}><Plus /> Nueva rutina</button></div>
        {routines.length === 0 ? (
          <p className="muted-line routines-empty">Tareas que se repiten, como “Mandar 5 solicitudes a reclutadores en LinkedIn”. Los días que tocan aparecen solas en la caja del timer, sin escribirlas.</p>
        ) : (
          <div className="task-list">
            {routines.map((x) => {
              const p = projects.find((y) => y.id === x.projectId)
              const todays = x.days.includes(weekday)
              const done = doneToday.has(x.id)
              return (
                <div className="task-row" key={x.id}>
                  <button className="task-info" onClick={() => { setRoutineDraft({ id: x.id, text: x.text, projectId: x.projectId, days: x.days, tags: x.tags.join(', ') }); setRoutineError('') }} title="Editar rutina">
                    <strong>{x.text}</strong>
                    <span><i className="dot" style={{ background: p?.color ?? 'var(--faint)' }} /> {p?.name ?? 'Elegí un proyecto'} · {daysLabel(x.days)}</span>
                  </button>
                  <span className={`routine-state ${done ? 'routine-done' : ''}`}>{done ? <><Check /> Hecha hoy</> : todays ? 'Toca hoy' : 'Hoy no toca'}</span>
                  <div className="row-actions">
                    <button className="icon-button" onClick={() => onStartRoutine(x)} aria-label={`Empezar “${x.text}”`} title="Empezar"><Play /></button>
                    <button className="icon-button hide-mobile" onClick={() => { setRoutineDraft({ id: x.id, text: x.text, projectId: x.projectId, days: x.days, tags: x.tags.join(', ') }); setRoutineError('') }} aria-label={`Editar “${x.text}”`} title="Editar"><Pencil /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {backlog.length > 0 && (
        <div className="day-group backlog-group">
          <div className="day-head"><strong>Por hacer</strong><span>{backlog.length} sin empezar</span></div>
          <div className="task-list">
            {backlog.map((i) => {
              const p = projects.find((x) => x.id === i.projectId)
              return (
                <div className="task-row" key={i.id}>
                  <button className="task-info" onClick={() => openPlan(i)} title="Editar">
                    <strong>{i.text}</strong>
                    <span><i className="dot" style={{ background: p?.color ?? 'var(--faint)' }} /> {p?.name ?? 'Elegí un proyecto'}</span>
                    {i.note && <em className="task-note" title={i.note}><StickyNote /> {i.note}</em>}
                  </button>
                  <div className="row-actions">
                    <button className="icon-button hide-mobile" onClick={() => openPlan(i)} aria-label={`Editar “${i.text}”`} title="Editar"><Pencil /></button>
                    <button className="icon-button" onClick={() => onStartPlan(i)} aria-label={`Empezar “${i.text}”`} title="Empezar"><Play /></button>
                    <button className="icon-button danger" onClick={() => onRemovePlan(i.id)} aria-label={`Quitar “${i.text}”`} title="Quitar"><Trash2 /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="list-toolbar">
        <label className="check-all"><input type="checkbox" checked={allVisibleSelected} onChange={() => toggleMany(ordered)} disabled={ordered.length === 0} /> Seleccionar todo</label>
        <label className="search-input"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarea, proyecto, cliente o etiqueta" aria-label="Buscar" /></label>
      </div>
      <div className="task-filters">
        <div className="segmented small" role="tablist" aria-label="Fechas">{RANGES.map((r) => <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? 'seg-on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>)}</div>
        {range === 'rango' && <span className="date-range"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" /> – <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" /></span>}
        <select value={clientId} onChange={(e) => { setClientId(e.target.value); setProjectId('') }} aria-label="Filtrar por cliente"><option value="">Todos los clientes</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="personal">{PERSONAL}</option></select>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Filtrar por proyecto"><option value="">Todos los proyectos</option>{projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {filtering && <button className="text-button" onClick={() => { setQuery(''); setRange('todo'); setProjectId(''); setClientId('') }}><X /> Limpiar</button>}
      </div>
      {filtering && visible.length > 0 && <p className="filter-total">{visible.length} tarea{visible.length === 1 ? '' : 's'} · <b>{fmtHours(totalSeconds)}</b>{totalAmount > 0 && <> · <b>US$ {fmtMoney(totalAmount)}</b></>}</p>}

      {days.length === 0 && <p className="empty-list">{filtering ? 'No hay tareas con esos filtros.' : 'Todavía no registraste nada. Escribí una tarea en Inicio y tocá ▶.'}</p>}
      {days.map((day) => {
        const ts = byDay.get(day)!
        const secs = ts.reduce((s, t) => s + t.seconds, 0)
        const amount = ts.reduce((s, t) => s + t.amount, 0)
        const dayIds = ts.map((t) => t.id)
        return (
          <div className="day-group" key={day}>
            <div className="day-head">
              <label><input type="checkbox" checked={dayIds.every((id) => selected.has(id))} onChange={() => toggleMany(dayIds)} aria-label={`Seleccionar ${dayLabel(day, today)}`} /><strong>{dayLabel(day, today)}</strong></label>
              <span>{fmtHours(secs)}{amount > 0 && <> · US$ {fmtMoney(amount)}</>}</span>
            </div>
            <div className="task-list">{ts.map((t) => <TaskRow key={t.id} task={t} dateLabel={dayLabel(day, today)} onDelete={onDelete} onRepeat={onRepeat} onEdit={onEdit} onToggleBillable={onToggleBillable} billable={canBill(t.projectId, projects)} selected={selected.has(t.id)} onSelect={toggle} />)}</div>
          </div>
        )
      })}

      {chosen.length > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Acciones sobre la selección">
          <strong>{chosen.length} seleccionada{chosen.length === 1 ? '' : 's'}</strong>
          <span className="bulk-meta">{fmtHours(selSeconds)}</span>
          <button onClick={() => onSetBillable(chosen, true)}>Facturable</button>
          <button onClick={() => onSetBillable(chosen, false)}>No facturable</button>
          <ExportMenu tasks={selTasks} title={`${filterTitle} · selección`} />
          <button className="bulk-danger" onClick={removeSelected}><Trash2 /> Borrar</button>
          <button className="icon-button" onClick={() => setSelected(new Set())} aria-label="Quitar selección"><X /></button>
        </div>
      )}

      {planDraft && (
        <div className="modal-backdrop" onClick={() => setPlanDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPlanDraft(null)} aria-label="Cerrar"><X /></button>
            <h2>Tarea por hacer</h2>
            <div className="form-grid">
              <label>Tarea<input autoFocus value={planDraft.text} onChange={(e) => setPlanDraft({ ...planDraft, text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && savePlan()} maxLength={140} /></label>
              <div className="field"><span>Proyecto</span><ProjectPicker projects={projects} clients={clients} value={planDraft.projectId} onChange={(id) => setPlanDraft({ ...planDraft, projectId: id })} onCreateProject={onCreateProject} /></div>
              <label>Nota<textarea rows={3} value={planDraft.note} onChange={(e) => setPlanDraft({ ...planDraft, note: e.target.value })} maxLength={2000} placeholder="Qué hay que hacer, links, detalles…" /></label>
            </div>
            {planError && <p className="form-error">{planError}</p>}
            <div className="modal-actions">
              <button className="ghost-button danger-text" onClick={() => { onRemovePlan(planDraft.item.id); setPlanDraft(null) }}>Borrar</button>
              <button className="ghost-button" onClick={() => setPlanDraft(null)}>Cancelar</button>
              <button className="ghost-button" onClick={() => { const item = savePlan(); if (item) onStartPlan(item) }}><Play /> Empezar</button>
              <button className="primary-button" onClick={() => savePlan()}><Check /> Guardar</button>
            </div>
          </div>
        </div>
      )}

      {routineDraft && (
        <div className="modal-backdrop" onClick={() => setRoutineDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setRoutineDraft(null)} aria-label="Cerrar"><X /></button>
            <h2>{routineDraft.id ? 'Editar rutina' : 'Nueva rutina'}</h2>
            <p>Los días que elijas aparece sola en la caja del timer, en “Rutinas de hoy”, hasta que la registres. Así no la tenés que escribir.</p>
            <div className="form-grid">
              <label>Tarea<input autoFocus value={routineDraft.text} onChange={(e) => setRoutineDraft({ ...routineDraft, text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveRoutine()} maxLength={140} placeholder="Mandar 5 solicitudes a reclutadores en LinkedIn" /></label>
              <div className="field"><span>Proyecto</span><ProjectPicker projects={projects} clients={clients} value={routineDraft.projectId} onChange={(id) => setRoutineDraft({ ...routineDraft, projectId: id })} onCreateProject={onCreateProject} /></div>
              <div className="field"><span>Días</span>
                <div className="day-picker">{WEEK.map((w) => {
                  const on = routineDraft.days.includes(w.day)
                  return <button type="button" key={w.day} className={on ? 'day-on' : ''} aria-pressed={on} onClick={() => setRoutineDraft({ ...routineDraft, days: on ? routineDraft.days.filter((d) => d !== w.day) : [...routineDraft.days, w.day] })}>{w.letter}</button>
                })}</div>
                <div className="day-presets"><button type="button" className="text-button" onClick={() => setRoutineDraft({ ...routineDraft, days: WEEKDAYS_ONLY })}>Lunes a viernes</button><button type="button" className="text-button" onClick={() => setRoutineDraft({ ...routineDraft, days: EVERY_DAY })}>Todos los días</button></div>
              </div>
              <label>Etiquetas<input value={routineDraft.tags} onChange={(e) => setRoutineDraft({ ...routineDraft, tags: e.target.value })} placeholder="búsqueda, linkedin" /></label>
            </div>
            {routineError && <p className="form-error">{routineError}</p>}
            <div className="modal-actions">
              {routineDraft.id && <button className="ghost-button danger-text" onClick={() => removeRoutine(routines.find((x) => x.id === routineDraft.id)!)}>Borrar</button>}
              <button className="ghost-button" onClick={() => setRoutineDraft(null)}>Cancelar</button>
              <button className="primary-button" onClick={saveRoutine}>Guardar rutina</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
