// Se inyecta en cualquier página, pero sólo actúa en Tasker CRM (tiene <meta name="tasker-crm">).
// La app y la extensión se hablan por el DOM de la página:
//   app → extensión: data-focus (sitios a bloquear) y data-tasker-state (timer, proyectos, recientes)
//   extensión → app: data-focus-ext (versión), data-focus-log (intentos bloqueados) y mensajes de comando
if (document.querySelector('meta[name="tasker-crm"]')) {
  const html = document.documentElement
  html.dataset.focusExt = chrome.runtime.getManifest().version
  const safe = (fn) => { try { fn() } catch { /* la extensión se recargó: hay que refrescar la página */ } }

  let lastSites = null
  const sendFocus = () => {
    const sites = html.dataset.focus === 'on' ? (html.dataset.focusSites || '').split(',').filter(Boolean) : []
    const key = sites.join(',')
    if (key === lastSites) return
    lastSites = key
    safe(() => chrome.runtime.sendMessage({ type: 'focus', sites }))
  }

  let lastState = ''
  const sendState = () => {
    const raw = html.dataset.taskerState
    if (!raw || raw === lastState) return
    lastState = raw
    safe(() => chrome.runtime.sendMessage({ type: 'state', state: JSON.parse(raw), origin: location.origin }))
  }

  const sendLog = () => safe(() => chrome.storage.local.get('log', ({ log }) => { html.dataset.focusLog = JSON.stringify((log || []).slice(-1000)) }))

  new MutationObserver(() => { sendFocus(); sendState() }).observe(html, { attributes: true, attributeFilter: ['data-focus', 'data-focus-sites', 'data-tasker-state'] })
  safe(() => chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.log) sendLog() }))

  // El popup pide el estado y manda comandos.
  safe(() => chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'getState') {
      try { reply({ state: html.dataset.taskerState ? JSON.parse(html.dataset.taskerState) : null }) } catch { reply({ state: null }) }
    } else if (msg?.type === 'cmd') {
      window.postMessage({ tasker: 'cmd', cmd: msg.cmd }, location.origin)
      reply({ ok: true })
    }
  }))

  sendFocus(); sendState(); sendLog()
  safe(() => chrome.runtime.sendMessage({ type: 'hello', origin: location.origin }))
}
