// Popup: lo mismo que la caja del timer de la app (nombre, Task ID, memo, etiquetas, facturable, por hacer, rutinas)
// desde cualquier pestaña. La app vive en una pestaña; el popup le pide el estado y le manda comandos a través de content.js.
const root = document.getElementById('root')
const $ = (tag, props = {}, ...kids) => {
  const el = Object.assign(document.createElement(tag), props)
  kids.flat().forEach((k) => el.append(k))
  return el
}
const fmtClock = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const fmtHours = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m` }
const looksLikeId = (t) => { t = t.trim(); return t.length >= 8 && t.length <= 80 && !/\s/.test(t) && /\d/.test(t) && /^[\w-]+$/.test(t) }
const shortRef = (r) => (r.length > 10 ? `${r.slice(0, 8)}…` : r)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let app = { tab: null, state: null, origin: null, cached: null }
let tick = null
let message = ''
// Lo que se está escribiendo para una tarea nueva: sobrevive a los redibujos del popup.
const form = { name: '', ref: '', tags: '', note: '', projectId: null, billable: null, noteOpen: false }
const resetForm = () => Object.assign(form, { name: '', ref: '', tags: '', note: '', billable: null, noteOpen: false })

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

const post = (cmd) => chrome.tabs.sendMessage(app.tab.id, { type: 'cmd', cmd })

/** Manda un comando y espera a que la app lo refleje (la pestaña puede tardar si está en segundo plano). */
async function send(cmd, done) {
  message = ''
  try { await post(cmd) } catch { message = 'No pude hablar con la app. Refrescá su pestaña.' }
  for (let i = 0; i < 16; i++) {
    await wait(250)
    await find()
    if (!app.state || done(app.state)) break
  }
  render()
}

// Cambios sobre la tarea en curso: se juntan unos instantes para no mandar una tecla a la vez.
let pending = {}
let pendingTimer = null
function flush() {
  clearTimeout(pendingTimer)
  if (!Object.keys(pending).length || !app.tab) return
  const patch = pending
  pending = {}
  post({ type: 'update', ...patch }).catch(() => {})
}
function queue(patch) {
  Object.assign(pending, patch)
  clearTimeout(pendingTimer)
  pendingTimer = setTimeout(flush, 300)
}
window.addEventListener('pagehide', flush)

async function openApp() {
  message = 'Abriendo Tasker CRM…'
  render()
  await chrome.tabs.create({ url: app.origin, active: false, pinned: true })
  for (let i = 0; i < 20 && !app.tab; i++) { await wait(500); await find() }
  message = app.tab ? '' : 'No se conectó. Abrí Tasker CRM y refrescalo (Ctrl+R).'
  render()
}

const dot = (color) => $('i', { className: 'dot', style: `background:${color || '#999'}` })

function projectSelect(s, value, onChange) {
  const sel = $('select', { 'aria-label': 'Proyecto' })
  const groups = new Map()
  s.projects.forEach((p) => groups.set(p.client, [...(groups.get(p.client) || []), p]))
  sel.append($('option', { value: '', textContent: 'Elegí un proyecto' }))
  groups.forEach((list, client) => { const g = $('optgroup', { label: client }); list.forEach((p) => g.append($('option', { value: p.id, textContent: p.name }))); sel.append(g) })
  sel.value = s.projects.some((p) => p.id === value) ? value : ''
  sel.onchange = () => onChange(sel.value)
  return sel
}

function billableButton(project, on, onToggle) {
  if (!project || !project.canBill) return ''
  const b = $('button', { type: 'button', className: `toggle ${on ? 'on' : ''}`, textContent: '$', title: on ? 'Facturable' : 'No facturable', 'aria-pressed': String(on), 'aria-label': 'Facturable' })
  b.onclick = () => { const next = !b.classList.contains('on'); b.classList.toggle('on', next); b.title = next ? 'Facturable' : 'No facturable'; onToggle(next) }
  return b
}

const field = (label, el) => $('label', { className: 'field' }, $('span', { textContent: label }), el)

async function render() {
  clearInterval(tick)
  const { log = [] } = await chrome.storage.local.get('log')
  const attempts = log.filter((d) => d.t >= new Date().setHours(0, 0, 0, 0)).length
  const s = app.state
  root.replaceChildren()

  if (!app.origin) {
    root.append($('div', { className: 'box' }, 'Abrí Tasker CRM una vez con esta extensión instalada (y refrescá la página) para conectarla.'))
    return
  }
  if (!s) {
    root.append($('div', { className: 'box' }, 'La app no está abierta en ninguna pestaña conectada. ', app.cached ? `Hoy llevabas ${fmtHours(app.cached.todaySeconds)}.` : ''))
    root.append($('button', { className: 'primary', textContent: 'Abrir Tasker CRM en segundo plano', onclick: openApp }))
    if (message) root.append($('div', { className: 'muted', textContent: message }))
    return
  }

  const projectOf = (id) => s.projects.find((p) => p.id === id)
  const backlog = s.backlog || []
  const routines = s.routines || []

  if (s.running) {
    // Tarea en curso: se puede completar lo mismo que en la app mientras corre.
    const clock = $('div', { className: 'clock' })
    const paint = () => { clock.textContent = fmtClock(s.base + (Date.now() - s.startedAt) / 1000) }
    paint(); tick = setInterval(paint, 500)
    const name = $('input', { placeholder: 'Nombre de la tarea', maxLength: 140, value: s.name || '', oninput: () => queue({ name: name.value }) })
    const ref = $('input', { className: 'mono', placeholder: 'Task ID', maxLength: 80, value: s.ref || '', oninput: () => queue({ ref: ref.value }) })
    const tags = $('input', { placeholder: 'Etiquetas (coma)', maxLength: 200, value: s.tags || '', oninput: () => queue({ tags: tags.value }) })
    const note = $('textarea', { rows: 4, placeholder: 'Memo: indicaciones, qué hiciste, lo que falta…', maxLength: 20000, value: s.note || '', oninput: () => queue({ note: note.value }) })
    const sel = projectSelect(s, s.projectId, (id) => { flush(); void post({ type: 'update', projectId: id }) })
    root.append(
      clock,
      name,
      $('div', { className: 'row' }, sel, billableButton(projectOf(s.projectId), s.billable, (on) => queue({ billable: on }))),
      $('div', { className: 'row' }, ref, tags),
      note,
      $('div', { className: 'row' },
        $('button', { className: 'primary stop', textContent: 'Terminar y registrar', onclick: async () => { flush(); await send({ type: 'stop' }, (st) => !st.running) } }),
        $('button', { className: 'ghost', textContent: 'Descartar', title: 'Descartar sin registrar el tiempo', onclick: async () => { if (confirm('¿Descartar la tarea en curso sin registrar el tiempo?')) await send({ type: 'discard' }, (st) => !st.running) } })),
    )
  } else {
    if (!projectOf(form.projectId)) form.projectId = projectOf(s.projectId) ? s.projectId : projectOf((await chrome.storage.local.get('lastProject')).lastProject) ? (await chrome.storage.local.get('lastProject')).lastProject : null
    const project = () => projectOf(form.projectId)
    const billableNow = () => form.billable ?? project()?.billableDefault ?? false

    const name = $('input', { placeholder: '¿En qué estás trabajando? Nombre o Task ID', maxLength: 140, value: form.name, oninput: () => { form.name = name.value } })
    const ref = $('input', { className: 'mono', placeholder: 'Task ID', maxLength: 80, value: form.ref, oninput: () => { form.ref = ref.value } })
    // Igual que en la app: un ID pegado en la caja del nombre pasa a ser el Task ID.
    name.onpaste = (e) => {
      const t = (e.clipboardData.getData('text') || '').trim()
      if (!name.value.trim() && !form.ref && looksLikeId(t)) { e.preventDefault(); form.ref = t; ref.value = t }
    }
    const tags = $('input', { placeholder: 'Etiquetas (coma)', maxLength: 200, value: form.tags, oninput: () => { form.tags = tags.value } })
    const note = $('textarea', { rows: 3, placeholder: 'Memo: indicaciones de la tarea o qué hiciste…', maxLength: 20000, value: form.note, oninput: () => { form.note = note.value } })
    const sel = projectSelect(s, form.projectId, (id) => { form.projectId = id || null; form.billable = null; void render() })
    const go = $('button', { className: 'primary', textContent: '▶ Empezar', onclick: async () => {
      if (!form.projectId) { message = 'Elegí un proyecto: cada tarea va a una plataforma o a Personal.'; return render() }
      chrome.storage.local.set({ lastProject: form.projectId })
      const cmd = { type: 'start', name: form.name.trim(), ref: form.ref.trim(), tags: form.tags, note: form.note, projectId: form.projectId, billable: billableNow() }
      resetForm()
      await send(cmd, (st) => st.running)
    } })
    const later = $('button', { className: 'ghost', textContent: '+ Por hacer', title: 'Guardar en el backlog para hacerla después', onclick: async () => {
      if (!form.name.trim() && !form.ref.trim()) { message = 'Escribí un nombre o Task ID.'; return render() }
      const cmd = { type: 'later', name: form.name.trim(), ref: form.ref.trim(), note: form.note, projectId: form.projectId }
      resetForm()
      try { await post(cmd); message = 'Guardada en “Por hacer”.' } catch { message = 'No pude hablar con la app. Refrescá su pestaña.' }
      await wait(400)
      await find()
      render()
    } })
    name.onkeydown = (e) => { if (e.key === 'Enter') go.click() }

    root.append(
      name,
      $('div', { className: 'row' }, sel, billableButton(project(), billableNow(), (on) => { form.billable = on })),
      $('div', { className: 'row' }, ref, tags),
    )
    if (form.noteOpen || form.note) root.append(note)
    else root.append($('button', { className: 'link', textContent: '+ Agregar memo', onclick: () => { form.noteOpen = true; void render().then(() => root.querySelector('textarea')?.focus()) } }))
    root.append($('div', { className: 'row' }, go, later))

    // Atajos: lo que hay por hacer, las rutinas de hoy y lo reciente. Cada uno arranca con su proyecto, memo y etiquetas.
    const pickProject = () => (form.projectId ? { projectId: form.projectId } : {})
    const needProject = (item) => !item.projectId && !form.projectId
    const list = (title, items, start) => items.length ? $('div', { className: 'recent' }, $('h3', { textContent: title }), items.map((it) => {
      const p = projectOf(it.projectId)
      return $('button', { type: 'button', title: it.note || 'Empezar', onclick: () => { if (needProject(it)) { message = 'Elegí un proyecto arriba para esta tarea.'; return void render() } resetForm(); void start(it) } },
        $('span', { textContent: it.text || it.name }), $('span', { className: 'chip' }, p ? [dot(p.color), p.name] : '', ' ▶'))
    })) : ''
    root.append(
      list('Por hacer', backlog, (it) => send({ type: 'startPlan', id: it.id, ...pickProject() }, (st) => st.running)),
      list('Rutinas de hoy', routines, (it) => send({ type: 'startRoutine', id: it.id, ...pickProject() }, (st) => st.running)),
      list('Recientes', s.recent.map((r) => ({ ...r, text: r.name })), (it) => send({ type: 'start', name: it.name, projectId: it.projectId }, (st) => st.running)),
    )
    if (!s.projects.length) root.append($('div', { className: 'muted', textContent: 'Todavía no tenés proyectos: creá uno en la app.' }))
    setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) name.focus() }, 30)
  }
  if (message) root.append($('div', { className: message.startsWith('Guardada') ? 'ok' : 'err', textContent: message }))
  root.append($('div', { className: 'foot' }, $('span', {}, 'Hoy ', $('b', { textContent: fmtHours(s.todaySeconds + (s.running ? s.base + (Date.now() - s.startedAt) / 1000 : 0)) })), attempts ? $('span', { textContent: `${attempts} intento${attempts === 1 ? '' : 's'} de distraerte` }) : ''))
}

document.getElementById('open').onclick = async (e) => {
  e.preventDefault()
  if (app.tab) { await chrome.tabs.update(app.tab.id, { active: true }); await chrome.windows.update(app.tab.windowId, { focused: true }) }
  else if (app.origin) await chrome.tabs.create({ url: app.origin })
  window.close()
}

// Se mantiene al día: si el timer cambia en la app (o tarda en reflejar un comando), el popup lo muestra solo.
// No redibuja mientras estás escribiendo, para no pisar lo que tipeás.
let busy = false
const sig = () => JSON.stringify([app.state?.running, app.state?.todaySeconds, !!app.tab, app.state?.backlog?.length, app.state?.routines?.length, app.state?.projects?.length])
setInterval(async () => {
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)
  if (busy || typing || Object.keys(pending).length) return
  busy = true
  const before = sig()
  await find()
  if (before !== sig()) await render()
  busy = false
}, 1000)

find().then(render)
