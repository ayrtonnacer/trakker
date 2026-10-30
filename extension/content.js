// Se inyecta en cualquier página, pero sólo actúa en Tasker CRM (tiene <meta name="tasker-crm">).
// Le avisa a la app que la extensión está instalada (data-focus-ext) y le pasa al fondo los sitios a bloquear.
if (document.querySelector('meta[name="tasker-crm"]')) {
  const html = document.documentElement
  html.dataset.focusExt = chrome.runtime.getManifest().version
  let last = null
  const send = () => {
    const sites = html.dataset.focus === 'on' ? (html.dataset.focusSites || '').split(',').filter(Boolean) : []
    const key = sites.join(',')
    if (key === last) return
    last = key
    try { chrome.runtime.sendMessage({ type: 'focus', sites }) } catch { /* la extensión se recargó: hay que refrescar la página */ }
  }
  new MutationObserver(send).observe(html, { attributes: true, attributeFilter: ['data-focus', 'data-focus-sites'] })
  send()
}
