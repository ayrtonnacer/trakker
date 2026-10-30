// Backup completo en un solo archivo JSON, para no depender de que el navegador no borre los datos.
import { download } from './export'
import { dateKey } from './game'
import type { AppData } from './sync'

// Se mantiene la clave de cuando la app se llamaba Trakker.
const BACKUP_KEY = 'trakker-last-backup'
export const BACKUP_REMINDER_DAYS = 7

export function readBackupTime() {
  try {
    const n = Number(window.localStorage.getItem(BACKUP_KEY))
    return n > 0 ? n : null
  } catch {
    return null
  }
}

export function markBackup() {
  try {
    window.localStorage.setItem(BACKUP_KEY, String(Date.now()))
  } catch {
    // Sin almacenamiento: el aviso va a volver a aparecer.
  }
}

/** Días desde el último backup; Infinity si nunca se hizo. */
export function backupAgeDays(last: number | null) {
  return last ? Math.floor((Date.now() - last) / 86400000) : Infinity
}

export function downloadBackup(d: AppData) {
  const body = JSON.stringify({ app: 'tasker-crm', version: 1, exportedAt: new Date().toISOString(), data: d }, null, 2)
  download(`tasker-crm-backup-${dateKey()}.json`, body, 'application/json;charset=utf-8')
}

/** Lee un backup. Devuelve los datos o un mensaje de error. */
export function parseBackup(raw: string): AppData | string {
  let j: { app?: string; data?: Partial<AppData> }
  try {
    j = JSON.parse(raw)
  } catch {
    return 'El archivo no es un backup válido (no se puede leer).'
  }
  const d = j?.app === 'tasker-crm' || j?.app === 'trakker' ? j.data : undefined
  if (!d || !Array.isArray(d.tasks) || !Array.isArray(d.clients) || !Array.isArray(d.projects)) return 'El archivo no parece un backup de Tasker CRM.'
  return { tasks: d.tasks, clients: d.clients, projects: d.projects, payments: d.payments ?? [], goal: d.goal ?? null, plan: d.plan ?? [], routines: d.routines ?? [] }
}
