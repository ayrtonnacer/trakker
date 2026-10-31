import { NO_CLIENT, NO_PROJECT, PERSONAL, NO_PROJECT_COLOR, billingOf, dateKey, paymentClientId, paymentKind, type Client, type Payment, type Project, type Task } from './game'

export type Period = 'hoy' | 'semana' | 'mes' | 'trimestre' | 'año' | 'todo'

export const PERIODS: { id: Period; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'trimestre', label: 'Trimestre' },
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
  /** Segundos que entran en el "valor de la hora" y lo que valen: ver `withHourlyValue`. */
  valueSeconds: number
  imputed: number
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
  const names = (projectId: string | null, fallbackProject: string, fallbackClient: string, fallbackColor: string, clientId: string | null = null) => {
    const p = projectId ? projectById.get(projectId) : undefined
    // Un bonus de plataforma no tiene proyecto: se muestra con el nombre y color de su plataforma.
    if (!p && clientId && clientById.get(clientId)) return { project: fallbackProject, client: clientById.get(clientId)!.name, color: clientById.get(clientId)!.color }
    if (!p) return { project: fallbackProject, client: fallbackClient, color: fallbackColor }
    const c = p.clientId ? clientById.get(p.clientId) : undefined
    return { project: p.name, client: c?.name ?? PERSONAL, color: p.color }
  }
  const fromTasks = tasks.map((t) => ({
    date: t.date, seconds: t.seconds, amount: t.amount, billable: t.billable, projectId: t.projectId,
    name: t.name, tags: t.tags, isTask: true, valueSeconds: 0, imputed: 0, ...names(t.projectId, t.project, t.client, t.color),
  }))
  // Los pagos por horas (payout) no entran: esas horas ya están en las tareas. Sólo cuentan como cobrado.
  const fromPayments = payments.filter((p) => p.paid && paymentKind(p) !== 'payout').map((p) => ({
    date: p.date, seconds: 0, amount: p.amount, billable: true, projectId: p.projectId,
    name: p.label || 'Pago', tags: [], isTask: false, valueSeconds: 0, imputed: 0, ...names(p.projectId, NO_PROJECT, NO_CLIENT, NO_PROJECT_COLOR, p.projectId ? null : paymentClientId(p, projects)),
  }))
  return withHourlyValue([...fromTasks, ...fromPayments], projectById)
}

/**
 * Valor de la hora que no depende de cuándo cobrás. Por hora: lo que dio la tarea. Presupuesto o
 * entrega: lo cobrado en todo el proyecto ÷ sus horas facturables, aplicado a las horas de cada
 * tarea (así un pago grande no infla la semana en que llega). Un presupuesto que todavía no
 * terminó ni se cobró completo, o que no cobró nada, queda afuera hasta que haya con qué medirlo.
 */
function withHourlyValue(entries: Entry[], projectById: Map<string, Project>): Entry[] {
  const totals = new Map<string, { seconds: number; paid: number }>()
  for (const e of entries) {
    if (!e.projectId) continue
    const t = totals.get(e.projectId) ?? { seconds: 0, paid: 0 }
    if (e.billable) t.seconds += e.seconds
    t.paid += e.amount
    totals.set(e.projectId, t)
  }
  const rateOf = (projectId: string | null) => {
    const p = projectId ? projectById.get(projectId) : undefined
    const t = projectId ? totals.get(projectId) : undefined
    if (!p || !t || t.seconds <= 0 || t.paid <= 0) return 0
    const billing = billingOf(p)
    if (billing === 'interno') return 0
    if (billing === 'fijo' && (p.price ?? 0) > 0 && p.status !== 'terminado' && t.paid < (p.price ?? 0)) return 0
    return t.paid / (t.seconds / 3600)
  }
  return entries.map((e) => {
    if (!e.isTask || !e.billable || e.seconds <= 0) return e
    const p = e.projectId ? projectById.get(e.projectId) : undefined
    if (p && billingOf(p) === 'hora') return e.amount > 0 ? { ...e, valueSeconds: e.seconds, imputed: e.amount } : e
    const rate = rateOf(e.projectId)
    return rate > 0 ? { ...e, valueSeconds: e.seconds, imputed: (e.seconds / 3600) * rate } : e
  })
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
  if (period === 'trimestre') {
    const q = Math.floor(t.getMonth() / 3) + offset
    const from = new Date(t.getFullYear(), q * 3, 1, 12)
    const to = new Date(from.getFullYear(), from.getMonth() + 3, 0, 12)
    return { from, to, label: `${MONTHS_SHORT[from.getMonth()]} – ${MONTHS_SHORT[to.getMonth()]} ${to.getFullYear()}` }
  }
  if (period === 'año') {
    const y = t.getFullYear() + offset
    return { from: new Date(y, 0, 1, 12), to: new Date(y, 11, 31, 12), label: String(y) }
  }
  const first = entries.reduce((min, x) => (x.date < min ? x.date : min), today)
  return { from: noon(first), to: t, label: 'Desde el principio' }
}

export type Group = { key: string; name: string; color: string; seconds: number; amount: number; billableSeconds: number; valueSeconds: number; imputed: number; count: number; pct: number; amountPct: number }
export type Bin = { key: string; label: string; title: string; seconds: number; amount: number; isCurrent: boolean }

export type GroupBy = 'cliente' | 'proyecto' | 'etiqueta' | 'tarea'

export function groupEntries(entries: Entry[], by: GroupBy, clientColors: Map<string, string>): Group[] {
  const map = new Map<string, Group>()
  const totalSeconds = entries.reduce((s, t) => s + t.seconds, 0) || 1
  const totalAmount = entries.reduce((s, t) => s + t.amount, 0) || 1
  const add = (key: string, name: string, color: string, e: Entry) => {
    const g = map.get(key) ?? { key, name, color, seconds: 0, amount: 0, billableSeconds: 0, valueSeconds: 0, imputed: 0, count: 0, pct: 0, amountPct: 0 }
    g.seconds += e.seconds
    g.amount += e.amount
    if (e.billable) g.billableSeconds += e.seconds
    g.valueSeconds += e.valueSeconds
    g.imputed += e.imputed
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
  const valueSeconds = entries.reduce((s, t) => s + t.valueSeconds, 0)
  const imputed = entries.reduce((s, t) => s + t.imputed, 0)
  const workedDays = new Set(tasks.map((t) => t.date)).size
  // Tarifa efectiva: lo ganado en plataformas ÷ todas sus horas, incluido el tiempo no pago.
  const onPlatform = entries.filter((e) => e.client !== PERSONAL && e.client !== NO_CLIENT)
  const platformSeconds = onPlatform.reduce((s, e) => s + e.seconds, 0)
  const platformAmount = onPlatform.reduce((s, e) => s + e.amount, 0)
  const unpaidSeconds = onPlatform.filter((e) => e.isTask && !e.billable).reduce((s, e) => s + e.seconds, 0)

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
    perHour: valueSeconds ? imputed / (valueSeconds / 3600) : 0,
    effectiveRate: platformSeconds > 0 && platformAmount > 0 ? platformAmount / (platformSeconds / 3600) : 0,
    unpaidSeconds,
    workedDays,
    bins,
    byMonth,
  }
}

/** Tiempo por día de la semana (lunes primero) y hora del día. */
export type HourProfile = { grid: number[][]; byHour: number[]; total: number; best: { from: number; to: number; pct: number } | null }

const BEST_WINDOW = 3

/**
 * Reparte cada tarea entre las horas que ocupó, desde su hora de inicio. Si cruza la medianoche,
 * lo que sigue va al día siguiente. Las tareas sin hora de inicio (cargadas sin “Desde”) no cuentan.
 */
export function hourProfile(tasks: { date: string; start?: string; seconds: number }[]): HourProfile {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const t of tasks) {
    const m = t.start?.match(/^(\d{1,2}):(\d{2})$/)
    if (!m || t.seconds <= 0) continue
    let row = (noon(t.date).getDay() + 6) % 7
    let hour = Number(m[1]) % 24
    let offset = Number(m[2]) * 60
    let left = t.seconds
    while (left > 0) {
      const chunk = Math.min(left, 3600 - offset)
      grid[row][hour] += chunk
      left -= chunk
      offset = 0
      hour++
      if (hour === 24) { hour = 0; row = (row + 1) % 7 }
    }
  }
  const byHour = Array.from({ length: 24 }, (_, h) => grid.reduce((s, r) => s + r[h], 0))
  const total = byHour.reduce((s, v) => s + v, 0)
  let best: HourProfile['best'] = null
  if (total > 0) {
    let top = -1
    for (let h = 0; h <= 24 - BEST_WINDOW; h++) {
      const sum = byHour.slice(h, h + BEST_WINDOW).reduce((s, v) => s + v, 0)
      if (sum > top) { top = sum; best = { from: h, to: h + BEST_WINDOW, pct: Math.round((sum / total) * 100) } }
    }
  }
  return { grid, byHour, total, best }
}

const PREV_LABEL: Partial<Record<Period, string>> = { hoy: 'ayer', semana: 'la semana anterior', mes: 'el mes anterior', trimestre: 'el trimestre anterior', año: 'el año anterior' }

/**
 * El período anterior, para comparar. Si el actual está en curso, se toma el mismo tramo del anterior
 * (de lunes a jueves contra lunes a jueves), así una semana a medias no parece peor que una completa.
 */
export function previousStats(all: Entry[], period: Period, offset: number, today: string) {
  const label = PREV_LABEL[period]
  if (!label) return null
  const cur = periodRange(period, offset, today, all)
  const prev = periodRange(period, offset - 1, today, all)
  const curEnd = dateKey(cur.to) > today ? noon(today) : cur.to
  const partial = curEnd < cur.to
  const span = Math.round((curEnd.getTime() - cur.from.getTime()) / 86400000)
  const prevEnd = partial && addDays(prev.from, span) < prev.to ? addDays(prev.from, span) : prev.to
  const from = dateKey(prev.from), to = dateKey(prevEnd)
  const es = all.filter((e) => e.date >= from && e.date <= to)
  const onPlatform = es.filter((e) => e.client !== PERSONAL && e.client !== NO_CLIENT)
  const platformSeconds = onPlatform.reduce((s, e) => s + e.seconds, 0)
  const platformAmount = onPlatform.reduce((s, e) => s + e.amount, 0)
  return {
    label: partial ? `${label} a esta altura` : label,
    seconds: es.reduce((s, e) => s + e.seconds, 0),
    amount: Math.round(es.reduce((s, e) => s + e.amount, 0) * 100) / 100,
    effectiveRate: platformSeconds > 0 && platformAmount > 0 ? platformAmount / (platformSeconds / 3600) : 0,
  }
}

/** Variación porcentual redondeada; null si no hay con qué comparar. */
export function change(now: number, before: number) {
  return before > 0 ? Math.round(((now - before) / before) * 100) : null
}
