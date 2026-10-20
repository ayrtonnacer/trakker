import { NO_PROJECT_COLOR, dateKey, type Task } from './game'

export type Period = 'hoy' | 'semana' | 'mes' | 'año' | 'todo'

export const PERIODS: { id: Period; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'año', label: 'Año' },
  { id: 'todo', label: 'Todo' },
]

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

function noon(key: string) {
  return new Date(`${key}T12:00:00`)
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Rango de fechas (inclusive) del período, desplazado `offset` períodos hacia atrás o adelante. */
export function periodRange(period: Period, offset: number, today: string, tasks: Task[]) {
  const t = noon(today)
  if (period === 'hoy') {
    const d = addDays(t, offset)
    const label = offset === 0 ? 'Hoy' : offset === -1 ? 'Ayer' : `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
    return { from: d, to: d, label }
  }
  if (period === 'semana') {
    const monday = addDays(t, -((t.getDay() + 6) % 7) + offset * 7)
    const sunday = addDays(monday, 6)
    const label = offset === 0 ? 'Esta semana' : offset === -1 ? 'Semana pasada' : `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS_SHORT[sunday.getMonth()]}`
    return { from: monday, to: sunday, label }
  }
  if (period === 'mes') {
    const from = new Date(t.getFullYear(), t.getMonth() + offset, 1, 12)
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 12)
    return { from, to, label: `${MONTHS[from.getMonth()]} ${from.getFullYear()}` }
  }
  if (period === 'año') {
    const y = t.getFullYear() + offset
    return { from: new Date(y, 0, 1, 12), to: new Date(y, 11, 31, 12), label: String(y) }
  }
  const first = tasks.reduce((min, x) => (x.date < min ? x.date : min), today)
  return { from: noon(first), to: t, label: 'Desde el principio' }
}

export type Group = { key: string; name: string; color: string; seconds: number; amount: number; billableSeconds: number; count: number; pct: number }
export type Bin = { label: string; title: string; seconds: number; amount: number; isCurrent: boolean }

export type GroupBy = 'cliente' | 'proyecto' | 'etiqueta' | 'tarea'

export function groupTasks(tasks: Task[], by: GroupBy, clientColors: Map<string, string>): Group[] {
  const map = new Map<string, Group>()
  const total = tasks.reduce((s, t) => s + t.seconds, 0) || 1
  const add = (key: string, name: string, color: string, t: Task) => {
    const g = map.get(key) ?? { key, name, color, seconds: 0, amount: 0, billableSeconds: 0, count: 0, pct: 0 }
    g.seconds += t.seconds
    g.amount += t.amount
    if (t.billable) g.billableSeconds += t.seconds
    g.count++
    map.set(key, g)
  }
  for (const t of tasks) {
    if (by === 'cliente') add(t.client, t.client, clientColors.get(t.client) ?? NO_PROJECT_COLOR, t)
    else if (by === 'proyecto') add(`${t.client}/${t.project}`, t.project, t.color, t)
    else if (by === 'tarea') add(t.name.toLowerCase(), t.name, t.color, t)
    else if (t.tags.length === 0) add('—', 'Sin etiqueta', NO_PROJECT_COLOR, t)
    else t.tags.forEach((tag) => add(tag, tag, '#8fa0b3', t))
  }
  return [...map.values()]
    .map((g) => ({ ...g, amount: Math.round(g.amount * 100) / 100, pct: Math.round((g.seconds / total) * 1000) / 10 }))
    .sort((a, b) => b.seconds - a.seconds)
}

export function computeStats(tasks: Task[], period: Period, offset: number, today: string) {
  const range = periodRange(period, offset, today, tasks)
  const fromKey = dateKey(range.from)
  const toKey = dateKey(range.to)
  const inRange = tasks.filter((t) => t.date >= fromKey && t.date <= toKey)

  const seconds = inRange.reduce((s, t) => s + t.seconds, 0)
  const billableSeconds = inRange.filter((t) => t.billable).reduce((s, t) => s + t.seconds, 0)
  const amount = Math.round(inRange.reduce((s, t) => s + t.amount, 0) * 100) / 100
  const xp = inRange.reduce((s, t) => s + t.xp, 0)

  // Promedio diario sobre los días del período que ya pasaron.
  const lastDay = toKey > today ? noon(today) : range.to
  const elapsedDays = Math.max(1, Math.round((lastDay.getTime() - range.from.getTime()) / 86400000) + 1)
  const workedDays = new Set(inRange.map((t) => t.date)).size

  // Barras: por día salvo año y todo, que van por mes.
  const bins: Bin[] = []
  const byMonth = period === 'año' || (period === 'todo' && elapsedDays > 62)
  if (byMonth) {
    const cur = new Date(range.from.getFullYear(), range.from.getMonth(), 1, 12)
    while (cur <= range.to) {
      const prefix = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
      const ts = inRange.filter((t) => t.date.startsWith(prefix))
      bins.push({
        label: period === 'año' ? MONTHS_SHORT[cur.getMonth()] : `${MONTHS_SHORT[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`,
        title: `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`,
        seconds: ts.reduce((s, t) => s + t.seconds, 0),
        amount: ts.reduce((s, t) => s + t.amount, 0),
        isCurrent: today.startsWith(prefix),
      })
      cur.setMonth(cur.getMonth() + 1)
    }
  } else {
    for (let d = new Date(range.from); d <= range.to; d = addDays(d, 1)) {
      const key = dateKey(d)
      const ts = inRange.filter((t) => t.date === key)
      bins.push({
        label: period === 'semana' || period === 'hoy' ? DAY_LETTERS[d.getDay()] : String(d.getDate()),
        title: `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`,
        seconds: ts.reduce((s, t) => s + t.seconds, 0),
        amount: ts.reduce((s, t) => s + t.amount, 0),
        isCurrent: key === today,
      })
    }
  }

  return {
    range,
    tasks: inRange,
    seconds,
    billableSeconds,
    amount,
    xp,
    count: inRange.length,
    billablePct: seconds ? Math.round((billableSeconds / seconds) * 100) : 0,
    avgDaily: seconds / elapsedDays,
    workedDays,
    bins,
    byMonth,
  }
}
