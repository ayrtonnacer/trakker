'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { canBill, dateKey, fmtHours, fmtMoney, type Project, type Task } from '@/lib/game'
import { TaskRow } from './task-row'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const CHIPS = 2

type Props = {
  tasks: Task[]
  projects: Project[]
  today: string
  onDelete: (id: number) => void
  onRepeat: (task: Task) => void
  onEdit: (task: Task) => void
  onToggleBillable: (id: number) => void
}

/** Vista mensual de las tareas: cada día muestra el total y las primeras tareas; al tocarlo se listan abajo. */
export function CalendarView({ tasks, projects, today, onDelete, onRepeat, onEdit, onToggleBillable }: Props) {
  const [month, setMonth] = useState(today.slice(0, 7))
  const [picked, setPicked] = useState(today)

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    tasks.forEach((t) => map.set(t.date, [...(map.get(t.date) ?? []), t]))
    map.forEach((list) => list.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.id - b.id))
    return map
  }, [tasks])

  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1, 12)
  const lead = (first.getDay() + 6) % 7
  const total = new Date(y, m, 0).getDate()
  const cells = Array.from({ length: Math.ceil((lead + total) / 7) * 7 }, (_, i) => {
    const day = i - lead + 1
    return day >= 1 && day <= total ? dateKey(new Date(y, m - 1, day, 12)) : null
  })

  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1, 12)
    setMonth(dateKey(d).slice(0, 7))
  }
  const monthTasks = tasks.filter((t) => t.date.startsWith(month))
  const monthSecs = monthTasks.reduce((s, t) => s + t.seconds, 0)
  const monthAmount = monthTasks.reduce((s, t) => s + t.amount, 0)
  const dayTasks = byDay.get(picked) ?? []
  const pickedDate = new Date(`${picked}T12:00:00`)

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button className="icon-button" onClick={() => shift(-1)} aria-label="Mes anterior"><ChevronLeft /></button>
        <strong>{MONTHS[m - 1]} {y}</strong>
        <button className="icon-button" onClick={() => shift(1)} aria-label="Mes siguiente"><ChevronRight /></button>
        <button className="text-button" onClick={() => { setMonth(today.slice(0, 7)); setPicked(today) }}>Hoy</button>
        <span className="calendar-total">{monthTasks.length} tarea{monthTasks.length === 1 ? '' : 's'} · <b>{fmtHours(monthSecs)}</b>{monthAmount > 0 && <> · <b>US$ {fmtMoney(monthAmount)}</b></>}</span>
      </div>
      <div className="calendar-grid">
        {HEAD.map((h) => <span key={h} className="calendar-dow">{h}</span>)}
        {cells.map((key, i) => {
          if (!key) return <span key={`e${i}`} className="calendar-day empty" />
          const list = byDay.get(key) ?? []
          const secs = list.reduce((s, t) => s + t.seconds, 0)
          return (
            <button key={key} className={`calendar-day ${key === today ? 'is-today' : ''} ${key === picked ? 'is-picked' : ''}`} onClick={() => setPicked(key)} aria-label={`${Number(key.slice(8))} de ${MONTHS[m - 1]}: ${list.length} tareas`}>
              <b>{Number(key.slice(8))}</b>
              {secs > 0 && <small>{fmtHours(secs)}</small>}
              <span className="calendar-chips">
                {list.slice(0, CHIPS).map((t) => <em key={t.id} style={{ borderLeftColor: t.color }}>{t.start && <i>{t.start}</i>}{t.name}</em>)}
                {list.length > CHIPS && <em className="more">+{list.length - CHIPS} más</em>}
              </span>
              <span className="calendar-dots" aria-hidden="true">{list.slice(0, 4).map((t) => <i key={t.id} style={{ background: t.color }} />)}</span>
            </button>
          )
        })}
      </div>
      <div className="day-group calendar-list">
        <div className="day-head"><strong>{WEEKDAYS[pickedDate.getDay()]} {pickedDate.getDate()} de {MONTHS[pickedDate.getMonth()]}</strong><span>{dayTasks.length ? `${fmtHours(dayTasks.reduce((s, t) => s + t.seconds, 0))}` : ''}</span></div>
        <div className="task-list">
          {dayTasks.length === 0 && <p className="empty-list">No hay tareas este día.</p>}
          {dayTasks.map((t) => <TaskRow key={t.id} task={t} dateLabel={picked === today ? 'Hoy' : `${pickedDate.getDate()} ${MONTHS[pickedDate.getMonth()].slice(0, 3)}`} onDelete={onDelete} onRepeat={onRepeat} onEdit={onEdit} onToggleBillable={onToggleBillable} billable={canBill(t.projectId, projects)} />)}
        </div>
      </div>
    </div>
  )
}
