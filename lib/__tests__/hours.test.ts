import { describe, expect, it } from 'vitest'
import { hourProfile } from '../stats'
import { accountBucket, greetingFor } from '../game'
import { parseSites } from '../focus'

describe('franjas horarias', () => {
  it('reparte una tarea entre las horas que ocupa', () => {
    // 2026-10-26 es lunes: 9:30 a 11:00
    const p = hourProfile([{ date: '2026-10-26', start: '09:30', seconds: 5400 }])
    expect(p.grid[0][9]).toBe(1800)
    expect(p.grid[0][10]).toBe(3600)
    expect(p.total).toBe(5400)
  })

  it('lo que cruza la medianoche va al día siguiente', () => {
    const p = hourProfile([{ date: '2026-11-01', start: '23:00', seconds: 7200 }]) // domingo
    expect(p.grid[6][23]).toBe(3600)
    expect(p.grid[0][0]).toBe(3600)
  })

  it('ignora tareas sin hora y encuentra la mejor franja de 3 horas', () => {
    const p = hourProfile([
      { date: '2026-10-27', seconds: 9000 },
      { date: '2026-10-27', start: '14:00', seconds: 10800 },
      { date: '2026-10-28', start: '08:00', seconds: 1800 },
    ])
    expect(p.total).toBe(12600)
    expect(p.best).toEqual({ from: 14, to: 17, pct: 86 })
  })
})

describe('saludo y cuentas', () => {
  it('saluda según la hora', () => {
    expect(greetingFor(7)).toBe('Buenos días')
    expect(greetingFor(15)).toBe('Buenas tardes')
    expect(greetingFor(23)).toBe('Buenas noches')
    expect(greetingFor(3)).toBe('Buenas noches')
  })

  it('agrupa las etapas en cuentas, postulaciones y rechazos', () => {
    expect(accountBucket({ status: 'pausado' })).toBe('cuenta')
    expect(accountBucket({ status: 'onboarding' })).toBe('proceso')
    expect(accountBucket({ status: 'potencial' })).toBe('proceso')
    expect(accountBucket({ status: 'rechazado' })).toBe('rechazado')
    expect(accountBucket({})).toBe('cuenta')
  })
})

describe('modo foco', () => {
  it('limpia los sitios pegados', () => {
    expect(parseSites('https://www.youtube.com/watch?v=1\nx.com, instagram.com  x.com\nno es un sitio')).toEqual(['youtube.com', 'x.com', 'instagram.com'])
  })
})

describe('distracciones', () => {
  const at = (day: string, hh: number, mm = 0) => new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).getTime()

  it('junta lo nuevo sin repetir y descarta basura', async () => {
    const { mergeDistractions } = await import('../focus')
    const a = [{ t: 1, site: 'x.com' }]
    const merged = mergeDistractions(a, [{ t: 1, site: 'x.com' }, { t: 2, site: 'youtube.com' }, { t: 'no', site: 1 }, null])
    expect(merged).toEqual([{ t: 1, site: 'x.com' }, { t: 2, site: 'youtube.com' }])
    expect(mergeDistractions(a, 'nada')).toBe(a)
  })

  it('cuenta por sitio, por hora y encuentra la franja', async () => {
    const { distractionStats } = await import('../focus')
    const list = [
      { t: at('2026-10-27', 15, 10), site: 'youtube.com' }, { t: at('2026-10-27', 15, 40), site: 'youtube.com' },
      { t: at('2026-10-28', 16, 5), site: 'x.com' }, { t: at('2026-10-29', 9, 0), site: 'x.com' },
      { t: at('2026-09-01', 15, 0), site: 'fuera.com' },
    ]
    const s = distractionStats(list, '2026-10-26', '2026-11-01')
    expect(s.total).toBe(4)
    expect(s.bySite).toEqual([{ site: 'x.com', n: 2, pct: 50 }, { site: 'youtube.com', n: 2, pct: 50 }])
    expect(s.byHour[15]).toBe(2)
    expect(s.peak).toEqual({ from: 14, to: 17, pct: 75 })
  })
})

describe('estado para la extensión', () => {
  it('arma proyectos, recientes sin repetir y lo trabajado hoy', async () => {
    const { buildExtState } = await import('../focus')
    const s = buildExtState({
      tasks: [
        { id: 1, name: 'Evaluar', date: '2026-10-29', seconds: 600, projectId: 'p1' },
        { id: 2, name: 'evaluar', date: '2026-10-30', seconds: 1800, projectId: 'p1' },
        { id: 3, name: 'Viejo', date: '2026-10-30', seconds: 60, projectId: 'p9' },
        { id: 4, name: 'Leer guía', date: '2026-10-28', seconds: 100, projectId: 'p2' },
      ],
      projects: [{ id: 'p1', name: 'AI', color: '#111', clientId: 'c1' }, { id: 'p2', name: 'Mío', color: '#222', clientId: null }, { id: 'p9', name: 'Cerrado', color: '#333', clientId: 'c1', status: 'terminado' }],
      clients: [{ id: 'c1', name: 'Outlier' }],
      active: { base: 0, startedAt: null }, draft: { name: '', projectId: null, note: '', tags: '', billable: false }, today: '2026-10-30', personal: 'Personal',
      plan: [{ id: 'a', text: 'Pendiente', projectId: 'p1', note: 'ver guía', done: false }, { id: 'b', text: 'Hecha', projectId: 'p1', done: true }],
      routines: [{ id: 'r1', text: 'LinkedIn', projectId: 'p2', days: [5] }, { id: 'r2', text: 'Otra', projectId: 'p2', days: [1] }], weekday: 5,
    })
    expect(s.todaySeconds).toBe(1860)
    expect(s.recent).toEqual([{ name: 'evaluar', projectId: 'p1' }, { name: 'Leer guía', projectId: 'p2' }])
    expect(s.projects.map((p) => `${p.client}/${p.name}`)).toEqual(['Outlier/AI', 'Personal/Mío'])
    expect(s.running).toBe(false)
    expect(s.backlog).toEqual([{ id: 'a', text: 'Pendiente', projectId: 'p1', note: 'ver guía' }])
    expect(s.routines).toEqual([{ id: 'r1', text: 'LinkedIn', projectId: 'p2' }])
    expect(s.projects.map((p) => [p.canBill, p.billableDefault])).toEqual([[true, true], [true, false]])
  })
})
