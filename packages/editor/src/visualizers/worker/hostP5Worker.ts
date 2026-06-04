/**
 * hostVizWorker — the bundler-AGNOSTIC worker host that runs a viz sketch in a
 * `WorkerGlobalScope` and renders it to a transferred `OffscreenCanvas` (Phase B,
 * epic #228). Hosts BOTH renderer kinds, branching on `MountMessage.kind`:
 *   - `'p5'`    (B-3) — install the 6-part p5 DOM shim, compile via the shared
 *     `compileP5Code`, drive `redraw()` then BLIT p5's worker-local canvas onto the
 *     transferred presenting canvas (p5 makes its OWN canvases — Tier 2).
 *   - `'hydra'` (B-5) — install the 2-part hydra shim, `new Hydra({ canvas })` on
 *     the transferred canvas DIRECTLY (Tier 1: hydra accepts a canvas → no blit),
 *     feed `s.a.fft[]` from the frame's master bytes, drive `hydra.tick()`.
 *
 * The app's `viz-worker.ts` (bundled by Next via `new Worker(new URL(...))`) is a
 * two-line shell: `hostVizWorker(self)`. ONE worker hosts ONE kind (B-3/B-5; a
 * pool that reuses a worker across kinds is B-6) — so only one shim ever installs.
 *
 * SHARED per frame (both kinds) — `applyAndDraw`: `feed.applyFrame` owns the ONE
 * bus tick (PK22) + refresh the raw shims, then the kind-specific `draw()` runs
 * EXACTLY ONCE (1:1 with the main sampler's frame → cadence can't drift). After
 * the first successful draw the host posts a one-shot `ready` (B-5 / #247): the
 * main `FallbackVizRenderer` waits for it; a throw or timeout BEFORE it falls the
 * renderer back to the main thread (a worker that throws/hangs at startup = blank).
 *
 * CADENCE (PK22): the p5 setup is wrapped to `noLoop()` (we drive `redraw()`); the
 * hydra instance is `autoLoop:false` (we drive `tick()`). `staveUniforms.__tick`
 * is a no-op in the worker (built without `onTick`) — the feed already ticked.
 *
 * REF: PV70 (.anvi/vyapti.md), PK22 (.anvi/krama.md), dom-shim.ts, rawShims.ts,
 *      workerBusFeed.ts, signalTransport.ts, p5Compiler.ts, hydraCompiler.ts,
 *      hydraStaveBag.ts (the shared bag builder), HydraVizRenderer (main contract).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  installWorkerDomShim,
  installWorkerHydraShim,
  wrapCanvas,
} from './dom-shim'
import { WorkerBusFeed } from './workerBusFeed'
import { RawAnalyserShim, RawSchedulerShim } from './rawShims'
import { createPostMessageReader, type SignalTransportReader } from './signalTransport'
import { MASTER_KEY, type SignalFrame, type AnalyserBytes } from './signalFrame'
import { buildStaveUniforms } from '../signals/staveUniforms'
import { buildHydraStaveBag } from '../renderers/hydraStaveBag'
import { compileP5Code } from '../p5Compiler'
import { compileHydraCode } from '../hydraCompiler'
import { getVizConfig } from '../vizConfig'
import {
  isControlMessage,
  type MountMessage,
  type WorkerControlMessage,
} from './workerMessages'

/** The minimal worker-global surface the host needs (a `DedicatedWorkerGlobalScope`
 *  on the real worker; structural so it's testable). */
interface WorkerScope {
  addEventListener(type: 'message', handler: (ev: { data: unknown }) => void): void
  postMessage(message: unknown): void
}

/** The kind-specific half of a mount — the shared scaffolding wraps these. */
interface RendererStrategy {
  /** True once the renderer can draw (p5 setup is async; hydra is sync). */
  setupDone: () => boolean
  /** Render exactly one frame from the (already-refreshed) shims. May throw — the
   *  caller catches + reports + suppresses the `ready` signal. */
  draw: () => void
  /** Apply a new size / DPR to the renderer + presenting canvas. */
  resizeKind: (w: number, h: number, dpr: number) => void
  /** Belt-and-suspenders teardown of the renderer instance. */
  teardown: () => void
}

interface MountState extends RendererStrategy {
  feed: WorkerBusFeed
  rawAnalyser: RawAnalyserShim
  rawScheduler: RawSchedulerShim
  containerSizeRef: { current: { w: number; h: number } }
  canvas: OffscreenCanvas
  reader: SignalTransportReader
  dpr: number
  paused: boolean
  /** One-shot guard for the `ready` liveness signal (#247). */
  readySent: boolean
}

/** Cached library constructors — imported once per worker (after the matching shim
 *  is installed). A worker hosts one kind, so only one is ever set. */
let P5ctor: any = null
let Hydractor: any = null

export function hostVizWorker(scope: WorkerScope): void {
  let state: MountState | null = null

  const diag = (level: 'error' | 'info', message: string, stack?: string): void => {
    try {
      scope.postMessage({ type: 'diag', level, message, stack })
    } catch {
      /* postMessage can fail late in teardown — ignore */
    }
  }
  const signalReady = (): void => {
    try {
      scope.postMessage({ type: 'ready' })
    } catch {
      /* ignore */
    }
  }

  scope.addEventListener('message', (ev) => {
    const data = ev.data
    // Signal frames (the `__staveSignalFrame` envelope) carry NO `type` — they're
    // handled by the reader installed in `mount`. Only control messages here.
    if (!isControlMessage(data)) return
    handleControl(data).catch((e) =>
      diag('error', `worker control '${(data as WorkerControlMessage).type}' failed: ${errMsg(e)}`, errStack(e)),
    )
  })

  async function handleControl(msg: WorkerControlMessage): Promise<void> {
    switch (msg.type) {
      case 'mount':
        await mount(msg)
        break
      case 'resize':
        resize(msg.w, msg.h, msg.dpr)
        break
      case 'pause':
        if (state) state.paused = true
        break
      case 'resume':
        if (state) state.paused = false
        break
      case 'destroy':
        destroy()
        break
    }
  }

  async function mount(msg: MountMessage): Promise<void> {
    // Tear down a previous mount (a pooled/shared worker re-mount — B-6; harmless
    // for the one-shot worker).
    if (state) destroy()

    const dpr = msg.dpr > 0 ? msg.dpr : 1
    const feed = new WorkerBusFeed()
    if (msg.aliases) feed.setAliases(msg.aliases)
    const rawAnalyser = new RawAnalyserShim()
    const rawScheduler = new RawSchedulerShim()
    const containerSizeRef = { current: { w: msg.size.w, h: msg.size.h } }

    const strategy =
      msg.kind === 'hydra'
        ? await mountHydra(msg, feed, rawAnalyser, rawScheduler, dpr)
        : await mountP5(msg, feed, rawAnalyser, rawScheduler, containerSizeRef, dpr)

    const reader = createPostMessageReader(scope as any)
    state = {
      feed,
      rawAnalyser,
      rawScheduler,
      containerSizeRef,
      canvas: msg.canvas,
      reader,
      dpr,
      paused: false,
      readySent: false,
      ...strategy,
    }
    reader.onFrame(applyAndDraw)
    diag('info', `mounted ${msg.kind} viz '${msg.name}' (${msg.size.w}×${msg.size.h}@${dpr})`)
  }

  // ── p5 (Tier 2: makes its own canvases → blit) ─────────────────────────────
  async function mountP5(
    msg: MountMessage,
    feed: WorkerBusFeed,
    rawAnalyser: RawAnalyserShim,
    rawScheduler: RawSchedulerShim,
    containerSizeRef: { current: { w: number; h: number } },
    dpr: number,
  ): Promise<RendererStrategy> {
    // ── condition 1: shim BEFORE importing p5. makeCanvasEl mints a FRESH wrapped
    // OffscreenCanvas per createElement('canvas') (condition 5) — all worker-local;
    // we blit, not transfer, so none of these is the presenting surface. ──
    if (!P5ctor) {
      installWorkerDomShim(() => wrapCanvas(new OffscreenCanvas(1, 1)))
      const mod: any = await import('p5')
      P5ctor = mod.default || mod.p5 || mod
      P5ctor.disableFriendlyErrors = true // condition 3
    }

    // No `onTick` → `__tick` is a no-op: the feed drives the bus (PK22).
    const staveUniforms = buildStaveUniforms(feed.bus)
    // The compiler reads `stave.analyser`/`stave.scheduler` off these refs — the
    // SAME contract P5VizRenderer uses, so the sketch is none the wiser it's in a
    // worker. hapStream raw access is not marshalled (no built-in needs it) → null.
    const analyserRef = { current: rawAnalyser as unknown as AnalyserNode }
    const schedulerRef = { current: rawScheduler }
    const hapStreamRef = { current: null }
    const optionsRef = { current: {} as Record<string, unknown> }
    const staveUniformsRef = { current: staveUniforms }

    const factory = compileP5Code(msg.code, msg.name)
    const userSketchFn = factory(
      hapStreamRef as any,
      analyserRef as any,
      schedulerRef as any,
      containerSizeRef as any,
      optionsRef as any,
      staveUniformsRef as any,
    )

    let setup = false
    // Wrap the sketch: after the user's setup runs, stop p5's auto-loop so WE drive
    // one redraw() per frame (1:1 cadence). p5 reads p.setup AFTER this fn assigns
    // it (instance-mode contract), so wrapping here is what #_setup calls.
    const sketchFn = (p: any): void => {
      userSketchFn(p)
      const setup0 = p.setup
      p.setup = function (this: unknown) {
        if (typeof setup0 === 'function') setup0.call(this)
        try {
          p.noLoop()
        } catch {
          /* noLoop before renderer ready — redraw still drives draws */
        }
        setup = true
      }
    }
    const inst = new P5ctor(sketchFn)

    // Presenting surface — size the backing store to device pixels, blit target.
    msg.canvas.width = Math.max(1, Math.round(msg.size.w * dpr))
    msg.canvas.height = Math.max(1, Math.round(msg.size.h * dpr))
    let present: ImageBitmapRenderingContext | null = null
    try {
      present = msg.canvas.getContext('bitmaprenderer')
    } catch (e) {
      diag('error', `bitmaprenderer unavailable: ${errMsg(e)}`)
    }

    return {
      setupDone: () => setup,
      draw: () => {
        inst.redraw() // exactly one draw, 1:1 with this frame (throws → caught)
        // Blit p5's worker-local render canvas → the presenting canvas (zero-copy).
        if (!present) return
        const src: OffscreenCanvas | undefined = inst?.drawingContext?.canvas
        if (!src) return
        try {
          present.transferFromImageBitmap(src.transferToImageBitmap())
        } catch (e) {
          diag('error', `present blit failed: ${errMsg(e)}`)
        }
      },
      resizeKind: (w, h, dprNew) => {
        msg.canvas.width = Math.max(1, Math.round(w * dprNew))
        msg.canvas.height = Math.max(1, Math.round(h * dprNew))
        // p5 sizes its render canvas off stave.width/height (containerSizeRef) on
        // the next draw; nudge resizeCanvas so it matches before the next frame.
        inst?.resizeCanvas?.(w, h)
      },
      teardown: () => {
        // Mirror P5VizRenderer.destroy's belt-and-suspenders teardown — neutralise
        // p5's async #_setup chain so a destroy mid-flight can't produce output.
        try {
          inst.hitCriticalError = true
          inst.setup = function () {}
          inst.draw = function () {}
          inst.preload = function () {}
          inst.createCanvas = function () {
            return null
          }
          inst._setupDone = true
          inst.remove?.()
        } catch {
          /* ignore */
        }
      },
    }
  }

  // ── hydra (Tier 1: accepts the canvas → render direct, no blit) ────────────
  async function mountHydra(
    msg: MountMessage,
    feed: WorkerBusFeed,
    rawAnalyser: RawAnalyserShim,
    rawScheduler: RawSchedulerShim,
    _dpr: number,
  ): Promise<RendererStrategy> {
    // condition 1: shim (window=self alias + thin document) BEFORE importing hydra
    // (it touches window at module-eval — mouseListen). 2-part subset (PV70).
    installWorkerHydraShim({ w: msg.size.w, h: msg.size.h })
    if (!Hydractor) {
      const mod: any = await import('hydra-synth')
      Hydractor = mod.default || mod
    }

    const bag = buildHydraStaveBag(feed.bus)
    // Combined raw scheduler shim → `stave.scheduler` + the `H()` fallback. Per-
    // track raw isn't marshalled (signalFrame ships combined only); per-track
    // signal still works via the bus-backed `u.track(id)` (fed by activeByTrack).
    bag.scheduler = rawScheduler

    const bins = getVizConfig().hydraAudioBins
    // Presenting canvas — size to CSS px (match the main HydraVizRenderer, which
    // does NOT dpr-scale its canvas); hydra renders into it DIRECTLY (no blit).
    msg.canvas.width = Math.max(1, Math.round(msg.size.w))
    msg.canvas.height = Math.max(1, Math.round(msg.size.h))

    const hydra = new Hydractor({
      canvas: msg.canvas,
      width: msg.size.w,
      height: msg.size.h,
      detectAudio: false, // no Meyda/getUserMedia/AudioContext in the worker
      makeGlobal: false, // generators live on hydra.synth
      autoLoop: false, // WE drive tick() (1:1 with the frame — PK22)
      enableStreamCapture: false, // OffscreenCanvas has no captureStream
    })
    const synth = hydra.synth

    // With makeGlobal:false the audio object is on the instance (hydra.a); bridge
    // it onto synth so preset patterns read `s.a.fft[]` (mirror initHydra 537-549).
    const audio = hydra.a
    if (audio) {
      synth.a = audio
      if (typeof audio.setCutoff === 'function') audio.setCutoff(bins)
      if (typeof audio.setBins === 'function') audio.setBins(bins)
      if (!Array.isArray(audio.fft) || audio.fft.length < bins) {
        audio.fft = new Array(bins).fill(0)
      }
    } else {
      synth.a = { fft: new Array(bins).fill(0) }
    }

    // Run the user sketch (a code string compiled in-worker — built-in hydra
    // closures are NOT worker-routed in B-5, deferred follow-up).
    compileHydraCode(msg.code)(synth, bag)

    // Reusable scratch for the s.a.fft downsample (avoid a per-frame alloc).
    let freqScratch = new Uint8Array(rawAnalyser.frequencyBinCount || 1024)

    return {
      setupDone: () => true, // pattern ran synchronously above; frames arrive after
      draw: () => {
        // Feed s.a.fft[] from the master analyser bytes (mirror pumpAudio 590-600).
        const a = hydra?.synth?.a
        if (a?.fft) {
          if (freqScratch.length !== rawAnalyser.frequencyBinCount) {
            freqScratch = new Uint8Array(rawAnalyser.frequencyBinCount)
          }
          rawAnalyser.getByteFrequencyData(freqScratch)
          const numBins = getVizConfig().hydraAudioBins
          const binSize = Math.max(1, Math.floor(freqScratch.length / numBins))
          for (let i = 0; i < numBins; i++) {
            let sum = 0
            for (let j = 0; j < binSize; j++) sum += freqScratch[i * binSize + j]
            a.fft[i] = sum / (binSize * 255)
          }
        }
        // The bus is already ticked by feed.applyFrame (PK22) — do NOT re-tick here.
        hydra.tick(performance.now()) // one shader frame (throws → caught)
      },
      resizeKind: (w, h) => {
        msg.canvas.width = Math.max(1, Math.round(w))
        msg.canvas.height = Math.max(1, Math.round(h))
        hydra?.setResolution?.(w, h)
      },
      teardown: () => {
        try {
          hydra?.synth?.hush?.()
        } catch {
          /* ignore */
        }
      },
    }
  }

  function applyAndDraw(frame: SignalFrame): void {
    const s = state
    if (!s) return
    // Bus tick (PK22 — drops stale seq, ticks once) + refresh the raw shims.
    s.feed.applyFrame(frame)
    let master: AnalyserBytes | undefined
    for (const a of frame.analysers) if (a.key === MASTER_KEY) master = a
    s.rawAnalyser.set(master)
    s.rawScheduler.set(frame.rawScheduler)

    if (!s.setupDone() || s.paused) return
    try {
      s.draw() // kind-specific (p5 redraw+blit | hydra fft+tick)
    } catch (e) {
      diag('error', `draw threw: ${errMsg(e)}`, errStack(e))
      return
    }
    // First successful frame → one-shot liveness signal (#247 fallback gate).
    if (!s.readySent) {
      s.readySent = true
      signalReady()
    }
  }

  function resize(w: number, h: number, dpr: number): void {
    const s = state
    if (!s) return
    s.dpr = dpr > 0 ? dpr : 1
    s.containerSizeRef.current = { w, h }
    try {
      s.resizeKind(w, h, s.dpr)
    } catch (e) {
      diag('error', `resize failed: ${errMsg(e)}`)
    }
  }

  function destroy(): void {
    const s = state
    state = null
    if (!s) return
    try {
      s.reader.dispose()
    } catch {
      /* ignore */
    }
    try {
      s.teardown()
    } catch {
      /* ignore */
    }
  }
}

/** Back-compat alias — the app's worker entry historically called `hostP5Worker`.
 *  The host now serves both kinds; the name is retained so existing wiring (and
 *  the worker-safe `index.ts` export) keeps resolving. Prefer `hostVizWorker`. */
export const hostP5Worker = hostVizWorker

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
function errStack(e: unknown): string | undefined {
  return e instanceof Error
    ? String(e.stack || '').split('\n').slice(0, 6).join('\n')
    : undefined
}
