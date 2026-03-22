import p5 from 'p5'
import type { VizRenderer, VizRefs, P5SketchFactory } from '../types'

/**
 * Adapter that wraps an existing p5 SketchFactory into the VizRenderer interface.
 * Each P5VizRenderer instance manages one p5 instance lifecycle.
 */
export class P5VizRenderer implements VizRenderer {
  private instance: p5 | null = null

  constructor(private sketch: P5SketchFactory) {}

  mount(
    container: HTMLDivElement,
    refs: VizRefs,
    size: { w: number; h: number },
    onError: (e: Error) => void
  ): void {
    try {
      const sketchFn = this.sketch(refs.hapStreamRef, refs.analyserRef, refs.schedulerRef)
      this.instance = new p5(sketchFn, container)
      // Correct canvas size after p5 setup() which may use window.innerWidth
      this.instance.resizeCanvas(size.w, size.h)
    } catch (e) {
      onError(e as Error)
    }
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
