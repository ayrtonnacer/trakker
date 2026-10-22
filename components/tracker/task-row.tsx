'use client'

import { DollarSign, Pencil, Play, StickyNote, Trash2 } from 'lucide-react'
import { fmtClock, fmtMoney, type Task } from '@/lib/game'

type Props = {
  task: Task
  dateLabel: string
  onDelete: (id: number) => void
  onRepeat: (task: Task) => void
  onEdit: (task: Task) => void
  onToggleBillable: (id: number) => void
  billable?: boolean // false = proyecto personal: no se muestra el $
  selected?: boolean
  onSelect?: (id: number, shift: boolean) => void
}

export function TaskRow({ task, dateLabel, onDelete, onRepeat, onEdit, onToggleBillable, billable = true, selected, onSelect }: Props) {
  const paid = task.amount > 0
  return (
    <div className={`task-row ${selected ? 'row-selected' : ''}`}>
      {onSelect && <input type="checkbox" className="row-check" checked={!!selected} onChange={() => {}} onClick={(e) => onSelect(task.id, e.shiftKey)} aria-label={`Seleccionar “${task.name}”`} />}
      <button className="task-info" onClick={() => onEdit(task)} title="Editar">
        <strong>{task.name}</strong>
        <span><i className="dot" style={{ background: task.color }} /> {task.project}{task.client !== 'Sin cliente' && <> · {task.client}</>}</span>
        {task.note && <em className="task-note" title={task.note}><StickyNote /> {task.note}</em>}
      </button>
      <div className="task-tags">{task.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      {billable ? <button className={`billable-toggle ${task.billable ? 'billable-on' : ''}`} onClick={() => onToggleBillable(task.id)} aria-pressed={task.billable} title={task.billable ? (task.rate > 0 ? `Facturable a ${task.rate} USD/h` : 'Facturable, pero sin tarifa por hora') : 'No facturable'} aria-label={task.billable ? 'Marcar como no facturable' : 'Marcar como facturable'}><DollarSign /></button> : <span className="billable-spacer" title="Proyecto personal: no se factura" />}
      <div className="task-duration"><strong>{fmtClock(task.seconds)}</strong><span>{task.start ? `${dateLabel} · ${task.start}` : dateLabel}</span></div>
      <div className="task-money"><strong className={paid ? '' : 'muted'}>{paid ? `US$ ${fmtMoney(task.amount)}` : '—'}</strong></div>
      <div className="row-actions">
        <button className="icon-button" onClick={() => onRepeat(task)} aria-label={`Repetir “${task.name}”`} title="Empezar de nuevo"><Play /></button>
        <button className="icon-button hide-mobile" onClick={() => onEdit(task)} aria-label={`Editar “${task.name}”`} title="Editar"><Pencil /></button>
        <button className="icon-button danger" onClick={() => onDelete(task.id)} aria-label={`Borrar “${task.name}”`} title="Borrar"><Trash2 /></button>
      </div>
    </div>
  )
}
