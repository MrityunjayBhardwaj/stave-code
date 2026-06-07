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
import { subscribeLog, type LogEntry } from '../../engine/engineLog'
import { getVizConfig, updateVizConfig } from '../vizConfig'
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

/** A WebGL context viewed only through the `WEBGL_lose_context` extension — enough
 *  to release the GPU context (#266). A 2D context's `getExtension` returns null. */
interface GLLoseCtx {
  getExtension(name: string): { loseContext?: () => void } | null
  isContextLost?: () => boolean
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
  /** The kind's live WebGL context, or null for a 2D / no-GL sketch (#266). The
   *  host accounts it (`glctx+`) and explicitly loses it on teardown so a POOLED
   *  warm worker doesn't retain the context past Chrome's ~16-context cap. p5:
   *  `inst.drawingContext`; hydra: the presenting canvas context. */
  gl?: () => GLLoseCtx | null
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

/** #266 diag messages — the worker reports WebGL-context lifecycle so the main
 *  thread can drive a `viz.glctx` gauge (live GL contexts), mirroring `viz.worker`. */
const GLCTX_UP = 'glctx+'
/** #266 fix toggle: when true, teardown explicitly loses the kind's WebGL context
 *  (`WEBGL_lose_context`) so a POOLED warm worker frees the context slot instead of
 *  leaving it to the idle worker's lazy GC. p5/hydra never call loseContext (p5
 *  2.2.3 source has no such call; hydra teardown only hush()es), so without this a
 *  parked worker retains its context toward Chrome's ~16-context cap. Flipped to
 *  false ONLY for the throwaway A/B that demonstrates the leak. */
const GLCTX_RELEASE = true

export function hostVizWorker(scope: WorkerScope): void {
  let state: MountState | null = null
  // Profiler bridge (#230 Phase F): wall-time of the last completed s.draw(),
  // piggybacked on the next frameAck → main records `viz.worker.draw`. Reset per
  // mount so a new sketch doesn't report the previous one's cost.
  let lastDrawMs: number | undefined

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

  // #257 — surface viz runtime errors that are otherwise SWALLOWED in the worker.
  // p5Compiler wraps each user lifecycle hook (draw/setup) in a try/catch that
  // reports to the worker-LOCAL engineLog (emitLog) and SWALLOWS the throw — so it
  // never reaches the host's synchronous catch, and the worker engineLog isn't
  // wired to the main console → a per-frame draw() typo = silent blank. We RE-EMIT
  // those entries into the MAIN engineLog (`vizlog` → Console panel + squiggle,
  // like the main-thread path), NOT via `diag`/onError (a post-ready user typo must
  // surface WITHOUT tearing the worker down). Hydra's tick() is NOT emitLog-wrapped
  // → its sync throws come through the s.draw() catch below; both route to
  // postVizLog, deduped to once per unique error so a throw-every-frame sketch
  // reports once, not 60×/s.
  const seenWorkerErrors = new Set<string>()
  const currentRuntimeRef = { kind: 'p5' as LogEntry['runtime'] }
  const postVizLog = (entry: Omit<LogEntry, 'id' | 'ts'>): void => {
    const sig = `${entry.runtime}|${entry.message}|${entry.line ?? ''}`
    if (seenWorkerErrors.has(sig)) return
    if (seenWorkerErrors.size > 64) seenWorkerErrors.clear()
    seenWorkerErrors.add(sig)
    try {
      scope.postMessage({ type: 'vizlog', entry })
    } catch {
      /* postMessage can fail late in teardown — ignore */
    }
  }
  // Forward p5/hydra runtime errors the compiler routed to the worker engineLog.
  subscribeLog((entry) => {
    if (entry?.level === 'error') {
      const { id: _id, ts: _ts, ...rest } = entry
      postVizLog(rest)
    }
  })

  // #266 WebGL-context accounting + release. Stashed at first-draw so destroy() can
  // explicitly lose the context even after `state` is cleared. `glLoseExt` holds the
  // WEBGL_lose_context extension; `glAccounted` guards the one-shot `glctx+` report
  // and the matching loseContext on teardown.
  let glLoseExt: { loseContext?: () => void } | null = null
  let glAccounted = false
  const accountGL = (): void => {
    if (glAccounted || !state) return
    try {
      const ctx = state.gl?.() ?? null
      const ext = ctx?.getExtension?.('WEBGL_lose_context') ?? null
      if (ext) {
        glLoseExt = ext
        glAccounted = true
        diag('info', GLCTX_UP) // main → perf.gauge('viz.glctx', +1)
      }
    } catch {
      /* best-effort accounting — never break the draw loop */
    }
  }
  const releaseGL = (): void => {
    if (!glAccounted) return
    glAccounted = false
    const ext = glLoseExt
    glLoseExt = null
    try {
      if (GLCTX_RELEASE) ext?.loseContext?.() // #266 fix — free the context slot
    } catch {
      /* already lost / unsupported — ignore */
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
      case 'config':
        // Live quality/LOD update (#269) — MERGE onto the worker's own vizConfig
        // singleton so the next draw reads it (e.g. `u.density`) without remount.
        updateVizConfig(msg.patch)
        break
    }
  }

  async function mount(msg: MountMessage): Promise<void> {
    // Tear down a previous mount (a pooled/shared worker re-mount — B-6; harmless
    // for the one-shot worker).
    if (state) destroy()

    // Apply the marshalled vizConfig subset BEFORE building the sketch, so the
    // first frame's `getVizConfig()` reads (u.density, hydra bins) see the user's
    // settings rather than the worker bundle's DEFAULT_VIZ_CONFIG (#269 / #253).
    if (msg.config) updateVizConfig(msg.config)

    currentRuntimeRef.kind = msg.kind // #257 — attribute sync draw throws to the kind
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
      // #266 — p5's WEBGL context lives on its internal render canvas (drawingContext);
      // 2D sketches return a CanvasRenderingContext2D whose getExtension yields null.
      gl: () => (inst?.drawingContext as GLLoseCtx | undefined) ?? null,
      draw: () => {
        inst.redraw() // 1:1 with this frame. User-draw throws are swallowed by
        // p5Compiler's lifecycle wrap → forwarded via the engineLog subscription (#257).
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
      // #266 — hydra renders directly into the presenting canvas (regl owns its
      // WebGL context); re-getContext returns that same context for release.
      gl: () =>
        ((msg.canvas.getContext('webgl2') as GLLoseCtx | null) ??
          (msg.canvas.getContext('webgl') as GLLoseCtx | null)),
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
    // #261 backpressure: ack EVERY received frame (on receipt, not draw success —
    // a pre-setup frame that doesn't draw must still ack or the bounded pipeline
    // deadlocks before p5's async setup completes). The main side caps unacked
    // frames in flight so it can't flood a slow worker into a stale backlog.
    try {
      // Carry the LAST completed draw's duration (known from the prior frame) —
      // this ack is sent on receipt, before THIS frame draws (#230 Phase F bridge).
      scope.postMessage({ type: 'frameAck', drawMs: lastDrawMs })
    } catch {
      /* ignore late-teardown failures */
    }
    // Bus tick (PK22 — drops stale seq, ticks once) + refresh the raw shims.
    s.feed.applyFrame(frame)
    let master: AnalyserBytes | undefined
    for (const a of frame.analysers) if (a.key === MASTER_KEY) master = a
    s.rawAnalyser.set(master)
    s.rawScheduler.set(frame.rawScheduler)

    if (!s.setupDone() || s.paused) return
    const drawT0 = globalThis.performance?.now?.() ?? 0
    try {
      s.draw() // kind-specific (p5 redraw+blit | hydra fft+tick)
    } catch (e) {
      // #257 — sync throws (hydra tick, blit). p5's are emitLog-routed above.
      postVizLog({ level: 'error', runtime: currentRuntimeRef.kind, message: `draw(): ${errMsg(e)}`, stack: errStack(e) })
      return
    }
    // Record this draw's wall-time for the NEXT ack to carry (#230 Phase F).
    lastDrawMs = (globalThis.performance?.now?.() ?? 0) - drawT0
    // First successful frame → one-shot liveness signal (#247 fallback gate).
    if (!s.readySent) {
      s.readySent = true
      signalReady()
      accountGL() // #266 — the GL context exists once a frame has drawn
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
    lastDrawMs = undefined // don't carry a dead sketch's draw cost into the next mount
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
    // #266 — after the kind has neutralised its instance, explicitly lose the
    // (now-orphaned) WebGL context so a POOLED warm worker frees the slot. On the
    // terminate path this is harmless; on reuse the next mount creates a fresh
    // canvas+context, so losing the old one can't affect it.
    releaseGL()
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
