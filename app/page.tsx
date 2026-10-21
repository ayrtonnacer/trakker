'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, BarChart3, Carrot, Cloud, CloudOff, Check, DollarSign, ExternalLink, Flame, History, Home, ListChecks, ListPlus, ListTodo, Pickaxe, Play, Plus, Square, Tag, Users, X } from 'lucide-react'
import {
  buildTask,
  dateKey,
  describeProject,
  fmtClock,
  fmtHours,
  fmtMoney,
  fmtShort,
  goalTarget,
  goldFor,
  migrateProject,
  migrateTask,
  milestonesFor,
  monthEarnings,
  parseTags,
  streakFor,
  timeKey,
  uid,
  type Client,
  type Goal,
  type Payment,
  type PlanItem,
  type Project,
  type Task,
} from '@/lib/game'
import { ClientsView } from '@/components/tracker/clients-view'
import { ProjectPicker } from '@/components/tracker/project-picker'
import { StatsView } from '@/components/tracker/stats-view'
import { TaskRow } from '@/components/tracker/task-row'
import { TasksView, dayLabel } from '@/components/tracker/tasks-view'
import { STATUS_LABEL, SyncModal } from '@/components/tracker/sync-modal'
import { useGitSync } from '@/lib/use-sync'

// Se mantiene la clave de versiones anteriores para no perder los datos guardados.
const STORAGE_KEY = 'tiempo-oro-v1'
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const TABS: { id: string; icon: typeof Home }[] = [
  { id: 'Inicio', icon: Home },
  { id: 'Tareas', icon: ListChecks },
  { id: 'Estadísticas', icon: BarChart3 },
  { id: 'Clientes', icon: Users },
]

type Active = { base: number; startedAt: number | null; startTime?: string; target?: number } // target: segundos de la cuenta regresiva
type Mode = { down: boolean; minutes: number }
type Draft = { name: string; projectId: string | null; billable: boolean; tags: string; planId?: string } // planId: viene del backlog
type Toast = { id: number; title: string; text: string }
type Manual = { id?: number; rate?: number; name: string; projectId: string | null; billable: boolean; tags: string; date: string; from: string; to: string }
type Piece = { id: number; x: number; y: number; r: number; d: number; s: number; round: boolean }

const DEFAULT_MODE: Mode = { down: false, minutes: 30 }
const PRESET_MINUTES = [15, 25, 30, 45, 60]
const EMPTY_DRAFT: Draft = { name: '', projectId: null, billable: false, tags: '' }

function seedData(today: string) {
  const clients: Client[] = [
    { id: 'c-outlier', name: 'Outlier', color: '#2f6f9f', status: 'activo', links: [{ label: 'Plataforma', url: 'https://app.outlier.ai' }, { label: 'Pagos', url: 'https://app.outlier.ai/earnings' }], notes: 'AI trainer. Pagan semanal, martes a la noche (hora del Pacífico).' },
    { id: 'c-norte', name: 'Estudio Norte', color: '#448361', status: 'activo', links: [], notes: '' },
  ]
  const projects: Project[] = [
    { id: 'p-ai', name: 'AI trainer', clientId: 'c-outlier', rate: 20, color: '#2f6f9f', billing: 'hora' },
    { id: 'p-web', name: 'Web institucional', clientId: 'c-norte', rate: 0, price: 2000, color: '#448361', billing: 'fijo' },
    { id: 'p-mio', name: 'Mi negocio', clientId: null, rate: 0, color: '#787774', billing: 'interno' },
  ]
  const payments: Payment[] = [
    { id: 'pay-1', projectId: 'p-web', label: 'Adelanto 50%', amount: 1000, date: today, paid: true },
    { id: 'pay-2', projectId: 'p-web', label: 'Entrega final 50%', amount: 1000, date: today, paid: false },
  ]
  const tasks: Task[] = [
    buildTask({ id: 1, name: 'Tareas de evaluación', seconds: 9000, projectId: 'p-ai', billable: true, tags: ['ai'], date: today, start: '09:00', projects, clients }),
    buildTask({ id: 2, name: 'Maquetado home', seconds: 5400, projectId: 'p-web', billable: true, tags: ['diseño'], date: today, start: '12:00', projects, clients }),
    buildTask({ id: 3, name: 'Mandar propuestas', seconds: 2700, projectId: 'p-mio', billable: false, tags: ['ventas'], date: today, start: '15:00', projects, clients }),
  ]
  return { clients, projects, payments, tasks }
}

function minutesOf(hhmm: string) {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

function addMinutes(hhmm: string, minutes: number) {
  const total = (((minutesOf(hhmm) || 0) + minutes) % 1440 + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
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
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE)
  const [loaded, setLoaded] = useState(false)
  const [today, setToday] = useState('')
  const [manual, setManual] = useState<Manual | null>(null)
  const [manualError, setManualError] = useState('')
  const [pieces, setPieces] = useState<Piece[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [syncOpen, setSyncOpen] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const timers = useRef<number[]>([])

  const running = active.startedAt !== null

  // Los datos que se guardan como .md en GitHub (el timer en curso queda sólo en este navegador).
  const data = useMemo(() => ({ tasks, clients, projects, payments, goal, plan }), [tasks, clients, projects, payments, goal, plan])
  const sync = useGitSync({
    loaded,
    data,
    apply: (d) => {
      setTasks(d.tasks.map(migrateTask))
      setClients(d.clients)
      setProjects(d.projects.map(migrateProject))
      setPayments(d.payments)
      setGoal(d.goal)
      setPlan(d.plan)
    },
  })

  // Carga inicial desde el navegador.
  useEffect(() => {
    const key = dateKey()
    setToday(key)
    setNow(Date.now())
    const seed = seedData(key)
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        setTasks((saved.tasks ?? []).map(migrateTask))
        setClients(saved.clients ?? seed.clients)
        setProjects((saved.projects ?? seed.projects).map(migrateProject))
        setPayments(saved.payments ?? [])
        setGoal(saved.goal ?? null)
        setPlan(saved.plan ?? [])
        if (saved.active) setActive(saved.active)
        if (saved.draft) setDraft({ ...EMPTY_DRAFT, ...saved.draft })
        if (saved.mode) setMode({ ...DEFAULT_MODE, ...saved.mode })
      } else {
        setTasks(seed.tasks)
        setClients(seed.clients)
        setProjects(seed.projects)
        setPayments(seed.payments)
      }
    } catch {
      setTasks(seed.tasks)
      setClients(seed.clients)
      setProjects(seed.projects)
      setPayments(seed.payments)
    }
    setLoaded(true)
    // Si la app queda abierta pasada la medianoche, "hoy" se actualiza solo.
    const tick = window.setInterval(() => setToday(dateKey()), 30000)
    const pending = timers.current
    return () => { window.clearInterval(tick); pending.forEach((t) => window.clearTimeout(t)) }
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, clients, projects, payments, goal, plan, active, draft, mode }))
    } catch {
      // Sin almacenamiento (modo privado): la app sigue andando, sólo no recuerda.
    }
  }, [loaded, tasks, clients, projects, payments, goal, plan, active, draft, mode])

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
  const liveGold = draft.billable && info.rate > 0 ? goldFor(elapsed, info.rate) : 0

  useEffect(() => {
    document.title = running ? `${fmtClock(shown)} · ${draft.name || 'Tasker'}` : 'Tasker'
  }, [running, shown, draft.name])

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
    const dates = new Set(tasks.map((t) => t.date))

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
      todaySeconds, todayGold, week, weekSeconds,
      weekMax: Math.max(3600, ...week.map((w) => w.secs)) * 1.1,
      weekDays: week.filter((w) => w.secs > 0).length,
      streak: streakFor(dates),
      monthEarned: monthEarnings(month, tasks, payments),
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
    const p = describeProject(projectId, projects, clients)
    // Un proyecto con tarifa por hora arranca como facturable; se puede cambiar con el botón $.
    setDraft((d) => ({ ...d, projectId, billable: p.rate > 0 }))
  }

  function addTag(tag: string) {
    setDraft((d) => ({ ...d, tags: [...parseTags(d.tags), tag].join(', ') }))
  }

  function startTask() {
    const t = Date.now()
    setNow(t)
    setActive((a) => ({ ...a, startedAt: t, startTime: a.startTime ?? timeKey(), target: a.target ?? (mode.down ? Math.max(1, mode.minutes) * 60 : undefined) }))
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
    const text = draft.name.trim()
    if (!text) return
    if (!draft.planId) setPlan((cur) => [...cur, { id: uid(), date: '', text, projectId: draft.projectId, hours: 0, done: false }])
    setDraft((d) => ({ ...d, name: '', tags: '', planId: undefined }))
    toast('Guardada en el backlog', text)
  }

  function pickSuggestion(next: Draft) {
    setDraft(next)
    setSuggestOpen(false)
  }

  function removePlan(id: string) {
    setPlan((cur) => cur.filter((x) => x.id !== id))
  }

  function discardTask() {
    if (elapsed > 0 && !window.confirm('¿Descartar la tarea en curso sin registrar el tiempo?')) return
    setActive({ base: 0, startedAt: null })
    setDraft((d) => ({ ...d, name: '', planId: undefined }))
  }

  function stopTask() {
    if (elapsed < 1) return discardTask()
    record(buildTask({
      name: draft.name, seconds: elapsed, projectId: draft.projectId, billable: draft.billable,
      tags: parseTags(draft.tags), date: dateKey(), start: active.startTime, projects, clients,
    }))
    // Si venía del backlog, ya está hecha: sale de "por hacer".
    if (draft.planId) removePlan(draft.planId)
    setActive({ base: 0, startedAt: null })
    setDraft((d) => ({ ...d, name: '', tags: '', planId: undefined }))
  }

  function startWith(next: Draft) {
    if (elapsed > 0 && !window.confirm('Hay una tarea en curso. ¿Descartarla y empezar esta?')) return
    setDraft(next)
    const t = Date.now()
    setNow(t)
    setActive({ base: 0, startedAt: t, startTime: timeKey(), target: mode.down ? Math.max(1, mode.minutes) * 60 : undefined })
    setActiveTab('Inicio')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function repeatTask(task: Task) {
    const projectId = projects.some((p) => p.id === task.projectId) ? task.projectId : null
    startWith({ name: task.name, projectId, billable: task.billable, tags: task.tags.join(', ') })
  }

  function startPlanItem(item: PlanItem) {
    const projectId = projects.some((p) => p.id === item.projectId) ? item.projectId : null
    startWith({ name: item.text, projectId, billable: describeProject(projectId, projects, clients).rate > 0, tags: '', planId: item.id })
  }

  function setBillable(ids: number[], billable: boolean) {
    const set = new Set(ids)
    setTasks((cur) => cur.map((t) => {
      if (!set.has(t.id)) return t
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
    setManual({ name: '', projectId: draft.projectId, billable: draft.billable, tags: '', date: dateKey(), from: timeKey(from), to: timeKey(d) })
    setManualError('')
  }

  function editTask(task: Task) {
    const from = task.start ?? '09:00'
    setManual({ id: task.id, rate: task.rate, name: task.name, projectId: task.projectId, billable: task.billable, tags: task.tags.join(', '), date: task.date, from, to: addMinutes(from, Math.round(task.seconds / 60)) })
    setManualError('')
  }

  function saveManual() {
    if (!manual) return
    if (!manual.name.trim()) return setManualError('Ponele un nombre a la tarea.')
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
    const task = buildTask({
      id: manual.id, name: manual.name, seconds: minutes * 60, projectId: manual.projectId, billable: manual.billable,
      tags: parseTags(manual.tags), date: manual.date || dateKey(), start: manual.from, rate: keepRate, projects, clients,
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
  const templates = (() => {
    const seen = new Set(backlog.map((i) => i.text.toLowerCase()))
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Pickaxe /></div><strong>Tasker</strong></div>
        <nav className="desktop-nav" aria-label="Secciones">
          {TABS.map(({ id }) => <button key={id} className={activeTab === id ? 'nav-active' : ''} onClick={() => setActiveTab(id)}>{id}</button>)}
        </nav>
        <div className="header-actions">
          {running && activeTab !== 'Inicio' && <button className="running-pill" onClick={() => setActiveTab('Inicio')}><i /> {fmtClock(shown)}</button>}
          <button className={`sync-button sync-${sync.status}`} onClick={() => setSyncOpen(true)} title={STATUS_LABEL[sync.status]} aria-label={STATUS_LABEL[sync.status]}>{sync.status === 'off' ? <CloudOff /> : <Cloud />}<span>{sync.status === 'off' ? 'Guardar en GitHub' : STATUS_LABEL[sync.status]}</span></button>
          <div className="avatar" title="Ayrton">AN</div>
        </div>
      </header>

      <div className="content-wrap">
        {activeTab === 'Inicio' && <>
          <section className="welcome-row"><p className="eyebrow">{headerDate}</p><h1>Hola, Ayrton</h1></section>

          <section className={`timer-bar ${running ? 'is-running' : ''}`}>
            <div className="timer-name-wrap">
              <input className="timer-name" value={draft.name} onChange={(e) => { setDraft({ ...draft, name: e.target.value, planId: undefined }); setSuggestOpen(true) }} onFocus={() => setSuggestOpen(true)} onBlur={() => setSuggestOpen(false)} onKeyDown={(e) => { if (e.key === 'Escape') setSuggestOpen(false); if (e.key === 'Enter') { setSuggestOpen(false); if (running) stopTask(); else startTask() } }} maxLength={140} placeholder={backlog.length ? `¿En qué estás trabajando? · ${backlog.length} por hacer` : '¿En qué estás trabajando?'} aria-label="Nombre de tarea" autoComplete="off" />
              {suggestOpen && !running && (backlogMatches.length > 0 || templates.length > 0) && (
                <div className="suggest-menu" onMouseDown={(e) => e.preventDefault()}>
                  {backlogMatches.length > 0 && <div className="suggest-title"><ListTodo /> Por hacer</div>}
                  {backlogMatches.map((i) => {
                    const p = projects.find((x) => x.id === i.projectId)
                    return (
                      <div className="suggest-row" key={i.id}>
                        <button className="suggest-item" onClick={() => pickSuggestion({ name: i.text, projectId: p ? p.id : null, billable: describeProject(p ? p.id : null, projects, clients).rate > 0, tags: '', planId: i.id })}><span>{i.text}</span>{p && <small><i className="dot" style={{ background: p.color }} /> {p.name}</small>}</button>
                        <button className="icon-button" onClick={() => { setSuggestOpen(false); startPlanItem(i) }} aria-label={`Empezar “${i.text}”`} title="Empezar ya"><Play /></button>
                      </div>
                    )
                  })}
                  {templates.length > 0 && <div className="suggest-title"><History /> Repetir</div>}
                  {templates.map((t) => (
                    <div className="suggest-row" key={t.id}>
                      <button className="suggest-item" onClick={() => pickSuggestion({ name: t.name, projectId: projects.some((p) => p.id === t.projectId) ? t.projectId : null, billable: t.billable, tags: t.tags.join(', ') })}><span>{t.name}</span><small><i className="dot" style={{ background: t.color }} /> {t.project}</small></button>
                      <button className="icon-button" onClick={() => { setSuggestOpen(false); repeatTask(t) }} aria-label={`Empezar “${t.name}”`} title="Empezar ya"><Play /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="timer-controls">
              <ProjectPicker projects={projects} clients={clients} value={draft.projectId} onChange={pickProject} onCreateProject={(p) => setProjects((cur) => [...cur, p])} compact />
              <label className="tags-input"><Tag /><input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="Etiquetas" aria-label="Etiquetas" /></label>
              <button className={`billable-toggle ${draft.billable ? 'billable-on' : ''}`} onClick={() => setDraft({ ...draft, billable: !draft.billable })} aria-pressed={draft.billable} title={draft.billable ? (info.rate > 0 ? `Facturable a ${info.rate} USD/h` : 'Facturable, pero sin tarifa por hora') : 'No facturable'} aria-label="Facturable"><DollarSign /></button>
              <button className={`billable-toggle ${mode.down ? 'billable-on' : ''}`} onClick={() => setMode((m) => ({ ...m, down: !m.down }))} disabled={running} aria-pressed={mode.down} title={mode.down ? 'Cuenta regresiva: tocá para contar hacia arriba' : 'Contando hacia arriba: tocá para usar cuenta regresiva'} aria-label="Modo del timer">{mode.down ? <ArrowDown /> : <ArrowUp />}</button>
              <span className="timer-clock" aria-live="off">{fmtClock(shown)}</span>
              {!running && draft.name.trim() && !draft.planId && <button className="icon-button" onClick={saveForLater} aria-label="Guardar en el backlog" title="Guardar en el backlog para hacerla después"><ListPlus /></button>}
              <button className={`play-button ${running ? 'stop' : ''}`} onClick={running ? stopTask : startTask} aria-label={running ? 'Terminar y registrar' : 'Empezar'} title={running ? 'Terminar y registrar' : 'Empezar'}>{running ? <Square /> : <Play />}</button>
              {elapsed > 0 && <button className="icon-button" onClick={discardTask} aria-label="Descartar" title="Descartar sin registrar"><X /></button>}
            </div>
          </section>
          <div className="timer-sub">
            {!running && mode.down && <span className="countdown-presets">Cuenta regresiva: {PRESET_MINUTES.map((m) => <button key={m} className={mode.minutes === m ? 'preset-on' : ''} onClick={() => setMode({ down: true, minutes: m })}>{m} min</button>)}<input type="number" min={1} max={600} value={mode.minutes} onChange={(e) => setMode({ down: true, minutes: Math.min(600, Math.max(1, Math.round(Number(e.target.value)) || 1)) })} aria-label="Minutos" /> min</span>}
            {running && active.target && <span>Cuenta regresiva de {fmtHours(active.target)}: al llegar a cero se registra sola</span>}
            {running && liveGold > 0 && <span>+US$ {fmtMoney(liveGold)} · {info.rate} USD/h</span>}
            {running && info.billing !== 'hora' && <span>{info.billing === 'interno' ? 'Proyecto personal: suma tiempo, no plata' : 'Se cobra por pagos: el tiempo te muestra cuánto rinde la hora'}</span>}
            {info.client?.links?.map((l, i) => <a key={i} className="link-chip" href={l.url} target="_blank" rel="noreferrer noopener"><ExternalLink /> {l.label}</a>)}
            {!running && suggestedTags.length > 0 && <span className="tag-suggestions">{suggestedTags.map((t) => <button key={t} onClick={() => addTag(t)}>+ {t}</button>)}</span>}
          </div>

          <section className="hud-grid">
            <article className="card earnings-card">
              <div className="card-label"><span>Ganado en {monthName}</span>{stats.monthTarget ? <span>Meta del mes US$ {fmtShort(stats.monthTarget)}</span> : <button className="text-button" onClick={() => { setActiveTab('Estadísticas'); window.setTimeout(() => document.getElementById('meta')?.scrollIntoView({ behavior: 'smooth' }), 50) }}>Definir meta</button>}</div>
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
            </article>
            <article className={`card streak-card ${workedToday ? 'lit' : ''}`}>
              <div className="streak-top">
                <Flame className="streak-flame" />
                <div><strong>{streak}</strong><span>{streak === 1 ? 'día de racha' : 'días de racha'}</span></div>
              </div>
              <div className="streak-week">
                {stats.week.map((d) => {
                  const done = d.secs > 0 || (d.isToday && elapsed > 0)
                  return <span key={d.key} className={`${done ? 'done' : ''} ${d.isToday ? 'today' : ''} ${d.future ? 'future' : ''}`}><i>{done ? <Check /> : null}</i>{d.letter}</span>
                })}
              </div>
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
            <div className="task-list">{recent.length === 0 && <p className="empty-list">Todavía no registraste nada. Escribí una tarea y tocá ▶.</p>}{recent.map((task) => <TaskRow key={task.id} task={task} dateLabel={dayLabel(task.date, today)} onDelete={deleteTask} onRepeat={repeatTask} onEdit={editTask} onToggleBillable={toggleBillable} />)}</div>
            <button className="text-button add-manual" onClick={openManual}><Plus /> Cargar tiempo a mano</button>
          </section>
        </>}

        {activeTab === 'Tareas' && <TasksView tasks={tasks} backlog={backlog} projects={projects} clients={clients} onStartPlan={startPlanItem} onRemovePlan={removePlan} today={today} onDelete={deleteTask} onDeleteMany={deleteMany} onSetBillable={setBillable} onRepeat={repeatTask} onEdit={editTask} onToggleBillable={toggleBillable} onAddManual={openManual} />}
        {activeTab === 'Estadísticas' && today && <StatsView tasks={tasks} payments={payments} projects={projects} clients={clients} goal={goal} setGoal={setGoal} today={today} />}
        {activeTab === 'Clientes' && <ClientsView clients={clients} projects={projects} tasks={tasks} payments={payments} setClients={setClients} setProjects={setProjects} setTasks={setTasks} setPayments={setPayments} />}
      </div>

      <nav className="bottom-nav" aria-label="Navegación móvil">{TABS.map(({ id, icon: Icon }) => <button key={id} className={activeTab === id ? 'mobile-active' : ''} onClick={() => setActiveTab(id)}><Icon /><span>{id === 'Estadísticas' ? 'Stats' : id}</span></button>)}</nav>

      {manual && manualInfo && <div className="modal-backdrop" onClick={() => setManual(null)}><div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setManual(null)} aria-label="Cerrar"><X /></button>
        <h2>{manual.id ? 'Editar tarea' : 'Cargar tiempo a mano'}</h2>
        {!manual.id && <p>Sumá una tarea que ya hiciste para no perder ese trabajo.</p>}
        <div className="form-grid">
          <label>Tarea<input autoFocus placeholder="¿Qué hiciste?" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} /></label>
          <div className="field"><span>Proyecto</span><ProjectPicker projects={projects} clients={clients} value={manual.projectId} onChange={(id) => setManual({ ...manual, projectId: id, billable: describeProject(id, projects, clients).rate > 0 })} onCreateProject={(p) => setProjects((cur) => [...cur, p])} /></div>
          <label>Etiquetas<input placeholder="diseño, reunión" value={manual.tags} onChange={(e) => setManual({ ...manual, tags: e.target.value })} /></label>
          <div className="modal-fields three"><label>Fecha<input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></label><label>Desde<input type="time" value={manual.from} onChange={(e) => setManual({ ...manual, from: e.target.value })} /></label><label>Hasta<input type="time" value={manual.to} onChange={(e) => setManual({ ...manual, to: e.target.value })} /></label></div>
          <label className="check-line"><input type="checkbox" checked={manual.billable} onChange={(e) => setManual({ ...manual, billable: e.target.checked })} /> Facturable{manual.billable && (manualRate > 0 ? ` · ${manualRate} USD/h` : ' · sin tarifa por hora')}</label>
        </div>
        {manualError && <p className="form-error">{manualError}</p>}
        <div className="modal-actions">
          {manual.id && <button className="ghost-button danger-text" onClick={() => { const id = manual.id!; if (window.confirm('¿Borrar esta tarea?')) { setTasks((cur) => cur.filter((t) => t.id !== id)); setManual(null) } }}>Borrar</button>}
          <button className="ghost-button" onClick={() => setManual(null)}>Cancelar</button>
          <button className="primary-button" onClick={saveManual}><Check /> Guardar</button>
        </div>
      </div></div>}

      {syncOpen && <SyncModal cfg={sync.cfg} status={sync.status} message={sync.message} lastSync={sync.lastSync} onConnect={sync.connect} onDisconnect={sync.disconnect} onSyncNow={sync.syncNow} onClose={() => setSyncOpen(false)} />}

      <div className="confetti" aria-hidden="true">{pieces.map((p) => <span key={p.id} className={p.round ? 'round' : ''} style={{ width: p.s, height: p.round ? p.s : p.s * 0.45, animationDelay: `${p.d}s`, ['--x' as string]: `${p.x}px`, ['--y' as string]: `${p.y}px`, ['--r' as string]: `${p.r}deg` }} />)}</div>
      <div className="toast-stack" role="status" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}><strong>{t.title}</strong><span>{t.text}</span></div>)}</div>
    </main>
  )
}
