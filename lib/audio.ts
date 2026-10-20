// Sonidos generados con Web Audio: sin archivos ni sonidos de terceros.
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  // Los navegadores arrancan el contexto suspendido hasta un gesto del usuario.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(c: AudioContext, freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'triangle') {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

/** Llamar dentro de un handler de click/tap para destrabar el audio en iOS y Chrome. */
export function unlockAudio() {
  getCtx()
}

/** Tintineo de monedas: cada moneda son dos notas agudas rápidas. */
export function playCoins(count = 8, volume = 0.5) {
  const c = getCtx()
  if (!c) return
  const t0 = c.currentTime + 0.02
  const n = Math.min(Math.max(count, 3), 14)
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 0.075 + Math.random() * 0.02
    const base = 1318.5 * (1 + Math.random() * 0.08) // ~E6
    tone(c, base, t, 0.09, volume * 0.35, 'square')
    tone(c, base * 1.5, t + 0.055, 0.28, volume * 0.5, 'triangle')
  }
}

/** Acorde ascendente para subida de nivel o logro. */
export function playLevelUp(volume = 0.5) {
  const c = getCtx()
  if (!c) return
  const t0 = c.currentTime + 0.02
  ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t0 + i * 0.11, 0.45, volume * 0.45))
}

/** Campana corta, para el aviso del temporizador. */
export function playBell(volume = 0.5) {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime + 0.02
  tone(c, 880, t, 1.2, volume * 0.5, 'sine')
  tone(c, 1760, t, 0.8, volume * 0.2, 'sine')
}
