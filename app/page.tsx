'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Coins,
  FolderKanban,
  Flame,
  GitBranch,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Tag,
  Trophy,
  UserRound,
  X,
  Zap,
} from 'lucide-react'

type Task = { id: number; name: string; client: string; project: string; duration: string; amount: string; xp: number; color: string; tags: string[] }

const starterTasks: Task[] = [
  { id: 1, name: 'Rediseño de landing page', client: 'Estudio Norte', project: 'Web institucional', duration: '2:40:00', amount: '53,33', xp: 240, color: '#e8ad4b', tags: ['diseño', 'web'] },
  { id: 2, name: 'Fix login en producción', client: 'Marea Studio', project: 'App mobile', duration: '1:15:00', amount: '25,00', xp: 116, color: '#67d6b2', tags: ['bug', 'dev'] },
  { id: 3, name: 'Llamada de seguimiento', client: 'Estudio Norte', project: 'Web institucional', duration: '0:45:00', amount: '15,00', xp: 50, color: '#e8ad4b', tags: ['reunión'] },
]

const chart = [42, 58, 35, 72, 50, 88, 64, 48, 78, 55, 90, 68, 80, 70]

export default function Page() {
  const [activeTab, setActiveTab] = useState('Inicio')
  const [taskName, setTaskName] = useState('')
  const [running, setRunning] = useState(false)
  const [seconds, setSeconds] = useState(2 * 60 * 17)
  const [tasks, setTasks] = useState(starterTasks)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [running])

  const formattedTime = useMemo(() => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0')
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }, [seconds])

  function startTask() {
    if (!taskName.trim()) setTaskName('Tarea sin título')
    setRunning(true)
  }

  function finishTask() {
    if (!running) return
    setRunning(false)
    setTasks((current) => [{ id: Date.now(), name: taskName || 'Tarea sin título', client: 'Sin cliente', project: 'Personal', duration: formattedTime, amount: '0,00', xp: 137, color: '#9b8cff', tags: ['nueva'] }, ...current])
    setTaskName('')
    setSeconds(0)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Coins /></div><div><strong>TIEMPO<span> ORO</span></strong><small>Freelance time tracker</small></div></div>
        <nav className="desktop-nav" aria-label="Secciones">
          {['Inicio', 'Tareas', 'Estadísticas'].map((item) => <button key={item} className={activeTab === item ? 'nav-active' : ''} onClick={() => setActiveTab(item)}>{item}</button>)}
        </nav>
        <div className="header-actions"><button className="icon-button" aria-label="Ayuda"><CircleHelp /></button><button className="icon-button" aria-label="Notificaciones"><Bell /></button><div className="profile"><div className="avatar">AN</div><span>Ayrton</span><ChevronDown /></div></div>
      </header>

      <div className="content-wrap">
        <section className="welcome-row"><div><p className="eyebrow">DOMINGO, 19 DE OCTUBRE</p><h1>Buenas, Ayrton <span className="wave">✦</span></h1><p className="subtitle">Cada minuto cuenta. Hoy ya hiciste un buen trabajo.</p></div><button className="settings-button"><Settings2 /> Preferencias</button></section>

        <section className="hud-grid">
          <article className="gold-card card-glow"><div className="card-label"><span><Coins /> ORO GANADO HOY</span><span className="currency">USD <ChevronDown /></span></div><div className="gold-value">$ 93,33</div><div className="gold-foot"><span><Zap /> +12,4% vs. ayer</span><span>Meta diaria 68%</span></div><div className="progress-track"><div className="progress-fill" style={{ width: '68%' }} /></div></article>
          <article className="stat-card"><div className="card-label"><span><Flame /> RACHA ACTUAL</span><span className="streak-badge">7 DÍAS</span></div><div className="stat-main"><strong>7</strong><span>días<br /><small>Tu mejor: 12</small></span></div><div className="week-dots">{['L','M','X','J','V','S','D'].map((d, i) => <div key={d} className={i < 6 ? 'dot-on' : 'dot-today'}><span>{d}</span><i>{i < 6 ? '✓' : '•'}</i></div>)}</div></article>
          <article className="stat-card level-card"><div className="card-label"><span><Trophy /> NIVEL 12</span><span className="rank">ARTESANO</span></div><div className="level-row"><strong>2.840 <small>/ 3.600 XP</small></strong><span>+137 XP hoy</span></div><div className="progress-track xp-track"><div className="progress-fill" style={{ width: '79%' }} /></div><div className="next-level"><span>Faltan 760 XP</span><span>Maestro del oficio</span></div></article>
        </section>

        <section className="workspace-grid">
          <article className="timer-panel panel"><div className="panel-heading"><div><p className="eyebrow">ENFOQUE PROFUNDO</p><h2>¿En qué estás trabajando?</h2></div><button className="more-button"><MoreHorizontal /></button></div><div className="task-input-row"><input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="Escribí una tarea para empezar..." aria-label="Nombre de tarea" /><button className="select-client">Sin cliente <ChevronDown /></button></div><div className="timer-zone"><div className="timer-ring"><div className="timer-ring-inner"><span>{formattedTime}</span><small>{running ? 'REGISTRANDO TIEMPO' : 'LISTO PARA EMPEZAR'}</small></div></div><div className="timer-meta"><span><Coins /> +$ 0,00</span><span><Zap /> +0 XP</span></div></div><div className="timer-actions"><button className="start-button" onClick={running ? () => setRunning(false) : startTask}>{running ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}{running ? 'Pausar' : 'Empezar'}</button><button className="finish-button" onClick={finishTask} disabled={!running}><Check data-icon="inline-start" /> Terminar y cobrar</button></div><div className="timer-tip"><Sparkles /> Tip: las tareas largas dan un 25% más de XP</div></article>

          <article className="daily-panel panel"><div className="panel-heading"><div><p className="eyebrow">RESUMEN DE ACTIVIDAD</p><h2>Tu semana</h2></div><button className="period-button">Esta semana <ChevronDown /></button></div><div className="chart-area"><div className="chart-labels"><span>8h</span><span>6h</span><span>4h</span><span>2h</span><span>0h</span></div><div className="bars">{chart.map((height, i) => <div className="bar-column" key={i}><div className={`bar ${i === 5 || i === 10 ? 'bar-highlight' : ''}`} style={{ height: `${height}%` }} /><span>{['L','M','X','J','V','S','D','L','M','X','J','V','S','D'][i]}</span></div>)}</div><div className="goal-line"><span>Meta diaria 6h</span></div></div><div className="activity-stats"><div><span>TIEMPO TOTAL</span><strong>31h 45m</strong></div><div><span>FACTURABLE</span><strong>84%</strong></div><div><span>TAREAS</span><strong>18</strong></div></div></article>
        </section>

        <section className="recent-section"><div className="section-heading"><div><p className="eyebrow">HISTORIAL RECIENTE</p><h2>Últimos registros</h2></div><button className="link-button" onClick={() => setActiveTab('Tareas')}>Ver todas <span>→</span></button></div><div className="task-list">{tasks.slice(0, 3).map((task) => <div className="task-row" key={task.id}><div className="task-icon" style={{ background: `${task.color}18`, color: task.color }}><Clock3 /></div><div className="task-info"><strong>{task.name}</strong><span><i style={{ background: task.color }} /> {task.client} · {task.project}</span></div><div className="task-tags">{task.tags.map((tag) => <span key={tag}><Tag /> {tag}</span>)}</div><div className="task-duration"><strong>{task.duration}</strong><span>Hoy</span></div><div className="task-money"><strong>{task.amount === '0,00' ? `+${task.xp} XP` : `+$ ${task.amount}`}</strong><span>{task.amount === '0,00' ? 'no facturable' : 'USD'}</span></div><button className="row-more"><MoreHorizontal /></button></div>)}</div><button className="new-task-button" onClick={() => setShowNew(true)}><Plus /> Agregar tarea manual</button></section>
      </div>

      <nav className="bottom-nav" aria-label="Navegación móvil">{[[Clock3,'Inicio'],[CalendarDays,'Tareas'],[BarChart3,'Estadísticas'],[UserRound,'Perfil']].map(([Icon,label]) => <button key={label as string} className={activeTab === label ? 'mobile-active' : ''} onClick={() => setActiveTab(label as string)}><Icon /><span>{label as string}</span></button>)}</nav>
      {showNew && <div className="modal-backdrop" onClick={() => setShowNew(false)}><div className="modal-card" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShowNew(false)}><X /></button><p className="eyebrow">NUEVO REGISTRO</p><h2>Cargar tiempo a mano</h2><p>Sumá una tarea que ya terminaste para no perder ese trabajo.</p><input placeholder="Nombre de la tarea" /><div className="modal-fields"><input type="date" defaultValue="2026-10-19" /><input type="text" placeholder="01:30" /></div><button className="start-button" onClick={() => setShowNew(false)}><Check /> Guardar registro</button></div></div>}
    </main>
  )
}
