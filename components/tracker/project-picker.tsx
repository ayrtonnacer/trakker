'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Folder, Plus, Search } from 'lucide-react'
import { BILLING_LABEL, PERSONAL, PALETTE, billingOf, parseAmount, uid, type Client, type Project } from '@/lib/game'

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
  openKey?: number // al cambiar, se abre solo (ej. al querer empezar sin proyecto)
}

export function ProjectPicker({ projects, clients, value, onChange, onCreateProject, compact, openKey }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', clientId: '', rate: '' })
  const ref = useRef<HTMLDivElement>(null)
  const selected = projects.find((p) => p.id === value) ?? null
  const selectedClient = selected ? clients.find((c) => c.id === selected.clientId) : null

  useEffect(() => {
    if (openKey) setOpen(true)
  }, [openKey])

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
    // Los proyectos terminados no se ofrecen (salvo el que ya está elegido).
    if (p.status === 'terminado' && p.id !== value) return false
    const client = clients.find((c) => c.id === p.clientId)
    return !q || p.name.toLowerCase().includes(q) || (client?.name.toLowerCase().includes(q) ?? false)
  }
  const groups = [
    ...clients.map((c) => ({ id: c.id, name: c.name, color: c.color, items: projects.filter((p) => p.clientId === c.id && matches(p)) })),
    { id: '', name: PERSONAL, color: '', items: projects.filter((p) => (!p.clientId || !clients.some((c) => c.id === p.clientId)) && matches(p)) },
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
      // Sin cliente es personal: suma tiempo, nunca plata.
      rate: draft.clientId ? parseAmount(draft.rate) : 0,
      billing: draft.clientId ? 'hora' : 'interno',
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
        <span className="picker-label">{selected ? selected.name : 'Elegí un proyecto'}{selectedClient && <small> · {selectedClient.name}</small>}</span>
        {selected && <span className="picker-rate">{rateLabel(selected)}</span>}
      </button>
      {open && (
        <div className="picker-pop" role="listbox">
          {!creating ? (
            <>
              <div className="picker-search"><Search /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar proyecto o plataforma" aria-label="Buscar proyecto o plataforma" /></div>
              <div className="picker-list">
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
                {groups.length === 0 && <p className="picker-empty">{q ? `No hay proyectos con “${query}”.` : 'Todavía no hay proyectos. Creá uno: de una plataforma o personal.'}</p>}
              </div>
              <button type="button" className="picker-create" onClick={() => { setCreating(true); setDraft((d) => ({ ...d, name: query })) }}><Plus /> Crear proyecto nuevo</button>
            </>
          ) : (
            <div className="picker-form">
              <p className="picker-group">{draft.clientId ? 'Nuevo proyecto por hora' : 'Nuevo proyecto personal'}</p>
              <input autoFocus placeholder="Nombre del proyecto" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && create()} />
              <select value={draft.clientId} onChange={(e) => setDraft({ ...draft, clientId: e.target.value })} aria-label="Plataforma">
                <option value="">{PERSONAL}</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {draft.clientId && <label className="rate-input"><span>Tarifa</span><input inputMode="decimal" placeholder="0" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && create()} /><span>USD/h</span></label>}
              <div className="picker-form-actions"><button type="button" className="ghost-button" onClick={() => setCreating(false)}>Cancelar</button><button type="button" className="primary-button" onClick={create} disabled={!draft.name.trim()}>Crear</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
