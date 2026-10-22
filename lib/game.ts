export type Link = { label: string; url: string }

export type ClientStatus = 'activo' | 'potencial' | 'pausado'

export type Client = { id: string; name: string; color: string; links?: Link[]; notes?: string; status?: ClientStatus; contact?: string; email?: string; since?: string }

/**
 * Cómo se cobra un proyecto:
 * - hora: tarifa en USD por hora, el monto sale del tiempo registrado.
 * - fijo: precio total acordado, se cobra en pagos (ej. 50% adelanto + 50% al entregar).
 * - entrega: precio por entrega/unidad, cada entrega cobrada se carga como pago.
 * - interno: trabajo para vos (mejorar la web, mandar propuestas). Sólo suma tiempo.
 */
export type Billing = 'hora' | 'fijo' | 'entrega' | 'interno'

/** Activo = en curso; terminado = se esconde del selector y de la lista por defecto. */
export type ProjectStatus = 'activo' | 'pausado' | 'terminado'

/** Proyecto. clientId null = sin cliente. rate = USD/h (hora) o USD por entrega (entrega). price = total (fijo). */
export type Project = { id: string; name: string; clientId: string | null; rate: number; color: string; billing?: Billing; price?: number; status?: ProjectStatus }

/** Plata cobrada (o por cobrar) que no sale de las horas: adelantos, hitos, entregas. */
export type Payment = { id: string; projectId: string | null; label: string; amount: number; date: string; paid: boolean }

export type Task = {
  id: number
  name: string
  client: string // nombre con el que se registró (se actualiza al renombrar)
  project: string
  projectId: string | null
  seconds: number
  billable: boolean
  rate: number // tarifa congelada al cerrar la tarea
  amount: number
  currency: string
  color: string
  tags: string[]
  date: string // AAAA-MM-DD, hora local
  start?: string // HH:MM
  long: boolean
  note?: string // memo: qué se hizo, para acordarse, exportar o mostrarle al cliente
  routineId?: string // si salió de una rutina, para saber que ya se hizo hoy
}

export type Action = { id: string; text: string; done: boolean }

/** Meta de ingresos: subir `pct`% sobre `baseline` (USD/mes) en `months` meses desde `start` (AAAA-MM). */
export type Goal = { baseline: number; pct: number; months: number; start: string; milestones: number[]; actions: Action[] }

/** date vacío = backlog: tarea pendiente sin día asignado. */
export type PlanItem = { id: string; date: string; text: string; projectId: string | null; hours: number; done: boolean }

/** Tarea que se repite ciertos días de la semana (0 = domingo … 6 = sábado). */
export type Routine = { id: string; text: string; projectId: string | null; days: number[]; tags: string[] }

export const CURRENCY = 'USD'
export const NO_CLIENT = 'Sin cliente'
/** Cómo se muestran los proyectos sin cliente: los propios (LinkedIn, CV, tu web). */
export const PERSONAL = 'Personal'
export const NO_PROJECT = 'Sin proyecto'
export const NO_PROJECT_COLOR = '#9b9a97'

// Colores apagados, estilo Notion: sólo se usan en puntitos y barras finas.
export const PALETTE = ['#2f6f9f', '#448361', '#9065b0', '#d9730d', '#c14c8a', '#cb912f', '#d44c47', '#64473a', '#337ea9', '#787774']

export const BILLING_LABEL: Record<Billing, string> = {
  hora: 'Por hora',
  fijo: 'Presupuesto',
  entrega: 'Por entrega',
  interno: 'Personal',
}

export const DAILY_GOAL_HOURS = 6

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function dateKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function monthKey(d = new Date()) {
  return dateKey(d).slice(0, 7)
}

export function timeKey(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function billingOf(p: Project | null | undefined): Billing {
  return p?.billing ?? 'hora'
}

/** Monto por tiempo = horas × tarifa, redondeado a 2 decimales. */
export function goldFor(seconds: number, rate: number) {
  return Math.round((seconds / 3600) * rate * 100) / 100
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
  const h = Math.floor(total / 3600)
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

/** Monto redondo cuando no tiene centavos: 1.500 en vez de 1.500,00. */
export function fmtShort(n: number) {
  return n.toLocaleString('es-AR', { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 })
}

export function parseTags(text: string) {
  return [...new Set(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

export function parseAmount(text: string) {
  // "1.500,50" (es-AR) o "1500.50": si hay coma, los puntos son de miles.
  const t = text.trim().replace(/\s|US\$|\$/g, '')
  const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return Math.max(0, Number(n) || 0)
}

export function normalizeUrl(url: string) {
  const u = url.trim()
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

/** Datos de la tarea según el proyecto elegido, con la tarifa congelada en ese momento. */
export function describeProject(projectId: string | null, projects: Project[], clients: Client[]) {
  const project = projects.find((p) => p.id === projectId) ?? null
  const client = project ? clients.find((c) => c.id === project.clientId) ?? null : null
  const billing = billingOf(project)
  return {
    project,
    client,
    billing,
    projectName: project?.name ?? NO_PROJECT,
    clientName: client?.name ?? NO_CLIENT,
    // Sólo los proyectos por hora convierten tiempo en plata.
    rate: project && billing === 'hora' ? project.rate : 0,
    color: project?.color ?? NO_PROJECT_COLOR,
  }
}

/** Los proyectos personales nunca se facturan: no tiene sentido marcar el $. */
export function canBill(projectId: string | null, projects: Project[]) {
  const p = projects.find((x) => x.id === projectId)
  return !p || billingOf(p) !== 'interno'
}

/** Si trabajás para un cliente, son horas que le dedicás: arranca como facturable. */
export function defaultBillable(projectId: string | null, projects: Project[], clients: Client[]) {
  const { project, client, billing } = describeProject(projectId, projects, clients)
  return !!project && !!client && billing !== 'interno'
}

/** Arma una tarea cerrada. Si no factura por hora, suma tiempo con monto 0. */
export function buildTask(input: {
  id?: number
  name: string
  seconds: number
  projectId: string | null
  billable: boolean
  tags: string[]
  date: string
  start?: string
  rate?: number // para respetar la tarifa congelada al editar
  note?: string
  routineId?: string
  projects: Project[]
  clients: Client[]
}): Task {
  const info = describeProject(input.projectId, input.projects, input.clients)
  const rate = input.rate ?? info.rate
  const billable = input.billable && canBill(input.projectId, input.projects)
  const amount = billable && rate > 0 ? goldFor(input.seconds, rate) : 0
  const note = input.note?.trim()
  return {
    id: input.id ?? Date.now() + Math.floor(Math.random() * 1000),
    name: input.name.trim() || 'Tarea sin título',
    client: info.clientName,
    project: info.projectName,
    projectId: info.project?.id ?? null,
    seconds: input.seconds,
    billable,
    rate,
    amount,
    currency: CURRENCY,
    color: info.color,
    tags: input.tags,
    date: input.date,
    start: input.start,
    long: false,
    ...(note ? { note } : {}),
    ...(input.routineId ? { routineId: input.routineId } : {}),
  }
}

/** Completa tareas guardadas por versiones anteriores. */
export function migrateTask(raw: Partial<Task> & { id: number; seconds: number; amount: number }): Task {
  // Versiones anteriores guardaban XP: ya no se usa.
  const { xp: _xp, ...t } = raw as typeof raw & { xp?: number }
  const rate = t.rate ?? (t.seconds ? Math.round((t.amount / (t.seconds / 3600)) * 100) / 100 : 0)
  return {
    name: 'Tarea sin título', client: NO_CLIENT, project: NO_PROJECT, projectId: null, currency: CURRENCY,
    color: NO_PROJECT_COLOR, tags: [], date: dateKey(), long: false,
    ...t,
    billable: t.billable ?? t.amount > 0,
    rate,
  } as Task
}

/** Sin cliente = proyecto personal: suma tiempo, nunca plata. */
export function migrateProject(p: Project): Project {
  return p.clientId ? p : { ...p, billing: 'interno', rate: 0, price: 0 }
}

/** Total cobrado (horas + pagos) en el mes AAAA-MM. */
export function monthEarnings(month: string, tasks: Task[], payments: Payment[]) {
  const fromTasks = tasks.filter((t) => t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0)
  const fromPayments = payments.filter((p) => p.paid && p.date.startsWith(month)).reduce((s, p) => s + p.amount, 0)
  return Math.round((fromTasks + fromPayments) * 100) / 100
}

export function addMonths(month: string, n: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1, 12)
  return monthKey(d)
}

export function monthsBetween(a: string, b: string) {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

/** Promedio de ingresos de los 3 meses completos anteriores a `month`. */
export function suggestedBaseline(month: string, tasks: Task[], payments: Payment[]) {
  const values = [1, 2, 3].map((i) => monthEarnings(addMonths(month, -i), tasks, payments))
  const withData = values.filter((v) => v > 0)
  return withData.length ? Math.round(withData.reduce((s, v) => s + v, 0) / withData.length) : 0
}

/**
 * Objetivo de ingresos para un mes: sube en línea recta desde la base hasta base × (1 + pct)
 * en el último mes del plan. Antes del plan no hay objetivo; después se mantiene el final.
 */
export function goalTarget(goal: Goal | null, month: string) {
  if (!goal || goal.baseline <= 0) return 0
  const i = monthsBetween(goal.start, month) + 1
  if (i < 1) return 0
  const step = Math.min(i, goal.months) / Math.max(1, goal.months)
  return Math.round(goal.baseline * (1 + (goal.pct / 100) * step))
}

/** Micro objetivos por defecto: 25%, 50% y 75% del objetivo. */
export const DEFAULT_MILESTONES = [0.25, 0.5, 0.75]

/** Micro objetivos del mes: los que cargó el usuario o, si no hay, el 25%, 50% y 75% del objetivo. */
export function milestonesFor(goal: Goal | null, target: number) {
  const own = (goal?.milestones ?? []).filter((m) => m > 0 && m < target).sort((a, b) => a - b)
  if (own.length) return own
  return target > 0 ? DEFAULT_MILESTONES.map((f) => Math.round(target * f)) : []
}
