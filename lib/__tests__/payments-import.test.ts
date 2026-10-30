import { describe, expect, it } from 'vitest'
import type { Client, Payment } from '../game'
import { findAmount, findDate, parsePayments, readNumber } from '../payments-import'

const clients: Client[] = [
  { id: 'c1', name: 'Outlier', color: '#000', payer: 'Scale AI, Inc.' },
  { id: 'c2', name: 'Estudio Norte', color: '#111', payer: 'GreenLight Workforce' },
]
const today = '2026-10-27'

describe('carga masiva de pagos', () => {
  it('lee montos en formato argentino y en inglés', () => {
    expect(readNumber('1.500,50')).toBe(1500.5)
    expect(readNumber('1,500.50')).toBe(1500.5)
    expect(readNumber('80.83')).toBe(80.83)
    expect(readNumber('80,5')).toBe(80.5)
    expect(readNumber('1.500')).toBe(1500)
  })

  it('encuentra fechas en varios formatos', () => {
    expect(findDate('22/10/2026 80', today).date).toBe('2026-10-22')
    expect(findDate('2026-10-22', today).date).toBe('2026-10-22')
    expect(findDate('Oct 22, 2026', today).date).toBe('2026-10-22')
    expect(findDate('22 de octubre', today).date).toBe('2026-10-22')
    expect(findDate('15/12', today).date).toBe('2025-12-15') // sin año y en el futuro: el año pasado
  })

  it('prefiere el monto con $ y detecta egresos', () => {
    expect(findAmount('Pago 3 $80,83').amount).toBe(80.83)
    expect(findAmount('-$60.63 USDC').negative).toBe(true)
  })

  it('una línea por pago, con plataforma por nombre o por quien paga', () => {
    const rows = parsePayments('22/10/2026\t80,83\tOutlier semana 42\n23/10/2026 $120 Scale AI, Inc.\n24/10/2026 50', clients, 'c2', [], today)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ date: '2026-10-22', amount: 80.83, clientId: 'c1', error: '' })
    expect(rows[1]).toMatchObject({ amount: 120, clientId: 'c1' })
    expect(rows[2]).toMatchObject({ amount: 50, clientId: 'c2' }) // la plataforma elegida por defecto
  })

  it('junta las celdas de una tabla de Airtm copiada', () => {
    const airtm = `TRANSACCIÓN\tCANTIDAD\tCOMPAÑERO\tFECHA\tESTADO
Depósito con cuenta virtual
Cuenta Virtual USA
+$80.83 USDC
$81.24 USD
GreenLight Workf
Oct 22, 2026
Completada
Agregar fondos
Tarjeta virtual (USD)
-$60.63 USDC
$60.02 USDC
Sep 22, 2026
Completada`
    const rows = parsePayments(airtm, clients, null, [], today)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ date: '2026-10-22', amount: 80.83, clientId: 'c2', error: '' })
    expect(rows[1].error).toMatch(/salió/)
  })

  it('marca los pagos que ya estaban cargados', () => {
    const existing: Payment[] = [{ id: 'x', projectId: null, clientId: 'c1', kind: 'payout', label: 'Pago', amount: 80.83, date: '2026-10-22', paid: true }]
    expect(parsePayments('22/10/2026 80,83 Outlier', clients, null, existing, today)[0].duplicate).toBe(true)
  })
})

describe('concepto de la carga masiva', () => {
  it('no repite la plataforma en el concepto', () => {
    const [row] = parsePayments('22/10/2026 80,83 Outlier semana 42', clients, null, [], today)
    expect(row.label).toBe('semana 42')
  })
})

describe('carga masiva separada por punto y coma', () => {
  it('lee fecha; monto; plataforma', () => {
    const rows = parsePayments('Fecha;Monto;Plataforma\n22/10/2026;80,83;Outlier\n2026-10-29; 120.5 ;Outlier;Bonus', [{ id: 'c1', name: 'Outlier', color: '#000' }], null, [], '2026-10-30')
    expect(rows.map((r) => [r.date, r.amount, r.clientId, r.kind, r.error])).toEqual([
      ['2026-10-22', 80.83, 'c1', 'payout', ''],
      ['2026-10-29', 120.5, 'c1', 'bonus', ''],
    ])
  })
})
