'use client'

import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, FolderPlus, IdCard, LayoutList, Pencil, Plus, Search, StickyNote, Trash2, UserPlus, Users, X } from 'lucide-react'
import {
  BILLING_LABEL,
  CLIENT_STATUSES,
  IDLE_DAYS,
  STAGE_GROUPS,
  clientStatus,
  NO_CLIENT,
  PERSONAL,
  PALETTE,
  billingOf,
  dateKey,
  fmtHours,
  fmtMoney,
  fmtShort,
  goldFor,
  normalizeUrl,
  parseAmount,
  uid,
  type Billing,
  type Client,
  type ClientStatus,
  type Link,
  type Payment,
  type Project,
  type ProjectStatus,
  type Task,
} from '@/lib/game'
import { ExportMenu } from './export-menu'
import { LinkChip, LinksEditor } from './link-chip'

type Props = {
  clients: Client[]
  projects: Project[]
  tasks: Task[]
  payments: Payment[]
  setClients: (fn: (c: Client[]) => Client[]) => void
  setProjects: (fn: (p: Project[]) => Project[]) => void
  setTasks: (fn: (t: Task[]) => Task[]) => void
  setPayments: (fn: (p: Payment[]) => Payment[]) => void
}

type ClientDraft = { id?: string; name: string; color: string; status: ClientStatus; notes: string; links: Link[]; since: string }
type ProjectDraft = { id?: string; name: string; clientId: string; billing: Billing; rate: string; price: string; color: string; status: ProjectStatus; links: Link[] }
type PaymentDraft = { projectId: string; label: string; amount: string; date: string }

const STATUSES = CLIENT_STATUSES
const cleanLinks = (links: Link[]) => links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim() || hostOf(l.url), url: normalizeUrl(l.url) }))
const PROJECT_STATUSES: { id: ProjectStatus; label: string }[] = [
  { id: 'activo', label: 'Activo' },
  { id: 'pausado', label: 'Pausado' },
  { id: 'terminado', label: 'Terminado' },
]
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtDate = (d: string) => { const [y, m, day] = d.split('-').map(Number); return `${day} ${MONTHS[m - 1]} ${y}` }
const statusOf = (p: Project): ProjectStatus => p.status ?? 'activo'
// Como en Upwork: o cobrás por hora, o arreglás un presupuesto cerrado y vas registrando lo que te pagan.
const BILLINGS: Billing[] = ['hora', 'fijo']
const BILLING_HELP: Record<Billing, string> = {
  hora: 'El monto se calcula solo: horas × tarifa. Ideal para plataformas como Outlier.',
  fijo: 'Un precio total acordado. Cada vez que te pagan (ej. el adelanto) lo registrás y ves cuánto falta cobrar y cuánto te rindió la hora.',
  entrega: 'Cobrás un monto por cada entrega y lo registrás como cobro.',
  interno: '',
}

/** Las plataformas no tienen tarifa propia: cada proyecto por hora tiene la suya. Acá se resume el rango. */
function rateRange(projects: Project[]) {
  const rates = projects.filter((p) => billingOf(p) === 'hora' && p.rate > 0 && (p.status ?? 'activo') === 'activo').map((p) => p.rate)
  if (!rates.length) return null
  const lo = Math.min(...rates), hi = Math.max(...rates)
  return <> · <b>{lo === hi ? fmtShort(lo) : `${fmtShort(lo)}–${fmtShort(hi)}`} US$/h</b></>
}

/** Días desde la última tarea registrada; Infinity si nunca. */
function idleDays(tasks: Task[]) {
  const last = tasks.reduce((m, t) => (t.date > m ? t.date : m), '')
  if (!last) return Infinity
  return Math.floor((new Date(`${dateKey()}T12:00:00`).getTime() - new Date(`${last}T12:00:00`).getTime()) / 86400000)
}

function hostOf(url: string) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function ClientsView({ clients, projects, tasks, payments, setClients, setProjects, setTasks, setPayments }: Props) {
  const [clientDraft, setClientDraft] = useState<ClientDraft | null>(null)
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null)
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [openPayments, setOpenPayments] = useState<Record<string, boolean>>({})
  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'personal' | ''>('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  // Con muchos proyectos: por defecto sólo los activos, y se puede ver una lista plana filtrada por cliente.
  const [layout, setLayout] = useState<'clientes' | 'proyectos'>('clientes')
  const [projectStatus, setProjectStatus] = useState<ProjectStatus | ''>('activo')
  const [clientFilter, setClientFilter] = useState('')
  const [sheetId, setSheetId] = useState<string | null>(null)

  const projectTotals = (p: Project) => {
    const ts = tasks.filter((t) => t.projectId === p.id)
    const ps = payments.filter((x) => x.projectId === p.id)
    const seconds = ts.reduce((s, t) => s + t.seconds, 0)
    const paid = ps.filter((x) => x.paid).reduce((s, x) => s + x.amount, 0)
    const pending = ps.filter((x) => !x.paid).reduce((s, x) => s + x.amount, 0)
    const amount = ts.reduce((s, t) => s + t.amount, 0) + paid
    return { seconds, amount, paid, pending, payments: ps }
  }

  const clientTotals = (c: Client | null) => {
    const own = projects.filter((p) => (c ? p.clientId === c.id : !p.clientId || !clients.some((x) => x.id === p.clientId)))
    const ids = new Set(own.map((p) => p.id))
    // Tareas sin proyecto se cuentan por el nombre de cliente con que se registraron.
    const loose = tasks.filter((t) => !t.projectId && t.client === (c?.name ?? NO_CLIENT))
    const ts = [...tasks.filter((t) => t.projectId && ids.has(t.projectId)), ...loose]
    const paid = payments.filter((x) => x.paid && x.projectId && ids.has(x.projectId)).reduce((s, x) => s + x.amount, 0)
    // Por cobrar: cobros pendientes y lo que falta de cada presupuesto.
    const pending = own.reduce((s, p) => {
      const ps = payments.filter((x) => x.projectId === p.id)
      const got = ps.filter((x) => x.paid).reduce((a, x) => a + x.amount, 0)
      const waiting = ps.filter((x) => !x.paid).reduce((a, x) => a + x.amount, 0)
      return s + (billingOf(p) === 'fijo' ? Math.max(waiting, (p.price ?? 0) - got) : waiting)
    }, 0)
    return { seconds: ts.reduce((s, t) => s + t.seconds, 0), amount: ts.reduce((s, t) => s + t.amount, 0) + paid, pending, tasks: ts, projects: own }
  }

  // Última vez que se trabajó en un proyecto: para ordenar la lista plana.
  const lastWork = (projectId: string) => tasks.reduce((m, t) => (t.projectId === projectId && t.date > m ? t.date : m), '')

  // ---- clientes ----
  function newClient() {
    setClientDraft({ name: '', color: PALETTE[clients.length % PALETTE.length], status: 'vista', notes: '', links: [{ label: '', url: '' }], since: dateKey() })
    setError('')
  }

  function saveClient() {
    if (!clientDraft) return
    const name = clientDraft.name.trim()
    if (!name) return setError('Ponele un nombre a la plataforma.')
    if (clients.some((c) => c.id !== clientDraft.id && c.name.toLowerCase() === name.toLowerCase())) return setError(`Ya existe una plataforma llamada “${name}”.`)
    const links = cleanLinks(clientDraft.links)
    const data = { name, color: clientDraft.color, status: clientDraft.status, notes: clientDraft.notes.trim(), links, since: clientDraft.since }
    if (clientDraft.id) {
      const old = clients.find((c) => c.id === clientDraft.id)
      setClients((cur) => cur.map((c) => (c.id === clientDraft.id ? { ...c, ...data } : c)))
      // Las tareas guardan el nombre: se actualiza para que historial y gráficos coincidan.
      if (old && old.name !== name) {
        const ids = new Set(projects.filter((p) => p.clientId === old.id).map((p) => p.id))
        setTasks((cur) => cur.map((t) => (t.projectId && ids.has(t.projectId) ? { ...t, client: name } : t)))
      }
    } else setClients((cur) => [...cur, { id: uid(), ...data }])
    setClientDraft(null)
    setError('')
  }

  function editClient(c: Client) {
    setClientDraft({ id: c.id, name: c.name, color: c.color, status: clientStatus(c), notes: c.notes ?? '', links: c.links?.length ? c.links : [{ label: '', url: '' }], since: c.since ?? '' })
    setError('')
  }

  function newProject(clientId: string, color: string) {
    setProjectDraft({ name: '', clientId, billing: clientId ? 'hora' : 'interno', rate: '', price: '', color, status: 'activo', links: [{ label: '', url: '' }] })
    setError('')
  }

  function deleteClient(c: Client) {
    const n = projects.filter((p) => p.clientId === c.id).length
    if (!window.confirm(`¿Borrar la plataforma “${c.name}”?${n ? ` Sus ${n} proyecto(s) pasan a Personal.` : ''} Las tareas ya registradas no cambian.`)) return
    setClients((cur) => cur.filter((x) => x.id !== c.id))
    setSheetId(null)
    setProjects((cur) => cur.map((p) => (p.clientId === c.id ? { ...p, clientId: null } : p)))
  }

  // ---- proyectos ----
  function editProject(p: Project) {
    setProjectDraft({ id: p.id, name: p.name, clientId: p.clientId ?? '', billing: billingOf(p), rate: p.rate ? String(p.rate) : '', price: p.price ? String(p.price) : '', color: p.color, status: statusOf(p), links: p.links?.length ? p.links : [{ label: '', url: '' }] })
    setError('')
  }

  function saveProject() {
    if (!projectDraft) return
    const name = projectDraft.name.trim()
    if (!name) return setError('Ponele un nombre al proyecto.')
    // Sin cliente es un proyecto personal: suma tiempo, nunca plata.
    const billing: Billing = projectDraft.clientId ? (projectDraft.billing === 'interno' ? 'hora' : projectDraft.billing) : 'interno'
    const rate = billing === 'hora' || billing === 'entrega' ? parseAmount(projectDraft.rate) : 0
    const price = billing === 'fijo' ? parseAmount(projectDraft.price) : 0
    const clientId = projectDraft.clientId || null
    const data = { name, clientId, rate, price, billing, color: projectDraft.color, status: projectDraft.status, links: cleanLinks(projectDraft.links) }
    const clientName = clients.find((c) => c.id === clientId)?.name ?? NO_CLIENT

    if (projectDraft.id) {
      const id = projectDraft.id
      const old = projects.find((p) => p.id === id)!
      const own = tasks.filter((t) => t.projectId === id)
      const hourlyNow = billing === 'hora' ? rate : 0
      const oldHourly = billingOf(old) === 'hora' ? old.rate : 0
      // Cambiar la tarifa no toca el pasado salvo que el usuario lo pida.
      const reprice = own.length > 0 && hourlyNow !== oldHourly &&
        window.confirm(`Cambiaste la tarifa por hora de ${fmtMoney(oldHourly)} a ${fmtMoney(hourlyNow)} USD/h.\n\n¿Recalcular también las ${own.length} tarea(s) ya registradas de este proyecto?\n\nAceptar = recalcular · Cancelar = sólo tareas nuevas`)
      setProjects((cur) => cur.map((p) => (p.id === id ? { ...p, ...data } : p)))
      setTasks((cur) => cur.map((t) => {
        if (t.projectId !== id) return t
        const next = { ...t, project: name, client: clientName, color: data.color }
        if (!reprice) return next
        const amount = t.billable && hourlyNow > 0 ? goldFor(t.seconds, hourlyNow) : 0
        return { ...next, rate: hourlyNow, amount }
      }))
    } else setProjects((cur) => [...cur, { id: uid(), ...data }])
    setProjectDraft(null)
    setError('')
  }

  function deleteProject(p: Project) {
    const n = payments.filter((x) => x.projectId === p.id).length
    if (!window.confirm(`¿Borrar el proyecto “${p.name}”? Las tareas ya registradas conservan su nombre y monto.${n ? ` Sus ${n} pago(s) también se borran.` : ''}`)) return
    setProjects((cur) => cur.filter((x) => x.id !== p.id))
    setPayments((cur) => cur.filter((x) => x.projectId !== p.id))
  }

  // ---- pagos ----
  /** Registra un cobro. Por defecto propone lo que falta cobrar del presupuesto. */
  function newPayment(p: Project) {
    const own = payments.filter((x) => x.projectId === p.id)
    const paid = own.filter((x) => x.paid).reduce((s, x) => s + x.amount, 0)
    const left = Math.max(0, (p.price ?? 0) - paid)
    setPaymentDraft({
      projectId: p.id,
      label: own.length === 0 ? 'Adelanto' : billingOf(p) === 'entrega' ? `Entrega ${own.length + 1}` : left > 0 ? 'Pago final' : `Pago ${own.length + 1}`,
      amount: billingOf(p) === 'entrega' && p.rate ? String(p.rate) : left > 0 && own.length > 0 ? String(left) : '',
      date: dateKey(),
    })
    setOpenPayments((o) => ({ ...o, [p.id]: true }))
    setError('')
  }

  function savePayment() {
    if (!paymentDraft) return
    const amount = parseAmount(paymentDraft.amount)
    if (amount <= 0) return setError('Poné el monto del pago.')
    setPayments((cur) => [...cur, { id: uid(), projectId: paymentDraft.projectId, label: paymentDraft.label.trim() || 'Pago', amount, date: paymentDraft.date || dateKey(), paid: true }])
    setPaymentDraft(null)
    setError('')
  }

  const q = query.trim().toLowerCase()
  const match = (text: string) => !q || text.toLowerCase().includes(q)
  const isPersonal = (p: Project) => !p.clientId || !clients.some((c) => c.id === p.clientId)
  const personal = projects.filter(isPersonal)
  const statusOk = (p: Project) => !projectStatus || statusOf(p) === projectStatus
  const showClients = clientFilter ? (clientFilter === 'personal' ? [] : clients.filter((c) => c.id === clientFilter)) : statusFilter === 'personal' ? [] : clients.filter((c) => !statusFilter || clientStatus(c) === statusFilter)
  const showPersonal = clientFilter ? clientFilter === 'personal' : !statusFilter || statusFilter === 'personal'
  const groups = [
    ...showClients.map((c) => {
      const own = projects.filter((p) => p.clientId === c.id)
      // Si coincide el cliente se ven todos sus proyectos; si no, sólo los que coinciden.
      const found = match(c.name) ? own : own.filter((p) => match(p.name))
      return { client: c as Client | null, items: found.filter(statusOk), hidden: found.filter((p) => !statusOk(p)).length }
    }).filter((g) => !q || match(g.client!.name) || g.items.length > 0),
    ...(showPersonal ? [(() => { const found = personal.filter((p) => match(p.name) || match(PERSONAL)); return { client: null, items: found.filter(statusOk), hidden: found.filter((p) => !statusOk(p)).length } })()] : []),
  ]
  // Lista plana de proyectos: lo más reciente arriba.
  const flat = groups.flatMap((g) => g.items).sort((a, b) => lastWork(b.id).localeCompare(lastWork(a.id)) || a.name.localeCompare(b.name))
  const sheet = sheetId ? clients.find((c) => c.id === sheetId) ?? null : null
  const counts = STATUSES.map((s) => ({ ...s, n: clients.filter((c) => clientStatus(c) === s.id).length }))

  function renderProject(p: Project, withClient = false) {
    const pt = projectTotals(p)
    const st = statusOf(p)
    const owner = clients.find((c) => c.id === p.clientId)
    const billing = billingOf(p)
    const usesPayments = billing === 'fijo' || billing === 'entrega'
    const perHour = pt.seconds > 0 && pt.amount > 0 ? pt.amount / (pt.seconds / 3600) : 0
    const price = p.price ?? 0
    return (
      <div className={`project-block ${st === 'terminado' ? 'project-done' : ''}`} key={p.id}>
        <div className={`project-row ${withClient ? 'flat' : ''}`}>
          <i className="dot" style={{ background: p.color }} />
          <strong>{p.name}</strong>
          {withClient && owner && <button className="text-button project-client" onClick={() => setSheetId(owner.id)} title="Ver ficha de la plataforma">{owner.name}</button>}
          {st !== 'activo' && <span className={`status-pill status-${st}`}>{PROJECT_STATUSES.find((x) => x.id === st)!.label}</span>}
          <span className="rate-badge">{billing === 'hora' ? (p.rate > 0 ? `${fmtShort(p.rate)} USD/h` : 'sin tarifa') : billing === 'fijo' ? `Presupuesto ${price ? `US$ ${fmtShort(price)}` : ''}` : billing === 'entrega' ? `${p.rate ? `US$ ${fmtShort(p.rate)} ` : ''}por entrega` : BILLING_LABEL[billing]}</span>
          <span className="project-meta">{fmtHours(pt.seconds)}{billing !== 'interno' && <> · US$ {fmtMoney(pt.amount)}{perHour > 0 && billing !== 'hora' && <> · {fmtShort(Math.round(perHour * 100) / 100)}/h reales</>}</>}</span>
          <div className="row-actions">
            {usesPayments && <button className="text-button" onClick={() => setOpenPayments((o) => ({ ...o, [p.id]: !o[p.id] }))}>Cobros ({pt.payments.length})</button>}
            <button className="icon-button" onClick={() => editProject(p)} aria-label={`Editar ${p.name}`} title="Editar"><Pencil /></button>
            <button className="icon-button danger" onClick={() => deleteProject(p)} aria-label={`Borrar ${p.name}`} title="Borrar"><Trash2 /></button>
          </div>
        </div>
        {p.links?.length ? <div className="project-links">{p.links.map((l, i) => <LinkChip key={i} link={l} />)}</div> : null}
        {billing === 'fijo' && (
          <div className="project-progress">
            {price > 0 && <div className="thin-track"><div style={{ width: `${Math.min(100, (pt.paid / price) * 100)}%` }} /></div>}
            <small>{price > 0 ? <>Cobrado <b>US$ {fmtShort(pt.paid)}</b> de {fmtShort(price)}{price - pt.paid > 0 ? <> · falta cobrar <b>US$ {fmtShort(price - pt.paid)}</b></> : ' · cobrado completo'}</> : <>Cobrado US$ {fmtShort(pt.paid)} · poné el presupuesto total editando el proyecto</>}</small>
            <button className="text-button" onClick={() => newPayment(p)}><Plus /> Registrar cobro</button>
          </div>
        )}
        {usesPayments && openPayments[p.id] && (
          <div className="payments">
            {pt.payments.length === 0 && <p className="muted-line">Todavía no registraste cobros.</p>}
            {[...pt.payments].sort((a, b) => a.date.localeCompare(b.date)).map((x) => (
              <div className="payment-row" key={x.id}>
                {x.paid ? <Check className="paid-icon" /> : <button className="pay-check" onClick={() => setPayments((cur) => cur.map((y) => (y.id === x.id ? { ...y, paid: true, date: dateKey() } : y)))} aria-label="Marcar como cobrado" title="Pendiente: tocá cuando lo cobres" />}
                <span className="payment-label">{x.label}</span>
                <span className="payment-date">{x.paid ? x.date.split('-').reverse().join('/') : 'pendiente'}</span>
                <strong>US$ {fmtMoney(x.amount)}</strong>
                <button className="icon-button danger" onClick={() => window.confirm(`¿Borrar “${x.label}”?`) && setPayments((cur) => cur.filter((y) => y.id !== x.id))} aria-label="Borrar cobro"><X /></button>
              </div>
            ))}
            {billing === 'entrega' && <div className="payment-actions"><button className="text-button" onClick={() => newPayment(p)}><Plus /> Registrar cobro</button></div>}
          </div>
        )}
      </div>
    )

  }

  return (
    <section className="view">
      <div className="view-heading">
        <div><h2>Plataformas</h2><p className="view-sub">Cada plataforma (Outlier, LinkedIn, Upwork…) tiene su etapa y sus proyectos, cada uno con su tarifa por hora y sus links (Slack, Meet, manuales). En <b>Personal</b> va lo tuyo, sin plataforma: suma tiempo, no plata.</p></div>
        <div className="heading-actions">
          <button className="ghost-button" onClick={() => newProject('', PALETTE[projects.length % PALETTE.length])}><FolderPlus /> Nuevo proyecto</button>
          <button className="primary-button" onClick={newClient}><UserPlus /> Nueva plataforma</button>
        </div>
      </div>

      <div className="clients-toolbar">
        <div className="segmented small" role="tablist" aria-label="Vista">
          <button role="tab" aria-selected={layout === 'clientes'} className={layout === 'clientes' ? 'seg-on' : ''} onClick={() => setLayout('clientes')}><Users /> Por plataforma</button>
          <button role="tab" aria-selected={layout === 'proyectos'} className={layout === 'proyectos' ? 'seg-on' : ''} onClick={() => setLayout('proyectos')}><LayoutList /> Proyectos</button>
        </div>
        <label className="search-input clients-search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar plataforma o proyecto" aria-label="Buscar plataforma o proyecto" />{query && <button className="icon-button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><X /></button>}</label>
      </div>
      <div className="task-filters">
        {!clientFilter && layout === 'clientes' && <div className="funnel-filter" role="tablist" aria-label="Etapa">
          <button role="tab" aria-selected={!statusFilter} className={!statusFilter ? 'seg-on' : ''} onClick={() => setStatusFilter('')}>Todas <small>{clients.length}</small></button>
          {STAGE_GROUPS.map((g) => <div className="funnel-group" key={g.id}><span>{g.label}</span>{g.stages.map((id) => { const st = counts.find((x) => x.id === id)!; return <button key={id} role="tab" title={st.help} aria-selected={statusFilter === id} className={statusFilter === id ? 'seg-on' : ''} onClick={() => setStatusFilter(id)}>{st.label} <small>{st.n}</small></button> })}</div>)}
          <div className="funnel-group"><span>Sin plataforma</span><button role="tab" aria-selected={statusFilter === 'personal'} className={statusFilter === 'personal' ? 'seg-on' : ''} onClick={() => setStatusFilter('personal')}>{PERSONAL} <small>{personal.length}</small></button></div>
        </div>}
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} aria-label="Filtrar por plataforma"><option value="">Todas las plataformas</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="personal">{PERSONAL}</option></select>
        <select value={projectStatus} onChange={(e) => setProjectStatus(e.target.value as ProjectStatus | '')} aria-label="Estado de los proyectos"><option value="activo">Proyectos activos</option><option value="pausado">Proyectos pausados</option><option value="terminado">Proyectos terminados</option><option value="">Todos los proyectos</option></select>
        {(clientFilter || projectStatus !== 'activo' || statusFilter) && <button className="text-button" onClick={() => { setClientFilter(''); setProjectStatus('activo'); setStatusFilter('') }}><X /> Limpiar</button>}
      </div>

      {layout === 'proyectos' ? (
        <div className="client-card project-list">
          {flat.length === 0 ? <p className="muted-line">No hay proyectos con estos filtros.</p> : flat.map((p) => renderProject(p, true))}
        </div>
      ) : (
      <div className="client-list">
        {groups.map(({ client, items, hidden }) => {
          if (!client && items.length === 0 && hidden === 0) return null
          const key = client?.id ?? 'none'
          const tot = clientTotals(client)
          const status = clientStatus(client)
          return (
            <div className="client-card" key={key}>
              <div className="client-head">
                <button className="client-collapse" onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))} aria-label={collapsed[key] ? 'Mostrar proyectos' : 'Ocultar proyectos'}>{collapsed[key] ? <ChevronRight /> : <ChevronDown />}</button>
                {client ? (
                  <button className="client-open" onClick={() => setSheetId(client.id)} title="Ver ficha de la plataforma">
                    <i className="client-avatar" style={{ color: client.color }}>{client.name.slice(0, 1).toUpperCase()}</i>
                    <div className="client-title">
                      <strong>{client.name}<span className={`status-pill status-${status}`}>{STATUSES.find((s) => s.id === status)!.label}</span></strong>
                      <span>{items.length} proyecto{items.length === 1 ? '' : 's'}{projectStatus ? ` ${PROJECT_STATUSES.find((x) => x.id === projectStatus)!.label.toLowerCase()}${items.length === 1 ? '' : 's'}` : ''} · {fmtHours(tot.seconds)} · US$ {fmtMoney(tot.amount)}{rateRange(items)}{status === 'activo' && (() => { const d = idleDays(tot.tasks); return d >= IDLE_DAYS ? <> · <span className="idle-hint" title="¿Pasarla a En pausa?">sin taskear hace {d} días</span></> : null })()}</span>
                    </div>
                  </button>
                ) : <>
                  <i className="client-avatar" style={{ color: 'var(--muted)' }}>—</i>
                  <div className="client-title"><strong>{PERSONAL}</strong><span>{items.length} proyecto{items.length === 1 ? '' : 's'} · {fmtHours(tot.seconds)}</span></div>
                </>}
                {!client && <div className="row-actions"><button className="icon-button" onClick={() => newProject('', PALETTE[projects.length % PALETTE.length])} aria-label="Agregar proyecto personal" title="Agregar proyecto personal"><FolderPlus /></button></div>}
                {client && <div className="row-actions">
                  <button className="icon-button" onClick={() => setSheetId(client.id)} aria-label={`Ficha de ${client.name}`} title="Ver ficha"><IdCard /></button>
                  <button className="icon-button" onClick={() => newProject(client.id, client.color)} aria-label={`Agregar proyecto a ${client.name}`} title="Agregar proyecto"><FolderPlus /></button>
                  <button className="icon-button hide-mobile" onClick={() => editClient(client)} aria-label={`Editar ${client.name}`} title="Editar"><Pencil /></button>
                </div>}
              </div>
              {!collapsed[key] && (
                <div className="project-rows">
                  {items.length === 0 && hidden === 0 && <p className="muted-line">Sin proyectos. Tocá <FolderPlus className="inline-icon" /> para agregar uno.</p>}
                  {items.map((p) => renderProject(p))}
                  {hidden > 0 && <button className="text-button hidden-projects" onClick={() => setProjectStatus('')}>+ {hidden} proyecto{hidden === 1 ? '' : 's'} más (pausados o terminados)</button>}
                </div>
              )}
            </div>
          )
        })}
        {q && groups.every((g) => g.items.length === 0 && !g.client) && <p className="empty-list">No hay plataformas ni proyectos con “{query}”.</p>}
        {clients.length === 0 && projects.length === 0 && <p className="empty-list">Todavía no cargaste plataformas. Tocá “Nueva plataforma”.</p>}
      </div>
      )}

      {sheet && (() => {
        const tot = clientTotals(sheet)
        const status = clientStatus(sheet)
        const month = dateKey().slice(0, 7)
        const monthSecs = tot.tasks.filter((t) => t.date.startsWith(month)).reduce((s, t) => s + t.seconds, 0)
        const recentTasks = [...tot.tasks].sort((a, b) => (b.date + (b.start ?? '')).localeCompare(a.date + (a.start ?? '')) || b.id - a.id)
        const last = recentTasks[0]?.date
        const first = [...tot.tasks].sort((a, b) => a.date.localeCompare(b.date))[0]?.date
        return (
          <div className="modal-backdrop" onClick={() => setSheetId(null)}>
            <div className="modal-card wide client-sheet" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setSheetId(null)} aria-label="Cerrar"><X /></button>
              <div className="sheet-head">
                <i className="client-avatar big" style={{ color: sheet.color }}>{sheet.name.slice(0, 1).toUpperCase()}</i>
                <div><h2>{sheet.name}</h2><span className={`status-pill status-${status}`}>{STATUSES.find((s) => s.id === status)!.label}</span></div>
              </div>

              <dl className="sheet-data">
                <div><dt>Etapa</dt><dd>{STATUSES.find((s) => s.id === status)!.help}</dd></div>
                <div><dt>En la plataforma desde</dt><dd>{sheet.since ? fmtDate(sheet.since) : first ? fmtDate(first) : <span className="muted">—</span>}</dd></div>
                <div><dt>Última vez que taskeaste</dt><dd>{last ? fmtDate(last) : <span className="muted">Nunca</span>}</dd></div>
              </dl>

              <div className="sheet-stats">
                <div><span>Horas totales</span><strong>{fmtHours(tot.seconds)}</strong></div>
                <div><span>Este mes</span><strong>{fmtHours(monthSecs)}</strong></div>
                <div><span>Ganado</span><strong>US$ {fmtShort(Math.round(tot.amount * 100) / 100)}</strong></div>
                <div><span>Por cobrar</span><strong>US$ {fmtShort(Math.round(tot.pending * 100) / 100)}</strong></div>
              </div>

              {(sheet.links?.length || sheet.notes) ? <div className="sheet-section">
                {sheet.links?.length ? <div className="sheet-links">{sheet.links.map((l, i) => <LinkChip key={i} link={l} />)}</div> : null}
                {sheet.notes && <p className="client-notes">{sheet.notes}</p>}
              </div> : null}

              <div className="sheet-section">
                <h4>Proyectos <small>{tot.projects.length}</small></h4>
                {tot.projects.length === 0 && <p className="muted-line">Sin proyectos.</p>}
                {tot.projects.map((p) => {
                  const pt = projectTotals(p)
                  const st = statusOf(p)
                  return <div className="sheet-row" key={p.id}><i className="dot" style={{ background: p.color }} /><span>{p.name}</span>{st !== 'activo' && <span className={`status-pill status-${st}`}>{PROJECT_STATUSES.find((x) => x.id === st)!.label}</span>}<small>{fmtHours(pt.seconds)} · US$ {fmtShort(Math.round(pt.amount * 100) / 100)}</small><button className="icon-button" onClick={() => editProject(p)} aria-label={`Editar ${p.name}`} title="Editar proyecto"><Pencil /></button></div>
                })}
              </div>

              <div className="sheet-section">
                <h4>Últimas tareas <small>{tot.tasks.length}</small></h4>
                {recentTasks.length === 0 && <p className="muted-line">Todavía no taskeaste en esta plataforma.</p>}
                {recentTasks.slice(0, 8).map((t) => <div className="sheet-row task" key={t.id}><span>{t.name}{t.note && <em><StickyNote className="inline-icon" /> {t.note}</em>}</span><small>{fmtDate(t.date)} · {fmtHours(t.seconds)}</small></div>)}
              </div>

              <div className="modal-actions">
                <button className="ghost-button danger-text" onClick={() => deleteClient(sheet)}><Trash2 /> Borrar</button>
                <ExportMenu tasks={tot.tasks} title={`Trabajo en ${sheet.name}`} label="Exportar trabajo" />
                <button className="ghost-button" onClick={() => newProject(sheet.id, sheet.color)}><FolderPlus /> Proyecto</button>
                <button className="primary-button" onClick={() => editClient(sheet)}><Pencil /> Editar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {clientDraft && (
        <div className="modal-backdrop" onClick={() => setClientDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setClientDraft(null)} aria-label="Cerrar"><X /></button>
            <h2>{clientDraft.id ? 'Editar plataforma' : 'Nueva plataforma'}</h2>
            <div className="form-grid">
              <label>Nombre<input autoFocus value={clientDraft.name} onChange={(e) => setClientDraft({ ...clientDraft, name: e.target.value })} placeholder="Ej. Outlier, Upwork, LinkedIn" /></label>
              <div className="field"><span>Etapa</span><div className="segmented small wrap">{STATUSES.map((s) => <button type="button" key={s.id} title={s.help} className={clientStatus(clientDraft) === s.id ? 'seg-on' : ''} onClick={() => setClientDraft({ ...clientDraft, status: s.id })}>{s.label}</button>)}</div><small className="field-help">{STATUSES.find((s) => s.id === clientStatus(clientDraft))!.help}</small></div>
              <label>En la plataforma desde<input type="date" value={clientDraft.since} onChange={(e) => setClientDraft({ ...clientDraft, since: e.target.value })} /></label>
              <LinksEditor links={clientDraft.links} onChange={(links) => setClientDraft({ ...clientDraft, links })} urlPlaceholder="app.outlier.ai" />
              <label>Notas<textarea rows={3} value={clientDraft.notes} onChange={(e) => setClientDraft({ ...clientDraft, notes: e.target.value })} placeholder="Cuándo pagan, requisitos, próximos pasos…" /></label>
              <div className="field"><span>Color</span><div className="swatches">{PALETTE.map((col) => <button type="button" key={col} className={clientDraft.color === col ? 'swatch-on' : ''} style={{ background: col }} onClick={() => setClientDraft({ ...clientDraft, color: col })} aria-label={`Color ${col}`} />)}</div></div>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions"><button className="ghost-button" onClick={() => setClientDraft(null)}>Cancelar</button><button className="primary-button" onClick={saveClient}>Guardar</button></div>
          </div>
        </div>
      )}

      {projectDraft && (
        <div className="modal-backdrop" onClick={() => setProjectDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setProjectDraft(null)} aria-label="Cerrar"><X /></button>
            <h2>{projectDraft.id ? 'Editar proyecto' : 'Nuevo proyecto'}</h2>
            <div className="form-grid">
              <label>Nombre<input autoFocus value={projectDraft.name} onChange={(e) => setProjectDraft({ ...projectDraft, name: e.target.value })} placeholder="Ej. AI trainer, Onboarding Meridial" /></label>
              <div className="field"><span>Estado</span><div className="segmented small">{PROJECT_STATUSES.map((x) => <button type="button" key={x.id} className={projectDraft.status === x.id ? 'seg-on' : ''} onClick={() => setProjectDraft({ ...projectDraft, status: x.id })}>{x.label}</button>)}</div><small className="field-help">Los terminados no aparecen al elegir proyecto en el timer.</small></div>
              <label>Plataforma<select value={projectDraft.clientId} onChange={(e) => setProjectDraft({ ...projectDraft, clientId: e.target.value, billing: e.target.value ? (projectDraft.billing === 'interno' ? 'hora' : projectDraft.billing) : 'interno' })}><option value="">{PERSONAL}</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              {!projectDraft.clientId ? <small className="field-help">Proyecto personal: registrás el tiempo que le dedicás (CV, LinkedIn, buscar trabajo), sin tarifa ni cobros.</small> : <>
              <div className="field"><span>Cómo se cobra</span>
                <div className="segmented small wrap">{(projectDraft.billing === 'entrega' ? [...BILLINGS, 'entrega' as Billing] : BILLINGS).map((b) => <button type="button" key={b} className={projectDraft.billing === b ? 'seg-on' : ''} onClick={() => setProjectDraft({ ...projectDraft, billing: b })}>{BILLING_LABEL[b]}</button>)}</div>
                <small className="field-help">{BILLING_HELP[projectDraft.billing]}</small>
              </div>
              {projectDraft.billing === 'hora' && <label>Tarifa por hora<span className="rate-input"><span>US$</span><input inputMode="decimal" value={projectDraft.rate} onChange={(e) => setProjectDraft({ ...projectDraft, rate: e.target.value })} placeholder="0" /><span>/h</span></span></label>}
              {projectDraft.billing === 'entrega' && <label>Precio por entrega<span className="rate-input"><span>US$</span><input inputMode="decimal" value={projectDraft.rate} onChange={(e) => setProjectDraft({ ...projectDraft, rate: e.target.value })} placeholder="0" /></span></label>}
              {projectDraft.billing === 'fijo' && <label>Precio total<span className="rate-input"><span>US$</span><input inputMode="decimal" value={projectDraft.price} onChange={(e) => setProjectDraft({ ...projectDraft, price: e.target.value })} placeholder="2000" /></span></label>}
              </>}
              <LinksEditor links={projectDraft.links} onChange={(links) => setProjectDraft({ ...projectDraft, links })} />
              <div className="field"><span>Color</span><div className="swatches">{PALETTE.map((col) => <button type="button" key={col} className={projectDraft.color === col ? 'swatch-on' : ''} style={{ background: col }} onClick={() => setProjectDraft({ ...projectDraft, color: col })} aria-label={`Color ${col}`} />)}</div></div>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions"><button className="ghost-button" onClick={() => setProjectDraft(null)}>Cancelar</button><button className="primary-button" onClick={saveProject}>Guardar proyecto</button></div>
          </div>
        </div>
      )}

      {paymentDraft && (
        <div className="modal-backdrop" onClick={() => setPaymentDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPaymentDraft(null)} aria-label="Cerrar"><X /></button>
            <h2>Registrar cobro</h2>
            <p>{projects.find((p) => p.id === paymentDraft.projectId)?.name}</p>
            <div className="form-grid">
              <label>Concepto<input value={paymentDraft.label} onChange={(e) => setPaymentDraft({ ...paymentDraft, label: e.target.value })} placeholder="Adelanto" /></label>
              <div className="modal-fields two">
                <label>Monto<span className="rate-input"><span>US$</span><input autoFocus inputMode="decimal" value={paymentDraft.amount} onChange={(e) => setPaymentDraft({ ...paymentDraft, amount: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && savePayment()} placeholder="0" /></span></label>
                <label>Fecha<input type="date" value={paymentDraft.date} onChange={(e) => setPaymentDraft({ ...paymentDraft, date: e.target.value })} /></label>
              </div>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions"><button className="ghost-button" onClick={() => setPaymentDraft(null)}>Cancelar</button><button className="primary-button" onClick={savePayment}>Guardar cobro</button></div>
          </div>
        </div>
      )}
    </section>
  )
}
