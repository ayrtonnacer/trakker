'use client'

import { Plus } from 'lucide-react'
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
  onRepeat: (task: Task) => void
  onToggleBillable: (id: number) => void
  onAddManual: () => void
}

export function TasksView({ tasks, today, onDelete, onRepeat, onToggleBillable, onAddManual }: Props) {
  const days = [...new Set(tasks.map((t) => t.date))].sort().reverse()
  return (
    <section className="view">
      <div className="view-heading">
        <div><p className="eyebrow">HISTORIAL</p><h2>Tareas registradas</h2><p className="view-sub">El botón $ marca si la tarea se cobra. El monto usa la tarifa que tenía el proyecto al registrarla.</p></div>
        <button className="start-button" onClick={onAddManual}><Plus /> Cargar tiempo a mano</button>
      </div>
      {days.length === 0 && <p className="empty-list panel">Todavía no registraste nada. Escribí una tarea en Inicio y tocá Empezar.</p>}
      {days.map((day) => {
        const ts = tasks.filter((t) => t.date === day).sort((a, b) => (b.start ?? '').localeCompare(a.start ?? '') || b.id - a.id)
        const secs = ts.reduce((s, t) => s + t.seconds, 0)
        const amount = ts.reduce((s, t) => s + t.amount, 0)
        return (
          <div className="day-group" key={day}>
            <div className="day-head"><strong>{dayLabel(day, today)}</strong><span>{fmtHours(secs)}{amount > 0 && <b> · US$ {fmtMoney(amount)}</b>}</span></div>
            <div className="task-list">{ts.map((t) => <TaskRow key={t.id} task={t} dateLabel={dayLabel(day, today)} onDelete={onDelete} onRepeat={onRepeat} onToggleBillable={onToggleBillable} />)}</div>
          </div>
        )
      })}
    </section>
  )
}
