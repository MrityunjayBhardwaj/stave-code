import type { EngineComponents } from '../../engine/LiveCodingEngine'
import type { HapStream, HapEvent } from '../../engine/HapStream'
import type { VizRenderer } from '../types'
import { getVizConfig } from '../vizConfig'

export type HydraPatternFn = (synth: any) => void

/**
 * Energy envelope derived from HapStream events.
 * When per-track audio routing isn't available, this provides per-track
 * reactivity by converting note events into synthetic FFT-like bins.
 *
 * Bins are mapped by MIDI pitch:
 *   bin 0 = bass      (MIDI  0–35)
 *   bin 1 = low-mid   (MIDI 36–59)
 *   bin 2 = high-mid  (MIDI 60–83)
 *   bin 3 = treble    (MIDI 84+)
 *   unpitched (drums) → bin 0 + bin 1 (broad energy)
 */
class HapEnergyEnvelope {
  /** Per-bin energy levels (0..1), decayed each frame. */
  readonly bins: number[]
  private readonly decay: number
  private readonly numBins: number

  constructor(numBins: number, decay = 0.92) {
    this.numBins = numBins
    this.bins = new Array(numBins).fill(0)
    this.decay = decay
  }

  /** Call when a hap event fires. */
  onHap(event: HapEvent): void {
    const gain = Math.min(1, Math.max(0, event.hap?.value?.gain ?? 1))
    const midi = event.midiNote

    if (midi != null) {
      // Pitched — map to bin by MIDI range
      const bin = Math.min(this.numBins - 1, Math.floor((midi / 127) * this.numBins))
      this.bins[bin] = Math.min(1, this.bins[bin] + gain)
    } else {
      // Unpitched (drums) — distribute across bass bins
      this.bins[0] = Math.min(1, this.bins[0] + gain * 0.8)
      if (this.numBins > 1) {
        this.bins[1] = Math.min(1, this.bins[1] + gain * 0.4)
      }
    }
  }

  /** Call once per animation frame to apply decay. */
  tick(): void {
    for (let i = 0; i < this.numBins; i++) {
      this.bins[i] *= this.decay
    }
  }
}

/**
 * VizRenderer that uses hydra-synth for audio-reactive WebGL visuals.
 * Lazily loads hydra-synth on first mount to avoid bloating the main bundle.
 *
 * Audio source priority:
 *   1. Per-track AnalyserNode (real FFT, if per-track routing exists)
 *   2. HapStream energy envelope (synthetic FFT from note events — per-track)
 *   3. Global AnalyserNode (real FFT, but reacts to ALL tracks — fallback)
 *
 * Reads `hydraAudioBins` and `hydraAutoLoop` from the active VizConfig.
 */
export class HydraVizRenderer implements VizRenderer {
  private hydra: any = null
  private canvas: HTMLCanvasElement | null = null
  private analyser: AnalyserNode | null = null
  private freqData: Uint8Array<ArrayBuffer> | null = null
  private rafId: number | null = null
  private paused = false
  private hapStream: HapStream | null = null
  private envelope: HapEnergyEnvelope | null = null
  private hapHandler: ((e: HapEvent) => void) | null = null
  private useEnvelope = false

  constructor(private pattern?: HydraPatternFn) {}

  mount(
    container: HTMLDivElement,
    components: Partial<EngineComponents>,
    size: { w: number; h: number },
    onError: (e: Error) => void
  ): void {
    try {
      const config = getVizConfig()

      // Determine audio source: prefer per-track analyser, then hap envelope, then global
      this.analyser = components.audio?.analyser ?? null

      // If the streaming component is a per-track HapStream (inline zone scenario),
      // use event-driven energy instead of global FFT
      this.hapStream = components.streaming?.hapStream ?? null
      if (this.hapStream) {
        this.envelope = new HapEnergyEnvelope(config.hydraAudioBins)
        this.hapHandler = (e: HapEvent) => this.envelope?.onHap(e)
        this.hapStream.on(this.hapHandler)
        // Use envelope for inline zones (per-track), global analyser for panel
        this.useEnvelope = true
      }

      if (this.analyser && !this.useEnvelope) {
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount)
      }

      this.canvas = document.createElement('canvas')
      this.canvas.width = size.w
      this.canvas.height = size.h
      this.canvas.style.width = '100%'
      this.canvas.style.height = '100%'
      container.appendChild(this.canvas)

      this.initHydra(size).catch(onError)
    } catch (e) {
      onError(e as Error)
    }
  }

  private async initHydra(size: { w: number; h: number }): Promise<void> {
    const { default: Hydra } = await import('hydra-synth')
    const config = getVizConfig()

    if (!this.canvas) return // destroyed before load finished

    this.hydra = new Hydra({
      canvas: this.canvas,
      width: size.w,
      height: size.h,
      detectAudio: false,
      makeGlobal: false,
      autoLoop: config.hydraAutoLoop,
    })

    const synth = this.hydra.synth

    // With makeGlobal:false, the audio object is on the Hydra instance (this.hydra.a),
    // NOT on synth. Bridge it so preset patterns can use s.a.fft[] naturally.
    const audio = this.hydra.a
    if (audio) {
      synth.a = audio
      if (typeof audio.setCutoff === 'function') audio.setCutoff(config.hydraAudioBins)
      if (typeof audio.setBins === 'function') audio.setBins(config.hydraAudioBins)
      if (!Array.isArray(audio.fft) || audio.fft.length < config.hydraAudioBins) {
        audio.fft = new Array(config.hydraAudioBins).fill(0)
      }
    } else {
      synth.a = { fft: new Array(config.hydraAudioBins).fill(0) }
    }

    if (this.pattern) {
      this.pattern(synth)
    } else {
      this.defaultPattern(synth)
    }

    this.pumpAudio()
  }

  private defaultPattern(s: any): void {
    s.osc(10, 0.1, () => s.a.fft[0] * 4)
      .color(1.0, 0.5, () => s.a.fft[1] * 2)
      .rotate(() => s.a.fft[2] * 6.28)
      .modulate(s.noise(3, () => s.a.fft[3] * 0.5), 0.02)
      .out()
  }

  private pumpAudio = (): void => {
    const a = this.hydra?.synth?.a
    if (!this.paused && a?.fft) {
      if (this.useEnvelope && this.envelope) {
        // Per-track: synthetic energy from hap events
        this.envelope.tick()
        const numBins = getVizConfig().hydraAudioBins
        for (let i = 0; i < numBins; i++) {
          a.fft[i] = this.envelope.bins[i]
        }
      } else if (this.analyser && this.freqData) {
        // Global: real FFT from AnalyserNode
        this.analyser.getByteFrequencyData(this.freqData)
        const numBins = getVizConfig().hydraAudioBins
        const binSize = Math.floor(this.freqData.length / numBins)
        for (let i = 0; i < numBins; i++) {
          let sum = 0
          for (let j = 0; j < binSize; j++) {
            sum += this.freqData[i * binSize + j]
          }
          a.fft[i] = sum / (binSize * 255)
        }
      }
    }
    this.rafId = requestAnimationFrame(this.pumpAudio)
  }

  update(components: Partial<EngineComponents>): void {
    const newAnalyser = components.audio?.analyser ?? null
    if (newAnalyser !== this.analyser) {
      this.analyser = newAnalyser
      if (!this.useEnvelope) {
        this.freqData = newAnalyser
          ? new Uint8Array(newAnalyser.frequencyBinCount)
          : null
      }
    }
  }

  resize(w: number, h: number): void {
    if (this.canvas) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.hydra?.setResolution?.(w, h)
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  destroy(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    // Unsubscribe from HapStream
    if (this.hapStream && this.hapHandler) {
      this.hapStream.off(this.hapHandler)
      this.hapHandler = null
    }
    this.canvas?.remove()
    this.canvas = null
    this.hydra = null
    this.analyser = null
    this.freqData = null
    this.envelope = null
    this.hapStream = null
  }
}
