// Informe del período para guardar, compartir o pasarle a una IA: Markdown y la misma versión en HTML para imprimir.
import { fmtHours, fmtMoney } from './game'
import { WEEKDAY_NAMES, type Rhythm } from './rhythm'

export type ReportInput = {
  title: string
  periodLabel: string
  platforms: string[] // vacío = todas
  billableOnly: boolean
  seconds: number
  billableSeconds: number
  amount: number
  collected: number
  collectedCount: number
  fees: number
  effectiveRate: number
  perHour: number
  workedDays: number
  prev: { label: string; seconds: number; amount: number; effectiveRate: number } | null
  groupLabel: string
  groups: { name: string; seconds: number; amount: number; perHour: number }[]
  rhythm: Rhythm
}

const pct = (now: number, before: number) => (before > 0 ? `${now >= before ? '+' : '−'}${Math.abs(Math.round(((now - before) / before) * 100))}%` : '—')
const usd = (n: number) => `US$ ${fmtMoney(n)}`
const cell = (s: string) => s.replace(/\|/g, '\\|')

export function reportMarkdown(r: ReportInput) {
  const unpaid = r.seconds - r.billableSeconds
  const out: string[] = [
    `# ${r.title}`,
    '',
    `**Período:** ${r.periodLabel} · **Plataformas:** ${r.platforms.length ? r.platforms.join(', ') : 'todas'}${r.billableOnly ? ' · sólo facturable' : ''}`,
    '',
    '## Resumen',
    '',
    `- **Tiempo trabajado:** ${fmtHours(r.seconds)} en ${r.workedDays} día${r.workedDays === 1 ? '' : 's'} (${fmtHours(r.billableSeconds)} pagas, ${fmtHours(unpaid)} sin pago: documentación, pruebas, assessments)`,
    `- **Estimado:** ${usd(r.amount)} · **Cobrado:** ${usd(r.collected)}${r.collectedCount ? ` en ${r.collectedCount} pago${r.collectedCount === 1 ? '' : 's'}` : ' (sin pagos cargados)'}${r.fees > 0 ? ` · comisiones ${usd(r.fees)}` : ''}`,
    `- **Valor real de tu hora:** ${r.effectiveRate > 0 ? `${usd(r.effectiveRate)}/h` : '—'}${r.perHour > 0 ? ` (la plataforma paga ${usd(r.perHour)}/h por hora facturada)` : ''}`,
    `- **Tareas:** ${r.rhythm.taskCount} · sesión promedio ${fmtHours(r.rhythm.avgSession)}`,
  ]
  if (r.prev) {
    out.push('', `## Contra ${r.prev.label}`, '', '| | Ahora | Antes | Cambio |', '|---|---:|---:|---:|',
      `| Tiempo | ${fmtHours(r.seconds)} | ${fmtHours(r.prev.seconds)} | ${pct(r.seconds, r.prev.seconds)} |`,
      `| Estimado | ${usd(r.amount)} | ${usd(r.prev.amount)} | ${pct(r.amount, r.prev.amount)} |`,
      `| Valor real de la hora | ${r.effectiveRate > 0 ? usd(r.effectiveRate) : '—'} | ${r.prev.effectiveRate > 0 ? usd(r.prev.effectiveRate) : '—'} | ${pct(r.effectiveRate, r.prev.effectiveRate)} |`)
  }
  if (r.groups.length) {
    out.push('', `## Por ${r.groupLabel.toLowerCase()}`, '', `| ${r.groupLabel} | Horas | US$ | US$/hora |`, '|---|---:|---:|---:|',
      ...r.groups.map((g) => `| ${cell(g.name)} | ${fmtHours(g.seconds)} | ${g.amount > 0 ? fmtMoney(g.amount) : '—'} | ${g.perHour > 0 ? fmtMoney(g.perHour) : '—'} |`))
  }
  const k = r.rhythm
  out.push('', '## Tu ritmo', '')
  out.push(k.work.best ? `- **Cuándo rendís más:** de ${k.work.best.from} a ${k.work.best.to} h (${k.work.best.pct}% de tu tiempo con hora de inicio)` : '- **Cuándo rendís más:** sin tareas con hora de inicio en el período')
  if (k.bestDays.length) out.push(`- **Tus mejores días:** ${k.bestDays.map((d) => `${WEEKDAY_NAMES[d.day]} (${fmtHours(d.avg)} promedio)`).join(', ')}`)
  out.push(k.lossPeak
    ? `- **Cuándo perdés el foco:** de ${k.lossPeak.from} a ${k.lossPeak.to} h (${k.lossPeak.count} intento${k.lossPeak.count === 1 ? '' : 's'}, ${k.lossPeak.rate.toFixed(1).replace('.', ',')} por hora trabajada)`
    : '- **Cuándo perdés el foco:** sin intentos registrados (se mide con el modo foco de la extensión)')
  if (k.dist.bySite.length) out.push(`- **Qué te distrae:** ${k.dist.bySite.slice(0, 5).map((x) => `${x.site} (${x.n})`).join(', ')} · ${k.focusRate.toFixed(1).replace('.', ',')} intentos por hora trabajada en total`)
  out.push('', '| Día | Promedio | Total | Tareas |', '|---|---:|---:|---:|', ...k.byDay.map((d) => `| ${WEEKDAY_NAMES[d.day]} | ${fmtHours(d.avg)} | ${fmtHours(d.seconds)} | ${d.tasks} |`), '')
  return out.join('\n')
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s: string) => escape(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
const cells = (line: string) => line.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'))

/** HTML mínimo para imprimir el informe: sólo lo que usa reportMarkdown (títulos, listas, tablas y negritas). */
export function reportHtml(md: string, title: string) {
  const body: string[] = []
  const lines = md.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('# ')) body.push(`<h1>${inline(l.slice(2))}</h1>`)
    else if (l.startsWith('## ')) body.push(`<h2>${inline(l.slice(3))}</h2>`)
    else if (l.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) items.push(`<li>${inline(lines[i++].slice(2))}</li>`)
      i--
      body.push(`<ul>${items.join('')}</ul>`)
    } else if (l.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].startsWith('|')) { if (!/^\|[-:| ]+\|$/.test(lines[i])) rows.push(cells(lines[i])); i++ }
      i--
      const [head, ...rest] = rows
      body.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
    } else if (l.trim()) body.push(`<p>${inline(l)}</p>`)
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escape(title)}</title><style>
body{font-family:ui-sans-serif,-apple-system,"Segoe UI",sans-serif;color:#191919;max-width:760px;margin:32px auto;padding:0 16px;line-height:1.5}
h1{font-size:24px;margin:0 0 8px}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid #e9e9e7;padding-bottom:4px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:6px 8px;border-bottom:1px solid #e9e9e7;text-align:left}th:not(:first-child),td:not(:first-child){text-align:right}
ul{padding-left:20px}li{margin:3px 0}@media print{body{margin:0}}
</style></head><body>${body.join('\n')}</body></html>`
}
