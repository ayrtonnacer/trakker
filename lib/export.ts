// Exportar tareas: Markdown para pasárselo a una IA o a un cliente, CSV para una planilla.
import { fmtClock, fmtHours, fmtMoney, type Task } from './game'

const byDate = (a: Task, b: Task) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? '')) || a.id - b.id

/**
 * Reporte en Markdown, agrupado por día, con las notas de cada tarea.
 * `forClient` saca los montos y la tarifa: sirve para mostrarle al cliente en qué trabajaste.
 */
export function tasksToMarkdown(tasks: Task[], title: string, opts: { forClient?: boolean } = {}) {
  const sorted = [...tasks].sort(byDate)
  const seconds = sorted.reduce((s, t) => s + t.seconds, 0)
  const amount = sorted.reduce((s, t) => s + t.amount, 0)
  const from = sorted[0]?.date
  const to = sorted[sorted.length - 1]?.date
  const out = [`# ${title}`, '']
  if (from) out.push(`${from === to ? from : `Del ${from} al ${to}`} · ${sorted.length} tarea${sorted.length === 1 ? '' : 's'} · ${fmtHours(seconds)}${!opts.forClient && amount > 0 ? ` · US$ ${fmtMoney(amount)}` : ''}`, '')
  let day = ''
  for (const t of sorted) {
    if (t.date !== day) {
      day = t.date
      const ts = sorted.filter((x) => x.date === day)
      out.push(`## ${day} · ${fmtHours(ts.reduce((s, x) => s + x.seconds, 0))}`, '')
    }
    const where = [t.project, t.client !== 'Sin cliente' ? t.client : ''].filter(Boolean).join(' · ')
    const extra = [
      t.start ? `${t.start}` : '',
      fmtHours(t.seconds),
      opts.forClient ? '' : where,
      !opts.forClient && t.amount > 0 ? `US$ ${fmtMoney(t.amount)}` : '',
      !opts.forClient && !t.billable && t.client !== 'Sin cliente' ? 'no facturable' : '',
      t.tags.length ? t.tags.map((x) => `#${x}`).join(' ') : '',
    ].filter(Boolean).join(' · ')
    out.push(`- **${t.name}**${t.ref ? ` (ID ${t.ref})` : ''} — ${extra}`)
    if (t.note) out.push(...t.note.split('\n').map((l) => `  > ${l}`))
  }
  out.push('')
  return out.join('\n')
}

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function tasksToCsv(tasks: Task[]) {
  const head = ['Fecha', 'Inicio', 'Tarea', 'Proyecto', 'Plataforma', 'Duración', 'Horas', 'Facturable', 'Tarifa USD/h', 'US$', 'Etiquetas', 'Notas']
  const rows = [...tasks].sort(byDate).map((t) => [
    t.date, t.start ?? '', t.ref ? `${t.name} (ID ${t.ref})` : t.name, t.project, t.client, fmtClock(t.seconds), (t.seconds / 3600).toFixed(2),
    t.billable ? 'sí' : 'no', t.rate, t.amount.toFixed(2), t.tags.join(', '), t.note ?? '',
  ])
  // BOM: así Excel abre bien las tildes.
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
}

export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slug(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tareas'
}
