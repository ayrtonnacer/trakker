'use client'

import { Clock3, DollarSign, Play, Tag, Trash2 } from 'lucide-react'
import { fmtClock, fmtMoney, type Task } from '@/lib/game'

type Props = {
  task: Task
  dateLabel: string
  onDelete: (id: number) => void
  onRepeat: (task: Task) => void
  onToggleBillable: (id: number) => void
}

export function TaskRow({ task, dateLabel, onDelete, onRepeat, onToggleBillable }: Props) {
  const paid = task.amount > 0
  return (
    <div className="task-row">
      <div className="task-icon" style={{ background: `${task.color}18`, color: task.color }}><Clock3 /></div>
      <div className="task-info"><strong>{task.name}</strong><span><i style={{ background: task.color }} /> <b style={{ color: task.color }}>{task.project}</b> · {task.client}</span></div>
      <div className="task-tags">{task.tags.map((tag) => <span key={tag}><Tag /> {tag}</span>)}</div>
      <button className={`billable-toggle ${task.billable ? 'billable-on' : ''}`} onClick={() => onToggleBillable(task.id)} aria-pressed={task.billable} title={task.billable ? (task.rate > 0 ? `Facturable a ${task.rate} USD/h` : 'Facturable, pero el proyecto no tiene tarifa') : 'No facturable'} aria-label={task.billable ? 'Marcar como no facturable' : 'Marcar como facturable'}><DollarSign /></button>
      <div className="task-duration"><strong>{fmtClock(task.seconds)}</strong><span>{task.start ? `${dateLabel} · ${task.start}` : dateLabel}</span></div>
      <div className="task-money"><strong className={paid ? '' : 'xp-only'}>{paid ? `+$ ${fmtMoney(task.amount)}` : `+${task.xp} XP`}</strong><span>{paid ? task.currency : task.billable ? 'sin tarifa' : 'no facturable'}</span></div>
      <div className="row-actions">
        <button className="row-more" onClick={() => onRepeat(task)} aria-label={`Repetir “${task.name}”`} title="Empezar de nuevo"><Play /></button>
        <button className="row-more danger" onClick={() => onDelete(task.id)} aria-label={`Borrar “${task.name}”`} title="Borrar"><Trash2 /></button>
      </div>
    </div>
  )
}
