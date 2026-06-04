/**
 * hostP5Worker — the bundler-AGNOSTIC worker host that runs a p5 sketch in a
 * `WorkerGlobalScope` and renders it to a transferred `OffscreenCanvas` (Phase B /
 * B-3, epic #228). The app's `viz-worker.ts` (bundled by Next via
 * `new Worker(new URL(...))`) is a two-line shell: `hostP5Worker(self)`.
 *
 * Lifecycle (one worker per renderer for B-3; pool arrives in B-6):
 *   1. `mount`  — install the DOM shim (PV70) BEFORE importing p5 (condition 1),
 *      compile the sketch from its CODE STRING (the SAME pure `compileP5Code` the
 *      main renderer uses — no fork), feed it shim-backed `stave.analyser` /
 *      `stave.scheduler` + a bus-backed `staveUniforms`, and start consuming
 *      `SignalFrame`s.
 *   2. per FRAME — `feed.applyFrame` (owns the ONE bus tick — PK22) + refresh the
 *      raw shims, then drive EXACTLY ONE p5 `redraw()` (1:1 with the main
 *      sampler's frame → cadence can't drift), then blit p5's render canvas onto
 *      the presenting canvas.
 *   3. `resize` / `pause` / `resume` / `destroy` — lifecycle control.
 *
 * RENDER-PRESENT: p5's own canvases stay worker-local throwaways (the shim mints a
 * fresh OffscreenCanvas per `createElement('canvas')` — condition 5); each redraw
 * we BLIT p5's render canvas → the transferred presenting canvas via a
 * `bitmaprenderer` context (`transferToImageBitmap` → `transferFromImageBitmap`,
 * zero-copy). This sidesteps the fragile "which createElement call is the on-screen
 * canvas" problem and keeps ALL p5 cost in the worker (the B-0 spike already proved
 * the WEBGL offscreen content reads back).
 *
 * CADENCE (PK22 resolution): the user setup is wrapped to call `noLoop()` right
 * after it runs, so p5 does NOT auto-loop; we drive one `redraw()` per received
 * frame. `staveUniforms.__tick` is a no-op in the worker (built without `onTick`) —
 * the feed already ticked the bus, so the draw reads an already-ticked bus.
 *
 * REF: PV70 (.anvi/vyapti.md), PK22 (.anvi/krama.md), dom-shim.ts, rawShims.ts,
 *      workerBusFeed.ts, signalTransport.ts, p5Compiler.ts (the shared compiler).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { installWorkerDomShim, wrapCanvas } from './dom-shim'
import { WorkerBusFeed } from './workerBusFeed'
import { RawAnalyserShim, RawSchedulerShim } from './rawShims'
import { createPostMessageReader, type SignalTransportReader } from './signalTransport'
import { MASTER_KEY, type SignalFrame } from './signalFrame'
import { buildStaveUniforms } from '../signals/staveUniforms'
import { compileP5Code } from '../p5Compiler'
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

/** p5's render canvas is a worker-local OffscreenCanvas; this is the subset we read. */
type GlCanvas = OffscreenCanvas

interface MountState {
  inst: any // p5 instance
  feed: WorkerBusFeed
  rawAnalyser: RawAnalyserShim
  rawScheduler: RawSchedulerShim
  containerSizeRef: { current: { w: number; h: number } }
  present: ImageBitmapRenderingContext | null
  canvas: OffscreenCanvas
  reader: SignalTransportReader
  dpr: number
  paused: boolean
  setupDone: () => boolean
}

/** Cached p5 constructor — imported once (after the shim is installed). */
let P5ctor: any = null

export function hostP5Worker(scope: WorkerScope): void {
  let state: MountState | null = null

  const diag = (level: 'error' | 'info', message: string, stack?: string): void => {
    try {
      scope.postMessage({ type: 'diag', level, message, stack })
    } catch {
      /* postMessage can fail late in teardown — ignore */
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
    // for B-3's one-shot worker).
    if (state) destroy()

    // ── condition 1: shim BEFORE importing p5 (registerAddon touches window at
    // module-eval). makeCanvasEl mints a FRESH wrapped OffscreenCanvas per
    // createElement('canvas') (condition 5) — all worker-local; we blit, not
    // transfer, so none of these is the presenting surface. ──
    if (!P5ctor) {
      installWorkerDomShim(() => wrapCanvas(new OffscreenCanvas(1, 1)))
      const mod: any = await import('p5')
      P5ctor = mod.default || mod.p5 || mod
      P5ctor.disableFriendlyErrors = true // condition 3
    }

    const feed = new WorkerBusFeed()
    if (msg.aliases) feed.setAliases(msg.aliases)
    const rawAnalyser = new RawAnalyserShim()
    const rawScheduler = new RawSchedulerShim()
    // No `onTick` → `__tick` is a no-op: the feed drives the bus (PK22).
    const staveUniforms = buildStaveUniforms(feed.bus)

    const containerSizeRef = { current: { w: msg.size.w, h: msg.size.h } }
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
    const dpr = msg.dpr > 0 ? msg.dpr : 1
    msg.canvas.width = Math.max(1, Math.round(msg.size.w * dpr))
    msg.canvas.height = Math.max(1, Math.round(msg.size.h * dpr))
    let present: ImageBitmapRenderingContext | null = null
    try {
      present = msg.canvas.getContext('bitmaprenderer')
    } catch (e) {
      diag('error', `bitmaprenderer unavailable: ${errMsg(e)}`)
    }

    const reader = createPostMessageReader(scope as any)
    state = {
      inst,
      feed,
      rawAnalyser,
      rawScheduler,
      containerSizeRef,
      present,
      canvas: msg.canvas,
      reader,
      dpr,
      paused: false,
      setupDone: () => setup,
    }
    reader.onFrame(applyAndDraw)
    diag('info', `mounted ${msg.kind} viz '${msg.name}' (${msg.size.w}×${msg.size.h}@${dpr})`)
  }

  function applyAndDraw(frame: SignalFrame): void {
    const s = state
    if (!s) return
    // Bus tick (PK22 — drops stale seq, ticks once) + refresh the raw shims.
    s.feed.applyFrame(frame)
    let master = undefined
    for (const a of frame.analysers) if (a.key === MASTER_KEY) master = a
    s.rawAnalyser.set(master)
    s.rawScheduler.set(frame.rawScheduler)

    if (!s.setupDone() || s.paused) return
    try {
      s.inst.redraw() // exactly one draw, 1:1 with this frame
    } catch (e) {
      diag('error', `draw threw: ${errMsg(e)}`, errStack(e))
      return
    }
    blit(s)
  }

  /** Blit p5's render canvas → the presenting canvas (worker-side cost only). */
  function blit(s: MountState): void {
    if (!s.present) return
    const src: GlCanvas | undefined = s.inst?.drawingContext?.canvas
    if (!src) return
    try {
      const bmp = src.transferToImageBitmap()
      s.present.transferFromImageBitmap(bmp)
    } catch (e) {
      diag('error', `present blit failed: ${errMsg(e)}`)
    }
  }

  function resize(w: number, h: number, dpr: number): void {
    const s = state
    if (!s) return
    s.dpr = dpr > 0 ? dpr : 1
    s.containerSizeRef.current = { w, h }
    const bw = Math.max(1, Math.round(w * s.dpr))
    const bh = Math.max(1, Math.round(h * s.dpr))
    try {
      s.canvas.width = bw
      s.canvas.height = bh
      // p5 sizes its render canvas off stave.width/height (containerSizeRef) on
      // the next draw; nudge resizeCanvas so it matches before the next frame.
      s.inst?.resizeCanvas?.(w, h)
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
    const inst = s.inst
    if (inst) {
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
    }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
function errStack(e: unknown): string | undefined {
  return e instanceof Error
    ? String(e.stack || '').split('\n').slice(0, 6).join('\n')
    : undefined
}
