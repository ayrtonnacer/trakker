// Popup: iniciar y parar el timer de Tasker CRM desde cualquier pestaña.
// La app vive en una pestaña; el popup le pide el estado y le manda comandos a través de content.js.
const root = document.getElementById('root')
const $ = (tag, props = {}, ...kids) => {
  const el = Object.assign(document.createElement(tag), props)
  kids.flat().forEach((k) => el.append(k))
  return el
}
const fmtClock = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const fmtHours = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m` }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let app = { tab: null, state: null, origin: null, cached: null }
let tick = null
let message = ''

async function find() {
  const { appOrigin, lastState } = await chrome.storage.local.get(['appOrigin', 'lastState'])
  app = { tab: null, state: null, origin: appOrigin || null, cached: lastState || null }
  if (!appOrigin) return
  const u = new URL(appOrigin)
  const tabs = await chrome.tabs.query({ url: `${u.protocol}//${u.hostname}/*` })
  for (const tab of tabs.filter((t) => t.url?.startsWith(appOrigin))) {
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: 'getState' })
      if (r?.state) { app.tab = tab; app.state = r.state; return }
    } catch { /* esa pestaña no tiene la extensión conectada: se prueba la siguiente */ }
  }
}

async function send(cmd) {
  message = ''
  try { await chrome.tabs.sendMessage(app.tab.id, { type: 'cmd', cmd }) } catch { message = 'No pude hablar con la app. Refrescá su pestaña.' }
  // Se espera a que la app refleje el cambio.
  for (let i = 0; i < 16; i++) {
    await wait(250)
    await find()
    if (app.state && app.state.running === (cmd.type === 'start')) break
  }
  render()
}

async function openApp() {
  message = 'Abriendo Tasker CRM…'
  render()
  await chrome.tabs.create({ url: app.origin, active: false, pinned: true })
  for (let i = 0; i < 20 && !app.tab; i++) { await wait(500); await find() }
  message = app.tab ? '' : 'No se conectó. Abrí Tasker CRM y refrescalo (Ctrl+R).'
  render()
}

async function render() {
  clearInterval(tick)
  const { log = [] } = await chrome.storage.local.get('log')
  const midnight = new Date().setHours(0, 0, 0, 0)
  const attempts = log.filter((d) => d.t >= midnight).length
  const s = app.state
  root.replaceChildren()

  if (!app.origin) {
    root.append($('div', { className: 'box' }, 'Abrí Tasker CRM una vez con esta extensión instalada (y refrescá la página) para conectarla.'))
    return
  }
  if (!s) {
    root.append($('div', { className: 'box' }, 'La app no está abierta en ningún pestaña conectada. ', app.cached ? `Hoy llevabas ${fmtHours(app.cached.todaySeconds)}.` : ''))
    root.append($('button', { className: 'primary', textContent: 'Abrir Tasker CRM en segundo plano', onclick: openApp }))
    if (message) root.append($('div', { className: 'muted', textContent: message }))
    return
  }

  const project = s.projects.find((p) => p.id === s.projectId)
  if (s.running) {
    const clock = $('div', { className: 'clock' })
    const paint = () => { clock.textContent = fmtClock(s.base + (Date.now() - s.startedAt) / 1000) }
    paint(); tick = setInterval(paint, 500)
    root.append(
      $('div', {}, $('div', { className: 'name', textContent: s.name || 'Tarea sin título' }), project ? $('span', { className: 'chip' }, $('i', { className: 'dot', style: `background:${project.color}` }), `${project.name} · ${project.client}`) : ''),
      clock,
      $('div', { className: 'row' }, $('button', { className: 'primary stop', textContent: 'Terminar y registrar', onclick: () => send({ type: 'stop' }) })),
    )
  } else {
    const name = $('input', { placeholder: '¿En qué estás trabajando?', maxLength: 140, value: s.name || '' })
    const sel = $('select', {})
    const groups = new Map()
    s.projects.forEach((p) => groups.set(p.client, [...(groups.get(p.client) || []), p]))
    sel.append($('option', { value: '', textContent: 'Elegí un proyecto' }))
    groups.forEach((list, client) => { const g = $('optgroup', { label: client }); list.forEach((p) => g.append($('option', { value: p.id, textContent: p.name }))); sel.append(g) })
    const { lastProject } = await chrome.storage.local.get('lastProject')
    sel.value = s.projectId && s.projects.some((p) => p.id === s.projectId) ? s.projectId : s.projects.some((p) => p.id === lastProject) ? lastProject : ''
    const go = $('button', { className: 'primary', textContent: '▶ Empezar', disabled: !sel.value })
    sel.onchange = () => { go.disabled = !sel.value }
    const start = (n, pid) => { chrome.storage.local.set({ lastProject: pid }); void send({ type: 'start', name: n, projectId: pid }) }
    go.onclick = () => start(name.value.trim(), sel.value)
    name.onkeydown = (e) => { if (e.key === 'Enter' && sel.value) go.click() }
    root.append(name, sel, $('div', { className: 'row' }, go))
    if (!s.projects.length) root.append($('div', { className: 'muted', textContent: 'Todavía no tenés proyectos: creá uno en la app.' }))
    if (s.recent.length) {
      root.append($('div', { className: 'recent' }, $('h3', { textContent: 'Recientes' }), s.recent.map((r) => {
        const p = s.projects.find((x) => x.id === r.projectId)
        return $('button', { onclick: () => start(r.name, r.projectId), title: 'Empezar de nuevo' }, $('span', { textContent: r.name }), $('span', { className: 'chip' }, $('i', { className: 'dot', style: `background:${p?.color || '#999'}` }), p?.name || '', ' ▶'))
      })))
    }
    setTimeout(() => name.focus(), 30)
  }
  if (message) root.append($('div', { className: 'err', textContent: message }))
  root.append($('div', { className: 'foot' }, $('span', {}, 'Hoy ', $('b', { textContent: fmtHours(s.todaySeconds + (s.running ? s.base + (Date.now() - s.startedAt) / 1000 : 0)) })), attempts ? $('span', { textContent: `${attempts} intento${attempts === 1 ? '' : 's'} de distraerte` }) : ''))
}

document.getElementById('open').onclick = async (e) => {
  e.preventDefault()
  if (app.tab) { await chrome.tabs.update(app.tab.id, { active: true }); await chrome.windows.update(app.tab.windowId, { focused: true }) }
  else if (app.origin) await chrome.tabs.create({ url: app.origin })
  window.close()
}

// Se mantiene al día: si el timer cambia en la app (o tarda en reflejar un comando), el popup lo muestra solo.
let busy = false
setInterval(async () => {
  if (busy || document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return
  busy = true
  const before = JSON.stringify([app.state?.running, app.state?.name, app.state?.projectId, app.state?.todaySeconds, !!app.tab])
  await find()
  if (before !== JSON.stringify([app.state?.running, app.state?.name, app.state?.projectId, app.state?.todaySeconds, !!app.tab])) await render()
  busy = false
}, 1000)

find().then(render)
