import { describe, expect, it } from 'vitest'
import { rhythm } from '../rhythm'
import { reportHtml, reportMarkdown } from '../report'
import { buildEntries, change, previousStats } from '../stats'
import { buildTask, type Client, type Project } from '../game'

const at = (day: string, hh: number) => new Date(`${day}T${String(hh).padStart(2, '0')}:10:00`).getTime()

describe('ritmo', () => {
  // 2026-10-26 lunes … 2026-11-01 domingo
  const tasks = [
    { date: '2026-10-26', start: '09:00', seconds: 7200 },
    { date: '2026-10-30', start: '18:00', seconds: 10800 },
    { date: '2026-10-30', start: '21:00', seconds: 3600 },
  ]
  const distractions = [{ t: at('2026-10-30', 21), site: 'youtube.com' }, { t: at('2026-10-30', 21), site: 'youtube.com' }, { t: at('2026-10-26', 9), site: 'x.com' }]

  it('mejores días por promedio y franja con más tiempo', () => {
    const r = rhythm(tasks, distractions, '2026-10-26', '2026-11-01', '2026-10-30')
    expect(r.bestDays.map((d) => d.day)).toEqual([4, 0]) // viernes, lunes
    expect(r.byDay[4].avg).toBe(14400)
    expect(r.work.best).toEqual({ from: 18, to: 21, pct: 50 })
    expect(r.taskCount).toBe(3)
    expect(r.avgSession).toBe(7200)
  })

  it('pérdida de foco por intentos por hora trabajada, no por cantidad', () => {
    const r = rhythm(tasks, distractions, '2026-10-26', '2026-11-01', '2026-10-30')
    // 21 h: 2 intentos en 1 h trabajada pesan más que 1 intento en 2 h a las 9.
    expect(r.lossPeak).toMatchObject({ from: 21, to: 24, count: 2, rate: 2 })
    expect(r.distGrid[4][21]).toBe(2)
    expect(r.focusRate).toBeCloseTo(3 / 6)
  })
})

describe('período anterior', () => {
  const clients: Client[] = [{ id: 'c1', name: 'Outlier', color: '#000' }]
  const projects: Project[] = [{ id: 'p1', name: 'AI', clientId: 'c1', rate: 20, color: '#000', billing: 'hora' }]
  const t = (id: number, date: string, h: number) => buildTask({ id, name: 't', seconds: h * 3600, projectId: 'p1', billable: true, tags: [], date, projects, clients })
  // Hoy jueves 29: se compara lunes a jueves contra lunes a jueves de la semana pasada.
  const all = buildEntries([t(1, '2026-10-19', 2), t(2, '2026-10-23', 5), t(3, '2026-10-27', 3)], [], projects, clients)

  it('compara el mismo tramo si la semana está en curso', () => {
    const p = previousStats(all, 'semana', 0, '2026-10-29')!
    expect(p.label).toBe('la semana anterior a esta altura')
    expect(p.seconds).toBe(7200)
    expect(change(3, 2)).toBe(50)
    expect(change(1, 0)).toBeNull()
  })

  it('una semana pasada se compara completa', () => {
    expect(previousStats(all, 'semana', -1, '2026-10-29')!.seconds).toBe(0)
    expect(previousStats(all, 'todo', 0, '2026-10-29')).toBeNull()
  })
})

describe('informe', () => {
  it('arma el markdown y su versión para imprimir', () => {
    const r = rhythm([{ date: '2026-10-30', start: '10:00', seconds: 3600 }], [], '2026-10-26', '2026-11-01', '2026-10-30')
    const md = reportMarkdown({ title: 'Informe', periodLabel: 'Esta semana', platforms: ['Outlier'], billableOnly: false, seconds: 3600, billableSeconds: 1800, amount: 20, collected: 0, collectedCount: 0, fees: 0, effectiveRate: 20, perHour: 40, workedDays: 1, prev: { label: 'la semana anterior', seconds: 1800, amount: 10, effectiveRate: 10 }, groupLabel: 'Plataforma', groups: [{ name: 'Out|lier', seconds: 3600, amount: 20, perHour: 20 }], rhythm: r })
    expect(md).toContain('**Plataformas:** Outlier')
    expect(md).toContain('| Tiempo | 1h 00m | 30m | +100% |')
    expect(md).toContain('Out\\|lier')
    expect(md).toContain('viernes (1h 00m promedio)')
    const html = reportHtml(md, 'Informe <x>')
    expect(html).toContain('<title>Informe &lt;x&gt;</title>')
    expect(html).toContain('<td>Out|lier</td>')
    expect(html).toContain('<b>Plataformas:</b>')
  })
})
