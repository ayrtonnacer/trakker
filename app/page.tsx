'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Carrot, Check, DollarSign, ExternalLink, Home, ListChecks, Pickaxe, Play, Plus, Square, Tag, Target, Users, X } from 'lucide-react'
import {
  DAILY_GOAL_HOURS,
  XP_PER_USD,
  buildTask,
  dateKey,
  describeProject,
  fmtClock,
  fmtHours,
  fmtMoney,
  fmtShort,
  goalTarget,
  goldFor,
  levelFor,
  migrateTask,
  milestonesFor,
  monthEarnings,
  nextRank,
  parseTags,
  paymentXp,
  rankFor,
  streakFor,
  timeKey,
  xpFor,
  type Client,
  type Goal,
  type Payment,
  type PlanItem,
  type Project,
  type Task,
} from '@/lib/game'
import { ClientsView } from '@/components/tracker/clients-view'
import { GoalsView } from '@/components/tracker/goals-view'
import { ProjectPicker } from '@/components/tracker/project-picker'
import { StatsView } from '@/components/tracker/stats-view'
import { TaskRow } from '@/components/tracker/task-row'
import { TasksView, dayLabel } from '@/components/tracker/tasks-view'

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
  { id: 'Metas', icon: Target },
]

type Active = { base: number; startedAt: number | null; startTime?: string }
type Draft = { name: string; projectId: string | null; billable: boolean; tags: string }
type Toast = { id: number; title: string; text: string }
type Manual = { id?: number; rate?: number; name: string; projectId: string | null; billable: boolean; tags: string; date: string; from: string; to: string }
type Piece = { id: number; x: number; y: number; r: number; d: number; s: number; round: boolean }

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
  const [loaded, setLoaded] = useState(false)
  const [today, setToday] = useState('')
  const [manual, setManual] = useState<Manual | null>(null)
  const [manualError, setManualError] = useState('')
  const [pieces, setPieces] = useState<Piece[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<number[]>([])

  const running = active.startedAt !== null

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
        setProjects(saved.projects ?? seed.projects)
        setPayments(saved.payments ?? [])
        setGoal(saved.goal ?? null)
        setPlan(saved.plan ?? [])
        if (saved.active) setActive(saved.active)
        if (saved.draft) setDraft({ ...EMPTY_DRAFT, ...saved.draft })
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, clients, projects, payments, goal, plan, active, draft }))
    } catch {
      // Sin almacenamiento (modo privado): la app sigue andando, sólo no recuerda.
    }
  }, [loaded, tasks, clients, projects, payments, goal, plan, active, draft])

  // El tiempo se calcula desde el inicio, así que sobrevive a pestañas en segundo plano.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [running])

  const elapsed = Math.floor(active.base + (active.startedAt ? Math.max(0, now - active.startedAt) / 1000 : 0))
  const info = describeProject(draft.projectId, projects, clients)
  const liveGold = draft.billable && info.rate > 0 ? goldFor(elapsed, info.rate) : 0

  useEffect(() => {
    document.title = running ? `${fmtClock(elapsed)} · ${draft.name || 'Tasker'}` : 'Tasker'
  }, [running, elapsed, draft.name])

  const suggestedTags = useMemo(() => {
    const count = new Map<string, number>()
    tasks.slice(0, 200).forEach((t) => t.tags.forEach((tag) => count.set(tag, (count.get(tag) ?? 0) + 1)))
    const current = new Set(parseTags(draft.tags))
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).filter((t) => !current.has(t)).slice(0, 5)
  }, [tasks, draft.tags])

  const totalXp = useMemo(() => tasks.reduce((s, t) => s + t.xp, 0) + payments.reduce((s, p) => s + paymentXp(p), 0), [tasks, payments])

  const stats = useMemo(() => {
    const todayTasks = tasks.filter((t) => t.date === today)
    const todaySeconds = todayTasks.reduce((s, t) => s + t.seconds, 0)
    const todayPaid = payments.filter((p) => p.paid && p.date === today).reduce((s, p) => s + p.amount, 0)
    const todayGold = todayTasks.reduce((s, t) => s + t.amount, 0) + todayPaid
    const todayXp = todayTasks.reduce((s, t) => s + t.xp, 0) + payments.filter((p) => p.date === today).reduce((s, p) => s + paymentXp(p), 0)
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
      todaySeconds, todayGold, todayXp, week, weekSeconds,
      weekMax: Math.max(DAILY_GOAL_HOURS * 3600 * 1.2, ...week.map((w) => w.secs)),
      streak: streakFor(dates),
      monthEarned: monthEarnings(month, tasks, payments),
      monthTarget: goalTarget(goal, month),
    }
  }, [tasks, payments, goal, today])

  const lvl = levelFor(totalXp)
  const rankNext = nextRank(lvl.level)

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

  /** Registra la tarea, festeja y avisa si subió de nivel. */
  function record(task: Task) {
    const before = levelFor(totalXp).level
    const after = levelFor(totalXp + task.xp).level
    setTasks((cur) => [task, ...cur])
    celebrate()
    toast(`Tarea terminada · ${fmtHours(task.seconds)}`, `${task.amount > 0 ? `+US$ ${fmtMoney(task.amount)} · ` : ''}+${task.xp} XP · ${task.project}`)
    if (after > before) toast(`Subiste al nivel ${after}`, rankFor(after))
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
    setActive((a) => ({ ...a, startedAt: t, startTime: a.startTime ?? timeKey() }))
  }

  function discardTask() {
    if (elapsed > 0 && !window.confirm('¿Descartar la tarea en curso sin registrar el tiempo?')) return
    setActive({ base: 0, startedAt: null })
    setDraft((d) => ({ ...d, name: '' }))
  }

  function stopTask() {
    if (elapsed < 1) return discardTask()
    record(buildTask({
      name: draft.name, seconds: elapsed, projectId: draft.projectId, billable: draft.billable,
      tags: parseTags(draft.tags), date: dateKey(), start: active.startTime, projects, clients,
    }))
    setActive({ base: 0, startedAt: null })
    setDraft((d) => ({ ...d, name: '', tags: '' }))
  }

  function startWith(next: Draft) {
    if (elapsed > 0 && !window.confirm('Hay una tarea en curso. ¿Descartarla y empezar esta?')) return
    setDraft(next)
    const t = Date.now()
    setNow(t)
    setActive({ base: 0, startedAt: t, startTime: timeKey() })
    setActiveTab('Inicio')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function repeatTask(task: Task) {
    const projectId = projects.some((p) => p.id === task.projectId) ? task.projectId : null
    startWith({ name: task.name, projectId, billable: task.billable, tags: task.tags.join(', ') })
  }

  function startPlanItem(item: PlanItem) {
    const projectId = projects.some((p) => p.id === item.projectId) ? item.projectId : null
    startWith({ name: item.text, projectId, billable: describeProject(projectId, projects, clients).rate > 0, tags: '' })
  }

  function setBillable(ids: number[], billable: boolean) {
    const set = new Set(ids)
    setTasks((cur) => cur.map((t) => {
      if (!set.has(t.id)) return t
      const amount = billable && t.rate > 0 ? goldFor(t.seconds, t.rate) : 0
      return { ...t, billable, amount, xp: xpFor(t.seconds, amount) }
    }))
  }

  function toggleBillable(id: number) {
    const t = tasks.find((x) => x.id === id)
    if (t) setBillable([id], !t.billable)
  }

  function deleteTask(id: number) {
    if (window.confirm('¿Borrar esta tarea? También baja el XP que dio.')) setTasks((cur) => cur.filter((t) => t.id !== id))
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
  const todayPlan = plan.filter((p) => p.date === today)

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
          {running && activeTab !== 'Inicio' && <button className="running-pill" onClick={() => setActiveTab('Inicio')}><i /> {fmtClock(elapsed)}</button>}
          <div className="avatar" title="Ayrton">AN</div>
        </div>
      </header>

      <div className="content-wrap">
        {activeTab === 'Inicio' && <>
          <section className="welcome-row"><p className="eyebrow">{headerDate}</p><h1>Hola, Ayrton</h1></section>

          <section className={`timer-bar ${running ? 'is-running' : ''}`}>
            <input className="timer-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { if (running) stopTask(); else startTask() } }} maxLength={140} placeholder="¿En qué estás trabajando?" aria-label="Nombre de tarea" />
            <div className="timer-controls">
              <ProjectPicker projects={projects} clients={clients} value={draft.projectId} onChange={pickProject} onCreateProject={(p) => setProjects((cur) => [...cur, p])} compact />
              <label className="tags-input"><Tag /><input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="Etiquetas" aria-label="Etiquetas" /></label>
              <button className={`billable-toggle ${draft.billable ? 'billable-on' : ''}`} onClick={() => setDraft({ ...draft, billable: !draft.billable })} aria-pressed={draft.billable} title={draft.billable ? (info.rate > 0 ? `Facturable a ${info.rate} USD/h` : 'Facturable, pero sin tarifa por hora') : 'No facturable'} aria-label="Facturable"><DollarSign /></button>
              <span className="timer-clock" aria-live="off">{fmtClock(elapsed)}</span>
              <button className={`play-button ${running ? 'stop' : ''}`} onClick={running ? stopTask : startTask} aria-label={running ? 'Terminar y registrar' : 'Empezar'} title={running ? 'Terminar y registrar' : 'Empezar'}>{running ? <Square /> : <Play />}</button>
              {elapsed > 0 && <button className="icon-button" onClick={discardTask} aria-label="Descartar" title="Descartar sin registrar"><X /></button>}
            </div>
          </section>
          <div className="timer-sub">
            {running && liveGold > 0 && <span>+US$ {fmtMoney(liveGold)} · {info.rate} USD/h</span>}
            {running && info.billing !== 'hora' && <span>{info.billing === 'interno' ? 'Proyecto interno: suma tiempo y XP' : 'Se cobra por pagos: el tiempo te muestra cuánto rinde la hora'}</span>}
            {info.client?.links?.map((l, i) => <a key={i} className="link-chip" href={l.url} target="_blank" rel="noreferrer noopener"><ExternalLink /> {l.label}</a>)}
            {!running && suggestedTags.length > 0 && <span className="tag-suggestions">{suggestedTags.map((t) => <button key={t} onClick={() => addTag(t)}>+ {t}</button>)}</span>}
          </div>

          <section className="hud-grid">
            <article className="card earnings-card">
              <div className="card-label"><span>Ganado en {monthName}</span>{stats.monthTarget ? <span>Meta US$ {fmtShort(stats.monthTarget)}</span> : <button className="text-button" onClick={() => setActiveTab('Metas')}>Definir meta</button>}</div>
              <div className="big-number">US$ {fmtMoney(monthLive)}</div>
              <div className="carrot-track">
                <div className="carrot-fill" style={{ width: `${Math.min(100, (monthLive / barTarget) * 100)}%` }} />
                {steps.map((m) => <i key={m} className={`track-mark ${monthLive >= m ? 'done' : ''}`} style={{ left: `${(m / barTarget) * 100}%` }} title={`US$ ${fmtShort(m)}`} />)}
                {nextStep > 0 && <span className="carrot" style={{ left: `${Math.min(100, (nextStep / barTarget) * 100)}%` }} title={`Próximo: US$ ${fmtShort(nextStep)}`}><Carrot /></span>}
              </div>
              <div className="card-foot">
                {nextStep > 0 ? <span>Faltan <b>US$ {fmtShort(Math.ceil((nextStep - monthLive) * 100) / 100)}</b> para llegar a {fmtShort(nextStep)}</span> : stats.monthTarget ? <span><b>¡Meta del mes cumplida!</b></span> : <span>Con una meta vas a ver micro objetivos en esta barra.</span>}
                <span>Hoy US$ {fmtMoney(stats.todayGold + liveGold)}</span>
              </div>
            </article>
            <article className="card">
              <div className="card-label"><span>Hoy</span><span>Racha {stats.streak} {stats.streak === 1 ? 'día' : 'días'}</span></div>
              <div className="big-number">{fmtHours(stats.todaySeconds + elapsed)}</div>
              <div className="thin-track"><div style={{ width: `${Math.min(100, ((stats.todaySeconds + elapsed) / 3600 / DAILY_GOAL_HOURS) * 100)}%` }} /></div>
              <div className="card-foot"><span>Meta diaria {DAILY_GOAL_HOURS}h</span><span>Semana {fmtHours(stats.weekSeconds)}</span></div>
            </article>
            <article className="card">
              <div className="card-label"><span>Nivel {lvl.level} · {rankFor(lvl.level)}</span><span>+{stats.todayXp.toLocaleString('es-AR')} XP hoy</span></div>
              <div className="big-number">{lvl.into.toLocaleString('es-AR')} <small>/ {lvl.need.toLocaleString('es-AR')} XP</small></div>
              <div className="thin-track"><div style={{ width: `${Math.round((lvl.into / lvl.need) * 100)}%` }} /></div>
              <div className="card-foot"><span>{rankNext ? `${rankNext.name} en nivel ${rankNext.level}` : 'Rango máximo'}</span><span title="1 minuto trabajado = 1 XP">US$ 1 = {XP_PER_USD} XP</span></div>
            </article>
          </section>

          <section className="workspace-grid">
            <article className="panel">
              <div className="panel-heading"><h3>Plan de hoy</h3><button className="text-button" onClick={() => setActiveTab('Metas')}>Planificar semana →</button></div>
              {todayPlan.length === 0 ? <p className="empty-list">No planificaste nada para hoy. Armá tu semana en Metas.</p> : (
                <ul className="check-list">
                  {todayPlan.map((i) => {
                    const p = projects.find((x) => x.id === i.projectId)
                    return (
                      <li key={i.id} className={i.done ? 'done' : ''}>
                        <button className={`pay-check ${i.done ? 'on' : ''}`} onClick={() => setPlan((cur) => cur.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)))} aria-label={i.done ? 'Marcar pendiente' : 'Marcar hecha'}>{i.done && <Check />}</button>
                        <span>{i.text}{p && <small> · {p.name}</small>}{i.hours > 0 && <small> · {i.hours}h</small>}</span>
                        <button className="icon-button" onClick={() => startPlanItem(i)} aria-label="Empezar timer" title="Empezar timer"><Play /></button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </article>
            <article className="panel">
              <div className="panel-heading"><h3>Esta semana</h3><button className="text-button" onClick={() => setActiveTab('Estadísticas')}>Estadísticas →</button></div>
              <div className="mini-chart">
                <i className="mini-goal" style={{ bottom: `calc(19px + (100% - 19px) * ${(DAILY_GOAL_HOURS * 3600) / stats.weekMax})` }} />
                {stats.week.map((d) => {
                  const secs = d.secs + (d.isToday ? elapsed : 0)
                  return <div key={d.key} className={`mini-col ${d.isToday ? 'is-today' : ''}`} title={fmtHours(secs)}><div className="mini-bar-area"><div className={`mini-bar ${secs / 3600 >= DAILY_GOAL_HOURS ? 'hit' : ''}`} style={{ height: `${(secs / stats.weekMax) * 100}%` }} /></div><span>{d.letter}</span></div>
                })}
              </div>
              <div className="card-foot"><span>Línea: meta {DAILY_GOAL_HOURS}h por día</span><span>{fmtHours(stats.weekSeconds)} en total</span></div>
            </article>
          </section>

          <section className="recent-section">
            <div className="panel-heading"><h3>Últimos registros</h3><button className="text-button" onClick={() => setActiveTab('Tareas')}>Ver todas →</button></div>
            <div className="task-list">{recent.length === 0 && <p className="empty-list">Todavía no registraste nada. Escribí una tarea y tocá ▶.</p>}{recent.map((task) => <TaskRow key={task.id} task={task} dateLabel={dayLabel(task.date, today)} onDelete={deleteTask} onRepeat={repeatTask} onEdit={editTask} onToggleBillable={toggleBillable} />)}</div>
            <button className="text-button add-manual" onClick={openManual}><Plus /> Cargar tiempo a mano</button>
          </section>
        </>}

        {activeTab === 'Tareas' && <TasksView tasks={tasks} today={today} onDelete={deleteTask} onDeleteMany={deleteMany} onSetBillable={setBillable} onRepeat={repeatTask} onEdit={editTask} onToggleBillable={toggleBillable} onAddManual={openManual} />}
        {activeTab === 'Estadísticas' && today && <StatsView tasks={tasks} payments={payments} projects={projects} clients={clients} goal={goal} today={today} onOpenGoals={() => setActiveTab('Metas')} />}
        {activeTab === 'Clientes' && <ClientsView clients={clients} projects={projects} tasks={tasks} payments={payments} setClients={setClients} setProjects={setProjects} setTasks={setTasks} setPayments={setPayments} />}
        {activeTab === 'Metas' && today && <GoalsView goal={goal} setGoal={setGoal} plan={plan} setPlan={setPlan} tasks={tasks} payments={payments} projects={projects} clients={clients} today={today} onStart={startPlanItem} />}
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

      <div className="confetti" aria-hidden="true">{pieces.map((p) => <span key={p.id} className={p.round ? 'round' : ''} style={{ width: p.s, height: p.round ? p.s : p.s * 0.45, animationDelay: `${p.d}s`, ['--x' as string]: `${p.x}px`, ['--y' as string]: `${p.y}px`, ['--r' as string]: `${p.r}deg` }} />)}</div>
      <div className="toast-stack" role="status" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}><strong>{t.title}</strong><span>{t.text}</span></div>)}</div>
    </main>
  )
}
