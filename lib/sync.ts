// Sincronización con un repo de GitHub: los datos viven como archivos .md.
// Cada archivo tiene una tabla legible y, al final, un bloque <!-- tasker:data --> con
// el dato exacto: ese bloque es la fuente de verdad al leer. Editar la tabla a mano no
// cambia nada; para corregir algo, usá la app (o editá el bloque de datos).
import { PAYMENT_KIND_LABEL, clientStatus, fmtClock, fmtMoney, paymentClientId, paymentKind, type Client, type Goal, type Payment, type PlanItem, type Project, type Routine, type Task } from './game'

export type AppData = { tasks: Task[]; clients: Client[]; projects: Project[]; payments: Payment[]; goal: Goal | null; plan: PlanItem[]; routines: Routine[] }
export type SyncConfig = { repo: string; branch: string; dir: string; token: string }
export type Change = { path: string; content: string | null } // null = borrar

const API = 'https://api.github.com'
const TASKS_DIR = 'tareas'
const CLIENTS_FILE = 'clientes.md'
const GOALS_FILE = 'metas.md'
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

export class SyncError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// ---------- formato ----------

const cell = (v: string | number) => String(v).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')
// < y > sólo aparecen dentro de strings JSON: se escapan para no cerrar el comentario HTML.
const safe = (json: string) => json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
// Claves ordenadas: el mismo dato siempre da el mismo texto, así no hay commits de más.
const sortKeys = (_k: string, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y))) : v)
const json = (v: unknown) => safe(JSON.stringify(v, sortKeys))
const lines = (items: unknown[]) => (items.length ? `[\n${items.map(json).join(',\n')}\n]` : '[]')
const block = (json: string) => `<!-- tasker:data\n${json}\n-->\n`

function readBlock(text: string) {
  // Los repos creados cuando la app se llamaba Trakker usan el marcador viejo: se siguen leyendo.
  const m = text.match(/<!-- (?:tasker|trakker):data\r?\n([\s\S]*?)\r?\n-->/)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

const byDateStart = (a: Task, b: Task) => (a.date + (a.start ?? '')).localeCompare(b.date + (b.start ?? '')) || a.id - b.id

function tasksFile(month: string, tasks: Task[]) {
  const sorted = [...tasks].sort(byDateStart)
  const seconds = sorted.reduce((s, t) => s + t.seconds, 0)
  const amount = sorted.reduce((s, t) => s + t.amount, 0)
  const rows = sorted.map((t) => `| ${t.date} | ${t.start ?? ''} | ${cell(t.ref ? `${t.name} (ID ${t.ref})` : t.name)} | ${cell(t.project)} | ${cell(t.client)} | ${fmtClock(t.seconds)} | ${t.billable ? 'sí' : 'no'} | ${t.amount.toFixed(2)} | ${cell(t.tags.join(', '))} | ${cell(t.note ?? '')} |`)
  return [
    `# Tareas ${month}`,
    '',
    `**${sorted.length} tareas · ${fmtClock(seconds)} · US$ ${fmtMoney(amount)}**`,
    '',
    '| Fecha | Inicio | Tarea | Proyecto | Plataforma | Duración | Facturable | US$ | Etiquetas | Notas |',
    '|---|---|---|---|---|---|---|---:|---|---|',
    ...rows,
    '',
    block(lines(sorted)),
  ].join('\n')
}

function clientsFile(d: AppData) {
  const out = ['# Plataformas y proyectos', '']
  const projectName = new Map(d.projects.map((p) => [p.id, p.name]))
  const billing = (p: Project) => {
    const b = p.billing ?? 'hora'
    return b === 'hora' ? `por hora · US$ ${p.rate}/h` : b === 'fijo' ? `precio fijo · US$ ${p.price ?? 0}` : b === 'entrega' ? `por entrega · US$ ${p.rate}` : 'interno'
  }
  const section = (title: string, projects: Project[], c?: Client) => {
    out.push(`## ${title}${c ? ` (${clientStatus(c)})` : ''}`, '')
    if (c?.links?.length) out.push(`Links: ${c.links.map((l) => `[${l.label}](${l.url})`).join(' · ')}`, '')
    if (c?.notes) out.push(c.notes.split('\n').map((l) => `> ${l}`).join('\n'), '')
    if (projects.length) out.push(...projects.map((p) => `- **${p.name}** — ${billing(p)}${p.links?.length ? ` — ${p.links.map((l) => `[${l.label}](${l.url})`).join(' · ')}` : ''}`), '')
  }
  d.clients.forEach((c) => section(c.name, d.projects.filter((p) => p.clientId === c.id), c))
  const loose = d.projects.filter((p) => !p.clientId || !d.clients.some((c) => c.id === p.clientId))
  if (loose.length) section('Personal / interno', loose)
  if (d.payments.length) {
    out.push('## Pagos', '', '| Fecha | Plataforma / proyecto | Tipo | Concepto | Período | US$ | Comisión | Método | Estado |', '|---|---|---|---|---|---:|---:|---|---|')
    const sorted = [...d.payments].sort((a, b) => a.date.localeCompare(b.date))
    const clientName = (p: (typeof sorted)[number]) => d.clients.find((c) => c.id === paymentClientId(p, d.projects))?.name
    out.push(...sorted.map((p) => `| ${p.date} | ${cell(projectName.get(p.projectId ?? '') ?? clientName(p) ?? '—')} | ${PAYMENT_KIND_LABEL[paymentKind(p)]} | ${cell(p.label)} | ${p.from || p.to ? `${p.from ?? ''} → ${p.to ?? ''}` : ''} | ${p.amount.toFixed(2)} | ${(p.fee ?? 0).toFixed(2)} | ${cell(p.method ?? '')} | ${p.paid ? 'cobrado' : 'pendiente'} |`), '')
  }
  const data = `{\n"clients": ${lines(d.clients)},\n"projects": ${lines(d.projects)},\n"payments": ${lines(d.payments)}\n}`
  out.push(block(data))
  return out.join('\n')
}

function goalsFile(d: AppData) {
  const out = ['# Meta de ingresos y por hacer', '']
  const g = d.goal
  if (g) {
    out.push(g.fixed ? `**Meta:** US$ ${g.fixed} por mes, desde ${g.start}.` : `**Meta:** pasar de US$ ${g.baseline}/mes a +${g.pct}% en ${g.months} mes(es), desde ${g.start}.`, '')
    if (g.milestones.length) out.push(`Micro objetivos: ${g.milestones.join(', ')}`, '')
    if (g.actions.length) out.push('### Acciones', '', ...g.actions.map((a) => `- [${a.done ? 'x' : ' '}] ${a.text}`), '')
  } else out.push('Sin meta definida.', '')
  if (d.plan.length) out.push('## Por hacer', '', ...d.plan.map((p) => `- [${p.done ? 'x' : ' '}] ${p.text}`), '')
  if (d.routines.length) out.push('## Rutinas', '', ...d.routines.map((r) => `- ${r.text} (${[1, 2, 3, 4, 5, 6, 0].filter((x) => r.days.includes(x)).map((x) => DAY_LETTERS[x]).join(' ')})`), '')
  out.push(block(`{\n"goal": ${g ? json(g) : 'null'},\n"plan": ${lines(d.plan)},\n"routines": ${lines(d.routines)}\n}`))
  return out.join('\n')
}

/** Todos los archivos que representan los datos, con ruta relativa a la carpeta elegida. */
export function serialize(d: AppData): Record<string, string> {
  const files: Record<string, string> = { [CLIENTS_FILE]: clientsFile(d), [GOALS_FILE]: goalsFile(d) }
  const months = new Map<string, Task[]>()
  d.tasks.forEach((t) => months.set(t.date.slice(0, 7), [...(months.get(t.date.slice(0, 7)) ?? []), t]))
  months.forEach((ts, m) => { files[`${TASKS_DIR}/${m}.md`] = tasksFile(m, ts) })
  return files
}

/** Lee los archivos del repo. `found` es false si no hay ningún dato de Tasker CRM. */
export function parseFiles(files: Record<string, string>) {
  const data: Partial<AppData> = {}
  let found = false
  const clients = files[CLIENTS_FILE] ? readBlock(files[CLIENTS_FILE]) : null
  if (clients) {
    found = true
    data.clients = clients.clients ?? []
    data.projects = clients.projects ?? []
    data.payments = clients.payments ?? []
  }
  const goals = files[GOALS_FILE] ? readBlock(files[GOALS_FILE]) : null
  if (goals) {
    found = true
    data.goal = goals.goal ?? null
    data.plan = goals.plan ?? []
    data.routines = goals.routines ?? []
  }
  const taskFiles = Object.keys(files).filter((p) => p.startsWith(`${TASKS_DIR}/`))
  if (taskFiles.length || clients || goals) {
    const tasks: Task[] = []
    taskFiles.forEach((p) => {
      const list = readBlock(files[p])
      if (Array.isArray(list)) { tasks.push(...list); found = true }
    })
    data.tasks = tasks
  }
  return { data, found }
}

// ---------- fusión por id ----------

/** Une dos listas por `id`. Si el mismo id está en las dos, gana `over`. El orden: primero `base`, después lo nuevo de `over`. */
export function mergeById<T extends { id: string | number }>(base: T[], over: T[]): T[] {
  const incoming = new Map(over.map((x) => [x.id, x]))
  const out = base.map((x) => incoming.get(x.id) ?? x)
  const seen = new Set(base.map((x) => x.id))
  over.forEach((x) => { if (!seen.has(x.id)) out.push(x) })
  return out
}

/** Une dos copias completas de los datos: nada se pierde, y ante el mismo id gana `over`. */
export function mergeData(base: AppData, over: AppData): AppData {
  return {
    tasks: mergeById(base.tasks, over.tasks),
    clients: mergeById(base.clients, over.clients),
    projects: mergeById(base.projects, over.projects),
    payments: mergeById(base.payments, over.payments),
    goal: over.goal ?? base.goal,
    plan: mergeById(base.plan, over.plan),
    routines: mergeById(base.routines, over.routines ?? []),
  }
}

const EMPTY: AppData = { tasks: [], clients: [], projects: [], payments: [], goal: null, plan: [], routines: [] }

/**
 * Cuando un archivo cambió en GitHub mientras lo editabas (otro dispositivo), en vez de pisarlo se fusiona por id:
 * lo del otro dispositivo se conserva y tu versión gana en lo que tocaste. Devuelve el contenido nuevo, o null si
 * no se puede fusionar (ahí se sube el local como estaba).
 */
export function mergeConflict(path: string, local: string, remote: string): string | null {
  const l = readBlock(local)
  const r = readBlock(remote)
  if (!l || !r) return null
  if (path === CLIENTS_FILE) return clientsFile({ ...EMPTY, clients: mergeById(r.clients ?? [], l.clients ?? []), projects: mergeById(r.projects ?? [], l.projects ?? []), payments: mergeById(r.payments ?? [], l.payments ?? []) })
  if (path === GOALS_FILE) return goalsFile({ ...EMPTY, goal: l.goal ?? r.goal ?? null, plan: mergeById(r.plan ?? [], l.plan ?? []), routines: mergeById(r.routines ?? [], l.routines ?? []) })
  if (path.startsWith(`${TASKS_DIR}/`) && Array.isArray(l) && Array.isArray(r)) return tasksFile(path.slice(TASKS_DIR.length + 1).replace(/\.md$/, ''), mergeById<Task>(r, l))
  return null
}

/** Cambios necesarios para pasar de `prev` a `next`. */
export function diffFiles(next: Record<string, string>, prev: Record<string, string>): Change[] {
  const changes: Change[] = []
  Object.keys(next).forEach((p) => { if (next[p] !== prev[p]) changes.push({ path: p, content: next[p] }) })
  Object.keys(prev).forEach((p) => { if (!(p in next)) changes.push({ path: p, content: null }) })
  return changes
}

// ---------- GitHub ----------

const b64encode = (s: string) => {
  let bin = ''
  new TextEncoder().encode(s).forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin)
}
const b64decode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)))

const full = (c: SyncConfig, path: string) => [c.dir.trim().replace(/^\/+|\/+$/g, ''), path].filter(Boolean).join('/')
const url = (c: SyncConfig, path: string) => `${API}/repos/${c.repo}/contents/${full(c, path).split('/').map(encodeURIComponent).join('/')}`

async function gh(c: SyncConfig, endpoint: string, init: RequestInit = {}, accept = 'application/vnd.github+json') {
  let res: Response
  try {
    res = await fetch(endpoint, { ...init, cache: 'no-store', headers: { Accept: accept, Authorization: `Bearer ${c.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
  } catch {
    throw new SyncError(0, 'No hay conexión con GitHub.')
  }
  if (!res.ok) {
    let msg = ''
    try { msg = (await res.json()).message ?? '' } catch { /* sin cuerpo */ }
    const hint = res.status === 401 ? 'El token no es válido o venció.' : res.status === 403 ? 'El token no tiene permiso (necesita Contents: Read and write) o se pasó el límite.' : res.status === 404 ? 'No encuentro el repo. Revisá el nombre y que el token tenga acceso a él.' : msg
    throw new SyncError(res.status, hint || `Error ${res.status} de GitHub.`)
  }
  return res
}

const refQuery = (c: SyncConfig) => (c.branch.trim() ? `?ref=${encodeURIComponent(c.branch.trim())}` : '')

export async function checkRepo(c: SyncConfig) {
  const res = await gh(c, `${API}/repos/${c.repo}`)
  const info = await res.json()
  if (info.permissions && info.permissions.push === false) throw new SyncError(403, 'El token puede leer el repo pero no escribir. Dale permiso Contents: Read and write.')
  return { isPrivate: !!info.private, name: info.full_name as string }
}

async function getFile(c: SyncConfig, path: string): Promise<{ text: string; sha: string } | null> {
  try {
    const res = await gh(c, url(c, path) + refQuery(c))
    const j = await res.json()
    if (Array.isArray(j)) return null
    if (j.content) return { text: b64decode(j.content), sha: j.sha }
    // Archivos de más de 1 MB: la API no manda el contenido en base64.
    const raw = await gh(c, url(c, path) + refQuery(c), {}, 'application/vnd.github.raw+json')
    return { text: await raw.text(), sha: j.sha }
  } catch (e) {
    if (e instanceof SyncError && e.status === 404) return null
    throw e
  }
}

export async function pullAll(c: SyncConfig) {
  const files: Record<string, string> = {}
  const shas: Record<string, string> = {}
  let taskNames: string[] = []
  try {
    const res = await gh(c, url(c, TASKS_DIR) + refQuery(c))
    const list = await res.json()
    if (Array.isArray(list)) taskNames = list.filter((f: { name: string; type: string }) => f.type === 'file' && f.name.endsWith('.md')).map((f: { name: string }) => `${TASKS_DIR}/${f.name}`)
  } catch (e) {
    if (!(e instanceof SyncError && e.status === 404)) throw e
  }
  await Promise.all([CLIENTS_FILE, GOALS_FILE, ...taskNames].map(async (p) => {
    const f = await getFile(c, p)
    if (f) { files[p] = f.text; shas[p] = f.sha }
  }))
  return { files, shas }
}

/** Sube los cambios. Devuelve las rutas que se fusionaron con lo que había en GitHub: hay que volver a leerlas. */
export async function pushChanges(c: SyncConfig, changes: Change[], shas: Record<string, string>) {
  const merged: string[] = []
  for (const ch of changes) {
    const send = async (sha?: string) => {
      const body = ch.content === null
        ? { message: `Tasker CRM: borrar ${ch.path}`, sha, ...(c.branch.trim() ? { branch: c.branch.trim() } : {}) }
        : { message: `Tasker CRM: actualizar ${ch.path}`, content: b64encode(ch.content), sha, ...(c.branch.trim() ? { branch: c.branch.trim() } : {}) }
      return gh(c, url(c, ch.path), { method: ch.content === null ? 'DELETE' : 'PUT', body: JSON.stringify(body) })
    }
    if (ch.content === null && !shas[ch.path]) {
      const f = await getFile(c, ch.path)
      if (!f) continue
      shas[ch.path] = f.sha
    }
    let res: Response
    try {
      res = await send(shas[ch.path])
    } catch (e) {
      // El archivo cambió en GitHub (otro dispositivo) o el sha quedó viejo: se vuelve a leer el sha y se reintenta una vez.
      if (!(e instanceof SyncError && (e.status === 409 || e.status === 422))) throw e
      const f = await getFile(c, ch.path)
      if (f) shas[ch.path] = f.sha
      else delete shas[ch.path]
      if (ch.content === null && !f) continue
      // Si el archivo cambió desde otro dispositivo, se fusiona por id para no pisar lo del otro.
      if (f && ch.content !== null) {
        const union = mergeConflict(ch.path, ch.content, f.text)
        if (union !== null && union !== f.text) { ch.content = union; merged.push(ch.path) }
        else if (union === f.text) { merged.push(ch.path); continue }
      }
      res = await send(shas[ch.path])
    }
    const j = await res.json()
    if (ch.content === null) delete shas[ch.path]
    else if (j.content?.sha) shas[ch.path] = j.content.sha
  }
  return merged
}
