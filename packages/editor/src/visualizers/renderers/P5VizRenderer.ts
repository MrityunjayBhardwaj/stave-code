import p5 from 'p5'
import type { RefObject } from 'react'
import type { EngineComponents } from '../../engine/LiveCodingEngine'
import type { HapStream } from '../../engine/HapStream'
import type { VizRenderer, P5SketchFactory, PatternScheduler } from '../types'

/**
 * Adapter that wraps an existing p5 SketchFactory into the VizRenderer interface.
 * Each P5VizRenderer instance manages one p5 instance lifecycle.
 *
 * Bridges the component bag (Partial<EngineComponents>) to the individual ref
 * objects that P5SketchFactory expects. Refs are stored as instance fields so
 * update() can refresh them for live React rendering.
 */
export class P5VizRenderer implements VizRenderer {
  private instance: p5 | null = null
  private hapStreamRef = { current: null as HapStream | null }
  private analyserRef = { current: null as AnalyserNode | null }
  private schedulerRef = { current: null as PatternScheduler | null }

  constructor(private sketch: P5SketchFactory) {}

  mount(
    container: HTMLDivElement,
    components: Partial<EngineComponents>,
    size: { w: number; h: number },
    onError: (e: Error) => void
  ): void {
    try {
      // Bridge: populate refs from the component bag
      this.hapStreamRef.current = components.streaming?.hapStream ?? null
      this.analyserRef.current = components.audio?.analyser ?? null
      this.schedulerRef.current = components.queryable?.scheduler ?? null

      const sketchFn = this.sketch(
        this.hapStreamRef as RefObject<HapStream | null>,
        this.analyserRef as RefObject<AnalyserNode | null>,
        this.schedulerRef as RefObject<PatternScheduler | null>
      )
      this.instance = new p5(sketchFn, container)
      // Correct canvas size after p5 setup() which may use window.innerWidth
      this.instance.resizeCanvas(size.w, size.h)
    } catch (e) {
      onError(e as Error)
    }
  }

  update(components: Partial<EngineComponents>): void {
    if (!this.instance) return
    this.hapStreamRef.current = components.streaming?.hapStream ?? null
    this.analyserRef.current = components.audio?.analyser ?? null
    this.schedulerRef.current = components.queryable?.scheduler ?? null
  }

  resize(w: number, h: number): void {
    this.instance?.resizeCanvas(w, h)
  }

  pause(): void {
    this.instance?.noLoop()
  }

  resume(): void {
    this.instance?.loop()
  }

  destroy(): void {
    this.instance?.remove()
    this.instance = null
  }
}
