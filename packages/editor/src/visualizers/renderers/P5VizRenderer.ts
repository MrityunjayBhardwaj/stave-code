import p5 from 'p5'
import type { RefObject } from 'react'
import type { EngineComponents } from '../../engine/LiveCodingEngine'
import type { HapStream } from '../../engine/HapStream'
import type {
  VizRenderer,
  P5SketchFactory,
  PatternScheduler,
  ContainerSize,
} from '../types'

/**
 * Adapter that wraps an existing p5 SketchFactory into the VizRenderer interface.
 * Each P5VizRenderer instance manages one p5 instance lifecycle.
 *
 * Bridges the component bag (Partial<EngineComponents>) to the individual ref
 * objects that P5SketchFactory expects. Refs are stored as instance fields so
 * update() can refresh them for live React rendering.
 *
 * `containerSizeRef` is maintained by the renderer and exposed to user
 * sketches via `stave.width` / `stave.height` (through the compiler).
 * It's initialized from the size passed to `mount()` and updated on
 * every `resize(w, h)` call, so a user's `createCanvas(stave.width,
 * stave.height)` always gets the live preview-pane dimensions — no
 * mismatches with `windowWidth` / `windowHeight` which track the
 * browser window rather than the container.
 */
export class P5VizRenderer implements VizRenderer {
  private instance: p5 | null = null
  private hapStreamRef = { current: null as HapStream | null }
  private analyserRef = { current: null as AnalyserNode | null }
  private schedulerRef = { current: null as PatternScheduler | null }
  private containerSizeRef: { current: ContainerSize } = {
    current: { w: 400, h: 300 },
  }

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

      // Seed the container size ref BEFORE invoking the sketch
      // factory so `stave.width` / `stave.height` reads inside user
      // setup() see the intended canvas dimensions. If clientWidth
      // or clientHeight are 0 at mount time (parent layout not yet
      // resolved), the ResizeObserver in `mountVizRenderer` will
      // fire `resize(w, h)` below once layout settles, and this
      // ref updates accordingly.
      this.containerSizeRef.current = { w: size.w, h: size.h }

      const sketchFn = this.sketch(
        this.hapStreamRef as RefObject<HapStream | null>,
        this.analyserRef as RefObject<AnalyserNode | null>,
        this.schedulerRef as RefObject<PatternScheduler | null>,
        this.containerSizeRef as RefObject<ContainerSize>
      )
      this.instance = new p5(sketchFn, container)
      // Correct canvas size after p5 setup() which may use
      // window.innerWidth (belt-and-suspenders — the preferred path
      // is `createCanvas(stave.width, stave.height)` in the user's
      // setup, which sizes the canvas correctly from the start).
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
    // Update the ref BEFORE resizing the canvas so any draw call
    // mid-resize reads consistent values. Both touch mutable state,
    // but the draw call path goes through stave.width/height and
    // benefits from seeing the new target size first.
    this.containerSizeRef.current = { w, h }
    this.instance?.resizeCanvas(w, h)
  }

  pause(): void {
    this.instance?.noLoop()
  }

  resume(): void {
    this.instance?.loop()
  }

  destroy(): void {
    if (this.instance) {
      // p5 v2 defers its `#_setup()` chain to the next animation
      // frame (PV5 / PK2). #_setup is `async` and contains FOUR
      // things that need cancelling if we destroy mid-flight:
      //
      //   1. `await _runLifecycleHook('presetup')`
      //   2. `this.createCanvas(100, 100, P2D)` — UNCONDITIONAL
      //      default canvas creation
      //   3. `await context.setup()` — user setup
      //   4. `await _runLifecycleHook('postsetup')`
      //
      // If React StrictMode's dev double-invoke runs the effect
      // cleanup BEFORE p5's first rAF fires, calling
      // `instance.remove()` cancels the draw loop schedule but
      // does NOT cancel the async #_setup chain. The chain still
      // fires, the default 100×100 canvas is appended to our
      // container, then the user setup creates a second canvas
      // sized to stave.width×stave.height, the draw loop starts
      // running… on a "destroyed" instance whose remove() call
      // was a no-op because no canvas existed yet at the moment
      // of removal.
      //
      // Multiple defenses (belt-and-suspenders) — any one of
      // these alone might not fully cover all p5 internal
      // paths, but together they guarantee the destroyed
      // instance never produces visible output:
      //
      //   - `hitCriticalError = true`: p5's #_setup checks this
      //     after each await and bails out early (line 72530 of
      //     p5.js v2.2.3).
      //   - No-op user `setup`/`draw`/`preload`: even if the
      //     critical-error early-return is bypassed, the user
      //     code never runs.
      //   - No-op `createCanvas`: if the unconditional default
      //     canvas creation runs anyway, we silently swallow
      //     it instead of appending a 100×100 orphan to the
      //     container.
      //   - `_setupDone = true`: makes p5's draw scheduler
      //     consider setup complete so it doesn't keep waiting.
      //
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pi = this.instance as any
      pi.hitCriticalError = true
      pi.setup = function () {}
      pi.draw = function () {}
      pi.preload = function () {}
      pi.createCanvas = function () {
        return null
      }
      pi._setupDone = true
      this.instance.remove()
    }
    this.instance = null
  }
}
