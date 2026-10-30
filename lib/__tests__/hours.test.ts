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
