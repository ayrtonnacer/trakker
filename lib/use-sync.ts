'use client'

import { useEffect, useRef, useState } from 'react'
import { SyncError, checkRepo, diffFiles, parseFiles, pullAll, pushChanges, serialize, type AppData, type SyncConfig } from './sync'

const CONFIG_KEY = 'tasker-sync'
const DIRTY_KEY = 'tasker-sync-dirty'
const PUSH_DELAY = 2500
const PULL_EVERY = 20000

export type SyncStatus = 'off' | 'connecting' | 'synced' | 'pending' | 'saving' | 'error'

const store = {
  get: (k: string) => { try { return window.localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { window.localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } },
  del: (k: string) => { try { window.localStorage.removeItem(k) } catch { /* sin almacenamiento */ } },
}

function pick(files: Record<string, string>, paths: string[]) {
  const out: Record<string, string> = {}
  paths.forEach((p) => { if (p in files) out[p] = files[p] })
  return out
}

/**
 * Guarda los datos como .md en un repo de GitHub y los lee de vuelta.
 * - Al abrir: si quedaron cambios sin subir se suben; si no, se trae lo del repo.
 * - Al cambiar algo: se sube a los pocos segundos (sólo los archivos que cambiaron).
 * - Al volver a la pestaña: se trae lo del repo si no hay cambios pendientes.
 */
export function useGitSync({ loaded, data, apply }: { loaded: boolean; data: AppData; apply: (d: AppData) => void }) {
  const [cfg, setCfg] = useState<SyncConfig | null>(null)
  const [status, setStatus] = useState<SyncStatus>('off')
  const [message, setMessage] = useState('')
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [ready, setReady] = useState(false)

  const dataRef = useRef(data)
  dataRef.current = data
  const applyRef = useRef(apply)
  applyRef.current = apply
  const cfgRef = useRef<SyncConfig | null>(null)
  const statusRef = useRef<SyncStatus>('off')
  const lastPushed = useRef<Record<string, string>>({})
  const shas = useRef<Record<string, string>>({})
  const busy = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  const lastPull = useRef(0)
  const fns = useRef({ push: async () => {}, pull: async (_force: boolean) => {} })

  const set = (s: SyncStatus, msg = '') => { statusRef.current = s; setStatus(s); setMessage(msg) }
  const fail = (e: unknown) => set('error', e instanceof Error ? e.message : 'Error desconocido')
  const hasPending = () => diffFiles(serialize(dataRef.current), lastPushed.current).length > 0

  function schedule(ms: number) {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { void fns.current.push() }, ms)
  }

  async function push() {
    const c = cfgRef.current
    if (!c) return
    if (busy.current) return schedule(1000)
    const files = serialize(dataRef.current)
    const changes = diffFiles(files, lastPushed.current)
    if (!changes.length) {
      store.del(DIRTY_KEY)
      return set('synced')
    }
    busy.current = true
    set('saving')
    try {
      await pushChanges(c, changes, shas.current)
      lastPushed.current = files
      setLastSync(Date.now())
      if (hasPending()) { set('pending'); schedule(PUSH_DELAY) } // cambió algo mientras se subía
      else { store.del(DIRTY_KEY); set('synced') }
    } catch (e) {
      fail(e)
      // Un error de red o de límite se reintenta solo; uno de permisos espera a que el usuario lo arregle.
      if (!(e instanceof SyncError) || e.status === 0 || e.status >= 500) schedule(30000)
    } finally {
      busy.current = false
    }
  }

  /**
   * Trae el repo. `mode`: 'connect' pregunta qué hacer si difieren, 'start' deja ganar a los cambios locales
   * sin subir, 'focus' sólo aplica lo remoto si no hay nada pendiente.
   */
  async function pull(mode: 'connect' | 'start' | 'focus' | 'force') {
    const c = cfgRef.current
    if (!c || busy.current) return
    busy.current = true
    if (mode !== 'focus') set('connecting')
    try {
      const remote = await pullAll(c)
      lastPull.current = Date.now()
      shas.current = remote.shas
      const parsed = parseFiles(remote.files)
      const local = dataRef.current
      const localFiles = serialize(local)
      if (!parsed.found) {
        // Repo vacío: se sube todo lo local.
        lastPushed.current = {}
        setReady(true)
        busy.current = false
        return await push()
      }
      const merged: AppData = { ...local, ...parsed.data } as AppData
      const remoteKnown = pick(serialize(merged), Object.keys(remote.files))
      const identical = diffFiles(localFiles, remoteKnown).length === 0
      const dirty = store.get(DIRTY_KEY) === '1' || diffFiles(localFiles, lastPushed.current).length > 0 && Object.keys(lastPushed.current).length > 0
      let useRemote = !identical
      if (!identical) {
        if (mode === 'connect') {
          useRemote = window.confirm('Hay datos en el repo y también en este navegador, y no coinciden.\n\nAceptar = usar los del repo (reemplaza los de este navegador)\nCancelar = subir los de este navegador (reemplaza los del repo)')
        } else if (mode === 'start' || mode === 'focus') {
          useRemote = !dirty
        }
      }
      lastPushed.current = remoteKnown
      if (useRemote && !identical) applyRef.current(merged)
      setReady(true)
      if (!useRemote && !identical) {
        busy.current = false
        return await push()
      }
      setLastSync(Date.now())
      set('synced')
    } catch (e) {
      fail(e)
    } finally {
      busy.current = false
    }
  }

  fns.current = { push, pull: (force) => pull(force ? 'force' : 'focus') }

  // Arranque: si ya hay conexión guardada, se sincroniza.
  useEffect(() => {
    if (!loaded) return
    const raw = store.get(CONFIG_KEY)
    if (!raw) return
    try {
      const c = JSON.parse(raw) as SyncConfig
      cfgRef.current = c
      setCfg(c)
      void pull('start')
    } catch {
      store.del(CONFIG_KEY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  // Cada cambio de datos se sube con una pequeña demora.
  useEffect(() => {
    if (!cfgRef.current || !ready || busy.current) return
    if (!hasPending()) return
    store.set(DIRTY_KEY, '1')
    if (statusRef.current !== 'saving') set('pending')
    schedule(PUSH_DELAY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ready])

  // Al volver a la pestaña se trae lo que se haya cambiado desde otro dispositivo.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (statusRef.current !== 'synced' || Date.now() - lastPull.current < PULL_EVERY) return
      void fns.current.pull(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible) }
  }, [])

  // Avisa si se intenta cerrar con cambios sin subir.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (statusRef.current === 'pending' || statusRef.current === 'saving') e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  async function connect(c: SyncConfig) {
    const clean: SyncConfig = { repo: c.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, ''), branch: c.branch.trim(), dir: c.dir.trim(), token: c.token.trim() }
    if (!/^[\w.-]+\/[\w.-]+$/.test(clean.repo)) throw new Error('El repo tiene que ser usuario/repositorio, por ejemplo ayrtonnacer/trakker-datos.')
    if (!clean.token) throw new Error('Falta el token de GitHub.')
    set('connecting')
    try {
      const info = await checkRepo(clean)
      if (!info.isPrivate && !window.confirm(`“${info.name}” es un repo PÚBLICO: cualquiera podría ver tus ingresos, clientes y pagos.\n\n¿Conectar igual?`)) {
        throw new Error('Conexión cancelada: elegí un repo privado.')
      }
    } catch (e) {
      set('off')
      throw e
    }
    store.set(CONFIG_KEY, JSON.stringify(clean))
    cfgRef.current = clean
    setCfg(clean)
    setReady(false)
    lastPushed.current = {}
    await pull('connect')
  }

  function disconnect() {
    window.clearTimeout(timer.current)
    store.del(CONFIG_KEY)
    store.del(DIRTY_KEY)
    cfgRef.current = null
    lastPushed.current = {}
    shas.current = {}
    setCfg(null)
    setReady(false)
    set('off')
  }

  async function syncNow() {
    if (!cfgRef.current) return
    if (hasPending()) return push()
    await pull('force')
  }

  return { cfg, status, message, lastSync, connect, disconnect, syncNow }
}
