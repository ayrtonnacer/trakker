// Modo foco: sitios que no querés abrir mientras corre el timer. La app no puede bloquear otras
// pestañas; lo hace la extensión de /extension, que lee estos atributos del <html> de la app.

export type Focus = { on: boolean; sites: string[] }
export const DEFAULT_FOCUS: Focus = { on: false, sites: [] }

/** "https://www.youtube.com/watch?v=…" → "youtube.com". Devuelve '' si no parece un dominio. */
export function cleanSite(raw: string) {
  const host = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:\s]/)[0]
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : ''
}

/** Sitios de una lista pegada (uno por línea, o separados por coma o espacio), sin repetir. */
export function parseSites(text: string) {
  return [...new Set(text.split(/[\s,;]+/).map(cleanSite).filter(Boolean))]
}

/** Etapa del arbolito según los minutos de foco, como en Forest. */
export function treeStage(seconds: number): 0 | 1 | 2 {
  return seconds < 10 * 60 ? 0 : seconds < 25 * 60 ? 1 : 2
}
