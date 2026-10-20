'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Briefcase,
  Check,
  Clock3,
  Coins,
  DollarSign,
  Flame,
  ListChecks,
  Pause,
  Play,
  Plus,
  Sparkles,
  Tag,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react'
import { playCoins, playLevelUp, unlockAudio } from '@/lib/audio'
import {
  DAILY_GOAL_HOURS,
  buildTask,
  dateKey,
  describeProject,
  fmtClock,
  fmtHours,
  fmtMoney,
  goldFor,
  levelFor,
  migrateTask,
  nextRank,
  parseTags,
  rankFor,
  streakFor,
  timeKey,
  xpFor,
  type Client,
  type Project,
  type Task,
} from '@/lib/game'
import { ClientsView } from '@/components/tracker/clients-view'
import { ProjectPicker } from '@/components/tracker/project-picker'
import { StatsView } from '@/components/tracker/stats-view'
import { TaskRow } from '@/components/tracker/task-row'
import { TasksView, dayLabel } from '@/components/tracker/tasks-view'

const STORAGE_KEY = 'tiempo-oro-v1'
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
const TABS: { id: string; icon: typeof Clock3 }[] = [
  { id: 'Inicio', icon: Clock3 },
  { id: 'Tareas', icon: ListChecks },
  { id: 'Estadísticas', icon: BarChart3 },
  { id: 'Clientes', icon: Briefcase },
]

type Active = { base: number; startedAt: number | null; startTime?: string }
type Draft = { name: string; projectId: string | null; billable: boolean; tags: string; long: boolean }
type Coin = { id: number; left: number; delay: number; duration: number; size: number; drift: number; spin: number }
type Toast = { id: number; title: string; text: string }
type Manual = { name: string; projectId: string | null; billable: boolean; tags: string; date: string; from: string; to: string }

const EMPTY_DRAFT: Draft = { name: '', projectId: null, billable: false, tags: '', long: false }

function seedData(today: string) {
  const clients: Client[] = [
    { id: 'c-norte', name: 'Estudio Norte', color: '#e8ad4b' },
    { id: 'c-marea', name: 'Marea Studio', color: '#67d6b2' },
  ]
  const projects: Project[] = [
    { id: 'p-web', name: 'Web institucional', clientId: 'c-norte', rate: 20, color: '#e8ad4b' },
    { id: 'p-app', name: 'App mobile', clientId: 'c-marea', rate: 20, color: '#67d6b2' },
  ]
  const tasks: Task[] = [
    { id: 1, name: 'Rediseño de landing page', client: 'Estudio Norte', project: 'Web institucional', projectId: 'p-web', seconds: 9600, billable: true, rate: 20, amount: 53.33, currency: 'USD', xp: 240, color: '#e8ad4b', tags: ['diseño', 'web'], date: today, start: '09:10', long: true },
    { id: 2, name: 'Fix login en producción', client: 'Marea Studio', project: 'App mobile', projectId: 'p-app', seconds: 4500, billable: true, rate: 20, amount: 25, currency: 'USD', xp: 116, color: '#67d6b2', tags: ['bug', 'dev'], date: today, start: '12:00', long: false },
    { id: 3, name: 'Llamada de seguimiento', client: 'Estudio Norte', project: 'Web institucional', projectId: 'p-web', seconds: 2700, billable: true, rate: 20, amount: 15, currency: 'USD', xp: 50, color: '#e8ad4b', tags: ['reunión'], date: today, start: '14:30', long: false },
  ]
  return { clients, projects, tasks }
}

function minutesOf(hhmm: string) {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

export default function Page() {
  const [activeTab, setActiveTab] = useState('Inicio')
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [active, setActive] = useState<Active>({ base: 0, startedAt: null })
  const [now, setNow] = useState(0)
  const [tasks, setTasks] = useState<Task[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [soundOn, setSoundOn] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [today, setToday] = useState('')
  const [manual, setManual] = useState<Manual | null>(null)
  const [manualError, setManualError] = useState('')
  const [coins, setCoins] = useState<Coin[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pulse, setPulse] = useState(false)
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
        setSoundOn(saved.soundOn ?? true)
        if (saved.active) setActive(saved.active)
        if (saved.draft) setDraft({ ...EMPTY_DRAFT, ...saved.draft })
        else if (saved.taskName) setDraft({ ...EMPTY_DRAFT, name: saved.taskName })
      } else {
        setTasks(seed.tasks)
        setClients(seed.clients)
        setProjects(seed.projects)
      }
    } catch {
      setTasks(seed.tasks)
      setClients(seed.clients)
      setProjects(seed.projects)
    }
    setLoaded(true)
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, clients, projects, soundOn, active, draft }))
    } catch {
      // Sin almacenamiento (modo privado): la app sigue andando, sólo no recuerda.
    }
  }, [loaded, tasks, clients, projects, soundOn, active, draft])

  // El tiempo se calcula desde el inicio, así que sobrevive a pestañas en segundo plano.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [running])

  const elapsed = Math.floor(active.base + (active.startedAt ? Math.max(0, now - active.startedAt) / 1000 : 0))
  const info = describeProject(draft.projectId, projects, clients)
  const paidNow = draft.billable && info.rate > 0
  const liveGold = paidNow ? goldFor(elapsed, info.rate) : 0
  const liveXp = elapsed > 0 ? xpFor(elapsed, paidNow, draft.long) : 0

  const suggestedTags = useMemo(() => {
    const count = new Map<string, number>()
    tasks.slice(0, 200).forEach((t) => t.tags.forEach((tag) => count.set(tag, (count.get(tag) ?? 0) + 1)))
    const current = new Set(parseTags(draft.tags))
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).filter((t) => !current.has(t)).slice(0, 6)
  }, [tasks, draft.tags])

  const stats = useMemo(() => {
    const todayTasks = tasks.filter((t) => t.date === today)
    const todaySeconds = todayTasks.reduce((s, t) => s + t.seconds, 0)
    const todayGold = todayTasks.reduce((s, t) => s + t.amount, 0)
    const todayXp = todayTasks.reduce((s, t) => s + t.xp, 0)
    const totalXp = tasks.reduce((s, t) => s + t.xp, 0)
    const dates = new Set(tasks.map((t) => t.date))

    const base = today ? new Date(`${today}T12:00:00`) : new Date(0)
    const monday = new Date(base)
    monday.setDate(base.getDate() - ((base.getDay() + 6) % 7))
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      const key = dateKey(d)
      return { letter: DAY_LETTERS[d.getDay()], key, has: dates.has(key), isToday: key === today }
    })
    const weekKeys = new Set(week.map((w) => w.key))
    const weekTasks = tasks.filter((t) => weekKeys.has(t.date))
    const weekSeconds = weekTasks.reduce((s, t) => s + t.seconds, 0)
    const billable = weekTasks.filter((t) => t.billable).reduce((s, t) => s + t.seconds, 0)

    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base)
      d.setDate(base.getDate() - (13 - i))
      const key = dateKey(d)
      const secs = tasks.filter((t) => t.date === key).reduce((s, t) => s + t.seconds, 0)
      return { letter: DAY_LETTERS[d.getDay()], pct: Math.min(100, (secs / 3600 / 8) * 100), hit: secs / 3600 >= DAILY_GOAL_HOURS }
    })

    return {
      todaySeconds, todayGold, todayXp, totalXp, week, days, weekSeconds, weekCount: weekTasks.length,
      weekGold: weekTasks.reduce((s, t) => s + t.amount, 0),
      billablePct: weekSeconds ? Math.round((billable / weekSeconds) * 100) : 0,
      streak: streakFor(dates),
      goalPct: Math.min(100, Math.round((todaySeconds / 3600 / DAILY_GOAL_HOURS) * 100)),
      ...levelFor(totalXp),
    }
  }, [tasks, today])

  function toast(title: string, text: string) {
    const id = Date.now() + Math.random()
    setToasts((cur) => [...cur, { id, title, text }])
    timers.current.push(window.setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4200))
  }

  function celebrate(amount: number): number {
    const count = Math.min(200, 100 + Math.floor(amount * 2))
    const id = Date.now()
    setCoins(Array.from({ length: count }, (_, i) => ({
      id: id + i,
      left: Math.random() * 100,
      delay: Math.random() * 1.6,
      duration: 1.5 + Math.random() * 1.3,
      size: 24 + Math.random() * 24,
      drift: (Math.random() - 0.5) * 120,
      spin: Math.random() < 0.5 ? -1 : 1,
    })))
    setPulse(true)
    timers.current.push(window.setTimeout(() => setCoins([]), 4200))
    timers.current.push(window.setTimeout(() => setPulse(false), 1400))
    return count
  }

  /** Registra la tarea, festeja y avisa si subió de nivel. */
  function record(task: Task) {
    const before = levelFor(stats.totalXp).level
    const after = levelFor(stats.totalXp + task.xp).level
    setTasks((cur) => [task, ...cur])
    const coinCount = celebrate(task.amount)
    if (soundOn) {
      playCoins(coinCount)
      if (after > before) timers.current.push(window.setTimeout(() => playLevelUp(), 900))
    }
    toast(task.amount > 0 ? `+ US$ ${fmtMoney(task.amount)}` : 'Tarea registrada', `+${task.xp} XP · ${task.project}`)
    if (after > before) toast(`¡Subiste al nivel ${after}!`, rankFor(after))
  }

  function pickProject(projectId: string | null) {
    const p = projects.find((x) => x.id === projectId)
    // Un proyecto con tarifa arranca como facturable; se puede cambiar con el botón $.
    setDraft((d) => ({ ...d, projectId, billable: p ? p.rate > 0 : false }))
  }

  function addTag(tag: string) {
    setDraft((d) => ({ ...d, tags: [...parseTags(d.tags), tag].join(', ') }))
  }

  function startTask() {
    unlockAudio()
    if (!draft.name.trim()) setDraft((d) => ({ ...d, name: 'Tarea sin título' }))
    const t = Date.now()
    setNow(t)
    setActive((a) => ({ ...a, startedAt: t, startTime: a.startTime ?? timeKey() }))
  }

  function pauseTask() {
    setActive((a) => ({ base: elapsed, startedAt: null, startTime: a.startTime }))
  }

  function discardTask() {
    if (elapsed > 0 && !window.confirm('¿Descartar la tarea en curso sin registrar el tiempo?')) return
    setActive({ base: 0, startedAt: null })
    setDraft((d) => ({ ...d, name: '' }))
  }

  function finishTask() {
    if (elapsed < 1) return
    record(buildTask({
      name: draft.name, seconds: elapsed, projectId: draft.projectId, billable: draft.billable,
      tags: parseTags(draft.tags), long: draft.long, date: dateKey(), start: active.startTime, projects, clients,
    }))
    setActive({ base: 0, startedAt: null })
    setDraft((d) => ({ ...d, name: '', tags: '', long: false }))
  }

  function repeatTask(task: Task) {
    if (elapsed > 0 && !window.confirm('Hay una tarea en curso. ¿Descartarla y empezar esta?')) return
    unlockAudio()
    const projectId = projects.some((p) => p.id === task.projectId) ? task.projectId : null
    setDraft({ name: task.name, projectId, billable: task.billable, tags: task.tags.join(', '), long: task.long })
    const t = Date.now()
    setNow(t)
    setActive({ base: 0, startedAt: t, startTime: timeKey() })
    setActiveTab('Inicio')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleBillable(id: number) {
    setTasks((cur) => cur.map((t) => {
      if (t.id !== id) return t
      const billable = !t.billable
      const paid = billable && t.rate > 0
      return { ...t, billable, amount: paid ? goldFor(t.seconds, t.rate) : 0, xp: xpFor(t.seconds, paid, t.long) }
    }))
  }

  function deleteTask(id: number) {
    if (window.confirm('¿Borrar esta tarea? También baja el XP que dio.')) setTasks((cur) => cur.filter((t) => t.id !== id))
  }

  function openManual() {
    const d = new Date()
    const from = new Date(d.getTime() - 3600000)
    setManual({ name: '', projectId: draft.projectId, billable: draft.billable, tags: '', date: dateKey(), from: timeKey(from), to: timeKey(d) })
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
    unlockAudio()
    record(buildTask({
      name: manual.name, seconds: minutes * 60, projectId: manual.projectId, billable: manual.billable,
      tags: parseTags(manual.tags), long: false, date: manual.date || dateKey(), start: manual.from, projects, clients,
    }))
    setManual(null)
  }

  const headerDate = today ? (() => { const d = new Date(`${today}T12:00:00`); return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} DE ${MONTHS[d.getMonth()].toUpperCase()}` })() : ' '
  const ringPct = Math.max(stats.goalPct, running ? Math.min(100, Math.round(((stats.todaySeconds + elapsed) / 3600 / DAILY_GOAL_HOURS) * 100)) : 0)
  const manualInfo = manual ? describeProject(manual.projectId, projects, clients) : null
  const recent = [...tasks].sort((a, b) => (b.date + (b.start ?? '')).localeCompare(a.date + (a.start ?? '')) || b.id - a.id).slice(0, 4)

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Coins /></div><div><strong>TIEMPO<span> ORO</span></strong><small>Freelance time tracker</small></div></div>
        <nav className="desktop-nav" aria-label="Secciones">
          {TABS.map(({ id }) => <button key={id} className={activeTab === id ? 'nav-active' : ''} onClick={() => setActiveTab(id)}>{id}</button>)}
        </nav>
        <div className="header-actions">
          {running && activeTab !== 'Inicio' && <button className="running-pill" onClick={() => setActiveTab('Inicio')}><i /> {fmtClock(elapsed)}</button>}
          <button className="icon-button sound-toggle" aria-label={soundOn ? 'Silenciar sonidos' : 'Activar sonidos'} aria-pressed={soundOn} title={soundOn ? 'Sonido activado' : 'Sonido apagado'} onClick={() => { unlockAudio(); setSoundOn((s) => !s) }}>{soundOn ? <Volume2 /> : <VolumeX />}</button>
          <div className="profile"><div className="avatar">AN</div><span>Ayrton</span></div>
        </div>
      </header>

      <div className="content-wrap">
        {activeTab === 'Inicio' && <>
          <section className="welcome-row"><div><p className="eyebrow">{headerDate}</p><h1>Buenas, Ayrton <span className="wave">✦</span></h1><p className="subtitle">Cada minuto cuenta. {stats.todaySeconds > 0 ? 'Hoy ya hiciste un buen trabajo.' : 'Arrancá tu primera tarea del día.'}</p></div></section>

          <section className="hud-grid">
            <article className={`gold-card card-glow ${pulse ? 'gold-pulse' : ''}`}><div className="card-label"><span><Coins /> ORO GANADO HOY</span><span className="currency">USD</span></div><div className="gold-value">$ {fmtMoney(stats.todayGold)}</div><div className="gold-foot"><span><Zap /> +{stats.todayXp} XP hoy</span><span>Meta diaria {stats.goalPct}%</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${stats.goalPct}%` }} /></div></article>
            <article className="stat-card"><div className="card-label"><span><Flame /> RACHA ACTUAL</span><span className="streak-badge">{stats.streak} {stats.streak === 1 ? 'DÍA' : 'DÍAS'}</span></div><div className="stat-main"><strong>{stats.streak}</strong><span>{stats.streak === 1 ? 'día' : 'días'}<br /><small>Seguí así</small></span></div><div className="week-dots">{stats.week.map((d) => <div key={d.key} className={d.isToday ? 'dot-today' : d.has ? 'dot-on' : 'dot-off'}><span>{d.letter}</span><i>{d.has ? '✓' : '•'}</i></div>)}</div></article>
            <article className="stat-card level-card"><div className="card-label"><span><Trophy /> NIVEL {stats.level}</span><span className="rank">{rankFor(stats.level).toUpperCase()}</span></div><div className="level-row"><strong>{stats.into.toLocaleString('es-AR')} <small>/ {stats.need.toLocaleString('es-AR')} XP</small></strong><span>+{stats.todayXp} XP hoy</span></div><div className="progress-track xp-track"><div className="progress-fill" style={{ width: `${Math.round((stats.into / stats.need) * 100)}%` }} /></div><div className="next-level"><span>Faltan {(stats.need - stats.into).toLocaleString('es-AR')} XP</span><span>{nextRank(stats.level)}</span></div></article>
          </section>

          <section className="workspace-grid">
            <article className="timer-panel panel">
              <div className="panel-heading"><div><p className="eyebrow">ENFOQUE PROFUNDO</p><h2>¿En qué estás trabajando?</h2></div><button className="more-button" onClick={discardTask} aria-label="Descartar tarea en curso" title="Descartar" disabled={elapsed === 0}><X /></button></div>
              <div className="task-input-row">
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && !running) startTask() }} maxLength={140} placeholder="¿Qué estás haciendo?" aria-label="Nombre de tarea" />
              </div>
              <div className="task-toolbar">
                <ProjectPicker projects={projects} clients={clients} value={draft.projectId} onChange={pickProject} onCreateProject={(p) => setProjects((cur) => [...cur, p])} />
                <label className="tags-input"><Tag /><input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="etiquetas, separadas por coma" aria-label="Etiquetas" /></label>
                <button className={`billable-toggle big ${draft.billable ? 'billable-on' : ''}`} onClick={() => setDraft({ ...draft, billable: !draft.billable })} aria-pressed={draft.billable} title={draft.billable ? (info.rate > 0 ? `Facturable a ${info.rate} USD/h` : 'Facturable, pero el proyecto no tiene tarifa') : 'No facturable'}><DollarSign /><span>{draft.billable ? 'Paga' : 'No paga'}</span></button>
                <button className={`chip ${draft.long ? 'chip-on' : ''}`} onClick={() => setDraft({ ...draft, long: !draft.long })} aria-pressed={draft.long}>Larga +25% XP</button>
              </div>
              {suggestedTags.length > 0 && <div className="tag-suggestions">{suggestedTags.map((t) => <button key={t} onClick={() => addTag(t)}>+ {t}</button>)}</div>}
              {draft.billable && info.rate === 0 && <p className="hint">Este {draft.projectId ? 'proyecto no tiene tarifa' : 'timer no tiene proyecto'}: la tarea suma XP pero no plata. Elegí un proyecto con tarifa o cargala en Clientes.</p>}
              <div className="timer-zone"><div className="timer-ring" style={{ background: `conic-gradient(var(--gold) 0 ${ringPct}%, #25313e ${ringPct}% 100%)` }}><div className="timer-ring-inner"><span>{fmtClock(elapsed)}</span><small>{running ? 'REGISTRANDO TIEMPO' : elapsed > 0 ? 'EN PAUSA' : 'LISTO PARA EMPEZAR'}</small></div></div><div className="timer-meta"><span><Coins /> +$ {fmtMoney(liveGold)}</span><span><Zap /> +{liveXp} XP</span>{paidNow && <span className="rate-note">{info.rate} USD/h</span>}</div></div>
              <div className="timer-actions"><button className="start-button" onClick={running ? pauseTask : startTask}>{running ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}{running ? 'Pausar' : elapsed > 0 ? 'Seguir' : 'Empezar'}</button><button className="finish-button" onClick={finishTask} disabled={elapsed < 1}><Check data-icon="inline-start" /> Terminar y cobrar</button></div>
              <div className="timer-tip"><Sparkles /> Tip: las tareas facturables dan 50% más de XP</div>
            </article>

            <article className="daily-panel panel"><div className="panel-heading"><div><p className="eyebrow">RESUMEN DE ACTIVIDAD</p><h2>Tu semana</h2></div><button className="period-button" onClick={() => setActiveTab('Estadísticas')}>Ver estadísticas →</button></div><div className="chart-area"><div className="chart-labels"><span>8h</span><span>6h</span><span>4h</span><span>2h</span><span>0h</span></div><div className="bars">{stats.days.map((d, i) => <div className="bar-column" key={i}><div className={`bar ${d.hit ? 'bar-highlight' : ''}`} style={{ height: `${Math.max(d.pct, 2)}%` }} /><span>{d.letter}</span></div>)}</div><div className="goal-line"><span>Meta diaria {DAILY_GOAL_HOURS}h</span></div></div><div className="activity-stats"><div><span>ESTA SEMANA</span><strong>{fmtHours(stats.weekSeconds)}</strong></div><div><span>FACTURABLE</span><strong>{stats.billablePct}%</strong></div><div><span>GANADO</span><strong>US$ {fmtMoney(stats.weekGold)}</strong></div></div></article>
          </section>

          <section className="recent-section"><div className="section-heading"><div><p className="eyebrow">HISTORIAL RECIENTE</p><h2>Últimos registros</h2></div><button className="link-button" onClick={() => setActiveTab('Tareas')}>Ver todas <span>→</span></button></div><div className="task-list">{recent.length === 0 && <p className="empty-list">Todavía no registraste nada. Escribí una tarea y tocá Empezar.</p>}{recent.map((task) => <TaskRow key={task.id} task={task} dateLabel={dayLabel(task.date, today)} onDelete={deleteTask} onRepeat={repeatTask} onToggleBillable={toggleBillable} />)}</div><button className="new-task-button" onClick={openManual}><Plus /> Cargar tiempo a mano</button></section>
        </>}

        {activeTab === 'Tareas' && <TasksView tasks={tasks} today={today} onDelete={deleteTask} onRepeat={repeatTask} onToggleBillable={toggleBillable} onAddManual={openManual} />}
        {activeTab === 'Estadísticas' && today && <StatsView tasks={tasks} clients={clients} today={today} />}
        {activeTab === 'Clientes' && <ClientsView clients={clients} projects={projects} tasks={tasks} setClients={setClients} setProjects={setProjects} />}
      </div>

      <nav className="bottom-nav" aria-label="Navegación móvil">{TABS.map(({ id, icon: Icon }) => <button key={id} className={activeTab === id ? 'mobile-active' : ''} onClick={() => setActiveTab(id)}><Icon /><span>{id}</span></button>)}</nav>

      {manual && manualInfo && <div className="modal-backdrop" onClick={() => setManual(null)}><div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setManual(null)} aria-label="Cerrar"><X /></button>
        <p className="eyebrow">NUEVO REGISTRO</p><h2>Cargar tiempo a mano</h2>
        <p>Sumá una tarea que ya hiciste para no perder ese trabajo.</p>
        <div className="form-grid">
          <label>Tarea<input autoFocus placeholder="¿Qué hiciste?" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} /></label>
          <div className="field"><span>Proyecto</span><ProjectPicker projects={projects} clients={clients} value={manual.projectId} onChange={(id) => { const p = projects.find((x) => x.id === id); setManual({ ...manual, projectId: id, billable: p ? p.rate > 0 : false }) }} onCreateProject={(p) => setProjects((cur) => [...cur, p])} /></div>
          <label>Etiquetas<input placeholder="diseño, reunión" value={manual.tags} onChange={(e) => setManual({ ...manual, tags: e.target.value })} /></label>
          <div className="modal-fields three"><label>Fecha<input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></label><label>Desde<input type="time" value={manual.from} onChange={(e) => setManual({ ...manual, from: e.target.value })} /></label><label>Hasta<input type="time" value={manual.to} onChange={(e) => setManual({ ...manual, to: e.target.value })} /></label></div>
          <button type="button" className={`billable-toggle big wide ${manual.billable ? 'billable-on' : ''}`} onClick={() => setManual({ ...manual, billable: !manual.billable })} aria-pressed={manual.billable}><DollarSign /><span>{manual.billable ? (manualInfo.rate > 0 ? `Paga · ${manualInfo.rate} USD/h` : 'Paga · el proyecto no tiene tarifa') : 'No paga'}</span></button>
        </div>
        {manualError && <p className="form-error">{manualError}</p>}
        <button className="start-button full" onClick={saveManual}><Check /> Guardar registro</button>
      </div></div>}

      <div className="coin-layer" aria-hidden="true">{coins.map((c) => <span key={c.id} className="coin" style={{ left: `${c.left}%`, width: c.size, height: c.size, fontSize: c.size * 0.5, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s`, ['--dx' as string]: `${c.drift}px`, ['--spin' as string]: `${c.spin * 900}deg` }}>$</span>)}</div>
      <div className="toast-stack" role="status" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}><strong>{t.title}</strong><span>{t.text}</span></div>)}</div>
    </main>
  )
}
