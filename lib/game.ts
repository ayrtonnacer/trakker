export type Client = { id: string; name: string; color: string }

/** Proyecto con tarifa propia en USD por hora. clientId null = sin cliente. */
export type Project = { id: string; name: string; clientId: string | null; rate: number; color: string }

export type Task = {
  id: number
  name: string
  client: string // nombre con el que se registró (no cambia si se renombra el cliente)
  project: string
  projectId: string | null
  seconds: number
  billable: boolean
  rate: number // tarifa congelada al cerrar la tarea
  amount: number
  currency: string
  xp: number
  color: string
  tags: string[]
  date: string // AAAA-MM-DD, hora local
  start?: string // HH:MM
  long: boolean
}

export const CURRENCY = 'USD'
export const NO_CLIENT = 'Sin cliente'
export const NO_PROJECT = 'Sin proyecto'
export const NO_PROJECT_COLOR = '#7c8797'

export const PALETTE = ['#e8ad4b', '#67d6b2', '#9b8cff', '#ee7373', '#5fb4f4', '#f08fd0', '#a3d965', '#f4a259', '#4fd1c5', '#c9b6ff']

export const RANKS: [number, string][] = [
  [30, 'Leyenda freelance'],
  [20, 'Maestro del oficio'],
  [15, 'Mercenario'],
  [10, 'Artesano'],
  [5, 'Jornalero'],
  [1, 'Aprendiz'],
]

export const DAILY_GOAL_HOURS = 6

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function dateKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function timeKey(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Oro = horas × tarifa, redondeado a 2 decimales. */
export function goldFor(seconds: number, rate: number) {
  return Math.round((seconds / 3600) * rate * 100) / 100
}

/** 1 XP por minuto; ×1,5 si factura; ×1,25 si es larga; +5 al terminar (+25 si es larga). */
export function xpFor(seconds: number, billable: boolean, long: boolean) {
  const minutes = seconds / 60
  return Math.round(minutes * (billable ? 1.5 : 1) * (long ? 1.25 : 1) + (long ? 25 : 5))
}

/** XP que pide pasar del nivel n al n+1. */
export function xpForLevel(n: number) {
  return Math.round(150 * Math.pow(n, 1.35))
}

export function levelFor(totalXp: number) {
  let level = 1
  let left = totalXp
  while (left >= xpForLevel(level)) {
    left -= xpForLevel(level)
    level++
  }
  return { level, into: left, need: xpForLevel(level) }
}

export function rankFor(level: number) {
  return RANKS.find(([min]) => level >= min)![1]
}

export function nextRank(level: number) {
  const next = [...RANKS].reverse().find(([min]) => min > level)
  return next ? next[1] : 'Rango máximo'
}

export function streakFor(dates: Set<string>) {
  // Si hoy todavía no hay tareas, la racha cuenta hasta ayer.
  const d = new Date()
  if (!dates.has(dateKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (dates.has(dateKey(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

export function fmtClock(total: number) {
  const h = Math.floor(total / 3600).toString().padStart(2, '0')
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0')
  const s = Math.floor(total % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function fmtHours(total: number) {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

export function fmtMoney(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function parseTags(text: string) {
  return [...new Set(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

/** Datos de la tarea según el proyecto elegido, con la tarifa congelada en ese momento. */
export function describeProject(projectId: string | null, projects: Project[], clients: Client[]) {
  const project = projects.find((p) => p.id === projectId) ?? null
  const client = project ? clients.find((c) => c.id === project.clientId) ?? null : null
  return {
    project,
    projectName: project?.name ?? NO_PROJECT,
    clientName: client?.name ?? NO_CLIENT,
    rate: project?.rate ?? 0,
    color: project?.color ?? NO_PROJECT_COLOR,
  }
}

/** Arma una tarea cerrada. Si no factura o no hay tarifa, suma XP y monto 0. */
export function buildTask(input: {
  name: string
  seconds: number
  projectId: string | null
  billable: boolean
  tags: string[]
  long: boolean
  date: string
  start?: string
  projects: Project[]
  clients: Client[]
}): Task {
  const info = describeProject(input.projectId, input.projects, input.clients)
  const paid = input.billable && info.rate > 0
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name: input.name.trim() || 'Tarea sin título',
    client: info.clientName,
    project: info.projectName,
    projectId: info.project?.id ?? null,
    seconds: input.seconds,
    billable: input.billable,
    rate: info.rate,
    amount: paid ? goldFor(input.seconds, info.rate) : 0,
    currency: CURRENCY,
    xp: xpFor(input.seconds, paid, input.long),
    color: info.color,
    tags: input.tags,
    date: input.date,
    start: input.start,
    long: input.long,
  }
}

/** Completa tareas guardadas por versiones anteriores de la app. */
export function migrateTask(t: Partial<Task> & { id: number; seconds: number; amount: number }): Task {
  const rate = t.rate ?? (t.seconds ? Math.round((t.amount / (t.seconds / 3600)) * 100) / 100 : 0)
  return {
    name: 'Tarea sin título', client: NO_CLIENT, project: NO_PROJECT, projectId: null, currency: CURRENCY,
    xp: 0, color: NO_PROJECT_COLOR, tags: [], date: dateKey(), long: false,
    ...t,
    billable: t.billable ?? t.amount > 0,
    rate,
  } as Task
}
