// Carga masiva de pagos: pegás líneas copiadas de Airtm, PayPal, el banco o una planilla y salen pagos.
import { dateKey, type Client, type Payment, type PaymentKind } from './game'

export type ParsedLine = {
  line: string
  date: string // YYYY-MM-DD, '' si no se encontró
  amount: number
  clientId: string | null
  label: string
  kind: PaymentKind
  error: string // por qué no se importa; '' si está bien
  duplicate: boolean // ya hay un pago igual (misma plataforma, fecha y monto)
}

const MONTHS: [RegExp, number][] = [
  [/^(ene|jan)/, 1], [/^feb/, 2], [/^mar/, 3], [/^(abr|apr)/, 4], [/^may/, 5], [/^jun/, 6],
  [/^jul/, 7], [/^(ago|aug)/, 8], [/^(sep|set)/, 9], [/^oct/, 10], [/^nov/, 11], [/^(dic|dec)/, 12],
]
const MONTH_WORD = '(ene\\w*|jan\\w*|feb\\w*|mar\\w*|abr\\w*|apr\\w*|may\\w*|jun\\w*|jul\\w*|ago\\w*|aug\\w*|sep\\w*|set\\w*|oct\\w*|nov\\w*|dic\\w*|dec\\w*)\\.?'
const monthOf = (word: string) => MONTHS.find(([re]) => re.test(word.toLowerCase()))?.[1] ?? 0

const pad = (n: number) => String(n).padStart(2, '0')

function validDate(y: number, m: number, d: number) {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31) return ''
  const dt = new Date(y, m - 1, d)
  return dt.getMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : ''
}

/** Sin año: el de hoy, o el anterior si la fecha quedaría en el futuro. */
function withYear(m: number, d: number, today: string) {
  const y = Number(today.slice(0, 4))
  const key = validDate(y, m, d)
  return key && key > today ? validDate(y - 1, m, d) : key
}

/** Busca una fecha en el texto. Devuelve la fecha y el texto sin ella. */
export function findDate(text: string, today = dateKey()): { date: string; rest: string } {
  const tries: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => validDate(+m[1], +m[2], +m[3])],
    [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/, (m) => validDate(+m[3], +m[2], +m[1])],
    [new RegExp(`\\b${MONTH_WORD}\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'i'), (m) => validDate(+m[3], monthOf(m[1]), +m[2])],
    [new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?${MONTH_WORD}(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`, 'i'), (m) => (m[3] ? validDate(+m[3], monthOf(m[2]), +m[1]) : withYear(monthOf(m[2]), +m[1], today))],
    [/\b(\d{1,2})\/(\d{1,2})\b/, (m) => withYear(+m[2], +m[1], today)],
  ]
  for (const [re, toKey] of tries) {
    const m = text.match(re)
    if (!m) continue
    const date = toKey(m)
    if (date) return { date, rest: text.replace(m[0], ' ') }
  }
  return { date: '', rest: text }
}

/** "1.500,50", "1,500.50", "80.83", "1.500" (miles), "80,5". */
export function readNumber(raw: string) {
  const s = raw.replace(/\s/g, '')
  const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',')
  if (dot >= 0 && comma >= 0) {
    const dec = dot > comma ? '.' : ','
    const thousands = dec === '.' ? /,/g : /\./g
    return Number(s.replace(thousands, '').replace(dec, '.'))
  }
  const sep = dot >= 0 ? '.' : comma >= 0 ? ',' : ''
  if (!sep) return Number(s)
  const parts = s.split(sep)
  // Un separador seguido de exactamente 3 dígitos (o varios separadores) es de miles.
  if (parts.length > 2 || parts[parts.length - 1].length === 3) return Number(parts.join(''))
  return Number(parts.join('.'))
}

/** El primer monto del texto; si alguno lleva $, ese. Negativo = plata que salió. */
export function findAmount(text: string): { amount: number; negative: boolean; rest: string } {
  const re = /([+\-−]?)\s*(US\$|U\$S|USD|\$)?\s*(\d[\d.,]*\d|\d)/gi
  const found: { m: RegExpExecArray; money: boolean }[] = []
  for (let m = re.exec(text); m; m = re.exec(text)) found.push({ m, money: !!m[2] || /^\s*(usd|usdc|us\$|dólares|dolares)\b/i.test(text.slice(m.index + m[0].length)) })
  const pick = found.find((f) => f.money) ?? found[0]
  if (!pick) return { amount: 0, negative: false, rest: text }
  const amount = Math.round(readNumber(pick.m[3]) * 100) / 100
  return { amount: Number.isFinite(amount) ? amount : 0, negative: pick.m[1] === '-' || pick.m[1] === '−', rest: text.replace(pick.m[0], ' ') }
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** La plataforma que aparece en el texto: por su nombre o por el nombre con que paga (payer). */
export function findClient(text: string, clients: Client[]): string | null {
  const t = norm(text)
  for (const c of clients) {
    for (const cand of [c.name, c.payer ?? '']) {
      const n = norm(cand.trim())
      if (!n) continue
      if (t.includes(n)) return c.id
      // Los extractos cortan nombres largos ("GreenLight Workf"): alcanza con la primera palabra si es distintiva.
      const first = n.split(/[\s,.]+/)[0]
      if (first.length >= 4 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return c.id
    }
  }
  return null
}

const NOISE = /\b(completada|completado|completed|pendiente|pending|usdc|usd|ars|us\$|u\$s|transacci[oó]n|cantidad|compa[nñ]ero|fecha|estado|monto|date|amount|status)\b|[+$|]/gi

/** Columnas del formato con punto y coma. En la fila de encabezado se pueden poner en cualquier orden. */
export const CSV_HEADER = 'fecha;monto;plataforma;concepto'
export const CSV_EXAMPLE = `${CSV_HEADER}\n22/10/2026;80,83;Outlier;Pago semanal\n15/10/2026;64,20;Outlier;Bonus`
const CSV_ALIASES: Record<'date' | 'amount' | 'client' | 'label', string[]> = {
  date: ['fecha', 'date'], amount: ['monto', 'importe', 'amount', 'cantidad'], client: ['plataforma', 'cliente', 'platform', 'client'], label: ['concepto', 'detalle', 'descripcion', 'description', 'nota'],
}

/** ¿Es un texto separado por ;? Sí si casi todas las líneas lo tienen. */
export function isDelimited(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  return lines.length > 0 && lines.filter((l) => l.includes(';')).length >= Math.ceil(lines.length / 2)
}

/**
 * Formato fijo: fecha;monto;plataforma;concepto, una fila por pago, con o sin fila de encabezado.
 * La plataforma puede ir vacía si se eligió una por defecto; el concepto es opcional ("Bonus" lo marca como bonus).
 */
function parseDelimited(text: string, clients: Client[], defaultClientId: string | null, existing: Payment[], today: string): ParsedLine[] {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const split = (l: string) => l.split(';').map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
  let col = { date: 0, amount: 1, client: 2, label: 3 }
  const head = split(rows[0]).map(norm)
  if (head.includes('fecha') || head.includes('date') || head.some((h) => CSV_ALIASES.amount.includes(h))) {
    const at = (k: keyof typeof CSV_ALIASES, fallback: number) => { const i = head.findIndex((h) => CSV_ALIASES[k].includes(h)); return i >= 0 ? i : fallback }
    col = { date: at('date', 0), amount: at('amount', 1), client: at('client', 2), label: at('label', 3) }
    rows.shift()
  }
  return rows.map((line): ParsedLine => {
    const f = split(line)
    const date = findDate(f[col.date] ?? '', today).date
    const { amount, negative } = findAmount(f[col.amount] ?? '')
    const named = (f[col.client] ?? '').trim()
    const found = named ? findClient(named, clients) : null
    const clientId = found ?? (named ? null : defaultClientId)
    const label = (f[col.label] ?? '').slice(0, 80)
    const kind: PaymentKind = /bonus|reward|premio|incentiv/i.test(label) ? 'bonus' : 'payout'
    const error = !date ? 'Sin fecha' : amount <= 0 ? 'Sin monto' : negative ? 'Es plata que salió: no se carga' : !clientId ? 'Elegí la plataforma' : ''
    const duplicate = !error && existing.some((p) => p.date === date && Math.abs(p.amount - amount) < 0.005 && (p.clientId ?? null) === clientId)
    return { line, date, amount, clientId, label, kind, error, duplicate }
  })
}

/**
 * Convierte lo pegado en pagos. Lo normal es un pago por línea (planilla, CSV), pero si cada dato vino
 * en su propia línea (copiar una tabla de Airtm) se juntan líneas hasta tener monto y fecha.
 */
export function parsePayments(text: string, clients: Client[], defaultClientId: string | null, existing: Payment[], today = dateKey()): ParsedLine[] {
  if (isDelimited(text)) return parseDelimited(text, clients, defaultClientId, existing, today)
  const complete = (t: string) => { const d = findDate(t, today); return !!d.date && findAmount(d.rest).amount > 0 }
  const records: string[] = []
  let buffer: string[] = []
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    if (complete(line)) {
      if (buffer.some((l) => /\d/.test(l))) records.push(buffer.join('\t'))
      buffer = []
      records.push(line)
      continue
    }
    buffer.push(line)
    if (complete(buffer.join('\t'))) { records.push(buffer.join('\t')); buffer = [] }
  }
  if (buffer.some((l) => /\d/.test(l))) records.push(buffer.join('\t'))

  return records.map((line) => {
    const { date, rest: noDate } = findDate(line, today)
    const { amount, negative, rest } = findAmount(noDate)
    const found = findClient(line, clients)
    const clientId = found ?? defaultClientId
    // El nombre de la plataforma ya va en su columna: no se repite en el concepto.
    const owner = clients.find((c) => c.id === found)
    const named = [owner?.name, owner?.payer].filter((n): n is string => !!n?.trim()).reduce((t, n) => t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' '), rest)
    const label = named.replace(NOISE, ' ').replace(/[\t;]+/g, ' · ').replace(/\s+/g, ' ').replace(/(\s*·\s*)+/g, ' · ').replace(/^[\s·,-]+|[\s·,-]+$/g, '').slice(0, 80)
    const kind: PaymentKind = /bonus|reward|premio|incentiv/i.test(line) ? 'bonus' : 'payout'
    const error = amount <= 0 ? 'Sin monto' : negative ? 'Es plata que salió: no se carga' : !date ? 'Sin fecha' : !clientId ? 'Elegí la plataforma' : ''
    const duplicate = !error && existing.some((p) => p.date === date && Math.abs(p.amount - amount) < 0.005 && (p.clientId ?? null) === clientId)
    return { line, date, amount, clientId, label, kind, error, duplicate }
  })
}
