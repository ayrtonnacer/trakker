// Sonido de refuerzo al terminar una tarea. Se sintetiza con Web Audio: no hay archivos que bajar.

/** Notas del campanazo: un arpegio de do mayor que sube, como al subir de nivel. */
export const CHIME = [
  { hz: 523.25, at: 0, len: 0.22 },
  { hz: 659.25, at: 0.09, len: 0.22 },
  { hz: 783.99, at: 0.18, len: 0.22 },
  { hz: 1046.5, at: 0.3, len: 0.7 },
]

let ctx: AudioContext | null = null

function audio() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx ??= new AC()
  return ctx
}

/** El navegador sólo deja sonar después de un gesto del usuario: se llama en el primer clic o tecla. */
export function unlockAudio() {
  const c = audio()
  if (c && c.state === 'suspended') void c.resume()
}

export function playChime(volume = 0.16) {
  const c = audio()
  if (!c) return
  if (c.state === 'suspended') void c.resume()
  const t0 = c.currentTime + 0.02
  for (const n of CHIME) {
    // Una senoidal con un armónico suave encima suena a campanita y no a pitido.
    for (const [mult, gain] of [[1, 1], [2, 0.25]] as const) {
      const osc = c.createOscillator()
      const amp = c.createGain()
      osc.type = 'sine'
      osc.frequency.value = n.hz * mult
      const start = t0 + n.at
      amp.gain.setValueAtTime(0.0001, start)
      amp.gain.exponentialRampToValueAtTime(volume * gain, start + 0.015)
      amp.gain.exponentialRampToValueAtTime(0.0001, start + n.len)
      osc.connect(amp).connect(c.destination)
      osc.start(start)
      osc.stop(start + n.len + 0.05)
    }
  }
}
