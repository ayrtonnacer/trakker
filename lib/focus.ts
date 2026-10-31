// Modo foco: sitios que no querés abrir mientras corre el timer. La app no puede bloquear otras
// pestañas; lo hace la extensión de /extension, que lee estos atributos del <html> de la app.

export type Focus = { on: boolean; sites: string[] }
export const DEFAULT_FOCUS: Focus = { on: false, sites: [] }

/** "https://www.youtube.com/watch?v=…" → "youtube.com". Devuelve '' si no parece un dominio. */
export function cleanSite(raw: string) {
  const host = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:\s]/)[0]
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : ''
}

/** Sitios de una lista pegada (uno por línea, o separados por coma o espacio), sin repetir. */
export function parseSites(text: string) {
  return [...new Set(text.split(/[\s,;]+/).map(cleanSite).filter(Boolean))]
}

/** Etapa del arbolito según los minutos de foco, como en Forest. */
export function treeStage(seconds: number): 0 | 1 | 2 {
  return seconds < 10 * 60 ? 0 : seconds < 25 * 60 ? 1 : 2
}

/** Versión de la extensión que trae esta app: si la instalada es anterior, se avisa. */
export const EXT_LATEST = '1.3.0'

/** Cuando la extensión cortó un intento de abrir un sitio bloqueado. t = milisegundos. */
export type Distraction = { t: number; site: string }

const BEST = 3

/** Suma lo que llega de la extensión a lo que ya había, sin repetir. Máximo 5000, los más recientes. */
export function mergeDistractions(cur: Distraction[], incoming: unknown): Distraction[] {
  if (!Array.isArray(incoming)) return cur
  const seen = new Set(cur.map((d) => `${d.t}|${d.site}`))
  const add = incoming.filter((d): d is Distraction => !!d && typeof d.t === 'number' && typeof d.site === 'string' && d.site.length < 80 && !seen.has(`${d.t}|${d.site}`))
  if (!add.length) return cur
  return [...cur, ...add].sort((a, b) => a.t - b.t).slice(-5000)
}

const localKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

/** Intentos en el período (fechas AAAA-MM-DD, ambas incluidas): por sitio, por hora y la franja de 3 horas con más. */
export function distractionStats(list: Distraction[], from: string, to: string) {
  const inRange = list.filter((d) => { const k = localKey(d.t); return k >= from && k <= to })
  const bySiteMap = new Map<string, number>()
  const byHour = Array<number>(24).fill(0)
  inRange.forEach((d) => { bySiteMap.set(d.site, (bySiteMap.get(d.site) ?? 0) + 1); byHour[new Date(d.t).getHours()]++ })
  const total = inRange.length
  const bySite = [...bySiteMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([site, n]) => ({ site, n, pct: Math.round((n / total) * 100) }))
  let peak: { from: number; to: number; pct: number } | null = null
  if (total > 0) {
    let top = -1
    for (let h = 0; h <= 24 - BEST; h++) {
      const sum = byHour.slice(h, h + BEST).reduce((s, v) => s + v, 0)
      if (sum > top) { top = sum; peak = { from: h, to: h + BEST, pct: Math.round((sum / total) * 100) } }
    }
  }
  return { total, bySite, byHour, peak }
}

/** Lo que la app le muestra a la extensión para trabajar con el timer desde el popup. */
export type ExtState = {
  running: boolean
  startedAt: number | null
  base: number // segundos acumulados antes de este tramo
  name: string
  projectId: string | null
  ref: string
  note: string
  tags: string
  billable: boolean
  todaySeconds: number
  projects: { id: string; name: string; color: string; client: string; canBill: boolean; billableDefault: boolean }[]
  recent: { name: string; projectId: string }[]
  backlog: { id: string; text: string; projectId: string | null; note: string }[]
  routines: { id: string; text: string; projectId: string | null }[]
}

export function buildExtState(input: {
  tasks: { id: number; name: string; date: string; seconds: number; projectId: string | null; routineId?: string }[]
  projects: { id: string; name: string; color: string; clientId: string | null; status?: string; billing?: string }[]
  clients: { id: string; name: string }[]
  active: { base: number; startedAt: number | null }
  draft: { name: string; projectId: string | null; ref?: string; note: string; tags: string; billable: boolean }
  plan: { id: string; text: string; projectId: string | null; note?: string; done: boolean }[]
  routines: { id: string; text: string; projectId: string | null; days: number[] }[]
  weekday: number
  today: string
  personal: string
}): ExtState {
  const live = input.projects.filter((p) => p.status !== 'terminado')
  const ids = new Set(live.map((p) => p.id))
  const recent: ExtState['recent'] = []
  const seen = new Set<string>()
  for (const t of [...input.tasks].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)) {
    const key = `${t.name.trim().toLowerCase()}|${t.projectId}`
    if (!t.name.trim() || !t.projectId || !ids.has(t.projectId) || seen.has(key)) continue
    seen.add(key)
    recent.push({ name: t.name, projectId: t.projectId })
    if (recent.length >= 5) break
  }
  const doneToday = new Set(input.tasks.filter((t) => t.date === input.today && t.routineId).map((t) => t.routineId))
  return {
    running: input.active.startedAt !== null,
    startedAt: input.active.startedAt,
    base: input.active.base,
    name: input.draft.name,
    projectId: input.draft.projectId,
    ref: input.draft.ref ?? '',
    note: input.draft.note,
    tags: input.draft.tags,
    billable: input.draft.billable,
    todaySeconds: input.tasks.filter((t) => t.date === input.today).reduce((s, t) => s + t.seconds, 0),
    projects: live.map((p) => {
      const client = input.clients.find((c) => c.id === p.clientId)
      const canBill = p.billing !== 'interno'
      return { id: p.id, name: p.name, color: p.color, client: client?.name ?? input.personal, canBill, billableDefault: !!client && canBill }
    }),
    recent,
    backlog: input.plan.filter((i) => !i.done).slice(0, 8).map((i) => ({ id: i.id, text: i.text, projectId: i.projectId, note: i.note ?? '' })),
    routines: input.routines.filter((r) => r.days.includes(input.weekday) && !doneToday.has(r.id)).slice(0, 5).map((r) => ({ id: r.id, text: r.text, projectId: r.projectId })),
  }
}
