const params = new URLSearchParams(location.search)
const site = params.get('site')
if (site) document.getElementById('site').textContent = site
// Un intento tuyo queda anotado; el que hace la propia extensión al arrancar el timer sobre una pestaña abierta, no.
if (site && !params.get('swept')) chrome.runtime.sendMessage({ type: 'blocked', site })
