import { dateKey } from './game'

export type ActivityCell = { key: string; secs: number; level: 0 | 1 | 2 | 3 | 4; future: boolean; today: boolean }
export type ActivityGrid = { weeks: ActivityCell[][]; months: { col: number; label: string }[]; activeDays: number }

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** 0 = día sin actividad; 1–4 según las horas del día respecto del mejor día del período, como en GitHub. */
export function levelFor(secs: number, max: number): ActivityCell['level'] {
  if (secs <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((secs / max) * 4))) as ActivityCell['level']
}

/**
 * Columnas de semanas (lunes a domingo) que terminan en la semana de `today`.
 * `secsByDay` suma los segundos de cada fecha AAAA-MM-DD.
 */
export function buildActivityGrid(secsByDay: Map<string, number>, today: string, weekCount: number): ActivityGrid {
  const base = new Date(`${today}T12:00:00`)
  const start = new Date(base)
  start.setDate(base.getDate() - ((base.getDay() + 6) % 7) - (weekCount - 1) * 7)

  const days: { key: string; secs: number }[][] = []
  for (let w = 0; w < weekCount; w++) {
    days.push(Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + w * 7 + i)
      const key = dateKey(d)
      return { key, secs: secsByDay.get(key) ?? 0 }
    }))
  }

  const max = Math.max(0, ...days.flat().filter((d) => d.key <= today).map((d) => d.secs))
  const weeks = days.map((week) => week.map((d) => ({ ...d, level: levelFor(d.secs, max), future: d.key > today, today: d.key === today })))

  // Cada mes se rotula sobre la primera semana que lo empieza.
  const months: ActivityGrid['months'] = []
  let last = -1
  weeks.forEach((week, col) => {
    const m = Number(week[0].key.slice(5, 7)) - 1
    if (m !== last) { months.push({ col, label: MONTHS[m] }); last = m }
  })

  return { weeks, months, activeDays: weeks.flat().filter((c) => c.secs > 0 && !c.future).length }
}
