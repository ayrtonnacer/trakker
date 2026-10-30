'use client'

import { useState } from 'react'
import { Download, RefreshCw, Upload, X } from 'lucide-react'
import type { AppData, SyncConfig } from '@/lib/sync'
import { backupAgeDays, downloadBackup } from '@/lib/backup'
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
  data: AppData
  lastBackup: number | null
  onBackup: () => void
  /** Aplica un backup leído del archivo. Devuelve un mensaje de error o '' si salió bien. */
  onRestore: (raw: string) => string
}

export const STATUS_LABEL: Record<SyncStatus, string> = {
  off: 'Sin guardar en GitHub',
  connecting: 'Conectando…',
  synced: 'Guardado en GitHub',
  pending: 'Cambios sin subir',
  saving: 'Guardando…',
  error: 'Error al guardar',
}

export function SyncModal({ cfg, status, message, lastSync, onConnect, onDisconnect, onSyncNow, onClose, data, lastBackup, onBackup, onRestore }: Props) {
  const [form, setForm] = useState({ repo: cfg?.repo ?? '', token: '' })
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')

  async function connect() {
    setError('')
    setWorking(true)
    try {
      // Siempre la rama principal y la raíz del repo.
      await onConnect({ ...form, branch: '', dir: '' })
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
        <p>Tus tareas, plataformas, pagos y metas se guardan como archivos <b>.md</b> en un repo tuyo y se leen de ahí al abrir la app, en cualquier dispositivo.</p>

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
              <li>Creá un repo <b>privado</b> vacío en GitHub, por ejemplo <code>tasker-crm-datos</code>. Tiene tus ingresos y plataformas: no lo hagas público.</li>
              <li>En GitHub: Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token.</li>
              <li>En “Repository access” elegí <b>Only select repositories</b> y marcá solo ese repo. En Permissions → Repository permissions poné <b>Contents: Read and write</b>.</li>
              <li>Copiá el token y pegalo acá. Queda guardado solo en este navegador.</li>
            </ol>
            <div className="form-grid">
              <label>Repo<input autoFocus value={form.repo} onChange={(e) => setForm({ ...form, repo: e.target.value })} placeholder="usuario/tasker-crm-datos" /></label>
              <label>Token de GitHub<input type="password" autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="github_pat_…" /></label>
            </div>
            {(error || (status === 'error' && message)) && <p className="form-error">{error || message}</p>}
            <div className="modal-actions">
              <button className="ghost-button" onClick={onClose}>Cancelar</button>
              <button className="primary-button" onClick={connect} disabled={working || !form.repo.trim() || !form.token.trim()}>{working ? 'Conectando…' : 'Conectar'}</button>
            </div>
          </>
        )}

        <div className="backup-box">
          <h3>Backup en un archivo</h3>
          <p>Una copia completa (tareas, plataformas, pagos, metas) que podés guardar donde quieras. {lastBackup ? `Último backup: hace ${backupAgeDays(lastBackup)} día${backupAgeDays(lastBackup) === 1 ? '' : 's'}.` : 'Todavía no hiciste ninguno.'}</p>
          <div className="backup-actions">
            <button className="ghost-button" onClick={() => { downloadBackup(data); onBackup(); setBackupMsg('Backup descargado.') }}><Download /> Descargar backup</button>
            <label className="ghost-button file-button"><Upload /> Restaurar desde archivo
              <input type="file" accept="application/json,.json" hidden onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                if (!window.confirm('Restaurar reemplaza todos los datos de este navegador por los del archivo. ¿Seguir?')) return
                const err = onRestore(await f.text())
                setBackupMsg(err || 'Backup restaurado.')
              }} />
            </label>
          </div>
          {backupMsg && <p role="status">{backupMsg}</p>}
        </div>

        <p className="sync-note">Archivos: <code>clientes.md</code>, <code>metas.md</code> y <code>tareas/AAAA-MM.md</code>. Cada uno tiene una tabla para leer y, al final, un bloque <code>tasker:data</code> que es lo que la app lee. Para corregir algo, hacelo desde la app.</p>
      </div>
    </div>
  )
}
