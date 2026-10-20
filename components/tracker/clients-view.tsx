'use client'

import { useState } from 'react'
import { Briefcase, ChevronDown, ChevronRight, FolderPlus, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { NO_CLIENT, PALETTE, fmtHours, fmtMoney, uid, type Client, type Project, type Task } from '@/lib/game'

type Props = {
  clients: Client[]
  projects: Project[]
  tasks: Task[]
  setClients: (fn: (c: Client[]) => Client[]) => void
  setProjects: (fn: (p: Project[]) => Project[]) => void
}

type ProjectDraft = { id?: string; name: string; clientId: string; rate: string; color: string }

export function ClientsView({ clients, projects, tasks, setClients, setProjects }: Props) {
  const [newClient, setNewClient] = useState('')
  const [editingClient, setEditingClient] = useState<{ id: string; name: string; color: string } | null>(null)
  const [projectDraft, setProjectDraft] = useState<ProjectDraft | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')

  const totals = (fn: (t: Task) => boolean) => {
    const ts = tasks.filter(fn)
    return { seconds: ts.reduce((s, t) => s + t.seconds, 0), amount: ts.reduce((s, t) => s + t.amount, 0) }
  }

  function addClient() {
    const name = newClient.trim()
    if (!name) return
    if (clients.some((c) => c.name.toLowerCase() === name.toLowerCase())) return setError(`Ya existe un cliente llamado “${name}”.`)
    setClients((cur) => [...cur, { id: uid(), name, color: PALETTE[cur.length % PALETTE.length] }])
    setNewClient('')
    setError('')
  }

  function saveClient() {
    if (!editingClient) return
    const name = editingClient.name.trim()
    if (!name) return
    if (clients.some((c) => c.id !== editingClient.id && c.name.toLowerCase() === name.toLowerCase())) return setError(`Ya existe un cliente llamado “${name}”.`)
    setClients((cur) => cur.map((c) => (c.id === editingClient.id ? { ...c, name, color: editingClient.color } : c)))
    setEditingClient(null)
    setError('')
  }

  function deleteClient(c: Client) {
    const n = projects.filter((p) => p.clientId === c.id).length
    if (!window.confirm(`¿Borrar el cliente “${c.name}”?${n ? ` Sus ${n} proyecto(s) quedan sin cliente.` : ''} Las tareas ya registradas no cambian.`)) return
    setClients((cur) => cur.filter((x) => x.id !== c.id))
    setProjects((cur) => cur.map((p) => (p.clientId === c.id ? { ...p, clientId: null } : p)))
  }

  function saveProject() {
    if (!projectDraft) return
    const name = projectDraft.name.trim()
    if (!name) return setError('Ponele un nombre al proyecto.')
    const rate = Math.max(0, Number(projectDraft.rate.replace(',', '.')) || 0)
    const data = { name, clientId: projectDraft.clientId || null, rate, color: projectDraft.color }
    if (projectDraft.id) setProjects((cur) => cur.map((p) => (p.id === projectDraft.id ? { ...p, ...data } : p)))
    else setProjects((cur) => [...cur, { id: uid(), ...data }])
    setProjectDraft(null)
    setError('')
  }

  function deleteProject(p: Project) {
    if (!window.confirm(`¿Borrar el proyecto “${p.name}”? Las tareas ya registradas conservan su nombre y monto.`)) return
    setProjects((cur) => cur.filter((x) => x.id !== p.id))
  }

  const groups = [
    ...clients.map((c) => ({ client: c as Client | null, items: projects.filter((p) => p.clientId === c.id) })),
    { client: null, items: projects.filter((p) => !p.clientId || !clients.some((c) => c.id === p.clientId)) },
  ]

  return (
    <section className="view">
      <div className="view-heading">
        <div><p className="eyebrow">ADMINISTRAR</p><h2>Clientes y proyectos</h2><p className="view-sub">Cada proyecto tiene su tarifa en USD por hora. Cambiar una tarifa no modifica las tareas ya registradas.</p></div>
        <button className="start-button" onClick={() => setProjectDraft({ name: '', clientId: '', rate: '', color: PALETTE[projects.length % PALETTE.length] })}><FolderPlus /> Nuevo proyecto</button>
      </div>

      <div className="add-client panel">
        <UserPlus />
        <input value={newClient} onChange={(e) => setNewClient(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClient()} placeholder="Nombre del cliente nuevo" aria-label="Nombre del cliente nuevo" />
        <button className="start-button" onClick={addClient} disabled={!newClient.trim()}><Plus /> Agregar cliente</button>
      </div>
      {error && <p className="form-error inline-error">{error}</p>}

      <div className="client-list">
        {groups.map(({ client, items }) => {
          if (!client && items.length === 0) return null
          const key = client?.id ?? 'none'
          const tot = totals((t) => t.client === (client?.name ?? NO_CLIENT))
          const isEditing = client && editingClient?.id === client.id
          return (
            <div className="client-card panel" key={key}>
              <div className="client-head">
                <button className="client-collapse" onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))} aria-label={collapsed[key] ? 'Mostrar proyectos' : 'Ocultar proyectos'}>{collapsed[key] ? <ChevronRight /> : <ChevronDown />}</button>
                {isEditing ? (
                  <div className="client-edit">
                    <div className="swatches">{PALETTE.map((col) => <button key={col} className={editingClient.color === col ? 'swatch-on' : ''} style={{ background: col }} onClick={() => setEditingClient({ ...editingClient, color: col })} aria-label={`Color ${col}`} />)}</div>
                    <input autoFocus value={editingClient.name} onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveClient()} aria-label="Nombre del cliente" />
                    <button className="start-button" onClick={saveClient}>Guardar</button>
                    <button className="ghost-button" onClick={() => setEditingClient(null)}>Cancelar</button>
                  </div>
                ) : (
                  <>
                    <i className="client-avatar" style={{ background: `${client?.color ?? '#5b6676'}22`, color: client?.color ?? '#8a95a5' }}><Briefcase /></i>
                    <div className="client-title"><strong>{client?.name ?? NO_CLIENT}</strong><span>{items.length} proyecto{items.length === 1 ? '' : 's'} · {fmtHours(tot.seconds)} · US$ {fmtMoney(tot.amount)}</span></div>
                    {client && <div className="row-actions">
                      <button className="icon-button" onClick={() => setProjectDraft({ name: '', clientId: client.id, rate: '', color: client.color })} aria-label={`Agregar proyecto a ${client.name}`}><FolderPlus /></button>
                      <button className="icon-button" onClick={() => setEditingClient({ id: client.id, name: client.name, color: client.color })} aria-label={`Editar ${client.name}`}><Pencil /></button>
                      <button className="icon-button danger" onClick={() => deleteClient(client)} aria-label={`Borrar ${client.name}`}><Trash2 /></button>
                    </div>}
                  </>
                )}
              </div>
              {!collapsed[key] && (
                <div className="project-rows">
                  {items.length === 0 && <p className="muted-line">Sin proyectos. Tocá <FolderPlus className="inline-icon" /> para agregar uno con su tarifa.</p>}
                  {items.map((p) => {
                    const pt = totals((t) => t.projectId === p.id)
                    return (
                      <div className="project-row" key={p.id}>
                        <i className="dot" style={{ background: p.color }} />
                        <strong style={{ color: p.color }}>{p.name}</strong>
                        <span className="project-meta">{fmtHours(pt.seconds)} · US$ {fmtMoney(pt.amount)}</span>
                        <span className={`rate-badge ${p.rate > 0 ? '' : 'rate-none'}`}>{p.rate > 0 ? `${fmtMoney(p.rate)} USD/h` : 'sin tarifa'}</span>
                        <div className="row-actions">
                          <button className="icon-button" onClick={() => setProjectDraft({ id: p.id, name: p.name, clientId: p.clientId ?? '', rate: p.rate ? String(p.rate) : '', color: p.color })} aria-label={`Editar ${p.name}`}><Pencil /></button>
                          <button className="icon-button danger" onClick={() => deleteProject(p)} aria-label={`Borrar ${p.name}`}><Trash2 /></button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {clients.length === 0 && projects.length === 0 && <p className="empty-list">Todavía no cargaste clientes. Agregá el primero arriba.</p>}
      </div>

      {projectDraft && (
        <div className="modal-backdrop" onClick={() => setProjectDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">{projectDraft.id ? 'EDITAR PROYECTO' : 'NUEVO PROYECTO'}</p>
            <h2>{projectDraft.id ? projectDraft.name || 'Proyecto' : 'Crear proyecto'}</h2>
            <p>La tarifa se usa para calcular cuánto ganás en cada tarea facturable de este proyecto.</p>
            <div className="form-grid">
              <label>Nombre<input autoFocus value={projectDraft.name} onChange={(e) => setProjectDraft({ ...projectDraft, name: e.target.value })} placeholder="Ej. Web institucional" /></label>
              <label>Cliente<select value={projectDraft.clientId} onChange={(e) => setProjectDraft({ ...projectDraft, clientId: e.target.value })}><option value="">{NO_CLIENT}</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>Tarifa por hora<span className="rate-input"><span>US$</span><input inputMode="decimal" value={projectDraft.rate} onChange={(e) => setProjectDraft({ ...projectDraft, rate: e.target.value })} placeholder="0" onKeyDown={(e) => e.key === 'Enter' && saveProject()} /><span>/h</span></span></label>
              <div className="field"><span>Color</span><div className="swatches">{PALETTE.map((col) => <button type="button" key={col} className={projectDraft.color === col ? 'swatch-on' : ''} style={{ background: col }} onClick={() => setProjectDraft({ ...projectDraft, color: col })} aria-label={`Color ${col}`} />)}</div></div>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions"><button className="ghost-button" onClick={() => setProjectDraft(null)}>Cancelar</button><button className="start-button" onClick={saveProject}>Guardar proyecto</button></div>
          </div>
        </div>
      )}
    </section>
  )
}
