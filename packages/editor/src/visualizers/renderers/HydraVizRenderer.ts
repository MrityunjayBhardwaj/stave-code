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
 *   1. AnalyserNode (real FFT) — always preferred when available.
 *   2. HapStream energy envelope (synthetic FFT from note events) —
 *      ONLY used as a fallback when no analyser is published. The
 *      envelope is only useful when there's no shared audio routing
 *      (e.g., a future runtime that emits hap events without exposing
 *      an analyser); in every current source — Strudel, the built-in
 *      examples, the (future) Sonic Pi runtime — an analyser is
 *      published and takes priority.
 *
 * The historical priority was (hapStream → envelope) → (analyser),
 * which broke audio reactivity for every built-in example source
 * because those sources published a HapStream that they never
 * actually emitted on. The renderer would lock onto the silent
 * envelope and ignore the working analyser, leaving s.a.fft[] at
 * all-zero forever and the shader visually unresponsive. Issue #7.
 *
 * Reads `hydraAudioBins` from the active VizConfig.
 *
 * ## Pause / loop ownership
 *
 * Hydra is constructed with `autoLoop: false` so the renderer (not
 * hydra) owns the animation loop. Our `pumpAudio` rAF callback both
 * polls the FFT data into `s.a.fft[]` AND calls `hydra.tick(time)` to
 * advance the shader by exactly one frame. This single-loop ownership
 * is what makes `pause()` actually pause:
 *   - With `autoLoop: true` (the old behavior), hydra's internal rAF
 *     keeps running independently. Setting our `paused` flag would
 *     stop FFT polling but hydra would keep rendering its last shader
 *     state, so the canvas never visibly froze. The user-visible
 *     symptom: the Stop button did nothing on hydra previews.
 *   - With `autoLoop: false`, cancelling our rAF in `pause()` halts
 *     the only path that ticks hydra. Resume re-arms the rAF and
 *     hydra picks up where it left off.
 *
 * The `hydraAutoLoop` config flag is no longer read — pause requires
 * us to own the loop. The flag is left in `vizConfig.ts` for now and
 * will be removed in a follow-up cleanup.
 */
export class HydraVizRenderer implements VizRenderer {
  private hydra: any = null
  private canvas: HTMLCanvasElement | null = null
  private analyser: AnalyserNode | null = null
  private freqData: Uint8Array<ArrayBuffer> | null = null
  private rafId: number | null = null
  private paused = false
  private destroyed = false
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

      // Audio source resolution — see class jsdoc for the priority
      // rationale (issue #7).
      this.analyser = components.audio?.analyser ?? null
      this.hapStream = components.streaming?.hapStream ?? null

      if (this.analyser) {
        // Real-FFT path. Allocate the byte buffer once; pumpAudio
        // reads into it on every frame.
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount)
        this.useEnvelope = false
      } else if (this.hapStream) {
        // Fallback: synthesize FFT from hap events. Used only when
        // no analyser is published.
        this.envelope = new HapEnergyEnvelope(config.hydraAudioBins)
        this.hapHandler = (e: HapEvent) => this.envelope?.onHap(e)
        this.hapStream.on(this.hapHandler)
        this.useEnvelope = true
      }
      // If neither is present we fall through with all flags false;
      // pumpAudio will still tick hydra (the shader's time-driven
      // baseline animates regardless), but s.a.fft[] stays at zero.

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

    if (!this.canvas || this.destroyed) return // destroyed before load finished

    this.hydra = new Hydra({
      canvas: this.canvas,
      width: size.w,
      height: size.h,
      detectAudio: false,
      makeGlobal: false,
      // We OWN the animation loop (see class jsdoc) — hydra must
      // not run its own rAF, or pause() can't actually halt the
      // shader render. `pumpAudio` calls `hydra.tick(time)` itself.
      autoLoop: false,
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

    // Schedule the first rAF — don't tick hydra synchronously here.
    // The next animation frame draws the first shader output. This
    // way pause() is observable from frame 1: if pause() runs before
    // the first rAF fires, no tick ever happens.
    if (!this.paused && !this.destroyed && this.rafId == null) {
      this.rafId = requestAnimationFrame(this.pumpAudio)
    }
  }

  private defaultPattern(s: any): void {
    s.osc(10, 0.1, () => s.a.fft[0] * 4)
      .color(1.0, 0.5, () => s.a.fft[1] * 2)
      .rotate(() => s.a.fft[2] * 6.28)
      .modulate(s.noise(3, () => s.a.fft[3] * 0.5), 0.02)
      .out()
  }

  private pumpAudio = (now?: number): void => {
    // Defensive: if pause() ran between scheduling this rAF and the
    // browser firing it, bail out without re-scheduling. (pause()
    // sets rafId=null and would normally have already called
    // cancelAnimationFrame, but the browser may have already queued
    // the callback at that point — this guard makes the cancellation
    // race-free.)
    if (this.paused || this.destroyed) {
      this.rafId = null
      return
    }
    const a = this.hydra?.synth?.a
    if (a?.fft) {
      // Real-FFT path takes priority when an analyser is published
      // (issue #7). The envelope path is only used when no analyser
      // is available — see mount() for the resolution logic.
      if (this.analyser && this.freqData) {
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
      } else if (this.useEnvelope && this.envelope) {
        // Fallback: synthetic energy from hap events.
        this.envelope.tick()
        const numBins = getVizConfig().hydraAudioBins
        for (let i = 0; i < numBins; i++) {
          a.fft[i] = this.envelope.bins[i]
        }
      }
    }
    // We own the loop — tick hydra exactly once per rAF. Without
    // this call hydra would never advance its shader because we
    // construct it with `autoLoop: false`. The `tick(time)`
    // signature matches what hydra-synth uses internally when
    // `autoLoop: true` mode runs the loop on its own.
    if (this.hydra && typeof this.hydra.tick === 'function') {
      try {
        this.hydra.tick(now ?? performance.now())
      } catch {
        // Non-fatal — a broken shader shouldn't tear down the
        // renderer; the error will already have surfaced via
        // hydra's onError path or as a console message.
      }
    }
    this.rafId = requestAnimationFrame(this.pumpAudio)
  }

  update(components: Partial<EngineComponents>): void {
    const newAnalyser = components.audio?.analyser ?? null
    if (newAnalyser !== this.analyser) {
      this.analyser = newAnalyser
      // Real-FFT path always wins when an analyser arrives (issue
      // #7). Re-allocate freqData for the new analyser, and flip
      // off the envelope path so future frames pull from the real
      // analyser instead of the (possibly empty) envelope.
      this.freqData = newAnalyser
        ? new Uint8Array(newAnalyser.frequencyBinCount)
        : null
      if (newAnalyser) {
        this.useEnvelope = false
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
    // Cancel the animation loop synchronously so hydra stops
    // rendering on the next frame. The pumpAudio guard at the top
    // also bails if `paused` is true, in case the browser already
    // queued the callback before cancelAnimationFrame could run.
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  resume(): void {
    this.paused = false
    // Re-arm the loop. Idempotent: if a callback is already
    // scheduled (e.g., resume() called twice), the second call is
    // a no-op because rafId is non-null.
    if (this.rafId == null && !this.destroyed) {
      this.rafId = requestAnimationFrame(this.pumpAudio)
    }
  }

  destroy(): void {
    this.destroyed = true
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
