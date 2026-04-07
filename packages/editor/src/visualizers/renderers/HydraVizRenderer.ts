import type { EngineComponents } from '../../engine/LiveCodingEngine'
import type { VizRenderer } from '../types'
import { getVizConfig } from '../vizConfig'

export type HydraPatternFn = (synth: any) => void

/**
 * VizRenderer that uses hydra-synth for audio-reactive WebGL visuals.
 * Lazily loads hydra-synth on first mount to avoid bloating the main bundle.
 *
 * Audio data from the engine's AnalyserNode is pumped into Hydra's `a.fft[]`
 * bins each frame, enabling audio-reactive shader patterns.
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

  constructor(private pattern?: HydraPatternFn) {}

  mount(
    container: HTMLDivElement,
    components: Partial<EngineComponents>,
    size: { w: number; h: number },
    onError: (e: Error) => void
  ): void {
    try {
      this.analyser = components.audio?.analyser ?? null
      if (this.analyser) {
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
    if (synth?.a) {
      synth.a.setCutoff(config.hydraAudioBins)
      synth.a.setBins(config.hydraAudioBins)
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
    if (!this.paused && this.analyser && this.freqData && this.hydra?.synth?.a) {
      this.analyser.getByteFrequencyData(this.freqData)
      const a = this.hydra.synth.a
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
    this.rafId = requestAnimationFrame(this.pumpAudio)
  }

  update(components: Partial<EngineComponents>): void {
    const newAnalyser = components.audio?.analyser ?? null
    if (newAnalyser !== this.analyser) {
      this.analyser = newAnalyser
      this.freqData = newAnalyser
        ? new Uint8Array(newAnalyser.frequencyBinCount)
        : null
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
    this.canvas?.remove()
    this.canvas = null
    this.hydra = null
    this.analyser = null
    this.freqData = null
  }
}
