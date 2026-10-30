// Corre en la app. Sólo actúa si la página es Tasker CRM (tiene <meta name="tasker-crm">).
if (document.querySelector('meta[name="tasker-crm"]')) {
  const html = document.documentElement
  let last = ''
  const send = () => {
    const on = html.dataset.focus === 'on'
    const sites = on ? (html.dataset.focusSites || '').split(',').filter(Boolean) : []
    const key = sites.join(',')
    if (key === last) return
    last = key
    chrome.runtime.sendMessage({ type: 'focus', sites })
  }
  new MutationObserver(send).observe(html, { attributes: true, attributeFilter: ['data-focus', 'data-focus-sites'] })
  send()
}
