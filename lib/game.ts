export type Client = { name: string; rate: number; currency: string; color: string }

export const CLIENTS: Client[] = [
  { name: 'Sin cliente', rate: 0, currency: 'USD', color: '#9b8cff' },
  { name: 'Estudio Norte', rate: 20, currency: 'USD', color: '#e8ad4b' },
  { name: 'Marea Studio', rate: 20, currency: 'USD', color: '#67d6b2' },
]

export type Task = {
  id: number
  name: string
  client: string
  project: string
  seconds: number
  amount: number
  currency: string
  xp: number
  color: string
  tags: string[]
  date: string // AAAA-MM-DD, hora local
  long: boolean
}

export const RANKS: [number, string][] = [
  [30, 'Leyenda freelance'],
  [20, 'Maestro del oficio'],
  [15, 'Mercenario'],
  [10, 'Artesano'],
  [5, 'Jornalero'],
  [1, 'Aprendiz'],
]

export const DAILY_GOAL_HOURS = 6

export function dateKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
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

export function fmtMoney(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
