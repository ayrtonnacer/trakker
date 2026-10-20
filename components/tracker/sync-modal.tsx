'use client'

import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import type { SyncConfig } from '@/lib/sync'
import type { SyncStatus } from '@/lib/use-sync'

type Props = {
  cfg: SyncConfig | null
  status: SyncStatus
  message: string
  lastSync: number | null
  onConnect: (c: SyncConfig) => Promise<void>
  onDisconnect: () => void
  onSyncNow: () => Promise<void>
  onClose: () => void
}

export const STATUS_LABEL: Record<SyncStatus, string> = {
  off: 'Sin guardar en GitHub',
  connecting: 'Conectando…',
  synced: 'Guardado en GitHub',
  pending: 'Cambios sin subir',
  saving: 'Guardando…',
  error: 'Error al guardar',
}

export function SyncModal({ cfg, status, message, lastSync, onConnect, onDisconnect, onSyncNow, onClose }: Props) {
  const [form, setForm] = useState({ repo: cfg?.repo ?? '', branch: cfg?.branch ?? '', dir: cfg?.dir ?? '', token: '' })
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  async function connect() {
    setError('')
    setWorking(true)
    try {
      await onConnect(form)
      setForm((f) => ({ ...f, token: '' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo conectar.')
    } finally {
      setWorking(false)
    }
  }

  const time = lastSync ? new Date(lastSync).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X /></button>
        <h2>Guardar en GitHub</h2>
        <p>Tus tareas, clientes, pagos y metas se guardan como archivos <b>.md</b> en un repo tuyo y se leen de ahí al abrir la app, en cualquier dispositivo.</p>

        {cfg ? (
          <>
            <div className="sync-status">
              <span className={`sync-dot sync-${status}`} />
              <div><strong>{STATUS_LABEL[status]}</strong><small>{cfg.repo}{cfg.dir ? ` / ${cfg.dir}` : ''}{time && status === 'synced' ? ` · ${time}` : ''}</small></div>
            </div>
            {message && <p className="form-error">{message}</p>}
            <div className="modal-actions">
              <button className="ghost-button danger-text" onClick={() => { if (window.confirm('¿Desconectar? Tus datos siguen en este navegador y en el repo, pero la app deja de sincronizarlos.')) onDisconnect() }}>Desconectar</button>
              <button className="primary-button" onClick={() => void onSyncNow()} disabled={status === 'connecting' || status === 'saving'}><RefreshCw /> Sincronizar ahora</button>
            </div>
          </>
        ) : (
          <>
            <ol className="sync-steps">
              <li>Creá un repo <b>privado</b> vacío en GitHub, por ejemplo <code>trakker-datos</code>. Tiene ingresos y clientes: no lo hagas público.</li>
              <li>En GitHub: Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token.</li>
              <li>En “Repository access” elegí <b>Only select repositories</b> y marcá solo ese repo. En Permissions → Repository permissions poné <b>Contents: Read and write</b>.</li>
              <li>Copiá el token y pegalo acá. Queda guardado solo en este navegador.</li>
            </ol>
            <div className="form-grid">
              <label>Repo<input autoFocus value={form.repo} onChange={(e) => setForm({ ...form, repo: e.target.value })} placeholder="usuario/trakker-datos" /></label>
              <label>Token de GitHub<input type="password" autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="github_pat_…" /></label>
              <div className="modal-fields two">
                <label>Rama (opcional)<input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder="la principal" /></label>
                <label>Carpeta (opcional)<input value={form.dir} onChange={(e) => setForm({ ...form, dir: e.target.value })} placeholder="raíz del repo" /></label>
              </div>
            </div>
            {(error || (status === 'error' && message)) && <p className="form-error">{error || message}</p>}
            <div className="modal-actions">
              <button className="ghost-button" onClick={onClose}>Cancelar</button>
              <button className="primary-button" onClick={connect} disabled={working || !form.repo.trim() || !form.token.trim()}>{working ? 'Conectando…' : 'Conectar'}</button>
            </div>
          </>
        )}

        <p className="sync-note">Archivos: <code>clientes.md</code>, <code>metas.md</code> y <code>tareas/AAAA-MM.md</code>. Cada uno tiene una tabla para leer y, al final, un bloque <code>trakker:data</code> que es lo que la app lee. Para corregir algo, hacelo desde la app.</p>
      </div>
    </div>
  )
}
