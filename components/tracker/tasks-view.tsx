'use client'

import { useMemo, useRef, useState } from 'react'
import { Plus, Search, Trash2, X } from 'lucide-react'
import { fmtHours, fmtMoney, type Task } from '@/lib/game'
import { TaskRow } from './task-row'

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function dayLabel(date: string, today: string) {
  if (date === today) return 'Hoy'
  const d = new Date(`${date}T12:00:00`)
  const y = new Date(`${today}T12:00:00`)
  y.setDate(y.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Ayer'
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

type Props = {
  tasks: Task[]
  today: string
  onDelete: (id: number) => void
  onDeleteMany: (ids: number[]) => void
  onSetBillable: (ids: number[], billable: boolean) => void
  onRepeat: (task: Task) => void
  onEdit: (task: Task) => void
  onToggleBillable: (id: number) => void
  onAddManual: () => void
}

export function TasksView({ tasks, today, onDelete, onDeleteMany, onSetBillable, onRepeat, onEdit, onToggleBillable, onAddManual }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const lastClicked = useRef<number | null>(null)

  const q = query.trim().toLowerCase()
  const visible = useMemo(() => tasks.filter((t) => !q || t.name.toLowerCase().includes(q) || t.project.toLowerCase().includes(q) || t.client.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q))), [tasks, q])
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

  const allVisibleSelected = ordered.length > 0 && ordered.every((id) => selected.has(id))
  const selTasks = tasks.filter((t) => selected.has(t.id))
  const selSeconds = selTasks.reduce((s, t) => s + t.seconds, 0)

  return (
    <section className="view">
      <div className="view-heading">
        <div><h2>Tareas</h2><p className="view-sub">Tocá una tarea para editarla. Marcá varias con la casilla (Shift + clic para un rango) para borrarlas o cambiar si se cobran de una vez.</p></div>
        <button className="primary-button" onClick={onAddManual}><Plus /> Cargar tiempo a mano</button>
      </div>

      <div className="list-toolbar">
        <label className="check-all"><input type="checkbox" checked={allVisibleSelected} onChange={() => toggleMany(ordered)} disabled={ordered.length === 0} /> Seleccionar todo</label>
        <label className="search-input"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarea, proyecto, cliente o etiqueta" aria-label="Buscar" /></label>
      </div>

      {days.length === 0 && <p className="empty-list">{q ? `No hay tareas con “${query}”.` : 'Todavía no registraste nada. Escribí una tarea en Inicio y tocá ▶.'}</p>}
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
            <div className="task-list">{ts.map((t) => <TaskRow key={t.id} task={t} dateLabel={dayLabel(day, today)} onDelete={onDelete} onRepeat={onRepeat} onEdit={onEdit} onToggleBillable={onToggleBillable} selected={selected.has(t.id)} onSelect={toggle} />)}</div>
          </div>
        )
      })}

      {chosen.length > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Acciones sobre la selección">
          <strong>{chosen.length} seleccionada{chosen.length === 1 ? '' : 's'}</strong>
          <span className="bulk-meta">{fmtHours(selSeconds)}</span>
          <button onClick={() => onSetBillable(chosen, true)}>Facturable</button>
          <button onClick={() => onSetBillable(chosen, false)}>No facturable</button>
          <button className="bulk-danger" onClick={removeSelected}><Trash2 /> Borrar</button>
          <button className="icon-button" onClick={() => setSelected(new Set())} aria-label="Quitar selección"><X /></button>
        </div>
      )}
    </section>
  )
}
