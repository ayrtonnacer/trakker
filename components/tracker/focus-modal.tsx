'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { parseSites, type Focus } from '@/lib/focus'

type Props = { focus: Focus; onSave: (f: Focus) => void; onClose: () => void }

/** Lista de sitios a bloquear mientras corre el timer. */
export function FocusModal({ focus, onSave, onClose }: Props) {
  const [text, setText] = useState(focus.sites.join('\n'))
  const [on, setOn] = useState(focus.on || focus.sites.length === 0)
  const sites = parseSites(text)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X /></button>
        <h2>Modo foco</h2>
        <p>Mientras corre el timer, estos sitios quedan bloqueados y tu arbolito crece. Al parar el timer se desbloquean solos.</p>
        <div className="form-grid">
          <label>Sitios que no querés ver mientras trabajás<textarea rows={6} className="mono" value={text} onChange={(e) => setText(e.target.value)} placeholder={'youtube.com\ninstagram.com\nx.com'} /></label>
          {sites.length > 0 && <small className="field-help">{sites.length} sitio{sites.length === 1 ? '' : 's'}: {sites.join(', ')}</small>}
          <label className="check-line"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Bloquear mientras corre el timer</label>
          <p className="memo-warning">Una página web no puede cerrar otras pestañas: el bloqueo lo hace la extensión <b>Tasker CRM Foco</b> para Chrome (carpeta <code>extension</code> del repo). Sin la extensión, igual ves la lista y el arbolito mientras trabajás.</p>
        </div>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button" onClick={() => onSave({ on: on && sites.length > 0, sites })}><Check /> Guardar</button>
        </div>
      </div>
    </div>
  )
}
