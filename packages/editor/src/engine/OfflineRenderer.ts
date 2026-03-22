import { WavEncoder } from './WavEncoder'
import { noteToMidi } from './noteToMidi'

/**
 * Offline renderer — processes a Strudel pattern at CPU speed via OfflineAudioContext.
 * Completely isolated from the live AudioContext — safe to call while playing.
 *
 * Implementation: queries the pattern arc directly and renders each note using
 * native WebAudio oscillators. This avoids touching superdough's global context.
 *
 * LIMITATION: Only oscillator-based sounds work (sine, sawtooth, square, triangle).
 * Sample-based sounds (bd, sd, hh, etc.) are silently skipped because AudioWorklets
 * cannot be re-registered in a fresh OfflineAudioContext.
 */
export class OfflineRenderer {
  static async render(
    code: string,
    duration: number,
    sampleRate: number
  ): Promise<Blob> {
    // Register Strudel globals without affecting the live audio graph
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mini = await import('@strudel/mini') as any
    mini.miniAllStrings()
    await import('@strudel/tonal')
    const { evaluate } = await import('@strudel/core')
    const { transpiler } = await import('@strudel/transpiler')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await evaluate(code, transpiler as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pattern = result.pattern as any
    if (!pattern) {
      throw new Error('OfflineRenderer: no pattern returned from evaluate()')
    }

    // Extract cps from the code (setcps(120/240) → 0.5)
    const cps = extractCps(code)

    const numFrames = Math.ceil(duration * sampleRate)
    const offlineCtx = new OfflineAudioContext(2, numFrames, sampleRate)

    // Query all haps in the duration window
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const haps: any[] = pattern.queryArc(0, duration * cps)

    for (const hap of haps) {
      // Only render onset haps (not continuation events)
      if (typeof hap.hasOnset === 'function' && !hap.hasOnset()) continue

      const startCycle: number = hap.whole?.begin?.valueOf() ?? hap.part?.begin?.valueOf() ?? 0
      const endCycle: number = hap.whole?.end?.valueOf() ?? hap.part?.end?.valueOf() ?? startCycle + 1
      const startTime = startCycle / cps
      const endTime = endCycle / cps

      if (startTime >= duration) continue

      const s: string = hap.value?.s ?? 'sine'
      const oscType = toOscType(s)
      if (!oscType) continue  // skip sample-based sounds

      const midi = noteToMidi(hap.value?.note ?? hap.value?.n)
      if (midi === null) continue

      const freq = midiToFreq(midi)
      const gain: number = Math.min(1, Math.max(0, hap.value?.gain ?? 0.7))
      const release: number = Math.min(hap.value?.release ?? 0.1, endTime - startTime)

      renderNote(offlineCtx, oscType, freq, gain, release, startTime, Math.min(endTime, duration))
    }

    const audioBuffer = await offlineCtx.startRendering()
    return WavEncoder.encode(audioBuffer)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractCps(code: string): number {
  // Matches: setcps(120/240) or setcps(0.5) or setcps(2)
  const m = code.match(/setcps\s*\(\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/)
  if (!m) return 1
  const num = parseFloat(m[1])
  const den = m[2] ? parseFloat(m[2]) : 1
  return den > 0 ? num / den : 1
}

function toOscType(s: string): OscillatorType | null {
  const norm = s.toLowerCase().replace(/:\d+$/, '')
  if (norm === 'sine') return 'sine'
  if (norm === 'sawtooth' || norm === 'saw') return 'sawtooth'
  if (norm === 'square') return 'square'
  if (norm === 'triangle' || norm === 'tri') return 'triangle'
  return null  // percussion / sample-based — skip
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function renderNote(
  ctx: OfflineAudioContext,
  oscType: OscillatorType,
  freq: number,
  gain: number,
  release: number,
  startTime: number,
  endTime: number
): void {
  const osc = ctx.createOscillator()
  osc.type = oscType
  osc.frequency.value = freq

  const gainNode = ctx.createGain()
  gainNode.gain.setValueAtTime(gain, startTime)
  gainNode.gain.setValueAtTime(gain, Math.max(startTime, endTime - release))
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endTime)

  osc.connect(gainNode)
  gainNode.connect(ctx.destination)

  osc.start(startTime)
  osc.stop(endTime + 0.001)
}
