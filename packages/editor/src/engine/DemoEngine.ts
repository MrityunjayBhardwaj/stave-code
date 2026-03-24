import { HapStream } from './HapStream'
import type { LiveCodingEngine, EngineComponents } from './LiveCodingEngine'

/**
 * Minimal LiveCodingEngine implementation using Web Audio directly.
 * Proves the engine protocol works for non-Strudel engines.
 *
 * Parses a simple format:
 *   note: c4 e4 g4    (space-separated note names)
 *   viz: scope         (optional inline viz request)
 *
 * Provides streaming + audio + inlineViz components. Does NOT provide queryable,
 * which validates that VizPicker correctly disables pianoroll/wordfall.
 */
export class DemoEngine implements LiveCodingEngine {
  private audioCtx: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private hapStream = new HapStream()
  private oscillator: OscillatorNode | null = null
  private gainNode: GainNode | null = null
  private initialized = false
  private playing = false
  private runtimeErrorHandler: ((err: Error) => void) | null = null
  private currentVizRequests = new Map<string, { vizId: string; afterLine: number }>()
  private schedulerInterval: ReturnType<typeof setInterval> | null = null
  private noteSequence: string[] = []
  private noteIndex = 0
  private cyclePos = 0

  async init(): Promise<void> {
    if (this.initialized) return

    this.audioCtx = new AudioContext()
    await this.audioCtx.resume()

    this.analyserNode = this.audioCtx.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.analyserNode.smoothingTimeConstant = 0.8

    this.gainNode = this.audioCtx.createGain()
    this.gainNode.gain.value = 0.3

    // Chain: oscillator -> gain -> analyser -> destination
    this.gainNode.connect(this.analyserNode)
    this.analyserNode.connect(this.audioCtx.destination)

    this.initialized = true
  }

  async evaluate(code: string): Promise<{ error?: Error }> {
    if (!this.initialized) {
      return { error: new Error('DemoEngine not initialized — call init() first') }
    }

    try {
      // Parse note sequence
      const noteMatch = code.match(/note:\s*(.+)/i)
      if (noteMatch) {
        this.noteSequence = noteMatch[1].trim().split(/\s+/)
      } else {
        this.noteSequence = ['c4'] // default
      }

      // Parse viz request
      this.currentVizRequests.clear()
      const vizMatch = code.match(/viz:\s*(\w+)/i)
      if (vizMatch) {
        const lines = code.split('\n')
        const noteLine = lines.findIndex(l => /note:/i.test(l))
        this.currentVizRequests.set('demo', {
          vizId: vizMatch[1],
          afterLine: noteLine >= 0 ? noteLine + 1 : lines.length,
        })
      }

      this.noteIndex = 0
      this.cyclePos = 0

      return {}
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      return { error }
    }
  }

  play(): void {
    if (!this.audioCtx || !this.gainNode || this.noteSequence.length === 0) return
    if (this.playing) return

    // Create oscillator
    this.oscillator = this.audioCtx.createOscillator()
    this.oscillator.type = 'sine'
    this.oscillator.frequency.value = this.noteToFreq(this.noteSequence[0])
    this.oscillator.connect(this.gainNode)
    this.oscillator.start()

    this.playing = true

    // Schedule note changes every 500ms
    this.schedulerInterval = setInterval(() => {
      try {
        if (!this.oscillator || !this.audioCtx) return

        this.noteIndex = (this.noteIndex + 1) % this.noteSequence.length
        const noteName = this.noteSequence[this.noteIndex]
        this.oscillator.frequency.value = this.noteToFreq(noteName)
        this.cyclePos += 0.25

        // Emit HapEvent for highlighting/viz
        const now = this.audioCtx.currentTime
        const hap = {
          value: { note: noteName, s: 'demo' },
          whole: { begin: this.cyclePos, end: this.cyclePos + 0.25 },
          part: { begin: this.cyclePos, end: this.cyclePos + 0.25 },
          context: { locations: [] },
        }
        this.hapStream.emit(hap, now, 2, now + 0.5, now)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        this.runtimeErrorHandler?.(error)
      }
    }, 500)
  }

  stop(): void {
    if (this.schedulerInterval != null) {
      clearInterval(this.schedulerInterval)
      this.schedulerInterval = null
    }
    if (this.oscillator) {
      try {
        this.oscillator.stop()
        this.oscillator.disconnect()
      } catch {
        // Already stopped
      }
      this.oscillator = null
    }
    this.playing = false
  }

  dispose(): void {
    if (this.playing) this.stop()
    this.hapStream.dispose()
    if (this.analyserNode) {
      this.analyserNode.disconnect()
      this.analyserNode = null
    }
    if (this.gainNode) {
      this.gainNode.disconnect()
      this.gainNode = null
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => { /* ignore */ })
      this.audioCtx = null
    }
    this.initialized = false
    this.noteSequence = []
    this.currentVizRequests.clear()
  }

  setRuntimeErrorHandler(handler: (err: Error) => void): void {
    this.runtimeErrorHandler = handler
  }

  get components(): Partial<EngineComponents> {
    const bag: Partial<EngineComponents> = {
      streaming: { hapStream: this.hapStream },
    }

    if (this.analyserNode && this.audioCtx) {
      bag.audio = { analyser: this.analyserNode, audioCtx: this.audioCtx }
    }

    // DemoEngine does NOT provide queryable (no PatternScheduler)
    // This proves VizPicker filtering works — pianoroll/wordfall should be disabled

    if (this.currentVizRequests.size > 0) {
      bag.inlineViz = { vizRequests: this.currentVizRequests }
    }

    return bag
  }

  private noteToFreq(note: string): number {
    const NOTES: Record<string, number> = {
      c4: 261.63, d4: 293.66, e4: 329.63, f4: 349.23,
      g4: 392.00, a4: 440.00, b4: 493.88,
      c5: 523.25, d5: 587.33, e5: 659.25,
    }
    return NOTES[note.toLowerCase()] ?? 440
  }
}
