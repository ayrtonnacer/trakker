const params = new URLSearchParams(location.search)
const site = params.get('site')
if (site) document.getElementById('site').textContent = site
