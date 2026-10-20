// Sonidos sintetizados con Web Audio (sin archivos ni sonidos de terceros).
// Una moneda real no suena como una nota: es un golpe metálico con armónicos
// inarmónicos que decaen rápido, más un "clic" de ruido en el ataque.
let ctx: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    ctx = new Ctor()
    // Compresor + ganancia general: sube el volumen percibido sin distorsionar.
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 12
    comp.ratio.value = 5
    comp.attack.value = 0.003
    comp.release.value = 0.2
    master = ctx.createGain()
    master.gain.value = 1.6
    master.connect(comp).connect(ctx.destination)
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  // Los navegadores arrancan el contexto suspendido hasta un gesto del usuario.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Llamar dentro de un handler de click/tap para destrabar el audio en iOS y Chrome. */
export function unlockAudio() {
  getCtx()
}

function burst(c: AudioContext, t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1, sweepTo?: number) {
  const src = c.createBufferSource()
  src.buffer = noise
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.setValueAtTime(freq, t)
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master!)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.02)
}

function partial(c: AudioContext, freq: number, t: number, decay: number, vol: number) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  o.connect(g).connect(master!)
  o.start(t)
  o.stop(t + decay + 0.03)
}

/** Un golpe de moneda contra otras monedas. vel: 0..1 */
function clink(c: AudioContext, t: number, vel: number) {
  const f0 = 1900 + Math.random() * 1500
  // Relaciones inarmónicas típicas de metal golpeado.
  const ratios = [1, 2.32, 3.87, 5.41, 7.13]
  ratios.forEach((r, i) => partial(c, f0 * r, t, 0.35 / (1 + i * 0.7) + Math.random() * 0.1, (vel * 0.22) / (1 + i * 0.8)))
  burst(c, t, 0.02, vel * 0.5, 'highpass', 4500, 0.7) // chasquido del ataque
}

/** Golpe grave y seco de monedas cayendo sobre la pila. */
function thud(c: AudioContext, t: number, vel: number) {
  burst(c, t, 0.07, vel * 0.5, 'bandpass', 700 + Math.random() * 500, 1.2)
}

/** Caja registradora: "ka" mecánico, campanilla "ching" y cajón que se abre. */
function register(c: AudioContext, t: number) {
  // ka: golpe grave + chasquido mecánico
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(190, t)
  o.frequency.exponentialRampToValueAtTime(55, t + 0.12)
  g.gain.setValueAtTime(0.9, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
  o.connect(g).connect(master!)
  o.start(t)
  o.stop(t + 0.2)
  burst(c, t, 0.05, 0.9, 'bandpass', 1800, 0.9)
  // ching: campanilla con parciales brillantes y cola larga
  const tb = t + 0.14
  ;[[2637, 1.5, 0.5], [3951, 1.1, 0.34], [5274, 0.8, 0.24], [7040, 0.5, 0.14], [2650, 1.6, 0.3]].forEach(([f, d, v]) => partial(c, f, tb, d, v))
  burst(c, tb, 0.025, 0.5, 'highpass', 5000)
  // cajón: barrido de ruido deslizante y tope final
  burst(c, t + 0.3, 0.32, 0.22, 'bandpass', 500, 0.8, 1600)
  burst(c, t + 0.62, 0.08, 0.45, 'lowpass', 600)
}

/**
 * Cascada de monedas: caja registradora + lluvia de monedas que cae sobre una pila.
 * intensity: cantidad de monedas en pantalla (más monedas = cascada más larga y densa).
 */
export function playCoins(intensity = 60, volume = 0.9) {
  const c = getCtx()
  if (!c || !master) return
  master.gain.value = 1.2 + volume
  const t0 = c.currentTime + 0.03
  register(c, t0)
  const hits = Math.min(70, Math.max(22, Math.round(intensity * 0.55)))
  const span = 1.5 + Math.min(1.2, intensity / 100)
  for (let i = 0; i < hits; i++) {
    // Más densidad al principio, se espacia al final.
    const p = Math.pow(i / hits, 1.5)
    const t = t0 + 0.35 + p * span + Math.random() * 0.03
    const vel = (0.45 + Math.random() * 0.55) * (1 - p * 0.45)
    clink(c, t, vel)
    if (i % 3 === 0) thud(c, t + 0.015, vel * 0.6)
  }
}

/** Acorde ascendente brillante para subida de nivel o logro. */
export function playLevelUp(volume = 0.9) {
  const c = getCtx()
  if (!c || !master) return
  master.gain.value = 1.2 + volume
  const t0 = c.currentTime + 0.02
  ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
    partial(c, f, t0 + i * 0.1, 0.9, 0.3)
    partial(c, f * 2, t0 + i * 0.1, 0.5, 0.1)
  })
}

/** Campana corta, para el aviso del temporizador. */
export function playBell(volume = 0.9) {
  const c = getCtx()
  if (!c || !master) return
  master.gain.value = 1.2 + volume
  const t = c.currentTime + 0.02
  ;[880, 1760, 2640].forEach((f, i) => partial(c, f, t, 1.6 / (1 + i * 0.5), 0.4 / (1 + i)))
}
