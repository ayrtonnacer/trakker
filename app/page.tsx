'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Coins,
  Flame,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Tag,
  Trophy,
  UserRound,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react'
import { playCoins, playLevelUp, unlockAudio } from '@/lib/audio'
import {
  CLIENTS,
  DAILY_GOAL_HOURS,
  dateKey,
  fmtClock,
  fmtMoney,
  goldFor,
  levelFor,
  nextRank,
  rankFor,
  streakFor,
  xpFor,
  type Task,
} from '@/lib/game'

const STORAGE_KEY = 'tiempo-oro-v1'
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']

type Active = { base: number; startedAt: number | null }
type Coin = { id: number; left: number; delay: number; duration: number; size: number }
type Toast = { id: number; title: string; text: string }

function seedTasks(today: string): Task[] {
  return [
    { id: 1, name: 'Rediseño de landing page', client: 'Estudio Norte', project: 'Web institucional', seconds: 9600, amount: 53.33, currency: 'USD', xp: 240, color: '#e8ad4b', tags: ['diseño', 'web'], date: today, long: true },
    { id: 2, name: 'Fix login en producción', client: 'Marea Studio', project: 'App mobile', seconds: 4500, amount: 25, currency: 'USD', xp: 116, color: '#67d6b2', tags: ['bug', 'dev'], date: today, long: false },
    { id: 3, name: 'Llamada de seguimiento', client: 'Estudio Norte', project: 'Web institucional', seconds: 2700, amount: 15, currency: 'USD', xp: 50, color: '#e8ad4b', tags: ['reunión'], date: today, long: false },
  ]
}

function parseDuration(text: string) {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return 0
  return Number(m[1]) * 3600 + Number(m[2]) * 60
}

export default function Page() {
  const [activeTab, setActiveTab] = useState('Inicio')
  const [taskName, setTaskName] = useState('')
  const [clientName, setClientName] = useState('Sin cliente')
  const [long, setLong] = useState(false)
  const [active, setActive] = useState<Active>({ base: 0, startedAt: null })
  const [now, setNow] = useState(0)
  const [tasks, setTasks] = useState<Task[]>([])
  const [soundOn, setSoundOn] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [today, setToday] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [manual, setManual] = useState({ name: '', date: '', time: '' })
  const [manualError, setManualError] = useState('')
  const [coins, setCoins] = useState<Coin[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pulse, setPulse] = useState(false)
  const timers = useRef<number[]>([])

  const running = active.startedAt !== null
  const client = CLIENTS.find((c) => c.name === clientName) ?? CLIENTS[0]

  // Carga inicial desde el navegador.
  useEffect(() => {
    const key = dateKey()
    setToday(key)
    setNow(Date.now())
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw)
        setTasks(saved.tasks ?? [])
        setSoundOn(saved.soundOn ?? true)
        if (saved.active) setActive(saved.active)
        if (saved.taskName) setTaskName(saved.taskName)
        if (saved.clientName) setClientName(saved.clientName)
        if (typeof saved.long === 'boolean') setLong(saved.long)
      } else {
        setTasks(seedTasks(key))
      }
    } catch {
      setTasks(seedTasks(key))
    }
    setLoaded(true)
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, soundOn, active, taskName, clientName, long }))
    } catch {
      // Sin almacenamiento (modo privado): la app sigue andando, sólo no recuerda.
    }
  }, [loaded, tasks, soundOn, active, taskName, clientName, long])

  // El tiempo se calcula desde el inicio, así que sobrevive a pestañas en segundo plano.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [running])

  const elapsed = Math.floor(active.base + (active.startedAt ? Math.max(0, now - active.startedAt) / 1000 : 0))
  const liveGold = goldFor(elapsed, client.rate)
  const liveXp = elapsed > 0 ? xpFor(elapsed, client.rate > 0, long) : 0

  const stats = useMemo(() => {
    const todayTasks = tasks.filter((t) => t.date === today)
    const todaySeconds = todayTasks.reduce((s, t) => s + t.seconds, 0)
    const todayGold = todayTasks.filter((t) => t.currency === 'USD').reduce((s, t) => s + t.amount, 0)
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
    const billable = weekTasks.filter((t) => t.amount > 0).reduce((s, t) => s + t.seconds, 0)

    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(base)
      d.setDate(base.getDate() - (13 - i))
      const key = dateKey(d)
      const secs = tasks.filter((t) => t.date === key).reduce((s, t) => s + t.seconds, 0)
      return { letter: DAY_LETTERS[d.getDay()], pct: Math.min(100, (secs / 3600 / 8) * 100), hit: secs / 3600 >= DAILY_GOAL_HOURS }
    })

    return {
      todaySeconds, todayGold, todayXp, totalXp, week, days, weekSeconds, weekCount: weekTasks.length,
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

  function celebrate(amount: number) {
    const count = Math.min(24, Math.max(5, 5 + Math.floor(amount / 5)))
    const id = Date.now()
    setCoins(Array.from({ length: count }, (_, i) => ({
      id: id + i,
      left: 6 + Math.random() * 88,
      delay: Math.random() * 0.7,
      duration: 1.1 + Math.random() * 0.9,
      size: 20 + Math.random() * 14,
    })))
    setPulse(true)
    timers.current.push(window.setTimeout(() => setCoins([]), 2600))
    timers.current.push(window.setTimeout(() => setPulse(false), 1400))
  }

  function startTask() {
    unlockAudio()
    if (!taskName.trim()) setTaskName('Tarea sin título')
    setNow(Date.now())
    setActive((a) => ({ ...a, startedAt: Date.now() }))
  }

  function pauseTask() {
    setActive({ base: elapsed, startedAt: null })
  }

  function discardTask() {
    if (elapsed > 0 && !window.confirm('¿Descartar la tarea en curso sin registrar el tiempo?')) return
    setActive({ base: 0, startedAt: null })
    setTaskName('')
  }

  function finishTask() {
    if (elapsed < 1) return
    const billable = client.rate > 0
    const amount = goldFor(elapsed, client.rate)
    const xp = xpFor(elapsed, billable, long)
    const before = levelFor(stats.totalXp).level
    const after = levelFor(stats.totalXp + xp).level
    const task: Task = {
      id: Date.now(),
      name: taskName.trim() || 'Tarea sin título',
      client: client.name,
      project: billable ? 'General' : 'Personal',
      seconds: elapsed,
      amount,
      currency: client.currency,
      xp,
      color: client.color,
      tags: long ? ['larga'] : [],
      date: dateKey(),
      long,
    }
    setTasks((cur) => [task, ...cur])
    setActive({ base: 0, startedAt: null })
    setTaskName('')

    celebrate(amount)
    if (soundOn) {
      playCoins(Math.min(14, 5 + Math.floor(amount / 4)))
      if (after > before) timers.current.push(window.setTimeout(() => playLevelUp(), 900))
    }
    toast(amount > 0 ? `+ ${client.currency === 'USD' ? 'US$' : client.currency} ${fmtMoney(amount)}` : 'Tarea registrada', `+${xp} XP`)
    if (after > before) toast(`¡Subiste al nivel ${after}!`, rankFor(after))
  }

  function saveManual() {
    const secs = parseDuration(manual.time)
    if (!manual.name.trim()) return setManualError('Ponele un nombre a la tarea.')
    if (!secs) return setManualError('Duración con formato HH:MM, por ejemplo 01:30.')
    if (secs > 16 * 3600) return setManualError('No se aceptan más de 16 horas.')
    const billable = client.rate > 0
    const task: Task = {
      id: Date.now(),
      name: manual.name.trim(),
      client: client.name,
      project: billable ? 'General' : 'Personal',
      seconds: secs,
      amount: goldFor(secs, client.rate),
      currency: client.currency,
      xp: xpFor(secs, billable, false),
      color: client.color,
      tags: ['manual'],
      date: manual.date || dateKey(),
      long: false,
    }
    setTasks((cur) => [task, ...cur].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)))
    setShowNew(false)
    setManualError('')
    celebrate(task.amount)
    if (soundOn) playCoins(6)
    toast(task.amount > 0 ? `+ US$ ${fmtMoney(task.amount)}` : 'Tarea registrada', `+${task.xp} XP`)
  }

  function openManual() {
    setManual({ name: '', date: dateKey(), time: '' })
    setManualError('')
    setShowNew(true)
  }

  function deleteTask(id: number) {
    if (window.confirm('¿Borrar esta tarea? También baja el XP que dio.')) setTasks((cur) => cur.filter((t) => t.id !== id))
  }

  const headerDate = today ? (() => { const d = new Date(`${today}T12:00:00`); return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} DE ${MONTHS[d.getMonth()].toUpperCase()}` })() : ' '
  const shown = activeTab === 'Tareas' ? tasks : tasks.slice(0, 3)
  const ringPct = Math.max(stats.goalPct, running ? Math.min(100, Math.round(((stats.todaySeconds + elapsed) / 3600 / DAILY_GOAL_HOURS) * 100)) : 0)
  const hoursLabel = `${Math.floor(stats.weekSeconds / 3600)}h ${Math.floor((stats.weekSeconds % 3600) / 60)}m`

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Coins /></div><div><strong>TIEMPO<span> ORO</span></strong><small>Freelance time tracker</small></div></div>
        <nav className="desktop-nav" aria-label="Secciones">
          {['Inicio', 'Tareas', 'Estadísticas'].map((item) => <button key={item} className={activeTab === item ? 'nav-active' : ''} onClick={() => setActiveTab(item)}>{item}</button>)}
        </nav>
        <div className="header-actions">
          <button className="icon-button" aria-label="Ayuda"><CircleHelp /></button>
          <button className="icon-button" aria-label="Notificaciones"><Bell /></button>
          <button className="icon-button sound-toggle" aria-label={soundOn ? 'Silenciar sonidos' : 'Activar sonidos'} aria-pressed={soundOn} onClick={() => { unlockAudio(); setSoundOn((s) => !s) }}>{soundOn ? <Volume2 /> : <VolumeX />}</button>
          <div className="profile"><div className="avatar">AN</div><span>Ayrton</span><ChevronDown /></div>
        </div>
      </header>

      <div className="content-wrap">
        <section className="welcome-row"><div><p className="eyebrow">{headerDate}</p><h1>Buenas, Ayrton <span className="wave">✦</span></h1><p className="subtitle">Cada minuto cuenta. {stats.todaySeconds > 0 ? 'Hoy ya hiciste un buen trabajo.' : 'Arrancá tu primera tarea del día.'}</p></div><button className="settings-button" onClick={() => { unlockAudio(); setSoundOn((s) => !s) }}><Settings2 /> Sonido {soundOn ? 'activado' : 'apagado'}</button></section>

        <section className="hud-grid">
          <article className={`gold-card card-glow ${pulse ? 'gold-pulse' : ''}`}><div className="card-label"><span><Coins /> ORO GANADO HOY</span><span className="currency">USD <ChevronDown /></span></div><div className="gold-value">$ {fmtMoney(stats.todayGold)}</div><div className="gold-foot"><span><Zap /> +{stats.todayXp} XP hoy</span><span>Meta diaria {stats.goalPct}%</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${stats.goalPct}%` }} /></div></article>
          <article className="stat-card"><div className="card-label"><span><Flame /> RACHA ACTUAL</span><span className="streak-badge">{stats.streak} {stats.streak === 1 ? 'DÍA' : 'DÍAS'}</span></div><div className="stat-main"><strong>{stats.streak}</strong><span>{stats.streak === 1 ? 'día' : 'días'}<br /><small>Seguí así</small></span></div><div className="week-dots">{stats.week.map((d) => <div key={d.key} className={d.isToday ? 'dot-today' : d.has ? 'dot-on' : 'dot-off'}><span>{d.letter}</span><i>{d.has ? '✓' : '•'}</i></div>)}</div></article>
          <article className="stat-card level-card"><div className="card-label"><span><Trophy /> NIVEL {stats.level}</span><span className="rank">{rankFor(stats.level).toUpperCase()}</span></div><div className="level-row"><strong>{stats.into.toLocaleString('es-AR')} <small>/ {stats.need.toLocaleString('es-AR')} XP</small></strong><span>+{stats.todayXp} XP hoy</span></div><div className="progress-track xp-track"><div className="progress-fill" style={{ width: `${Math.round((stats.into / stats.need) * 100)}%` }} /></div><div className="next-level"><span>Faltan {(stats.need - stats.into).toLocaleString('es-AR')} XP</span><span>{nextRank(stats.level)}</span></div></article>
        </section>

        <section className="workspace-grid">
          <article className="timer-panel panel"><div className="panel-heading"><div><p className="eyebrow">ENFOQUE PROFUNDO</p><h2>¿En qué estás trabajando?</h2></div><button className="more-button" onClick={discardTask} aria-label="Descartar tarea en curso" disabled={elapsed === 0}><X /></button></div><div className="task-input-row"><input value={taskName} onChange={(e) => setTaskName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !running) startTask() }} maxLength={140} placeholder="Escribí una tarea para empezar..." aria-label="Nombre de tarea" /><select className="select-client" value={clientName} onChange={(e) => setClientName(e.target.value)} aria-label="Cliente">{CLIENTS.map((c) => <option key={c.name} value={c.name}>{c.name}{c.rate ? ` · ${c.rate} ${c.currency}/h` : ''}</option>)}</select></div><label className="long-toggle"><input type="checkbox" checked={long} onChange={(e) => setLong(e.target.checked)} /> Tarea larga (+25% XP)</label><div className="timer-zone"><div className="timer-ring" style={{ background: `conic-gradient(var(--gold) 0 ${ringPct}%, #25313e ${ringPct}% 100%)` }}><div className="timer-ring-inner"><span>{fmtClock(elapsed)}</span><small>{running ? 'REGISTRANDO TIEMPO' : elapsed > 0 ? 'EN PAUSA' : 'LISTO PARA EMPEZAR'}</small></div></div><div className="timer-meta"><span><Coins /> +$ {fmtMoney(liveGold)}</span><span><Zap /> +{liveXp} XP</span></div></div><div className="timer-actions"><button className="start-button" onClick={running ? pauseTask : startTask}>{running ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}{running ? 'Pausar' : elapsed > 0 ? 'Seguir' : 'Empezar'}</button><button className="finish-button" onClick={finishTask} disabled={elapsed < 1}><Check data-icon="inline-start" /> Terminar y cobrar</button></div><div className="timer-tip"><Sparkles /> Tip: las tareas largas dan un 25% más de XP</div></article>

          <article className="daily-panel panel"><div className="panel-heading"><div><p className="eyebrow">RESUMEN DE ACTIVIDAD</p><h2>Tu semana</h2></div><button className="period-button">Últimos 14 días <ChevronDown /></button></div><div className="chart-area"><div className="chart-labels"><span>8h</span><span>6h</span><span>4h</span><span>2h</span><span>0h</span></div><div className="bars">{stats.days.map((d, i) => <div className="bar-column" key={i}><div className={`bar ${d.hit ? 'bar-highlight' : ''}`} style={{ height: `${Math.max(d.pct, 2)}%` }} /><span>{d.letter}</span></div>)}</div><div className="goal-line"><span>Meta diaria {DAILY_GOAL_HOURS}h</span></div></div><div className="activity-stats"><div><span>TIEMPO TOTAL</span><strong>{hoursLabel}</strong></div><div><span>FACTURABLE</span><strong>{stats.billablePct}%</strong></div><div><span>TAREAS</span><strong>{stats.weekCount}</strong></div></div></article>
        </section>

        <section className="recent-section"><div className="section-heading"><div><p className="eyebrow">{activeTab === 'Tareas' ? 'TODAS LAS TAREAS' : 'HISTORIAL RECIENTE'}</p><h2>{activeTab === 'Tareas' ? 'Tareas registradas' : 'Últimos registros'}</h2></div>{activeTab !== 'Tareas' && <button className="link-button" onClick={() => setActiveTab('Tareas')}>Ver todas <span>→</span></button>}</div><div className="task-list">{shown.length === 0 && <p className="empty-list">Todavía no registraste nada. Escribí una tarea y tocá Empezar.</p>}{shown.map((task) => <div className="task-row" key={task.id}><div className="task-icon" style={{ background: `${task.color}18`, color: task.color }}><Clock3 /></div><div className="task-info"><strong>{task.name}</strong><span><i style={{ background: task.color }} /> {task.client} · {task.project}</span></div><div className="task-tags">{task.tags.map((tag) => <span key={tag}><Tag /> {tag}</span>)}</div><div className="task-duration"><strong>{fmtClock(task.seconds)}</strong><span>{task.date === today ? 'Hoy' : task.date}</span></div><div className="task-money"><strong>{task.amount === 0 ? `+${task.xp} XP` : `+$ ${fmtMoney(task.amount)}`}</strong><span>{task.amount === 0 ? 'no facturable' : task.currency}</span></div><button className="row-more" onClick={() => deleteTask(task.id)} aria-label="Borrar tarea"><MoreHorizontal /></button></div>)}</div><button className="new-task-button" onClick={openManual}><Plus /> Agregar tarea manual</button></section>
      </div>

      <nav className="bottom-nav" aria-label="Navegación móvil">{[[Clock3,'Inicio'],[CalendarDays,'Tareas'],[BarChart3,'Estadísticas'],[UserRound,'Perfil']].map(([Icon,label]) => <button key={label as string} className={activeTab === label ? 'mobile-active' : ''} onClick={() => setActiveTab(label as string)}><Icon /><span>{label as string}</span></button>)}</nav>

      {showNew && <div className="modal-backdrop" onClick={() => setShowNew(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShowNew(false)} aria-label="Cerrar"><X /></button><p className="eyebrow">NUEVO REGISTRO</p><h2>Cargar tiempo a mano</h2><p>Sumá una tarea que ya terminaste para no perder ese trabajo. Usa el cliente elegido en el timer ({client.name}).</p><input placeholder="Nombre de la tarea" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} /><div className="modal-fields"><input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /><input type="text" placeholder="01:30 (horas:min)" value={manual.time} onChange={(e) => setManual({ ...manual, time: e.target.value })} /></div>{manualError && <p className="form-error">{manualError}</p>}<button className="start-button" onClick={saveManual}><Check /> Guardar registro</button></div></div>}

      <div className="coin-layer" aria-hidden="true">{coins.map((c) => <span key={c.id} className="coin" style={{ left: `${c.left}%`, width: c.size, height: c.size, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s` }}>$</span>)}</div>
      <div className="toast-stack" role="status" aria-live="polite">{toasts.map((t) => <div className="toast" key={t.id}><strong>{t.title}</strong><span>{t.text}</span></div>)}</div>
    </main>
  )
}
