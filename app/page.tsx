'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Sprout, TreeDeciduous, Trees, BarChart3, Carrot, Cloud, CloudOff, Check, Copy, DollarSign, Flame, History, Home, Landmark, ListChecks, ListPlus, ListTodo, Pickaxe, Play, Plus, Repeat, Square, StickyNote, Tag, Users, X } from 'lucide-react'
import {
  buildTask,
  canBill,
  dateKey,
  defaultBillable,
  describeProject,
  fmtClock,
  fmtHours,
  fmtMoney,
  fmtShort,
  goalTarget,
  goldFor,
  PERSONAL,
  greetingFor,
  migrateProject,
  migrateTask,
  milestonesFor,
  monthCollected,
  monthEarnings,
  parseTags,
  streakFor,
  timeKey,
  uid,
  type Client,
  looksLikeId,
  shortRef,
  resourceLinks,
  type Goal,
  type Payment,
  type PlanItem,
  type Project,
  type Routine,
  type Task,
} from '@/lib/game'
import { ActivityGrid } from '@/components/tracker/activity-grid'
import { ClientsView } from '@/components/tracker/clients-view'
import { PaymentsView } from '@/components/tracker/payments-view'
import { LinkChip } from '@/components/tracker/link-chip'
import { AutoTextarea } from '@/components/tracker/memo'
import { ProjectPicker } from '@/components/tracker/project-picker'
import { StatsView } from '@/components/tracker/stats-view'
import { TaskRow } from '@/components/tracker/task-row'
import { TasksView, dayLabel } from '@/components/tracker/tasks-view'
import { STATUS_LABEL, SyncModal } from '@/components/tracker/sync-modal'
import { useGitSync } from '@/lib/use-sync'
import { DEFAULT_FOCUS, buildExtState, mergeDistractions, treeStage, type Distraction, type Focus } from '@/lib/focus'
import { FocusModal } from '@/components/tracker/focus-modal'
import type { AppData } from '@/lib/sync'
import { BACKUP_REMINDER_DAYS, backupAgeDays, downloadBackup, markBackup, readBackupTime, parseBackup } from '@/lib/backup'

// Se mantiene la clave de versiones anteriores para no perder los datos guardados.
const STORAGE_KEY = 'tiempo-oro-v1'
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const TABS: { id: string; icon: typeof Home }[] = [
  { id: 'Inicio', icon: Home },
  { id: 'Tareas', icon: ListChecks },
  { id: 'Plataformas', icon: Users },
  { id: 'Pagos', icon: Landmark },
  { id: 'Estadísticas', icon: BarChart3 },
]

type Active = { base: number; startedAt: number | null; startTime?: string; startDate?: string; target?: number } // target: segundos de la cuenta regresiva
type Mode = { down: boolean; minutes: number }
type Draft = { name: string; projectId: string | null; billable: boolean; tags: string; note: string; ref?: string; planId?: string; routineId?: string } // planId: viene del backlog; routineId: de una rutina
type Toast = { id: number; title: string; text: string }
type Manual = { id?: number; rate?: number; routineId?: string; ref: string; name: string; projectId: string | null; billable: boolean; tags: string; note: string; date: string; from: string; to: string }
type Piece = { id: number; x: number; y: number; r: number; d: number; s: number; round: boolean }

const DEFAULT_MODE: Mode = { down: false, minutes: 30 }
const PRESET_MINUTES = [15, 25, 30, 45, 60]
const EMPTY_DRAFT: Draft = { name: '', projectId: null, billable: false, tags: '', note: '' }

function minutesOf(hhmm: string) {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

function addMinutes(hhmm: string, minutes: number) {
  const total = (((minutesOf(hhmm) || 0) + minutes) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Día en que arrancó la tarea en curso: si cruza la medianoche, la tarea queda en el día del inicio. */
function startDateOf(active: Active) {
  if (active.startDate) return active.startDate
  // Tareas en curso guardadas antes de este cambio: si la hora de inicio es posterior a la actual, arrancó ayer.
  if (active.startTime && active.startTime > timeKey()) {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return dateKey(d)
  }
  return dateKey()
}

export default function Page() {
  const [activeTab, setActiveTab] = useState('Inicio')
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [active, setActive] = useState<Active>({ base: 0, startedAt: null })
  const [now, setNow] = useState(0)
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [goal, setGoal] = useState<Goal | null>(null)
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE)
  const [loaded, setLoaded] = useState(false)
  const [today, setToday] = useState('')
  const [hour, setHour] = useState(12)
  const [userName, setUserName] = useState('')
  const [nameEdit, setNameEdit] = useState<string | null>(null)
  const [focus, setFocus] = useState<Focus>(DEFAULT_FOCUS)
  const [focusOpen, setFocusOpen] = useState(false)
  const [extVersion, setExtVersion] = useState('')
  const [distractions, setDistractions] = useState<Distraction[]>([])
  const [manual, setManual] = useState<Manual | null>(null)
  const [manualError, setManualError] = useState('')
  const [pieces, setPieces] = useState<Piece[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [syncOpen, setSyncOpen] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [pickerKey, setPickerKey] = useState(0)
  const timers = useRef<number[]>([])

  const running = active.startedAt !== null

  // Los datos que se guardan como .md en GitHub (el timer en curso queda sólo en este navegador).
  const data = useMemo(() => ({ tasks, clients, projects, payments, goal, plan, routines }), [tasks, clients, projects, payments, goal, plan, routines])
  const applyData = (d: AppData) => {
    setTasks(d.tasks.map(migrateTask))
    setClients(d.clients)
    setProjects(d.projects.map(migrateProject))
    setPayments(d.payments)
    setGoal(d.goal)
    setPlan(d.plan)
    setRoutines(d.routines ?? [])
  }
  const sync = useGitSync({ loaded, data, apply: applyData })
  const [lastBackup, setLastBackup] = useState<number | null>(null)

  // Carga inicial desde el navegador.
  useEffect(() => {
    const key = dateKey()
    setToday(key)
    setHour(new Date().getHours())
    setNow(Date.now())
    setLastBackup(readBackupTime())
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        setTasks((saved.tasks ?? []).map(migrateTask))
        setClients(saved.clients ?? [])
        setProjects((saved.projects ?? []).map(migrateProject))
        setPayments(saved.payments ?? [])
        setGoal(saved.goal ?? null)
        setPlan(saved.plan ?? [])
        setRoutines(saved.routines ?? [])
        if (saved.active) setActive(saved.active)
        if (saved.draft) setDraft({ ...EMPTY_DRAFT, ...saved.draft })
        if (saved.mode) setMode({ ...DEFAULT_MODE, ...saved.mode })
        if (typeof saved.userName === 'string') setUserName(saved.userName)
        if (saved.focus) setFocus({ ...DEFAULT_FOCUS, ...saved.focus })
        if (Array.isArray(saved.distractions)) setDistractions(saved.distractions)
      }
    } catch {
      // Datos ilegibles: se arranca vacío.
    }
    setLoaded(true)
    // Si la app queda abierta pasada la medianoche, "hoy" se actualiza solo.
    const tick = window.setInterval(() => { setToday(dateKey()); setHour(new Date().getHours()) }, 30000)
    const pending = timers.current
    return () => { window.clearInterval(tick); pending.forEach((t) => window.clearTimeout(t)) }
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, clients, projects, payments, goal, plan, routines, active, draft, mode, userName, focus, distractions }))
    } catch {
      // Sin almacenamiento (modo privado): la app sigue andando, sólo no recuerda.
    }
  }, [loaded, tasks, clients, projects, payments, goal, plan, routines, active, draft, mode, userName, focus, distractions])

  // El tiempo se calcula desde el inicio, así que sobrevive a pestañas en segundo plano.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [running])

  const rawElapsed = Math.floor(active.base + (active.startedAt ? Math.max(0, now - active.startedAt) / 1000 : 0))
  // En cuenta regresiva el tiempo registrado nunca pasa de lo que se puso.
  const elapsed = active.target ? Math.min(rawElapsed, active.target) : rawElapsed
  const shown = active.target ? active.target - elapsed : mode.down && !running ? mode.minutes * 60 : elapsed
  const info = describeProject(draft.projectId, projects, clients)
  const draftCanBill = canBill(draft.projectId, projects)
  const liveGold = draft.billable && draftCanBill && info.rate > 0 ? goldFor(elapsed, info.rate) : 0

  useEffect(() => {
    document.title = running ? `${fmtClock(shown)} · ${draft.name || 'Tasker CRM'}` : 'Tasker CRM'
  }, [running, shown, draft.name])

  // La extensión de foco lee estos atributos: bloquea los sitios sólo mientras corre el timer.
  const blocking = running && focus.on && focus.sites.length > 0
  useEffect(() => {
    const el = document.documentElement
    el.dataset.focus = blocking ? 'on' : 'off'
    el.dataset.focusSites = focus.sites.join(',')
  }, [blocking, focus.sites])

  // La extensión se anuncia con data-focus-ext al cargar la página (si no, está sin instalar o hay que refrescar)
  // y deja en data-focus-log los intentos de abrir sitios bloqueados.
  useEffect(() => {
    const el = document.documentElement
    const read = () => {
      setExtVersion(el.dataset.focusExt ?? '')
      if (!el.dataset.focusLog) return
      try { const incoming = JSON.parse(el.dataset.focusLog); setDistractions((cur) => mergeDistractions(cur, incoming)) } catch { /* registro ilegible */ }
    }
    read()
    const obs = new MutationObserver(read)
    obs.observe(el, { attributes: true, attributeFilter: ['data-focus-ext', 'data-focus-log'] })
    return () => obs.disconnect()
  }, [])

  // Estado para el popup de la extensión (iniciar y parar el timer desde cualquier pestaña).
  useEffect(() => {
    if (!loaded || !today) return
    document.documentElement.dataset.taskerState = JSON.stringify(buildExtState({ tasks, projects, clients, active, draft, today, personal: PERSONAL }))
  }, [loaded, tasks, projects, clients, active, draft.name, draft.projectId, today])

  // Comandos del popup: llegan como mensajes de la misma ventana, que reenvía la extensión.
  const commandRef = useRef<(c: { type?: string; name?: string; projectId?: string }) => void>(() => {})
  commandRef.current = (c) => {
    if (c.type === 'start' && typeof c.projectId === 'string' && !running) {
      const projectId = known(c.projectId)
      startWith({ name: String(c.name ?? '').slice(0, 140), projectId, billable: defaultBillable(projectId, projects, clients), tags: '', note: '' })
    } else if (c.type === 'stop' && running) stopTask()
  }
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.source === window && e.data?.tasker === 'cmd' && e.data.cmd) commandRef.current(e.data.cmd) }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [])

  const suggestedTags = useMemo(() => {
    const count = new Map<string, number>()
    tasks.slice(0, 200).forEach((t) => t.tags.forEach((tag) => count.set(tag, (count.get(tag) ?? 0) + 1)))
    const current = new Set(parseTags(draft.tags))
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).filter((t) => !current.has(t)).slice(0, 5)
  }, [tasks, draft.tags])

  const stats = useMemo(() => {
    const todayTasks = tasks.filter((t) => t.date === today)
    const todaySeconds = todayTasks.reduce((s, t) => s + t.seconds, 0)
    const todayPaid = payments.filter((p) => p.paid && p.date === today).reduce((s, p) => s + p.amount, 0)
    const todayGold = todayTasks.reduce((s, t) => s + t.amount, 0) + todayPaid
    const secsByDay = new Map<string, number>()
    tasks.forEach((t) => secsByDay.set(t.date, (secsByDay.get(t.date) ?? 0) + t.seconds))
    const dates = new Set(secsByDay.keys())

    const base = today ? new Date(`${today}T12:00:00`) : new Date(0)
    const monday = new Date(base)
    monday.setDate(base.getDate() - ((base.getDay() + 6) % 7))
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const key = dateKey(d)
      const secs = tasks.filter((t) => t.date === key).reduce((s, t) => s + t.seconds, 0)
      return { letter: DAY_LETTERS[d.getDay()], key, secs, isToday: key === today, future: key > today }
    })
    const weekSeconds = week.reduce((s, w) => s + w.secs, 0)
    const month = today.slice(0, 7)

    return {
      todaySeconds, todayGold, secsByDay, week, weekSeconds,
      weekMax: Math.max(3600, ...week.map((w) => w.secs)) * 1.1,
      weekDays: week.filter((w) => w.secs > 0).length,
      streak: streakFor(dates),
      monthEarned: monthEarnings(month, tasks, payments),
      monthCollected: monthCollected(month, payments),
      monthTarget: goalTarget(goal, month),
    }
  }, [tasks, payments, goal, today])

  function toast(title: string, text: string) {
    const id = Date.now() + Math.random()
    setToasts((cur) => [...cur, { id, title, text }])
    timers.current.push(window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4200))
  }

  /** Festejo sobrio: un estallido corto de papelitos en blanco y negro. */
  function celebrate() {
    const id = Date.now()
    setPieces(Array.from({ length: 36 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 36 + Math.random() * 0.4
      const dist = 90 + Math.random() * 140
      return { id: id + i, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 60, r: (Math.random() - 0.5) * 720, d: Math.random() * 0.12, s: 5 + Math.random() * 6, round: Math.random() < 0.35 }
    }))
    timers.current.push(window.setTimeout(() => setPieces([]), 1300))
  }

  /** Registra la tarea y festeja. */
  function record(task: Task) {
    setTasks((cur) => [task, ...cur])
    celebrate()
    toast(`Tarea terminada · ${fmtHours(task.seconds)}`, `${task.amount > 0 ? `+US$ ${fmtMoney(task.amount)} · ` : ''}${task.project}`)
  }

  function pickProject(projectId: string | null) {
    // Un proyecto de una plataforma arranca como facturable (se puede cambiar con el $); uno personal, nunca.
    setDraft((d) => ({ ...d, projectId, billable: defaultBillable(projectId, projects, clients) }))
  }

  function addTag(tag: string) {
    setDraft((d) => ({ ...d, tags: [...parseTags(d.tags), tag].join(', ') }))
  }

  /** Toda tarea va a un proyecto (de un cliente o personal): si falta, se abre el selector. */
  function askProject() {
    toast('Elegí un proyecto', 'Cada tarea va a un proyecto de una plataforma o a Personal.')
    setPickerKey((k) => k + 1)
  }

  function startTask() {
    if (!draft.projectId) return askProject()
    const t = Date.now()
    setNow(t)
    setActive((a) => ({ ...a, startedAt: t, startTime: a.startTime ?? timeKey(), startDate: a.startDate ?? (a.startTime ? startDateOf(a) : dateKey()), target: a.target ?? (mode.down ? Math.max(1, mode.minutes) * 60 : undefined) }))
  }

  // Cuando la cuenta regresiva llega a cero se registra sola la tarea.
  useEffect(() => {
    if (!running || !active.target || rawElapsed < active.target) return
    toast('Se terminó el tiempo', `${fmtHours(active.target)} · ${draft.name || 'Tarea sin título'}`)
    stopTask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, active.target, rawElapsed])

  /** Guarda lo escrito en el backlog, sin empezar el timer. */
  function saveForLater() {
    const text = draft.name.trim() || (draft.ref ? `Task ${draft.ref}` : '')
    if (!text) return
    if (!draft.planId) setPlan((cur) => [...cur, { id: uid(), date: '', text, projectId: draft.projectId, hours: 0, done: false, ...(draft.note.trim() ? { note: draft.note.trim() } : {}) }])
    setDraft((d) => ({ ...d, name: '', tags: '', note: '', ref: undefined, planId: undefined, routineId: undefined }))
    setNoteOpen(false)
    toast('Guardada en el backlog', text)
  }

  function pickSuggestion(next: Draft) {
    // Si ya escribiste una nota, se conserva.
    setDraft((d) => ({ ...next, note: d.note || next.note }))
    setSuggestOpen(false)
    setNoteOpen(false)
  }

  function removePlan(id: string) {
    setPlan((cur) => cur.filter((x) => x.id !== id))
  }

  function discardTask() {
    if (elapsed > 0 && !window.confirm('¿Descartar la tarea en curso sin registrar el tiempo?')) return
    setActive({ base: 0, startedAt: null })
    setDraft((d) => ({ ...d, name: '', note: '', ref: undefined, planId: undefined, routineId: undefined }))
    setNoteOpen(false)
  }

  function stopTask() {
    if (elapsed < 1) return discardTask()
    const { name, ref } = splitRef(draft.name, draft.ref)
    record(buildTask({
      name, ref, seconds: elapsed, projectId: draft.projectId, billable: draft.billable,
      tags: parseTags(draft.tags), date: startDateOf(active), start: active.startTime, note: draft.note, routineId: draft.routineId, projects, clients,
    }))
    // Si venía del backlog, ya está hecha: sale de "por hacer".
    if (draft.planId) removePlan(draft.planId)
    setActive({ base: 0, startedAt: null })
    setDraft((d) => ({ ...d, name: '', tags: '', note: '', ref: undefined, planId: undefined, routineId: undefined }))
    setNoteOpen(false)
  }

  /** Si en el nombre quedó pegado un Task ID y no hay otro, pasa a ser el ID de la tarea. */
  function splitRef(name: string, ref?: string) {
    return !ref?.trim() && looksLikeId(name) ? { name: '', ref: name.trim() } : { name, ref }
  }

  function copyRef(ref: string) {
    navigator.clipboard?.writeText(ref).then(() => toast('Task ID copiado', ref), () => {})
  }

  function startWith(next: Draft) {
    if (elapsed > 0 && !window.confirm('Hay una tarea en curso. ¿Descartarla y empezar esta?')) return
    setDraft(next)
    setNoteOpen(!!next.note)
    setActiveTab('Inicio')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    // Sin proyecto no arranca: queda cargada en la caja para elegirlo.
    if (!next.projectId) {
      setActive({ base: 0, startedAt: null })
      return askProject()
    }
    const t = Date.now()
    setNow(t)
    setActive({ base: 0, startedAt: t, startTime: timeKey(), startDate: dateKey(), target: mode.down ? Math.max(1, mode.minutes) * 60 : undefined })
  }

  function repeatTask(task: Task) {
    startWith(taskDraft(task))
  }

  function startPlanItem(item: PlanItem) {
    startWith(planDraft(item))
  }

  function startRoutine(r: Routine) {
    startWith(routineDraft(r))
  }

  // Borradores para la caja del timer, a partir de una tarea hecha, del backlog o de una rutina.
  const known = (id: string | null) => (projects.some((p) => p.id === id) ? id : null)
  function taskDraft(task: Task): Draft {
    const projectId = known(task.projectId)
    return { name: task.name, projectId, billable: task.billable && canBill(projectId, projects), tags: task.tags.join(', '), note: '', routineId: task.routineId }
  }
  function planDraft(item: PlanItem): Draft {
    const projectId = known(item.projectId)
    return { name: item.text, projectId, billable: defaultBillable(projectId, projects, clients), tags: '', note: item.note ?? '', planId: item.id }
  }
  function routineDraft(r: Routine): Draft {
    const projectId = known(r.projectId)
    return { name: r.text, projectId, billable: defaultBillable(projectId, projects, clients), tags: r.tags.join(', '), note: '', routineId: r.id }
  }

  function setBillable(ids: number[], billable: boolean) {
    const set = new Set(ids)
    setTasks((cur) => cur.map((t) => {
      // Las tareas de proyectos personales no se facturan nunca.
      if (!set.has(t.id) || (billable && !canBill(t.projectId, projects))) return t
      const amount = billable && t.rate > 0 ? goldFor(t.seconds, t.rate) : 0
      return { ...t, billable, amount }
    }))
  }

  function toggleBillable(id: number) {
    const t = tasks.find((x) => x.id === id)
    if (t) setBillable([id], !t.billable)
  }

  function deleteTask(id: number) {
    if (window.confirm('¿Borrar esta tarea?')) setTasks((cur) => cur.filter((t) => t.id !== id))
  }

  function deleteMany(ids: number[]) {
    const set = new Set(ids)
    setTasks((cur) => cur.filter((t) => !set.has(t.id)))
  }

  function openManual() {
    const d = new Date()
    const from = new Date(d.getTime() - 3600000)
    setManual({ name: '', ref: '', projectId: draft.projectId, billable: draft.billable, tags: '', note: '', date: dateKey(), from: timeKey(from), to: timeKey(d) })
    setManualError('')
  }

  function editTask(task: Task) {
    const from = task.start ?? '09:00'
    setManual({ id: task.id, rate: task.rate, routineId: task.routineId, ref: task.ref ?? '', name: task.name, projectId: task.projectId, billable: task.billable, tags: task.tags.join(', '), note: task.note ?? '', date: task.date, from, to: addMinutes(from, Math.round(task.seconds / 60)) })
    setManualError('')
  }

  function saveManual() {
    if (!manual) return
    if (!manual.name.trim() && !manual.ref.trim()) return setManualError('Ponele un nombre o un Task ID a la tarea.')
    if (!manual.projectId) return setManualError('Elegí un proyecto: de una plataforma o personal.')
    const a = minutesOf(manual.from)
    const b = minutesOf(manual.to)
    if (Number.isNaN(a) || Number.isNaN(b)) return setManualError('Completá el horario de inicio y de fin.')
    // Si el fin es antes del inicio, la tarea cruzó la medianoche.
    const minutes = b > a ? b - a : b + 1440 - a
    if (minutes <= 0) return setManualError('La tarea tiene que durar al menos un minuto.')
    if (minutes > 16 * 60) return setManualError('No se aceptan más de 16 horas.')
    const old = manual.id ? tasks.find((t) => t.id === manual.id) : undefined
    // Al editar se respeta la tarifa con que se registró, salvo que cambie el proyecto.
    const keepRate = old && old.projectId === manual.projectId ? old.rate : undefined
    const split = splitRef(manual.name, manual.ref)
    const task = buildTask({
      id: manual.id, name: split.name, ref: split.ref, seconds: minutes * 60, projectId: manual.projectId, billable: manual.billable,
      tags: parseTags(manual.tags), date: manual.date || dateKey(), start: manual.from, rate: keepRate, note: manual.note, routineId: manual.routineId, projects, clients,
    })
    if (old) setTasks((cur) => cur.map((t) => (t.id === old.id ? task : t)))
    else record(task)
    setManual(null)
  }

  const headerDate = today ? (() => { const d = new Date(`${today}T12:00:00`); return `${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}` })() : ' '
  const manualInfo = manual ? describeProject(manual.projectId, projects, clients) : null
  // Al editar, la tarifa congelada sigue valiendo mientras no cambie el proyecto.
  const manualRate = manual && manualInfo ? (manual.id && tasks.find((t) => t.id === manual.id)?.projectId === manual.projectId ? manual.rate ?? 0 : manualInfo.rate) : 0
  const recent = [...tasks].sort((a, b) => (b.date + (b.start ?? '')).localeCompare(a.date + (a.start ?? '')) || b.id - a.id).slice(0, 5)
  // Backlog: todo lo pendiente, con o sin día (los días vienen del plan semanal de versiones anteriores).
  const backlog = plan.filter((p) => !p.done)
  // Sugerencias de la caja del timer: lo que está por hacer y tareas ya hechas para repetir, como plantilla.
  const typed = draft.name.trim().toLowerCase()
  const backlogMatches = backlog.filter((i) => !typed || i.text.toLowerCase().includes(typed)).slice(0, 6)
  // Rutinas de hoy que todavía no se hicieron.
  const weekday = today ? new Date(`${today}T12:00:00`).getDay() : -1
  const doneRoutines = new Set(tasks.filter((t) => t.date === today && t.routineId).map((t) => t.routineId))
  const routinesToday = routines.filter((r) => r.days.includes(weekday) && !doneRoutines.has(r.id))
  const routineMatches = routinesToday.filter((r) => !typed || r.text.toLowerCase().includes(typed))
  const templates = (() => {
    const seen = new Set([...backlog.map((i) => i.text.toLowerCase()), ...routinesToday.map((r) => r.text.toLowerCase())])
    const out: Task[] = []
    for (const t of [...tasks].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)) {
      const key = t.name.toLowerCase()
      if (seen.has(key) || (typed && !key.includes(typed)) || key === typed) continue
      seen.add(key)
      out.push(t)
      if (out.length >= 4) break
    }
    return out
  })()
  const weekWorked = stats.weekSeconds + elapsed
  const weekAvg = weekWorked / Math.max(1, stats.weekDays + (elapsed > 0 && !stats.week.find((d) => d.isToday)?.secs ? 1 : 0))
  const workedToday = stats.todaySeconds + elapsed > 0
  const streak = stats.streak + (elapsed > 0 && stats.todaySeconds === 0 ? 1 : 0)

  // Barra de ganancias del mes: con meta, hasta la meta; sin meta, hasta el próximo número redondo.
  const monthLive = stats.monthEarned + liveGold
  const barTarget = stats.monthTarget || Math.max(100, Math.ceil((monthLive + 1) / 500) * 500)
  const steps = stats.monthTarget ? milestonesFor(goal, stats.monthTarget) : []
  const nextStep = [...steps, stats.monthTarget].find((m) => m > monthLive) ?? 0
  const monthName = today ? MONTHS[Number(today.slice(5, 7)) - 1] : ''

  const backupNag = loaded && sync.status === 'off' && (tasks.length > 0 || payments.length > 0) && backupAgeDays(lastBackup) >= BACKUP_REMINDER_DAYS

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Pickaxe /></div><strong>Tasker CRM</strong></div>
        <nav className="desktop-nav" aria-label="Secciones">
          {TABS.map(({ id }) => <button key={id} className={activeTab === id ? 'nav-active' : ''} onClick={() => setActiveTab(id)}>{id}</button>)}
        </nav>
        <div className="header-actions">
          {running && activeTab !== 'Inicio' && <button className="running-pill" onClick={() => setActiveTab('Inicio')}><i /> {fmtClock(shown)}</button>}
          {/* Sin GitHub y con el aviso de backup a la vista, el aviso ya ofrece conectarlo: no se repite acá. */}
          {!backupNag && <button className={`sync-button sync-${sync.status}`} onClick={() => setSyncOpen(true)} title={sync.status === 'off' ? 'Backup y guardado en GitHub' : STATUS_LABEL[sync.status]} aria-label={sync.status === 'off' ? 'Backup y guardado en GitHub' : STATUS_LABEL[sync.status]}>{sync.status === 'off' ? <CloudOff /> : <Cloud />}{sync.status !== 'off' && <span>{STATUS_LABEL[sync.status]}</span>}</button>}
        </div>
      </header>

      <div className="content-wrap">
        {activeTab === 'Inicio' && <>
          {backupNag && (
            <div className="backup-reminder" role="status"><span><b>Tus datos viven solo en este navegador.</b> {lastBackup ? `Hace ${backupAgeDays(lastBackup)} días que no hacés un backup.` : 'Todavía no hiciste ningún backup.'}</span><button className="ghost-button" onClick={() => { downloadBackup(data); markBackup(); setLastBackup(Date.now()) }}>Descargar backup</button><button className="text-button" onClick={() => setSyncOpen(true)}>Guardar en GitHub</button></div>
          )}
          <section className="welcome-row"><p className="eyebrow">{headerDate}</p>{nameEdit !== null
            ? <form className="name-form" onSubmit={(e) => { e.preventDefault(); setUserName(nameEdit.trim().slice(0, 40)); setNameEdit(null) }}><h1>{greetingFor(hour)},</h1><input autoFocus value={nameEdit} onChange={(e) => setNameEdit(e.target.value)} onBlur={() => { setUserName(nameEdit.trim().slice(0, 40)); setNameEdit(null) }} placeholder="tu nombre" aria-label="Tu nombre" maxLength={40} /></form>
            : <h1><button className="greeting" onClick={() => setNameEdit(userName)} title="Cambiar tu nombre">{greetingFor(hour)}{userName ? `, ${userName}` : ''}</button>{!userName && <button className="text-button name-ask" onClick={() => setNameEdit('')}>¿Cómo te llamás?</button>}</h1>}</section>

          <section className={`timer-bar ${running ? 'is-running' : ''}`}>
            <div className="timer-name-wrap">
              {draft.ref && <span className="ref-chip"><button onClick={() => copyRef(draft.ref!)} title={`Task ID ${draft.ref} · tocá para copiar`}><Copy /> {shortRef(draft.ref)}</button><button onClick={() => setDraft({ ...draft, ref: undefined })} aria-label="Quitar Task ID" title="Quitar Task ID"><X /></button></span>}
              <input className="timer-name" value={draft.name} onChange={(e) => { setDraft({ ...draft, name: e.target.value, planId: undefined, routineId: undefined }); setSuggestOpen(true) }} onPaste={(e) => { const text = e.clipboardData.getData('text'); if (!draft.name.trim() && !draft.ref && looksLikeId(text)) { e.preventDefault(); setDraft({ ...draft, ref: text.trim() }) } }} onFocus={() => setSuggestOpen(true)} onBlur={() => setSuggestOpen(false)} onKeyDown={(e) => { if (e.key === 'Escape') setSuggestOpen(false); if (e.key === 'Enter') { setSuggestOpen(false); if (running) stopTask(); else startTask() } }} maxLength={140} placeholder={draft.ref ? '¿Qué tarea es? (opcional)' : ['¿En qué estás trabajando? Nombre o Task ID', backlog.length ? `${backlog.length} por hacer` : '', routinesToday.length ? `${routinesToday.length} rutina${routinesToday.length === 1 ? '' : 's'} hoy` : ''].filter(Boolean).join(' · ')} aria-label="Nombre de tarea" autoComplete="off" />
              {suggestOpen && !running && (routineMatches.length > 0 || backlogMatches.length > 0 || templates.length > 0) && (
                // Elegir una sugerencia sólo la carga en la caja: después se arranca con ▶.
                <div className="suggest-menu" onMouseDown={(e) => e.preventDefault()}>
                  {routineMatches.length > 0 && <div className="suggest-title"><Repeat /> Rutinas de hoy</div>}
                  {routineMatches.map((r) => {
                    const p = projects.find((x) => x.id === r.projectId)
                    return <button className={`suggest-item ${draft.routineId === r.id ? 'suggest-on' : ''}`} key={r.id} onClick={() => pickSuggestion(routineDraft(r))}><span>{r.text}</span>{p && <small><i className="dot" style={{ background: p.color }} /> {p.name}</small>}</button>
                  })}
                  {backlogMatches.length > 0 && <div className="suggest-title"><ListTodo /> Por hacer</div>}
                  {backlogMatches.map((i) => {
                    const p = projects.find((x) => x.id === i.projectId)
                    return <button className={`suggest-item ${draft.planId === i.id ? 'suggest-on' : ''}`} key={i.id} onClick={() => pickSuggestion(planDraft(i))}><span>{i.text}</span>{p && <small><i className="dot" style={{ background: p.color }} /> {p.name}</small>}</button>
                  })}
                  {templates.length > 0 && <div className="suggest-title"><History /> Repetir</div>}
                  {templates.map((t) => <button className="suggest-item" key={t.id} onClick={() => pickSuggestion(taskDraft(t))}><span>{t.name}</span><small><i className="dot" style={{ background: t.color }} /> {t.project}</small></button>)}
                </div>
              )}
            </div>
            <div className="timer-controls">
              <ProjectPicker projects={projects} clients={clients} value={draft.projectId} onChange={pickProject} onCreateProject={(p) => setProjects((cur) => [...cur, p])} openKey={pickerKey} compact />
              <label className="tags-input"><Tag /><input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="Etiquetas" aria-label="Etiquetas" /></label>
              <button className={`billable-toggle ${noteOpen || draft.note.trim() ? 'billable-on' : ''}`} onClick={() => setNoteOpen((o) => !o)} aria-pressed={noteOpen} title={draft.note.trim() ? 'Memo de la tarea' : 'Memo: pegá las indicaciones de la tarea o anotá qué hiciste'} aria-label="Memo"><StickyNote /></button>
              {draftCanBill && <button className={`billable-toggle ${draft.billable ? 'billable-on' : ''}`} onClick={() => setDraft({ ...draft, billable: !draft.billable })} aria-pressed={draft.billable} title={draft.billable ? (info.rate > 0 ? `Facturable a ${info.rate} USD/h` : 'Facturable: horas taskeadas en la plataforma') : 'No facturable'} aria-label="Facturable"><DollarSign /></button>}
              <button className={`billable-toggle ${mode.down ? 'billable-on' : ''}`} onClick={() => setMode((m) => ({ ...m, down: !m.down }))} disabled={running} aria-pressed={mode.down} title={mode.down ? 'Cuenta regresiva: tocá para contar hacia arriba' : 'Contando hacia arriba: tocá para usar cuenta regresiva'} aria-label="Modo del timer">{mode.down ? <ArrowDown /> : <ArrowUp />}</button>
              <span className="timer-clock" aria-live="off">{fmtClock(shown)}</span>
              {!running && draft.name.trim() && !draft.planId && <button className="icon-button" onClick={saveForLater} aria-label="Guardar en el backlog" title="Guardar en el backlog para hacerla después"><ListPlus /></button>}
              <button className={`play-button ${running ? 'stop' : ''}`} onClick={running ? stopTask : startTask} aria-label={running ? 'Terminar y registrar' : 'Empezar'} title={running ? 'Terminar y registrar' : 'Empezar'}>{running ? <Square /> : <Play />}</button>
              {elapsed > 0 && <button className="icon-button" onClick={discardTask} aria-label="Descartar" title="Descartar sin registrar"><X /></button>}
            </div>
          </section>
          {(noteOpen || draft.note || draft.ref) && <div className="memo-panel">
            <div className="memo-head">
              <span><StickyNote /> Memo</span>
              <label className="ref-input">Task ID<input className="mono" value={draft.ref ?? ''} onChange={(e) => setDraft({ ...draft, ref: e.target.value || undefined })} placeholder="Pegalo acá" /></label>
              {draft.note && <small>{draft.note.length.toLocaleString('es-AR')} caracteres</small>}
            </div>
            <AutoTextarea className="memo-text" autoFocus={noteOpen && !draft.note} rows={4} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setNoteOpen(false) }} maxLength={20000} placeholder="Pegá las indicaciones de la tarea o anotá qué hiciste, decisiones, lo que falta…" aria-label="Memo de la tarea" />
            <p className="memo-warning">Solo notas propias. Las plataformas prohíben compartir el contenido de las tareas: no pegues acá texto confidencial del proyecto. Los reportes para compartir y la evidencia de pagos no incluyen los memos.</p>
          </div>}
          <div className="timer-sub">
            {!running && mode.down && <span className="countdown-presets">Cuenta regresiva: {PRESET_MINUTES.map((m) => <button key={m} className={mode.minutes === m ? 'preset-on' : ''} onClick={() => setMode({ down: true, minutes: m })}>{m} min</button>)}<input type="number" min={1} max={600} value={mode.minutes} onChange={(e) => setMode({ down: true, minutes: Math.min(600, Math.max(1, Math.round(Number(e.target.value)) || 1)) })} aria-label="Minutos" /> min</span>}
            {(focus.sites.length > 0 || !running) && <button className={`focus-chip ${blocking ? 'focus-on' : ''}`} onClick={() => setFocusOpen(true)} title={focus.sites.length ? `Modo foco: ${focus.sites.join(', ')}${extVersion ? '' : ' · extensión no detectada: no se bloquea nada'}` : 'Bloqueá sitios que te distraen mientras corre el timer'}>
              {blocking ? (() => { const Tree = [Sprout, TreeDeciduous, Trees][treeStage(elapsed)]; return <><Tree /> Foco · {focus.sites.length} sitio{focus.sites.length === 1 ? '' : 's'} {extVersion ? `bloqueado${focus.sites.length === 1 ? '' : 's'}` : 'sin bloquear: falta la extensión'}</> })() : <><Sprout /> {focus.on && focus.sites.length ? `Modo foco: ${focus.sites.length} sitio${focus.sites.length === 1 ? '' : 's'}` : 'Modo foco'}{focus.sites.length > 0 && !extVersion && <b className="focus-warn" title="No detecto la extensión: no se bloquea nada">!</b>}</>}
            </button>}
            {running && active.target && <span>Cuenta regresiva de {fmtHours(active.target)}: al llegar a cero se registra sola</span>}
            {running && liveGold > 0 && <span>+US$ {fmtMoney(liveGold)} · {info.rate} USD/h</span>}
            {running && info.billing !== 'hora' && <span>{info.billing === 'interno' ? 'Proyecto personal: suma tiempo, no plata' : 'Se cobra por pagos: el tiempo te muestra cuánto rinde la hora'}</span>}
            {resourceLinks(info.project, info.client).map((l, i) => <LinkChip key={i} link={l} />)}
            {!running && suggestedTags.length > 0 && <span className="tag-suggestions">{suggestedTags.map((t) => <button key={t} onClick={() => addTag(t)}>+ {t}</button>)}</span>}
          </div>

          <section className="hud-grid">
            <article className="card earnings-card">
              <div className="card-label"><span>Ganado en {monthName} <small title="Horas × tarifa más cobros y bonus. Lo que te pagaron de verdad está abajo.">(estimado)</small></span>{stats.monthTarget ? <span>Meta del mes US$ {fmtShort(stats.monthTarget)}</span> : <button className="text-button" onClick={() => { setActiveTab('Estadísticas'); window.setTimeout(() => document.getElementById('meta')?.scrollIntoView({ behavior: 'smooth' }), 50) }}>Definir meta</button>}</div>
              <div className="hero-number">US$ {fmtMoney(monthLive)}</div>
              <div className="carrot-track">
                <div className="carrot-fill" style={{ width: `${Math.min(100, (monthLive / barTarget) * 100)}%` }} />
                {steps.map((m, i) => <span key={m} className={`track-step ${monthLive >= m ? 'done' : ''}`} style={{ left: `${(m / barTarget) * 100}%` }}><i /><em className="step-tip">Micro objetivo {i + 1}: US$ {fmtShort(m)}</em></span>)}
                {nextStep > 0 && <span className="carrot" style={{ left: `${Math.min(100, (nextStep / barTarget) * 100)}%` }}><Carrot /><em className="step-tip">Próximo: US$ {fmtShort(nextStep)}</em></span>}
              </div>
              <div className="step-labels" aria-hidden="true">
                {steps.map((m) => <span key={m} className={monthLive >= m ? 'done' : ''} style={{ left: `${(m / barTarget) * 100}%` }}>{fmtShort(m)}</span>)}
                {stats.monthTarget > 0 && <span className="step-end" style={{ left: '100%' }}>{fmtShort(stats.monthTarget)}</span>}
              </div>
              <div className="card-foot">
                {nextStep > 0 ? <span>Faltan <b>US$ {fmtShort(Math.ceil((nextStep - monthLive) * 100) / 100)}</b> para llegar a {fmtShort(nextStep)}</span> : stats.monthTarget ? <span><b>¡Meta del mes cumplida!</b></span> : <span>Con una meta vas a ver micro objetivos en esta barra.</span>}
                <span>Hoy US$ {fmtMoney(stats.todayGold + liveGold)}</span>
              </div>
              {payments.some((p) => p.paid) && <div className="card-foot"><span>Cobrado en {monthName} <b>US$ {fmtMoney(stats.monthCollected)}</b></span>{stats.monthEarned > 0 && <span>{stats.monthCollected >= stats.monthEarned ? 'Al día' : `Falta cobrar US$ ${fmtShort(Math.round(stats.monthEarned - stats.monthCollected))}`}</span>}</div>}
            </article>
            <article className={`card streak-card ${workedToday ? 'lit' : ''}`}>
              <div className="streak-top">
                <Flame className="streak-flame" />
                <div><strong>{streak}</strong><span>{streak === 1 ? 'día de racha' : 'días de racha'}</span></div>
              </div>
              <ActivityGrid secsByDay={stats.secsByDay} today={today} liveSecs={elapsed} />
              <div className="card-foot"><span>{workedToday ? <>Hoy <b>{fmtHours(stats.todaySeconds + elapsed)}</b></> : streak > 0 ? 'Registrá algo hoy para no perder la racha' : 'Registrá una tarea para empezar tu racha'}</span></div>
            </article>
          </section>

          <section className="workspace-grid single">
            <article className="panel">
              <div className="panel-heading"><h3>Esta semana</h3><button className="text-button" onClick={() => setActiveTab('Estadísticas')}>Estadísticas →</button></div>
              <div className="mini-chart">
                {stats.week.map((d) => {
                  const secs = d.secs + (d.isToday ? elapsed : 0)
                  return <div key={d.key} className={`mini-col ${d.isToday ? 'is-today' : ''}`} title={fmtHours(secs)}><div className="mini-bar-area"><div className="mini-bar" style={{ height: `${(secs / stats.weekMax) * 100}%` }} /></div><span>{d.letter}</span></div>
                })}
              </div>
              <div className="card-foot"><span>Promedio <b>{fmtHours(weekAvg)}</b> por día trabajado</span><span>{fmtHours(weekWorked)} en total</span></div>
            </article>
          </section>

          <section className="recent-section">
            <div className="panel-heading"><h3>Últimos registros</h3><button className="text-button" onClick={() => setActiveTab('Tareas')}>Ver todas →</button></div>
            <div className="task-list">{recent.length === 0 && <p className="empty-list">Todavía no registraste nada. Escribí una tarea y tocá ▶.</p>}{recent.map((task) => <TaskRow key={task.id} task={task} dateLabel={dayLabel(task.date, today)} onDelete={deleteTask} onRepeat={repeatTask} onEdit={editTask} onToggleBillable={toggleBillable} billable={canBill(task.projectId, projects)} />)}</div>
            <button className="text-button add-manual" onClick={openManual}><Plus /> Cargar tiempo a mano</button>
          </section>
        </>}

        {activeTab === 'Tareas' && <TasksView tasks={tasks} backlog={backlog} routines={routines} setRoutines={setRoutines} onStartRoutine={startRoutine} onCreateProject={(p) => setProjects((cur) => [...cur, p])} projects={projects} clients={clients} onStartPlan={startPlanItem} onRemovePlan={removePlan} onUpdatePlan={(item) => setPlan((cur) => cur.map((x) => (x.id === item.id ? item : x)))} today={today} onDelete={deleteTask} onDeleteMany={deleteMany} onSetBillable={setBillable} onRepeat={repeatTask} onEdit={editTask} onToggleBillable={toggleBillable} onAddManual={openManual} />}
        {activeTab === 'Estadísticas' && today && <StatsView distractions={distractions} extVersion={extVersion} tasks={tasks} payments={payments} projects={projects} clients={clients} goal={goal} setGoal={setGoal} today={today} />}
        {activeTab === 'Pagos' && today && <PaymentsView clients={clients} projects={projects} payments={payments} setPayments={setPayments} today={today} />}
        {activeTab === 'Plataformas' && <ClientsView clients={clients} projects={projects} tasks={tasks} payments={payments} setClients={setClients} setProjects={setProjects} setTasks={setTasks} setPayments={setPayments} />}
      </div>

      <nav className="bottom-nav" aria-label="Navegación móvil">{TABS.map(({ id, icon: Icon }) => <button key={id} className={activeTab === id ? 'mobile-active' : ''} onClick={() => setActiveTab(id)}><Icon /><span>{id === 'Estadísticas' ? 'Stats' : id}</span></button>)}</nav>

      {manual && manualInfo && <div className="modal-backdrop" onClick={() => setManual(null)}><div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setManual(null)} aria-label="Cerrar"><X /></button>
        <h2>{manual.id ? 'Editar tarea' : 'Cargar tiempo a mano'}</h2>
        {!manual.id && <p>Sumá una tarea que ya hiciste para no perder ese trabajo.</p>}
        <div className="form-grid">
          <div className="modal-fields two"><label>Tarea<input autoFocus placeholder="¿Qué hiciste?" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} /></label><label>Task ID<input className="mono" placeholder="Opcional" value={manual.ref} onChange={(e) => setManual({ ...manual, ref: e.target.value })} /></label></div>
          <div className="field"><span>Proyecto</span><ProjectPicker projects={projects} clients={clients} value={manual.projectId} onChange={(id) => setManual({ ...manual, projectId: id, billable: defaultBillable(id, projects, clients) })} onCreateProject={(p) => setProjects((cur) => [...cur, p])} /></div>
          <label>Etiquetas<input placeholder="diseño, reunión" value={manual.tags} onChange={(e) => setManual({ ...manual, tags: e.target.value })} /></label>
          <div className="modal-fields three"><label>Fecha<input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></label><label>Desde<input type="time" value={manual.from} onChange={(e) => setManual({ ...manual, from: e.target.value })} /></label><label>Hasta<input type="time" value={manual.to} onChange={(e) => setManual({ ...manual, to: e.target.value })} /></label></div>
          <label>Memo<AutoTextarea className="memo-text" rows={4} max={360} value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} maxLength={20000} placeholder="Notas propias: qué hiciste, lo que quedó pendiente…" /><small className="memo-warning">No pegues texto confidencial de las tareas: las plataformas lo prohíben.</small></label>
          {canBill(manual.projectId, projects) ? <label className="check-line"><input type="checkbox" checked={manual.billable} onChange={(e) => setManual({ ...manual, billable: e.target.checked })} /> Facturable{manual.billable && (manualRate > 0 ? ` · ${manualRate} USD/h` : ' · sin tarifa por hora')}</label> : <small className="field-help">Proyecto personal: suma tiempo, no se factura.</small>}
        </div>
        {manualError && <p className="form-error">{manualError}</p>}
        <div className="modal-actions">
          {manual.id && <button className="ghost-button danger-text" onClick={() => { const id = manual.id!; if (window.confirm('¿Borrar esta tarea?')) { setTasks((cur) => cur.filter((t) => t.id !== id)); setManual(null) } }}>Borrar</button>}
          <button className="ghost-button" onClick={() => setManual(null)}>Cancelar</button>
          <button className="primary-button" onClick={saveManual}><Check /> Guardar</button>
        </div>
      </div></div>}

      {focusOpen && <FocusModal focus={focus} extVersion={extVersion} blocking={blocking} onSave={(f) => { setFocus(f); setFocusOpen(false) }} onClose={() => setFocusOpen(false)} />}

      {syncOpen && <SyncModal cfg={sync.cfg} status={sync.status} message={sync.message} lastSync={sync.lastSync} onConnect={sync.connect} onDisconnect={sync.disconnect} onSyncNow={sync.syncNow} onClose={() => setSyncOpen(false)} data={data} lastBackup={lastBackup} onBackup={() => { markBackup(); setLastBackup(Date.now()) }} onRestore={(raw) => { const d = parseBackup(raw); if (typeof d === 'string') return d; applyData(d); markBackup(); setLastBackup(Date.now()); return '' }} />}

      <div className="confetti" aria-hidden="true">{pieces.map((p) => <span key={p.id} className={p.round ? 'round' : ''} style={{ width: p.s, height: p.round ? p.s : p.s * 0.45, animationDelay: `${p.d}s`, ['--x' as string]: `${p.x}px`, ['--y' as string]: `${p.y}px`, ['--r' as string]: `${p.r}deg` }} />)}</div>
      <div className="toast-stack" role="status" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}><strong>{t.title}</strong><span>{t.text}</span></div>)}</div>
    </main>
  )
}
