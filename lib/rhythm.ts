// Tu ritmo: en qué horas y días rendís más, y cuándo y con qué perdés el foco.
import { dateKey } from './game'
import { distractionStats, type Distraction } from './focus'
import { hourProfile } from './stats'

export const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const WINDOW = 3

type TaskLike = { date: string; start?: string; seconds: number }

/** Lunes = 0 … domingo = 6. */
const weekdayOf = (key: string) => (new Date(`${key}T12:00:00`).getDay() + 6) % 7

export function rhythm(tasks: TaskLike[], distractions: Distraction[], from: string, to: string, today: string) {
  const inRange = tasks.filter((t) => t.date >= from && t.date <= to)
  const work = hourProfile(inRange)
  const dist = distractionStats(distractions, from, to)

  // Intentos por día de la semana y hora, en la misma grilla que el trabajo.
  const distGrid = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  distractions.forEach((d) => {
    const at = new Date(d.t)
    const key = dateKey(at)
    if (key >= from && key <= to) distGrid[(at.getDay() + 6) % 7][at.getHours()]++
  })

  // Días: promedio por cada lunes, martes… que ya pasó en el período (no el total, que premia al día que más veces aparece).
  const seen = Array<number>(7).fill(0)
  const last = to > today ? today : to
  for (let d = new Date(`${from}T12:00:00`); dateKey(d) <= last; d.setDate(d.getDate() + 1)) seen[weekdayOf(dateKey(d))]++
  const daySecs = Array<number>(7).fill(0)
  const dayTasks = Array<number>(7).fill(0)
  inRange.forEach((t) => { daySecs[weekdayOf(t.date)] += t.seconds; dayTasks[weekdayOf(t.date)]++ })
  const byDay = daySecs.map((seconds, i) => ({ day: i, seconds, tasks: dayTasks[i], avg: seen[i] ? seconds / seen[i] : 0 }))
  const bestDays = [...byDay].filter((d) => d.avg > 0).sort((a, b) => b.avg - a.avg).slice(0, 2)

  // Cuándo perdés el foco: intentos por hora trabajada en cada franja de 3 horas. Por tasa y no por cantidad,
  // porque a la hora en que más trabajás también vas a tener más intentos.
  const workHours = work.byHour.map((s) => s / 3600)
  let lossPeak: { from: number; to: number; count: number; rate: number } | null = null
  for (let h = 0; h <= 24 - WINDOW; h++) {
    const count = dist.byHour.slice(h, h + WINDOW).reduce((s, v) => s + v, 0)
    if (!count) continue
    const rate = count / Math.max(0.5, workHours.slice(h, h + WINDOW).reduce((s, v) => s + v, 0))
    if (!lossPeak || rate > lossPeak.rate) lossPeak = { from: h, to: h + WINDOW, count, rate }
  }

  const totalSecs = inRange.reduce((s, t) => s + t.seconds, 0)
  return {
    work,
    distGrid,
    dist,
    byDay,
    bestDays,
    lossPeak,
    focusRate: totalSecs > 0 ? dist.total / (totalSecs / 3600) : 0,
    taskCount: inRange.length,
    avgSession: inRange.length ? totalSecs / inRange.length : 0,
  }
}

export type Rhythm = ReturnType<typeof rhythm>
