// Bloquea los sitios mientras corre el timer de la app. Si se cierra la pestaña de la app, se desbloquea todo.
// Cubre las dos formas de llegar a un sitio: abrirlo de nuevo (regla de red) y tenerlo ya abierto (se recorren las pestañas).
const BLOCKED = chrome.runtime.getURL('blocked.html')
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase() } catch { return '' } }
const siteFor = (url, sites) => sites.find((s) => { const h = hostOf(url); return h === s || h.endsWith(`.${s}`) })
const backOf = (url) => { const i = url.indexOf('&back='); return i >= 0 ? url.slice(i + 6) : '' }

let appTab = null

async function apply(sites) {
  const old = await chrome.declarativeNetRequest.getDynamicRules()
  // \0 es la dirección completa a la que iba: la pantalla de bloqueo la guarda para volver al desbloquear.
  const addRules = sites.map((site, i) => ({
    id: i + 1,
    priority: 1,
    action: { type: 'redirect', redirect: { regexSubstitution: `${BLOCKED}?site=${encodeURIComponent(site)}&back=\\0` } },
    condition: { regexFilter: `^https?://([^/?#]+\\.)?${esc(site)}([:/?#].*)?$`, resourceTypes: ['main_frame'], isUrlFilterCaseSensitive: false },
  }))
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map((r) => r.id), addRules })
  await chrome.storage.session.set({ appTab, sites })

  for (const tab of await chrome.tabs.query({})) {
    if (!tab.url || tab.id === undefined || tab.id === appTab) continue
    if (tab.url.startsWith(BLOCKED)) {
      // Pantalla de bloqueo de un sitio que ya no está en la lista (o todo se desbloqueó): se vuelve a donde iba.
      const site = new URL(tab.url).searchParams.get('site')
      const back = backOf(tab.url)
      if (back && /^https?:/.test(back) && !sites.includes(site)) await chrome.tabs.update(tab.id, { url: back }).catch(() => {})
    } else if (/^https?:/.test(tab.url)) {
      // Sitio ya abierto antes de empezar: las reglas de red sólo ven las navegaciones nuevas.
      const site = siteFor(tab.url, sites)
      if (site) await chrome.tabs.update(tab.id, { url: `${BLOCKED}?site=${encodeURIComponent(site)}&back=${tab.url}` }).catch(() => {})
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'focus' || !Array.isArray(msg.sites)) return
  const sites = msg.sites.filter((s) => typeof s === 'string' && /^[a-z0-9.-]+$/.test(s))
  appTab = sites.length ? sender.tab?.id ?? null : null
  void apply(sites)
})

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (appTab === null) appTab = (await chrome.storage.session.get('appTab')).appTab ?? null
  if (tabId === appTab) { appTab = null; void apply([]) }
})

// Al instalar, actualizar o abrir el navegador no queda nada bloqueado de antes.
chrome.runtime.onInstalled.addListener(() => void apply([]))
chrome.runtime.onStartup.addListener(() => void apply([]))
