export type Link = { label: string; url: string }

/**
 * Embudo de búsqueda de trabajo en una plataforma, más el estado una vez adentro.
 * Búsqueda: en vista → aplicado → evaluación → onboarding. Adentro: activo ⇄ en pausa. Salidas: rechazado, finalizado.
 * 'prospecto' / 'potencial' / 'cerrado' son nombres de versiones anteriores: ver clientStatus().
 */
export type ClientStatus = 'vista' | 'aplicado' | 'evaluacion' | 'onboarding' | 'activo' | 'pausado' | 'rechazado' | 'finalizado' | 'prospecto' | 'potencial' | 'cerrado'
export type Stage = Exclude<ClientStatus, 'prospecto' | 'potencial' | 'cerrado'>

/**
 * Para un tasker lo que importa es cuántas cuentas tiene andando, cuántas postulaciones esperan
 * respuesta y cuántas lo rechazaron: tener varias cuentas activas es lo que lo protege cuando una se queda sin tareas.
 */
export type AccountBucket = 'cuenta' | 'proceso' | 'rechazado' | 'finalizado'
export const ACCOUNT_BUCKETS: { id: AccountBucket; label: string; help: string; stages: Stage[] }[] = [
  { id: 'cuenta', label: 'Con cuenta', help: 'Activas o en pausa: ya podés taskear', stages: ['activo', 'pausado'] },
  { id: 'proceso', label: 'Aplicadas', help: 'En vista, aplicado, evaluación u onboarding', stages: ['vista', 'aplicado', 'evaluacion', 'onboarding'] },
  { id: 'rechazado', label: 'Rechazadas', help: 'No pasaste o no respondieron', stages: ['rechazado'] },
  { id: 'finalizado', label: 'Cerradas', help: 'Trabajaste ahí y terminó', stages: ['finalizado'] },
]
/** Cuentas activas a partir de las que ya no se sugiere sumar otra plataforma. */
export const MIN_ACCOUNTS = 3

export function accountBucket(c: { status?: ClientStatus } | null | undefined): AccountBucket {
  const st = clientStatus(c)
  return ACCOUNT_BUCKETS.find((b) => b.stages.includes(st))!.id
}

export const CLIENT_STATUSES: { id: Stage; label: string; help: string }[] = [
  { id: 'vista', label: 'En vista', help: 'La viste o te la recomendaron; todavía no aplicaste' },
  { id: 'aplicado', label: 'Aplicado', help: 'Te registraste o mandaste la postulación; esperás respuesta' },
  { id: 'evaluacion', label: 'Evaluación', help: 'Entrevista, test de habilidades o assessment' },
  { id: 'onboarding', label: 'Onboarding', help: 'Te aceptaron: cursos, verificación de identidad, contrato, cuenta por activar' },
  { id: 'activo', label: 'Activo', help: 'Hay tareas y estás taskeando' },
  { id: 'pausado', label: 'En pausa', help: 'Adentro, pero sin taskear: no hay tareas o frenaste vos' },
  { id: 'rechazado', label: 'Rechazado', help: 'No pasaste la evaluación o no respondieron' },
  { id: 'finalizado', label: 'Finalizado', help: 'Trabajaste ahí y terminó: proyecto cerrado, cuenta dada de baja o lo dejaste' },
]

export function clientStatus(c: { status?: ClientStatus } | null | undefined): Stage {
  const s = c?.status ?? 'activo'
  return s === 'potencial' || s === 'prospecto' ? 'vista' : s === 'cerrado' ? 'finalizado' : s
}

/** Días sin taskear a partir de los que una plataforma activa se sugiere como en pausa. */
export const IDLE_DAYS = 14

/** Plataforma. payer = nombre con que aparece el pago (ej. Outlier paga como “Scale AI, Inc.”); payDay = cuándo pagan. */
export type Client = { id: string; name: string; color: string; links?: Link[]; notes?: string; status?: ClientStatus; contact?: string; email?: string; since?: string; payer?: string; payMethod?: string; payDay?: string }

/** Cómo te llega la plata: se usa para sugerir el método al registrar un pago. */
export const PAY_METHODS = ['Airtm', 'PayPal', 'Payoneer', 'Wise', 'Transferencia', 'Otro']

export type LinkKind = 'slack' | 'meet' | 'doc' | 'manual' | 'pago' | 'plataforma' | 'otro'

export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  slack: 'Slack', meet: 'Reunión', doc: 'Documento', manual: 'Manual', pago: 'Pagos', plataforma: 'Plataforma', otro: 'Link',
}

/** Adivina qué es un link por la URL o el nombre, para mostrarlo con su ícono sin pedirle nada al usuario. */
export function linkKind(l: Link): LinkKind {
  const text = `${l.label} ${l.url}`.toLowerCase()
  if (/slack\.com|\bslack\b/.test(text)) return 'slack'
  if (/meet\.google|zoom\.us|teams\.microsoft|teams\.live|whereby|\bmeet\b|reuni[oó]n|\bzoom\b/.test(text)) return 'meet'
  if (/manual|gu[ií]a|guideline|instruc|handbook|playbook|\bsop\b/.test(text)) return 'manual'
  if (/earnings|payments?|pagos?|invoice|factura|payout|cobros?/.test(text)) return 'pago'
  if (/docs\.google|drive\.google|notion\.|dropbox|\.pdf|confluence|airtable|sheets\.google|\bdoc\b|documento/.test(text)) return 'doc'
  return /platform|plataforma|app\.|dashboard/.test(text) ? 'plataforma' : 'otro'
}

/** Links a mano para un proyecto: los suyos primero y después los de su cliente/plataforma, sin repetir. */
export function resourceLinks(project: Project | null | undefined, client: Client | null | undefined): Link[] {
  const seen = new Set<string>()
  return [...(project?.links ?? []), ...(client?.links ?? [])].filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)))
}

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
export type Project = { id: string; name: string; clientId: string | null; rate: number; color: string; billing?: Billing; price?: number; status?: ProjectStatus; links?: Link[] }

/**
 * - cobro: adelanto, hito o entrega de un proyecto por presupuesto o entrega (suma a lo ganado y a lo cobrado).
 * - payout: lo que la plataforma te pagó por horas. Las horas ya suman a lo ganado: acá sólo cuenta como cobrado.
 * - bonus: premios y misiones (ej. Outlier Rewards): suma a lo ganado y a lo cobrado.
 */
export type PaymentKind = 'cobro' | 'payout' | 'bonus'

/**
 * Plata cobrada (o por cobrar) que no sale de las horas. Un payout o bonus de plataforma lleva clientId;
 * from/to es el período de trabajo que cubre, hours lo que la plataforma dice que pagó y fee la comisión del método.
 */
export type Payment = {
  id: string
  projectId: string | null
  label: string
  amount: number
  date: string
  paid: boolean
  clientId?: string | null
  kind?: PaymentKind
  method?: string
  fee?: number
  hours?: number
  from?: string
  to?: string
}

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = { cobro: 'Cobro', payout: 'Pago por horas', bonus: 'Bonus' }

export function paymentKind(p: Payment): PaymentKind {
  return p.kind ?? 'cobro'
}

/** La plataforma a la que pertenece un pago: la suya o la del proyecto. */
export function paymentClientId(p: Payment, projects: Project[]) {
  return p.clientId ?? projects.find((x) => x.id === p.projectId)?.clientId ?? null
}

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
  note?: string // memo: indicaciones de la tarea, qué se hizo, para acordarse o exportar
  ref?: string // Task ID de la plataforma (ej. el UUID de Outlier)
  routineId?: string // si salió de una rutina, para saber que ya se hizo hoy
}

export type Action = { id: string; text: string; done: boolean }

/**
 * Meta de ingresos: subir `pct`% sobre `baseline` (USD/mes) en `months` meses desde `start` (AAAA-MM).
 * Si hay `fixed`, la meta es un monto fijo por mes (ej. 5.000 USD) desde `start` y `pct` no se usa.
 */
export type Goal = { baseline: number; pct: number; months: number; start: string; milestones: number[]; actions: Action[]; fixed?: number }

/** date vacío = backlog: tarea pendiente sin día asignado. */
export type PlanItem = { id: string; date: string; text: string; projectId: string | null; hours: number; done: boolean; note?: string }

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

/** Saludo según la hora: de 6 a 12 buenos días, de 12 a 20 buenas tardes, el resto buenas noches. */
export function greetingFor(hour: number) {
  return hour >= 6 && hour < 12 ? 'Buenos días' : hour >= 12 && hour < 20 ? 'Buenas tardes' : 'Buenas noches'
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

/** Un Task ID pegado: UUID, hash o código largo sin espacios y con números. */
export function looksLikeId(text: string) {
  const t = text.trim()
  return t.length >= 8 && t.length <= 80 && !/\s/.test(t) && /\d/.test(t) && /^[\w-]+$/.test(t)
}

export function shortRef(ref: string) {
  return ref.length > 10 ? `${ref.slice(0, 8)}…` : ref
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
  ref?: string
  routineId?: string
  projects: Project[]
  clients: Client[]
}): Task {
  const info = describeProject(input.projectId, input.projects, input.clients)
  const rate = input.rate ?? info.rate
  const billable = input.billable && canBill(input.projectId, input.projects)
  const amount = billable && rate > 0 ? goldFor(input.seconds, rate) : 0
  const note = input.note?.trim()
  const ref = input.ref?.trim()
  return {
    id: input.id ?? Date.now() + Math.floor(Math.random() * 1000),
    name: input.name.trim() || (ref ? `Task ${shortRef(ref)}` : 'Tarea sin título'),
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
    ...(ref ? { ref } : {}),
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

/** Lo ganado (estimado) en el mes AAAA-MM: horas × tarifa + cobros y bonus. Los payouts no suman: sus horas ya están. */
export function monthEarnings(month: string, tasks: Task[], payments: Payment[]) {
  const fromTasks = tasks.filter((t) => t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0)
  const fromPayments = payments.filter((p) => p.paid && paymentKind(p) !== 'payout' && p.date.startsWith(month)).reduce((s, p) => s + p.amount, 0)
  return Math.round((fromTasks + fromPayments) * 100) / 100
}

/** Lo que de verdad te pagaron en el mes AAAA-MM (bruto, antes de la comisión del método). */
export function monthCollected(month: string, payments: Payment[]) {
  return Math.round(payments.filter((p) => p.paid && p.date.startsWith(month)).reduce((s, p) => s + p.amount, 0) * 100) / 100
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
  if (!goal || (goal.baseline <= 0 && !(goal.fixed && goal.fixed > 0))) return 0
  const i = monthsBetween(goal.start, month) + 1
  if (i < 1) return 0
  if (goal.fixed && goal.fixed > 0) return Math.round(goal.fixed)
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
