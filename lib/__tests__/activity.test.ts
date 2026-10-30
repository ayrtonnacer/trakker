import { describe, expect, it } from 'vitest'
import { buildActivityGrid, levelFor } from '../activity'

describe('gráfico de actividad', () => {
  it('niveles relativos al mejor día', () => {
    expect(levelFor(0, 100)).toBe(0)
    expect(levelFor(1, 100)).toBe(1)
    expect(levelFor(50, 100)).toBe(2)
    expect(levelFor(100, 100)).toBe(4)
  })

  it('termina en la semana de hoy, con semanas de lunes a domingo', () => {
    const g = buildActivityGrid(new Map([['2026-10-28', 3600], ['2026-10-29', 7200]]), '2026-10-30', 4)
    expect(g.weeks).toHaveLength(4)
    expect(g.weeks.every((w) => w.length === 7)).toBe(true)
    expect(g.weeks[3][0].key).toBe('2026-10-26') // lunes
    expect(g.weeks[3][4].today).toBe(true)
    expect(g.weeks[3][5].future).toBe(true)
    expect(g.weeks[3][3].level).toBe(4)
    expect(g.weeks[3][2].level).toBe(2)
    expect(g.activeDays).toBe(2)
  })
})
