import p5 from 'p5'
import type { RefObject } from 'react'
import type { EngineComponents } from '../../engine/LiveCodingEngine'
import type { HapStream, HapEvent } from '../../engine/HapStream'
import type {
  VizRenderer,
  P5SketchFactory,
  PatternScheduler,
  ContainerSize,
} from '../types'
import type { StaveUniforms } from '../p5Compiler'
import { installP5FesBridgeWith } from '../p5FesBridge'
import { SignalBus } from '../signals/SignalBus'
import { buildStaveUniforms } from '../signals/staveUniforms'
import { resolveAliasesForEngine, DEFAULT_VIZ_ENGINE } from '../signals/aliasMap'
import { getStoredSignalAliases } from '../../workspace/editorRegistry'
import { perf } from '../../perf/profiler'

/** Monotone id source so each renderer instance gets a stable profiler key
 *  (`p5#1`, `p5#2`, …) for per-instance frame/fps tracking (#228). */
let p5PerfSeq = 0

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
  // Per-render viz options (#214) → exposed to the sketch as `stave.options`.
  private optionsRef = { current: {} as Record<string, unknown> }

  /**
   * Per-renderer named-signal bus (Phase 21). PURE (P12) — owned here, fed
   * UNCONDITIONALLY from the HapStream + scheduler (NOT analyser-gated; the bus
   * is IR-grounded and must stay live whenever a real analyser is published,
   * which is normal playback). Mirrors `HydraVizRenderer`'s bus discipline; the
   * only difference is the p5 SHAPE (D-01): bare `uKick` is a live GETTER
   * NUMBER here, not a `() => number` thunk.
   */
  private bus: SignalBus | null = new SignalBus()
  /** Stable per-instance profiler key (`p5#N`) — frame/fps + bus timing (#228). */
  private readonly perfId = `p5#${++p5PerfSeq}`
  /**
   * The bus's HapStream `.env`-feed subscription. Kept as an instance ref so
   * `destroy()` can off it unconditionally (it is the bus's own subscription —
   * p5 has no analyser-fallback envelope, but keeping a named ref matches the
   * hydra teardown discipline and stays correct if a fallback is added later).
   */
  private busHapHandler: ((e: HapEvent) => void) | null = null
  /** The HapStream the bus handler is subscribed to (for clean off()). */
  private boundHapStream: HapStream | null = null
  /**
   * The live named-signal uniform object handed to the sketch factory as the
   * 6th arg. Built ONCE in the constructor; its `uKick…` getters read the
   * stable `bus` live each access (U2 — frame-fresh through the inner
   * `with (staveUniforms)`). `update()` rebinds only the bus's scheduler refs
   * in place, so this SAME object's getters keep returning current values
   * without a re-compile.
   */
  private staveUniformsRef: { current: StaveUniforms }

  constructor(private sketch: P5SketchFactory) {
    const bus = this.bus as SignalBus
    // `__tick` (MAIN) — fires ONCE per p5 draw frame (the draw wrapper calls it):
    // profiler beat + the bus's per-frame drive. readAudio MUST run AFTER
    // refreshActive (Slice 2): `audioFor` resolves sound→track via the active map
    // refreshActive fills; wrong order = sound-keyed DSP reads stale. The uniform
    // SHAPE (getters + `u`) is built by the shared `buildStaveUniforms` so the
    // worker renderer produces an IDENTICAL surface (PV54); only this tick differs
    // — the worker omits it (its `WorkerBusFeed` drives the bus — PK22).
    this.staveUniformsRef = {
      current: buildStaveUniforms(bus, (): void => {
        perf.frame(this.perfId)
        perf.begin('p5.bus')
        try {
          bus.tick()
          bus.refreshActive(bus.now())
          bus.readAudio()
        } finally {
          // Close the span even if a bus call threw — else the open span leaks
          // and is misattributed to the next frame (#230 #5; mirrors hydra.draw).
          perf.end('p5.bus')
        }
      }),
    }
  }

  mount(
    container: HTMLDivElement,
    components: Partial<EngineComponents>,
    size: { w: number; h: number },
    onError: (e: Error) => void
  ): void {
    perf.gauge('viz.p5', 1) // live p5-instance gauge (#228); -1 in destroy()
    // Install the FES bridge with the real p5 constructor we already
    // hold statically. Doing this here (rather than via a dynamic
    // `import('p5')` in CompiledVizMount) eliminates the class of bug
    // where the bridge and the runtime end up on two different p5
    // module instances — or where the async import hasn't resolved
    // before the first sketch runs. Idempotent.
    installP5FesBridgeWith(p5)
    try {
      // Bridge: populate refs from the component bag
      this.hapStreamRef.current = components.streaming?.hapStream ?? null
      this.analyserRef.current = components.audio?.analyser ?? null
      this.schedulerRef.current = components.queryable?.scheduler ?? null
      this.optionsRef.current = components.options ?? {}

      // ── Named signal bus feed (Phase 21) — UNCONDITIONAL ─────────────────
      // Bind the live scheduler + per-track schedulers, then subscribe the
      // bus's `.env` feed to the HapStream. The bus is IR-grounded and is NOT
      // analyser-gated (mirror HydraVizRenderer BLOCK-1) — it must stay live
      // whenever a real analyser is published (normal playback). The
      // trackSchedulers read is NEW here: mount previously read only
      // `queryable?.scheduler` — `u.tracks` / `u.track(id)` need the per-track
      // map too.
      this.bus?.bindScheduler(
        components.queryable?.scheduler,
        components.queryable?.trackSchedulers
      )
      // Bind the orbit analysers (Slice 2) — UNCONDITIONAL, same discipline as
      // bindScheduler. The bus internally degrades absent analysers to 0/[], so
      // the bind is never gated. Drives `u('bd').rms`/`.fft` etc.
      this.bus?.bindAnalysers(
        components.audio?.analyser,
        components.audio?.trackAnalysers
      )
      // ── Custom alias merge + bare-getter injection (Phase 21 aliases) ─────
      // Read the impure settings surface HERE (the renderer, NOT the bus — P12)
      // and build the merged map ONCE: built-ins first, custom LAST so a user
      // override WINS on collision. Push it into the (pure) bus, then expose
      // every custom name as a live GETTER on the SAME `staveUniforms` object
      // the sketch resolves bare names through (inner `with (staveUniforms)` for
      // full-lifecycle; the legacy `with`-wrap for legacy draw-body — Site B).
      // The getter reads `bus.envValue(name)` LIVE each access (U2 — never
      // captured), so bare `kick` is frame-fresh exactly like bare `uKick`.
      // Skip names already a property on the uniform object (built-ins win the
      // collision; the merge already let custom win the alias-RESOLUTION).
      // Resolve built-ins + custom aliases for the ACTIVE viz engine (Strudel
      // today; the single wire-point — when Sonic Web lands, source the
      // engine from the running LiveCodingEngine here). Custom wins on collision.
      const mergedAliases = resolveAliasesForEngine(
        getStoredSignalAliases(),
        DEFAULT_VIZ_ENGINE,
      )
      this.bus?.setAliases(mergedAliases)
      const aliasBus = this.bus
      const uniforms = this.staveUniformsRef.current
      if (aliasBus && uniforms) {
        for (const name of Object.keys(mergedAliases)) {
          if (name in uniforms) continue
          Object.defineProperty(uniforms, name, {
            get: () => aliasBus.envValue(name),
            enumerable: true,
            configurable: true,
          })
        }
      }
      const hapStream = components.streaming?.hapStream ?? null
      // Guard `.on` — a partial/non-conforming stream (e.g. a demo-mode stub or
      // a test double) must degrade to "no signal feed", never tear down the
      // renderer. A real HapStream always has `.on`.
      if (hapStream && this.bus && typeof hapStream.on === 'function') {
        this.busHapHandler = (e: HapEvent) => this.bus?.bump(e)
        hapStream.on(this.busHapHandler)
        this.boundHapStream = hapStream
      }

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
        this.containerSizeRef as RefObject<ContainerSize>,
        this.optionsRef as RefObject<Record<string, unknown>>,
        this.staveUniformsRef as RefObject<StaveUniforms>
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
    this.optionsRef.current = components.options ?? {}

    // Re-bind the bus's live scheduler refs in place (Phase 21) so the SAME
    // staveUniforms getters captured by the sketch observe the swapped
    // scheduler / trackSchedulers without a re-compile — mirrors the ref
    // rebind discipline above and the hydra renderer's in-place rebind.
    this.bus?.bindScheduler(
      components.queryable?.scheduler ?? null,
      components.queryable?.trackSchedulers
    )
    // Re-bind the orbit analysers in place (Slice 2) — same live-ref discipline
    // as the scheduler rebind above. A fresh engine re-publishes new analyser
    // nodes; the SAME bus must point at them so the DSP feed stays live across
    // re-evaluates. Unconditional (BLOCK-1) — the bus degrades absent → 0/[].
    this.bus?.bindAnalysers(
      components.audio?.analyser ?? null,
      components.audio?.trackAnalysers
    )

    // Re-subscribe the `.env` feed if the HapStream itself swapped (a fresh
    // engine re-publishes a new stream). Off the old, on the new — so `uKick`
    // keeps decaying after a re-evaluate that replaces the stream.
    const nextHapStream = components.streaming?.hapStream ?? null
    if (nextHapStream !== this.boundHapStream) {
      if (
        this.boundHapStream &&
        this.busHapHandler &&
        typeof this.boundHapStream.off === 'function'
      ) {
        this.boundHapStream.off(this.busHapHandler)
      }
      this.busHapHandler = null
      this.boundHapStream = null
      // Guard `.on` (see mount) — a partial stream degrades to no feed.
      if (nextHapStream && this.bus && typeof nextHapStream.on === 'function') {
        this.busHapHandler = (e: HapEvent) => this.bus?.bump(e)
        nextHapStream.on(this.busHapHandler)
        this.boundHapStream = nextHapStream
      }
    }
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
    perf.gauge('viz.p5', -1) // #228 — release the live-instance gauge + frame history
    perf.dropFrames(this.perfId)
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

    // Unsubscribe the bus `.env` feed (Phase 21) and null the bus. The
    // subscription is the bus's OWN handler (p5 has no analyser-fallback
    // envelope to gate against), so teardown is unconditional.
    if (
      this.boundHapStream &&
      this.busHapHandler &&
      typeof this.boundHapStream.off === 'function'
    ) {
      this.boundHapStream.off(this.busHapHandler)
    }
    this.busHapHandler = null
    this.boundHapStream = null
    this.bus = null
  }
}
