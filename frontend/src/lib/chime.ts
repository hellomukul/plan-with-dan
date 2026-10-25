/* A tiny "Dan's here" sparkle, synthesised with Web Audio (no sound file to load). Quiet, under half a second,
   and only ever played right after a click, so browsers allow it and it never surprises anyone. */
let ctx: AudioContext | null = null

export function playChime(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx = ctx ?? new Ctor()
    const now = ctx.currentTime
    ;[880, 1174.66, 1567.98, 2093].forEach((freq, i) => {  // A5, D6, G6, C7: a rising sparkle
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = now + i * 0.07
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.06, t + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(t)
      osc.stop(t + 0.4)
    })
  } catch { /* sound is a nice-to-have */ }
}
