// Bloquea los sitios con reglas de declarativeNetRequest mientras el timer de la app corre.
// Si se cierra la pestaña de la app, se desbloquea todo.
let appTab = null

async function setBlocked(sites) {
  const old = await chrome.declarativeNetRequest.getDynamicRules()
  const addRules = sites.map((site, i) => ({
    id: i + 1,
    priority: 1,
    action: { type: 'redirect', redirect: { extensionPath: `/blocked.html?site=${encodeURIComponent(site)}` } },
    condition: { urlFilter: `||${site}^`, resourceTypes: ['main_frame'] },
  }))
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map((r) => r.id), addRules })
  await chrome.storage.session.set({ appTab, sites })
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'focus' || !Array.isArray(msg.sites)) return
  appTab = msg.sites.length ? sender.tab?.id ?? null : null
  void setBlocked(msg.sites.filter((s) => typeof s === 'string' && /^[a-z0-9.-]+$/.test(s)))
})

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (appTab === null) appTab = (await chrome.storage.session.get('appTab')).appTab ?? null
  if (tabId === appTab) { appTab = null; void setBlocked([]) }
})

// Al abrir el navegador no queda nada bloqueado de una sesión anterior.
chrome.runtime.onStartup.addListener(() => void setBlocked([]))
