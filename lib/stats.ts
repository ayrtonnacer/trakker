import { NO_CLIENT, NO_PROJECT, PERSONAL, NO_PROJECT_COLOR, dateKey, type Client, type Payment, type Project, type Task } from './game'

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

/** Un movimiento para las estadísticas: una tarea (tiempo y quizá plata) o un pago cobrado (sólo plata). */
export type Entry = {
  date: string
  seconds: number
  amount: number
  billable: boolean
  client: string
  project: string
  projectId: string | null
  name: string
  color: string
  tags: string[]
  isTask: boolean
}

function noon(key: string) {
  return new Date(`${key}T12:00:00`)
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/**
 * Junta tareas y pagos cobrados usando los nombres actuales de proyectos y clientes,
 * así renombrar algo se refleja en los gráficos.
 */
export function buildEntries(tasks: Task[], payments: Payment[], projects: Project[], clients: Client[]): Entry[] {
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const clientById = new Map(clients.map((c) => [c.id, c]))
  const names = (projectId: string | null, fallbackProject: string, fallbackClient: string, fallbackColor: string) => {
    const p = projectId ? projectById.get(projectId) : undefined
    if (!p) return { project: fallbackProject, client: fallbackClient, color: fallbackColor }
    const c = p.clientId ? clientById.get(p.clientId) : undefined
    return { project: p.name, client: c?.name ?? PERSONAL, color: p.color }
  }
  const fromTasks = tasks.map((t) => ({
    date: t.date, seconds: t.seconds, amount: t.amount, billable: t.billable, projectId: t.projectId,
    name: t.name, tags: t.tags, isTask: true, ...names(t.projectId, t.project, t.client, t.color),
  }))
  const fromPayments = payments.filter((p) => p.paid).map((p) => ({
    date: p.date, seconds: 0, amount: p.amount, billable: true, projectId: p.projectId,
    name: p.label || 'Pago', tags: [], isTask: false, ...names(p.projectId, NO_PROJECT, NO_CLIENT, NO_PROJECT_COLOR),
  }))
  return [...fromTasks, ...fromPayments]
}

/** Rango de fechas (inclusive) del período, desplazado `offset` períodos hacia atrás o adelante. */
export function periodRange(period: Period, offset: number, today: string, entries: Entry[]) {
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
  const first = entries.reduce((min, x) => (x.date < min ? x.date : min), today)
  return { from: noon(first), to: t, label: 'Desde el principio' }
}

export type Group = { key: string; name: string; color: string; seconds: number; amount: number; billableSeconds: number; count: number; pct: number; amountPct: number }
export type Bin = { key: string; label: string; title: string; seconds: number; amount: number; isCurrent: boolean }

export type GroupBy = 'cliente' | 'proyecto' | 'etiqueta' | 'tarea'

export function groupEntries(entries: Entry[], by: GroupBy, clientColors: Map<string, string>): Group[] {
  const map = new Map<string, Group>()
  const totalSeconds = entries.reduce((s, t) => s + t.seconds, 0) || 1
  const totalAmount = entries.reduce((s, t) => s + t.amount, 0) || 1
  const add = (key: string, name: string, color: string, e: Entry) => {
    const g = map.get(key) ?? { key, name, color, seconds: 0, amount: 0, billableSeconds: 0, count: 0, pct: 0, amountPct: 0 }
    g.seconds += e.seconds
    g.amount += e.amount
    if (e.billable) g.billableSeconds += e.seconds
    if (e.isTask) g.count++
    map.set(key, g)
  }
  for (const e of entries) {
    if (by === 'cliente') add(e.client, e.client, clientColors.get(e.client) ?? NO_PROJECT_COLOR, e)
    else if (by === 'proyecto') add(e.projectId ?? `${e.client}/${e.project}`, e.project, e.color, e)
    else if (by === 'tarea') add(e.name.toLowerCase(), e.name, e.color, e)
    else if (e.tags.length === 0) add('—', e.isTask ? 'Sin etiqueta' : 'Pagos', NO_PROJECT_COLOR, e)
    else e.tags.forEach((tag) => add(tag, tag, '#787774', e))
  }
  return [...map.values()].map((g) => ({
    ...g,
    amount: Math.round(g.amount * 100) / 100,
    pct: Math.round((g.seconds / totalSeconds) * 1000) / 10,
    amountPct: Math.round((g.amount / totalAmount) * 1000) / 10,
  }))
}

export function computeStats(all: Entry[], period: Period, offset: number, today: string) {
  const range = periodRange(period, offset, today, all)
  const fromKey = dateKey(range.from)
  const toKey = dateKey(range.to)
  const entries = all.filter((t) => t.date >= fromKey && t.date <= toKey)
  const tasks = entries.filter((e) => e.isTask)

  const seconds = entries.reduce((s, t) => s + t.seconds, 0)
  const billableSeconds = entries.filter((t) => t.billable).reduce((s, t) => s + t.seconds, 0)
  const amount = Math.round(entries.reduce((s, t) => s + t.amount, 0) * 100) / 100
  const hourlyAmount = tasks.reduce((s, t) => s + t.amount, 0)
  const paymentsAmount = Math.round((amount - hourlyAmount) * 100) / 100

  // Promedio diario sobre los días del período que ya pasaron.
  const lastDay = toKey > today ? noon(today) : range.to
  const elapsedDays = Math.max(1, Math.round((lastDay.getTime() - range.from.getTime()) / 86400000) + 1)
  const workedDays = new Set(tasks.map((t) => t.date)).size

  // Barras: por día salvo año y todo, que van por mes.
  const bins: Bin[] = []
  const byMonth = period === 'año' || (period === 'todo' && elapsedDays > 62)
  if (byMonth) {
    const cur = new Date(range.from.getFullYear(), range.from.getMonth(), 1, 12)
    while (cur <= range.to) {
      const prefix = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
      const es = entries.filter((t) => t.date.startsWith(prefix))
      bins.push({
        key: prefix,
        label: period === 'año' ? MONTHS_SHORT[cur.getMonth()] : `${MONTHS_SHORT[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`,
        title: `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`,
        seconds: es.reduce((s, t) => s + t.seconds, 0),
        amount: Math.round(es.reduce((s, t) => s + t.amount, 0) * 100) / 100,
        isCurrent: today.startsWith(prefix),
      })
      cur.setMonth(cur.getMonth() + 1)
    }
  } else {
    for (let d = new Date(range.from); d <= range.to; d = addDays(d, 1)) {
      const key = dateKey(d)
      const es = entries.filter((t) => t.date === key)
      bins.push({
        key,
        label: period === 'semana' || period === 'hoy' ? DAY_LETTERS[d.getDay()] : String(d.getDate()),
        title: `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`,
        seconds: es.reduce((s, t) => s + t.seconds, 0),
        amount: Math.round(es.reduce((s, t) => s + t.amount, 0) * 100) / 100,
        isCurrent: key === today,
      })
    }
  }

  return {
    range,
    entries,
    seconds,
    billableSeconds,
    amount,
    paymentsAmount,
    count: tasks.length,
    billablePct: seconds ? Math.round((billableSeconds / seconds) * 100) : 0,
    avgDaily: seconds / elapsedDays,
    avgDailyAmount: amount / elapsedDays,
    perHour: seconds ? amount / (seconds / 3600) : 0,
    workedDays,
    bins,
    byMonth,
  }
}
