import { describe, expect, it } from 'vitest'
import { buildTask, goalTarget, monthCollected, monthEarnings, type Client, type Payment, type Project } from '../game'
import { concentration, platformFinance, reconcile } from '../finance'
import { mergeById, mergeConflict, serialize, parseFiles } from '../sync'

const clients: Client[] = [{ id: 'c1', name: 'Outlier', color: '#000' }, { id: 'c2', name: 'LinkedIn', color: '#111' }]
const projects: Project[] = [
  { id: 'p1', name: 'AI trainer', clientId: 'c1', rate: 20, color: '#000', billing: 'hora' },
  { id: 'p2', name: 'Trainer', clientId: 'c2', rate: 10, color: '#111', billing: 'hora' },
]
const task = (id: number, date: string, hours: number, projectId = 'p1', billable = true, ref?: string) =>
  buildTask({ id, name: `t${id}`, seconds: hours * 3600, projectId, billable, tags: [], date, ref, projects, clients })

const payout: Payment = { id: 'x1', projectId: null, clientId: 'c1', kind: 'payout', label: 'Pago', amount: 180, date: '2026-10-20', paid: true, from: '2026-10-13', to: '2026-10-19', hours: 9.5 }

describe('estimado vs cobrado', () => {
  const tasks = [task(1, '2026-10-14', 4, 'p1', true, 'abc-123'), task(2, '2026-10-15', 5), task(3, '2026-10-16', 2, 'p1', false), task(4, '2026-10-21', 1)]

  it('un payout no suma a lo ganado pero sí a lo cobrado', () => {
    expect(monthEarnings('2026-10', tasks, [payout])).toBe(200)
    expect(monthCollected('2026-10', [payout])).toBe(180)
  })

  it('concilia horas y plata contra el período del pago', () => {
    const [row] = reconcile(clients[0], projects, tasks, [payout])
    expect(row.seconds).toBe(9 * 3600)
    expect(row.estimated).toBe(180)
    expect(row.diff).toBe(0)
    expect(row.taskIds).toEqual(['abc-123'])
  })

  it('marca la diferencia cuando pagaron de menos', () => {
    const [row] = reconcile(clients[0], projects, tasks, [{ ...payout, amount: 144 }])
    expect(row.diff).toBe(-36)
    expect(row.diffPct).toBe(-20)
  })

  it('la tarifa efectiva cuenta el tiempo no pago y usa lo cobrado', () => {
    const f = platformFinance(clients[0], projects, tasks, [payout])
    expect(f.unpaidSeconds).toBe(2 * 3600)
    expect(f.collected).toBe(180)
    expect(f.effectiveIsReal).toBe(true)
    expect(f.effectiveRate).toBeCloseTo(180 / 12, 2)
    expect(f.awaiting).toBe(20) // la tarea del 21/10 todavía no se pagó
  })

  it('detecta la concentración de ingresos', () => {
    const t = [task(1, '2026-10-14', 8), task(2, '2026-10-15', 1, 'p2')]
    const [top, second] = concentration(clients, projects, t, [], '2026-10-27', 90)
    expect(top.name).toBe('Outlier')
    expect(top.pct).toBe(94)
    expect(second.pct).toBe(6)
  })
})

describe('meta', () => {
  it('una meta de monto fijo vale lo mismo todos los meses desde el inicio', () => {
    const goal = { baseline: 0, pct: 0, months: 3, start: '2026-10', milestones: [], actions: [], fixed: 5000 }
    expect(goalTarget(goal, '2026-09')).toBe(0)
    expect(goalTarget(goal, '2026-10')).toBe(5000)
    expect(goalTarget(goal, '2027-03')).toBe(5000)
  })
})

describe('sync', () => {
  it('fusiona por id y gana lo segundo', () => {
    expect(mergeById([{ id: 1, v: 'a' }, { id: 2, v: 'b' }], [{ id: 2, v: 'B' }, { id: 3, v: 'c' }])).toEqual([{ id: 1, v: 'a' }, { id: 2, v: 'B' }, { id: 3, v: 'c' }])
  })

  it('un conflicto en un mes conserva las tareas del otro dispositivo', () => {
    const base = { clients, projects, payments: [], goal: null, plan: [], routines: [] }
    const mine = serialize({ ...base, tasks: [task(1, '2026-10-14', 1), task(2, '2026-10-15', 1)] })['tareas/2026-10.md']
    const theirs = serialize({ ...base, tasks: [task(1, '2026-10-14', 1), task(3, '2026-10-16', 1)] })['tareas/2026-10.md']
    const merged = mergeConflict('tareas/2026-10.md', mine, theirs)!
    const ids = parseFiles({ 'tareas/2026-10.md': merged }).data.tasks!.map((t) => t.id).sort()
    expect(ids).toEqual([1, 2, 3])
  })
})
