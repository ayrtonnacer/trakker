'use client'

import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, ExternalLink, FolderPlus, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'
import {
  BILLING_LABEL,
  NO_CLIENT,
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
  type Task,
} from '@/lib/game'

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

type ClientDraft = { id?: string; name: string; color: string; status: ClientStatus; notes: string; links: Link[] }
type ProjectDraft = { id?: string; name: string; clientId: string; billing: Billing; rate: string; price: string; color: string }
type PaymentDraft = { projectId: string; label: string; amount: string; date: string; paid: boolean }

const STATUSES: { id: ClientStatus; label: string }[] = [
  { id: 'activo', label: 'Activo' },
  { id: 'potencial', label: 'Potencial' },
  { id: 'pausado', label: 'Pausado' },
]
const BILLINGS: Billing[] = ['hora', 'fijo', 'entrega', 'interno']
const BILLING_HELP: Record<Billing, string> = {
  hora: 'El monto se calcula solo: horas × tarifa. Ideal para plataformas como Outlier o Remotasks.',
  fijo: 'Un precio total acordado. Cargás cada pago (ej. 50% de adelanto y 50% al entregar) y ves cuánto falta cobrar y cuánto te rindió la hora.',
  entrega: 'Cobrás un monto por cada entrega. Registrás el tiempo y cargás un pago por entrega.',
  interno: 'Trabajo para vos: mejorar tu web, mandar propuestas, estudiar. No suma plata, pero ves cuánto tiempo le dedicás.',
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
  const [statusFilter, setStatusFilter] = useState<ClientStatus | ''>('')
  const [error, setError] = useState('')

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
    return { seconds: ts.reduce((s, t) => s + t.seconds, 0), amount: ts.reduce((s, t) => s + t.amount, 0) + paid }
  }

  // ---- clientes ----
  function newClient() {
    setClientDraft({ name: '', color: PALETTE[clients.length % PALETTE.length], status: 'activo', notes: '', links: [{ label: '', url: '' }] })
    setError('')
  }

  function saveClient() {
    if (!clientDraft) return
    const name = clientDraft.name.trim()
    if (!name) return setError('Ponele un nombre al cliente.')
    if (clients.some((c) => c.id !== clientDraft.id && c.name.toLowerCase() === name.toLowerCase())) return setError(`Ya existe un cliente llamado “${name}”.`)
    const links = clientDraft.links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim() || hostOf(l.url), url: normalizeUrl(l.url) }))
    const data = { name, color: clientDraft.color, status: clientDraft.status, notes: clientDraft.notes.trim(), links }
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

  function deleteClient(c: Client) {
    const n = projects.filter((p) => p.clientId === c.id).length
    if (!window.confirm(`¿Borrar el cliente “${c.name}”?${n ? ` Sus ${n} proyecto(s) quedan sin cliente.` : ''} Las tareas ya registradas no cambian.`)) return
    setClients((cur) => cur.filter((x) => x.id !== c.id))
    setProjects((cur) => cur.map((p) => (p.clientId === c.id ? { ...p, clientId: null } : p)))
  }

  // ---- proyectos ----
  function editProject(p: Project) {
    setProjectDraft({ id: p.id, name: p.name, clientId: p.clientId ?? '', billing: billingOf(p), rate: p.rate ? String(p.rate) : '', price: p.price ? String(p.price) : '', color: p.color })
    setError('')
  }

  function saveProject() {
    if (!projectDraft) return
    const name = projectDraft.name.trim()
    if (!name) return setError('Ponele un nombre al proyecto.')
    const billing = projectDraft.billing
    const rate = billing === 'hora' || billing === 'entrega' ? parseAmount(projectDraft.rate) : 0
    const price = billing === 'fijo' ? parseAmount(projectDraft.price) : 0
    const clientId = projectDraft.clientId || null
    const data = { name, clientId, rate, price, billing, color: projectDraft.color }
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
  function newPayment(p: Project, preset?: { label: string; amount: number }) {
    const count = payments.filter((x) => x.projectId === p.id).length
    setPaymentDraft({
      projectId: p.id,
      label: preset?.label ?? (billingOf(p) === 'entrega' ? `Entrega ${count + 1}` : `Pago ${count + 1}`),
      amount: preset ? String(preset.amount) : billingOf(p) === 'entrega' && p.rate ? String(p.rate) : '',
      date: dateKey(),
      paid: true,
    })
    setOpenPayments((o) => ({ ...o, [p.id]: true }))
    setError('')
  }

  function savePayment() {
    if (!paymentDraft) return
    const amount = parseAmount(paymentDraft.amount)
    if (amount <= 0) return setError('Poné el monto del pago.')
    setPayments((cur) => [...cur, { id: uid(), projectId: paymentDraft.projectId, label: paymentDraft.label.trim() || 'Pago', amount, date: paymentDraft.date || dateKey(), paid: paymentDraft.paid }])
    setPaymentDraft(null)
    setError('')
  }

  const groups = [
    ...clients.filter((c) => !statusFilter || (c.status ?? 'activo') === statusFilter).map((c) => ({ client: c as Client | null, items: projects.filter((p) => p.clientId === c.id) })),
    ...(statusFilter ? [] : [{ client: null, items: projects.filter((p) => !p.clientId || !clients.some((c) => c.id === p.clientId)) }]),
  ]
  const counts = STATUSES.map((s) => ({ ...s, n: clients.filter((c) => (c.status ?? 'activo') === s.id).length }))

  return (
    <section className="view">
      <div className="view-heading">
        <div><h2>Clientes y proyectos</h2><p className="view-sub">Guardá los links de cada cliente (plataforma de trabajo, pagos), cómo te paga y el estado de la relación. En <b>Personal / interno</b> van tus proyectos propios, sin cliente: actualizar tu LinkedIn, reescribir el CV, mejorar tu web.</p></div>
        <div className="heading-actions">
          <button className="ghost-button" onClick={() => { setProjectDraft({ name: '', clientId: '', billing: 'hora', rate: '', price: '', color: PALETTE[projects.length % PALETTE.length] }); setError('') }}><FolderPlus /> Nuevo proyecto</button>
          <button className="primary-button" onClick={newClient}><UserPlus /> Nuevo cliente</button>
        </div>
      </div>

      <div className="segmented small status-filter" role="tablist" aria-label="Estado">
        <button role="tab" aria-selected={!statusFilter} className={!statusFilter ? 'seg-on' : ''} onClick={() => setStatusFilter('')}>Todos <small>{clients.length}</small></button>
        {counts.map((s) => <button key={s.id} role="tab" aria-selected={statusFilter === s.id} className={statusFilter === s.id ? 'seg-on' : ''} onClick={() => setStatusFilter(s.id)}>{s.label} <small>{s.n}</small></button>)}
      </div>

      <div className="client-list">
        {groups.map(({ client, items }) => {
          if (!client && items.length === 0) return null
          const key = client?.id ?? 'none'
          const tot = clientTotals(client)
          const status = client?.status ?? 'activo'
          return (
            <div className="client-card" key={key}>
              <div className="client-head">
                <button className="client-collapse" onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))} aria-label={collapsed[key] ? 'Mostrar proyectos' : 'Ocultar proyectos'}>{collapsed[key] ? <ChevronRight /> : <ChevronDown />}</button>
                <i className="client-avatar" style={{ color: client?.color ?? 'var(--muted)' }}>{(client?.name ?? '—').slice(0, 1).toUpperCase()}</i>
                <div className="client-title">
                  <strong>{client?.name ?? 'Personal / interno'}{client && <span className={`status-pill status-${status}`}>{STATUSES.find((s) => s.id === status)!.label}</span>}</strong>
                  <span>{items.length} proyecto{items.length === 1 ? '' : 's'} · {fmtHours(tot.seconds)} · US$ {fmtMoney(tot.amount)}</span>
                </div>
                {!client && <div className="row-actions"><button className="icon-button" onClick={() => { setProjectDraft({ name: '', clientId: '', billing: 'interno', rate: '', price: '', color: PALETTE[projects.length % PALETTE.length] }); setError('') }} aria-label="Agregar proyecto personal" title="Agregar proyecto personal"><FolderPlus /></button></div>}
                {client && <div className="row-actions">
                  <button className="icon-button" onClick={() => { setProjectDraft({ name: '', clientId: client.id, billing: 'hora', rate: '', price: '', color: client.color }); setError('') }} aria-label={`Agregar proyecto a ${client.name}`} title="Agregar proyecto"><FolderPlus /></button>
                  <button className="icon-button" onClick={() => { setClientDraft({ id: client.id, name: client.name, color: client.color, status, notes: client.notes ?? '', links: client.links?.length ? client.links : [{ label: '', url: '' }] }); setError('') }} aria-label={`Editar ${client.name}`} title="Editar"><Pencil /></button>
                  <button className="icon-button danger" onClick={() => deleteClient(client)} aria-label={`Borrar ${client.name}`} title="Borrar"><Trash2 /></button>
                </div>}
              </div>
              {client && (client.links?.length || client.notes) ? (
                <div className="client-extra">
                  {client.links?.map((l, i) => <a key={i} className="link-chip" href={l.url} target="_blank" rel="noreferrer noopener"><ExternalLink /> {l.label}</a>)}
                  {client.notes && <p className="client-notes">{client.notes}</p>}
                </div>
              ) : null}
              {!collapsed[key] && (
                <div className="project-rows">
                  {items.length === 0 && <p className="muted-line">Sin proyectos. Tocá <FolderPlus className="inline-icon" /> para agregar uno.</p>}
                  {items.map((p) => {
                    const pt = projectTotals(p)
                    const billing = billingOf(p)
                    const usesPayments = billing === 'fijo' || billing === 'entrega'
                    const perHour = pt.seconds > 0 && pt.amount > 0 ? pt.amount / (pt.seconds / 3600) : 0
                    const price = p.price ?? 0
                    return (
                      <div className="project-block" key={p.id}>
                        <div className="project-row">
                          <i className="dot" style={{ background: p.color }} />
                          <strong>{p.name}</strong>
                          <span className="rate-badge">{billing === 'hora' ? (p.rate > 0 ? `${fmtShort(p.rate)} USD/h` : 'sin tarifa') : billing === 'fijo' ? `Fijo ${price ? `US$ ${fmtShort(price)}` : ''}` : billing === 'entrega' ? `${p.rate ? `US$ ${fmtShort(p.rate)} ` : ''}por entrega` : BILLING_LABEL[billing]}</span>
                          <span className="project-meta">{fmtHours(pt.seconds)}{billing !== 'interno' && <> · US$ {fmtMoney(pt.amount)}{perHour > 0 && billing !== 'hora' && <> · {fmtShort(Math.round(perHour * 100) / 100)}/h reales</>}</>}</span>
                          <div className="row-actions">
                            {usesPayments && <button className="text-button" onClick={() => setOpenPayments((o) => ({ ...o, [p.id]: !o[p.id] }))}>Pagos ({pt.payments.length})</button>}
                            <button className="icon-button" onClick={() => editProject(p)} aria-label={`Editar ${p.name}`} title="Editar"><Pencil /></button>
                            <button className="icon-button danger" onClick={() => deleteProject(p)} aria-label={`Borrar ${p.name}`} title="Borrar"><Trash2 /></button>
                          </div>
                        </div>
                        {billing === 'fijo' && price > 0 && (
                          <div className="project-progress">
                            <div className="thin-track"><div style={{ width: `${Math.min(100, (pt.paid / price) * 100)}%` }} /><div className="track-pending" style={{ left: `${Math.min(100, (pt.paid / price) * 100)}%`, width: `${Math.min(100 - Math.min(100, (pt.paid / price) * 100), (pt.pending / price) * 100)}%` }} /></div>
                            <small>Cobrado US$ {fmtShort(pt.paid)} de {fmtShort(price)}{pt.pending > 0 && ` · pendiente US$ ${fmtShort(pt.pending)}`}{price - pt.paid - pt.pending > 0 && ` · sin facturar US$ ${fmtShort(price - pt.paid - pt.pending)}`}</small>
                          </div>
                        )}
                        {usesPayments && openPayments[p.id] && (
                          <div className="payments">
                            {pt.payments.length === 0 && <p className="muted-line">Todavía no cargaste pagos.</p>}
                            {[...pt.payments].sort((a, b) => a.date.localeCompare(b.date)).map((x) => (
                              <div className="payment-row" key={x.id}>
                                <button className={`pay-check ${x.paid ? 'on' : ''}`} onClick={() => setPayments((cur) => cur.map((y) => (y.id === x.id ? { ...y, paid: !y.paid, date: !y.paid ? dateKey() : y.date } : y)))} aria-label={x.paid ? 'Marcar como pendiente' : 'Marcar como cobrado'} title={x.paid ? 'Cobrado' : 'Pendiente: tocá cuando lo cobres'}>{x.paid && <Check />}</button>
                                <span className="payment-label">{x.label}</span>
                                <span className="payment-date">{x.paid ? x.date.split('-').reverse().join('/') : 'pendiente'}</span>
                                <strong>US$ {fmtMoney(x.amount)}</strong>
                                <button className="icon-button danger" onClick={() => window.confirm(`¿Borrar “${x.label}”?`) && setPayments((cur) => cur.filter((y) => y.id !== x.id))} aria-label="Borrar pago"><X /></button>
                              </div>
                            ))}
                            <div className="payment-actions">
                              <button className="text-button" onClick={() => newPayment(p)}><Plus /> Agregar pago</button>
                              {billing === 'fijo' && price > 0 && pt.payments.length === 0 && <>
                                <button className="text-button" onClick={() => newPayment(p, { label: 'Adelanto 50%', amount: price / 2 })}>+ Adelanto 50%</button>
                                <button className="text-button" onClick={() => { setPayments((cur) => [...cur, { id: uid(), projectId: p.id, label: 'Adelanto 50%', amount: price / 2, date: dateKey(), paid: false }, { id: uid(), projectId: p.id, label: 'Entrega final 50%', amount: price / 2, date: dateKey(), paid: false }]) }}>Plan 50/50 (pendiente)</button>
                              </>}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {clients.length === 0 && projects.length === 0 && <p className="empty-list">Todavía no cargaste clientes. Tocá “Nuevo cliente”.</p>}
      </div>

      {clientDraft && (
        <div className="modal-backdrop" onClick={() => setClientDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setClientDraft(null)} aria-label="Cerrar"><X /></button>
            <h2>{clientDraft.id ? 'Editar cliente' : 'Nuevo cliente'}</h2>
            <div className="form-grid">
              <label>Nombre<input autoFocus value={clientDraft.name} onChange={(e) => setClientDraft({ ...clientDraft, name: e.target.value })} placeholder="Ej. Outlier" /></label>
              <div className="field"><span>Estado</span><div className="segmented small">{STATUSES.map((s) => <button type="button" key={s.id} className={clientDraft.status === s.id ? 'seg-on' : ''} onClick={() => setClientDraft({ ...clientDraft, status: s.id })}>{s.label}</button>)}</div></div>
              <div className="field"><span>Links</span>
                {clientDraft.links.map((l, i) => (
                  <div className="link-edit" key={i}>
                    <input value={l.label} onChange={(e) => setClientDraft({ ...clientDraft, links: clientDraft.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder="Nombre (ej. Plataforma)" aria-label="Nombre del link" />
                    <input value={l.url} onChange={(e) => setClientDraft({ ...clientDraft, links: clientDraft.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} placeholder="app.outlier.ai" aria-label="URL" inputMode="url" />
                    <button type="button" className="icon-button" onClick={() => setClientDraft({ ...clientDraft, links: clientDraft.links.filter((_, j) => j !== i) })} aria-label="Quitar link"><X /></button>
                  </div>
                ))}
                <button type="button" className="text-button" onClick={() => setClientDraft({ ...clientDraft, links: [...clientDraft.links, { label: '', url: '' }] })}><Plus /> Agregar link</button>
              </div>
              <label>Notas<textarea rows={3} value={clientDraft.notes} onChange={(e) => setClientDraft({ ...clientDraft, notes: e.target.value })} placeholder="Contacto, condiciones, próximos pasos…" /></label>
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
              <label>Nombre<input autoFocus value={projectDraft.name} onChange={(e) => setProjectDraft({ ...projectDraft, name: e.target.value })} placeholder="Ej. AI trainer" /></label>
              <label>Cliente<select value={projectDraft.clientId} onChange={(e) => setProjectDraft({ ...projectDraft, clientId: e.target.value })}><option value="">Personal / interno (sin cliente)</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <div className="field"><span>Cómo se cobra</span>
                <div className="segmented small wrap">{BILLINGS.map((b) => <button type="button" key={b} className={projectDraft.billing === b ? 'seg-on' : ''} onClick={() => setProjectDraft({ ...projectDraft, billing: b })}>{BILLING_LABEL[b]}</button>)}</div>
                <small className="field-help">{BILLING_HELP[projectDraft.billing]}</small>
              </div>
              {projectDraft.billing === 'hora' && <label>Tarifa por hora<span className="rate-input"><span>US$</span><input inputMode="decimal" value={projectDraft.rate} onChange={(e) => setProjectDraft({ ...projectDraft, rate: e.target.value })} placeholder="0" /><span>/h</span></span></label>}
              {projectDraft.billing === 'entrega' && <label>Precio por entrega<span className="rate-input"><span>US$</span><input inputMode="decimal" value={projectDraft.rate} onChange={(e) => setProjectDraft({ ...projectDraft, rate: e.target.value })} placeholder="0" /></span></label>}
              {projectDraft.billing === 'fijo' && <label>Precio total<span className="rate-input"><span>US$</span><input inputMode="decimal" value={projectDraft.price} onChange={(e) => setProjectDraft({ ...projectDraft, price: e.target.value })} placeholder="2000" /></span></label>}
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
            <h2>Agregar pago</h2>
            <p>{projects.find((p) => p.id === paymentDraft.projectId)?.name}</p>
            <div className="form-grid">
              <label>Concepto<input value={paymentDraft.label} onChange={(e) => setPaymentDraft({ ...paymentDraft, label: e.target.value })} placeholder="Adelanto 50%" /></label>
              <div className="modal-fields two">
                <label>Monto<span className="rate-input"><span>US$</span><input autoFocus inputMode="decimal" value={paymentDraft.amount} onChange={(e) => setPaymentDraft({ ...paymentDraft, amount: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && savePayment()} placeholder="0" /></span></label>
                <label>Fecha<input type="date" value={paymentDraft.date} onChange={(e) => setPaymentDraft({ ...paymentDraft, date: e.target.value })} /></label>
              </div>
              <label className="check-line"><input type="checkbox" checked={paymentDraft.paid} onChange={(e) => setPaymentDraft({ ...paymentDraft, paid: e.target.checked })} /> Ya lo cobré (si no, queda pendiente y no suma a tus ingresos)</label>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions"><button className="ghost-button" onClick={() => setPaymentDraft(null)}>Cancelar</button><button className="primary-button" onClick={savePayment}>Guardar pago</button></div>
          </div>
        </div>
      )}
    </section>
  )
}
