// Plata de verdad vs plata estimada, por plataforma: conciliación de pagos, tarifa efectiva y concentración.
import { billingOf, dateKey, paymentClientId, paymentKind, type Client, type Payment, type Project, type Task } from './game'

const r2 = (n: number) => Math.round(n * 100) / 100

/** Tareas de una plataforma: las de sus proyectos y las sueltas que se registraron con su nombre. */
export function clientTasks(client: Client, projects: Project[], tasks: Task[]) {
  const ids = new Set(projects.filter((p) => p.clientId === client.id).map((p) => p.id))
  return tasks.filter((t) => (t.projectId ? ids.has(t.projectId) : t.client === client.name))
}

export type PlatformFinance = {
  seconds: number // todo el tiempo en la plataforma, pago o no
  billableSeconds: number
  unpaidSeconds: number // tiempo no facturable: assessments, onboarding sin pago, esperas
  estimated: number // horas × tarifa
  extra: number // cobros de presupuesto/entrega y bonus
  earned: number // estimated + extra
  collected: number // todo lo que efectivamente te pagaron (bruto)
  fees: number
  net: number
  awaiting: number // horas trabajadas después del último pago recibido: todavía no te las pagaron
  billableRate: number // ganado ÷ horas facturables
  effectiveRate: number // lo mismo pero contando también el tiempo no pago
  effectiveIsReal: boolean // true si sale de lo cobrado; false si sale de lo estimado
}

export function platformFinance(client: Client, projects: Project[], tasks: Task[], payments: Payment[]): PlatformFinance {
  const ts = clientTasks(client, projects, tasks)
  const ps = payments.filter((p) => p.paid && paymentClientId(p, projects) === client.id)
  const seconds = ts.reduce((s, t) => s + t.seconds, 0)
  const billableSeconds = ts.filter((t) => t.billable).reduce((s, t) => s + t.seconds, 0)
  const estimated = ts.reduce((s, t) => s + t.amount, 0)
  const extra = ps.filter((p) => paymentKind(p) !== 'payout').reduce((s, p) => s + p.amount, 0)
  const collected = ps.reduce((s, p) => s + p.amount, 0)
  const fees = ps.reduce((s, p) => s + (p.fee ?? 0), 0)
  const payouts = ps.filter((p) => paymentKind(p) === 'payout')
  const lastTo = payouts.reduce((m, p) => ((p.to ?? p.date) > m ? (p.to ?? p.date) : m), '')
  const awaiting = payouts.length ? ts.filter((t) => t.date > lastTo).reduce((s, t) => s + t.amount, 0) : 0
  const earned = estimated + extra
  const hasPayouts = payouts.length > 0
  // Con pagos registrados, lo real es lo cobrado; sin ellos, lo estimado.
  const base = hasPayouts ? collected : earned
  return {
    seconds, billableSeconds, unpaidSeconds: seconds - billableSeconds, estimated: r2(estimated), extra: r2(extra), earned: r2(earned),
    collected: r2(collected), fees: r2(fees), net: r2(collected - fees), awaiting: r2(awaiting),
    billableRate: billableSeconds > 0 ? r2(earned / (billableSeconds / 3600)) : 0,
    effectiveRate: seconds > 0 && base > 0 ? r2(base / (seconds / 3600)) : 0,
    effectiveIsReal: hasPayouts,
  }
}

export type ReconRow = {
  payment: Payment
  from: string
  to: string
  seconds: number // tus horas facturables del período
  estimated: number // lo que calculó Tasker CRM
  paid: number // lo que te pagó la plataforma
  paidHours: number | null // horas que dice la plataforma, si las anotaste
  diff: number // paid − estimated
  diffPct: number
  taskIds: string[]
}

/** Un pago por horas contra el trabajo del período que cubre. Sin período, cubre desde el pago anterior. */
export function reconcile(client: Client, projects: Project[], tasks: Task[], payments: Payment[]): ReconRow[] {
  const ts = clientTasks(client, projects, tasks)
  const payouts = payments
    .filter((p) => p.paid && paymentKind(p) === 'payout' && paymentClientId(p, projects) === client.id)
    .sort((a, b) => a.date.localeCompare(b.date))
  let prevEnd = ''
  return payouts.map((p) => {
    const to = p.to || p.date
    const from = p.from || (prevEnd ? nextDay(prevEnd) : '0000-00-00')
    prevEnd = to > prevEnd ? to : prevEnd
    const inRange = ts.filter((t) => t.date >= from && t.date <= to)
    const estimated = r2(inRange.reduce((s, t) => s + t.amount, 0))
    const seconds = inRange.filter((t) => t.billable).reduce((s, t) => s + t.seconds, 0)
    const diff = r2(p.amount - estimated)
    return {
      payment: p, from: p.from || (from === '0000-00-00' ? '' : from), to, seconds, estimated, paid: p.amount, paidHours: p.hours ?? null, diff,
      diffPct: estimated > 0 ? Math.round((diff / estimated) * 1000) / 10 : 0,
      taskIds: inRange.filter((t) => t.ref).map((t) => t.ref!),
    }
  })
}

function nextDay(key: string) {
  const d = new Date(`${key}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return dateKey(d)
}

export type Share = { id: string; name: string; color: string; amount: number; pct: number }

/** Cuánto de lo ganado en los últimos `days` días viene de cada plataforma. */
export function concentration(clients: Client[], projects: Project[], tasks: Task[], payments: Payment[], today: string, days: number): Share[] {
  const d = new Date(`${today}T12:00:00`)
  d.setDate(d.getDate() - days + 1)
  const from = dateKey(d)
  const byClient = new Map<string, number>()
  const add = (id: string | null, n: number) => { if (id && n > 0) byClient.set(id, (byClient.get(id) ?? 0) + n) }
  const idOf = new Map(projects.map((p) => [p.id, p.clientId]))
  const byName = new Map(clients.map((c) => [c.name, c.id]))
  tasks.filter((t) => t.date >= from && t.date <= today).forEach((t) => add(t.projectId ? idOf.get(t.projectId) ?? null : byName.get(t.client) ?? null, t.amount))
  payments.filter((p) => p.paid && paymentKind(p) !== 'payout' && p.date >= from && p.date <= today).forEach((p) => add(paymentClientId(p, projects), p.amount))
  const total = [...byClient.values()].reduce((s, v) => s + v, 0)
  return clients
    .filter((c) => byClient.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, color: c.color, amount: r2(byClient.get(c.id)!), pct: total > 0 ? Math.round((byClient.get(c.id)! / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount)
}

/** Umbral de alerta: una sola plataforma con más de esta parte de tus ingresos. */
export const CONCENTRATION_LIMIT = 60

/** Tarifa efectiva global de los últimos `days` días: todo lo ganado en plataformas ÷ todas sus horas, pagas o no. */
export function effectiveRate(projects: Project[], tasks: Task[], payments: Payment[], today: string, days: number) {
  const d = new Date(`${today}T12:00:00`)
  d.setDate(d.getDate() - days + 1)
  const from = dateKey(d)
  const onPlatform = new Set(projects.filter((p) => p.clientId && billingOf(p) !== 'interno').map((p) => p.id))
  const ts = tasks.filter((t) => t.date >= from && t.date <= today && t.projectId && onPlatform.has(t.projectId))
  const seconds = ts.reduce((s, t) => s + t.seconds, 0)
  const extra = payments.filter((p) => p.paid && paymentKind(p) !== 'payout' && p.date >= from && p.date <= today && (onPlatform.has(p.projectId ?? '') || paymentKind(p) === 'bonus')).reduce((s, p) => s + p.amount, 0)
  const amount = ts.reduce((s, t) => s + t.amount, 0) + extra
  return seconds > 0 ? r2(amount / (seconds / 3600)) : 0
}
