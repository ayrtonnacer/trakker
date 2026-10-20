'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Folder, Plus, Search } from 'lucide-react'
import { BILLING_LABEL, NO_CLIENT, NO_PROJECT, NO_PROJECT_COLOR, PALETTE, billingOf, parseAmount, uid, type Client, type Project } from '@/lib/game'

function rateLabel(p: Project) {
  const b = billingOf(p)
  if (b === 'hora') return p.rate > 0 ? `${p.rate} USD/h` : 'sin tarifa'
  return BILLING_LABEL[b].toLowerCase()
}

type Props = {
  projects: Project[]
  clients: Client[]
  value: string | null
  onChange: (projectId: string | null) => void
  onCreateProject: (project: Project) => void
  compact?: boolean
}

export function ProjectPicker({ projects, clients, value, onChange, onCreateProject, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', clientId: '', rate: '' })
  const ref = useRef<HTMLDivElement>(null)
  const selected = projects.find((p) => p.id === value) ?? null
  const selectedClient = selected ? clients.find((c) => c.id === selected.clientId) : null

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const q = query.trim().toLowerCase()
  const matches = (p: Project) => {
    const client = clients.find((c) => c.id === p.clientId)
    return !q || p.name.toLowerCase().includes(q) || (client?.name.toLowerCase().includes(q) ?? false)
  }
  const groups = [
    ...clients.map((c) => ({ id: c.id, name: c.name, color: c.color, items: projects.filter((p) => p.clientId === c.id && matches(p)) })),
    { id: '', name: NO_CLIENT, color: '', items: projects.filter((p) => (!p.clientId || !clients.some((c) => c.id === p.clientId)) && matches(p)) },
  ].filter((g) => g.items.length > 0)

  function pick(id: string | null) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  function create() {
    if (!draft.name.trim()) return
    const project: Project = {
      id: uid(),
      name: draft.name.trim(),
      clientId: draft.clientId || null,
      rate: parseAmount(draft.rate),
      billing: 'hora',
      color: PALETTE[projects.length % PALETTE.length],
    }
    onCreateProject(project)
    setCreating(false)
    setDraft({ name: '', clientId: '', rate: '' })
    pick(project.id)
  }

  return (
    <div className="picker" ref={ref}>
      <button type="button" className={`picker-button ${selected ? 'picker-set' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox">
        {selected ? <i className="dot" style={{ background: selected.color }} /> : <Folder />}
        <span className="picker-label">{selected ? selected.name : compact ? 'Proyecto' : NO_PROJECT}{selectedClient && <small> · {selectedClient.name}</small>}</span>
        {selected && <span className="picker-rate">{rateLabel(selected)}</span>}
      </button>
      {open && (
        <div className="picker-pop" role="listbox">
          {!creating ? (
            <>
              <label className="picker-search"><Search /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar proyecto o cliente" /></label>
              <div className="picker-list">
                <button type="button" className={`picker-item ${!value ? 'picker-active' : ''}`} onClick={() => pick(null)}><i className="dot" style={{ background: NO_PROJECT_COLOR }} />{NO_PROJECT}{!value && <Check className="picker-check" />}</button>
                {groups.map((g) => (
                  <div key={g.id || 'none'}>
                    <p className="picker-group">{g.name}</p>
                    {g.items.map((p) => (
                      <button type="button" key={p.id} className={`picker-item ${value === p.id ? 'picker-active' : ''}`} onClick={() => pick(p.id)}>
                        <i className="dot" style={{ background: p.color }} /><span>{p.name}</span>
                        <em>{rateLabel(p)}</em>
                        {value === p.id && <Check className="picker-check" />}
                      </button>
                    ))}
                  </div>
                ))}
                {groups.length === 0 && q && <p className="picker-empty">No hay proyectos con “{query}”.</p>}
              </div>
              <button type="button" className="picker-create" onClick={() => { setCreating(true); setDraft((d) => ({ ...d, name: query })) }}><Plus /> Crear proyecto nuevo</button>
            </>
          ) : (
            <div className="picker-form">
              <p className="picker-group">Nuevo proyecto por hora</p>
              <input autoFocus placeholder="Nombre del proyecto" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && create()} />
              <select value={draft.clientId} onChange={(e) => setDraft({ ...draft, clientId: e.target.value })} aria-label="Cliente">
                <option value="">{NO_CLIENT}</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label className="rate-input"><span>Tarifa</span><input inputMode="decimal" placeholder="0" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && create()} /><span>USD/h</span></label>
              <div className="picker-form-actions"><button type="button" className="ghost-button" onClick={() => setCreating(false)}>Cancelar</button><button type="button" className="primary-button" onClick={create} disabled={!draft.name.trim()}>Crear</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
