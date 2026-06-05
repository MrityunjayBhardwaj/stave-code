/**
 * WorkerVizRenderer — a `VizRenderer` that runs the p5 sketch in an
 * OffscreenCanvas Web Worker, off the main thread (Phase B / B-3, epic #228).
 *
 * It is the MAIN-side counterpart to `hostP5Worker`:
 *   - `mount`   — create a `<canvas>`, `transferControlToOffscreen()`, spawn a
 *     worker (via the app-injected factory), post a `mount` with the sketch CODE
 *     STRING + transferred canvas, and start ONE main `requestAnimationFrame`
 *     loop that `sample()`s the live signal feed + `writeFrame()`s it to the
 *     worker. That rAF is the single clock — the worker draws exactly one frame
 *     per `writeFrame` (1:1 → cadence can't drift; PK22).
 *   - `update`  — rebind the sampler's live inputs (re-evaluate swaps analysers /
 *     scheduler / hap stream), mirroring P5VizRenderer.update.
 *   - `resize`  — forward the new size + DPR to the worker.
 *   - `pause`/`resume` — stop/start the sampling loop + tell the worker.
 *   - `destroy` — stop the loop, tell the worker to tear down, terminate it.
 *
 * The ONLY per-frame main-thread cost is `sample()` (read analyser bytes + ONE
 * wide scheduler query + now) + a transferable `postMessage` — the heavy
 * `draw()` is gone from main. That residual is what the matrix measures (PLAN §8).
 *
 * Falls back is NOT handled here: `makeRenderer` only constructs a
 * WorkerVizRenderer when a worker factory is registered AND the transport is
 * worker-capable; otherwise it builds a `P5VizRenderer`. If the factory is
 * somehow absent at mount, `mount` reports via `onError` so the host can recover.
 *
 * REF: hostP5Worker.ts, signalSampler.ts, signalTransport.ts, vizWorkerFactory.ts,
 *      P5VizRenderer.ts (the lifecycle + alias contract mirrored here), PK22.
 */

import type { EngineComponents } from '../../engine/LiveCodingEngine'
import type { VizRenderer } from '../types'
import type { BusAnalyser } from '../signals/SignalBus'
import type { IRPattern } from '../../ir/IRPattern'
import { MainSignalSampler } from '../worker/signalSampler'
import { createPostMessageWriter, type SignalTransportWriter } from '../worker/signalTransport'
import { getVizWorkerFactory } from '../vizWorkerFactory'
import { resolveAliasesForEngine, DEFAULT_VIZ_ENGINE } from '../signals/aliasMap'
import { getStoredSignalAliases } from '../../workspace/editorRegistry'
import { perf } from '../../perf/profiler'
import type {
  MountMessage,
  WorkerDiagMessage,
  WorkerReadyMessage,
  WorkerFrameAckMessage,
} from '../worker/workerMessages'

let workerPerfSeq = 0

/**
 * Max SignalFrames allowed in flight (written but not yet acked by the worker)
 * before the main sampler stops producing — the #261 backpressure cap. The main
 * rAF can fire at the display rate (e.g. 120fps) while a heavy-WEBGL worker draws
 * far slower (~20fps); without a bound, the surplus backlogs in the worker's
 * postMessage queue and the worker renders seconds-stale data (looks "static").
 * A small cap keeps the worker's queue ~1 frame deep (always drawing the freshest
 * sampled frame) while leaving one frame buffered so it never idles waiting.
 */
const MAX_FRAMES_IN_FLIGHT = 2

export class WorkerVizRenderer implements VizRenderer {
  private worker: Worker | null = null
  private writer: SignalTransportWriter | null = null
  private readonly sampler = new MainSignalSampler()
  private rafId = 0
  private running = false
  /** Frames written but not yet acked by the worker (#261 backpressure). The
   *  sampler skips producing while this is at the cap so a slow worker can't be
   *  flooded into a stale backlog. Reset to 0 on (re)start so a resume can't be
   *  wedged by acks owed for frames written before a pause. */
  private inFlight = 0
  private size = { w: 400, h: 300 }
  private onError: ((e: Error) => void) | null = null
  private readonly perfId = `worker#${++workerPerfSeq}`
  private diagHandler: ((ev: MessageEvent) => void) | null = null
  /** The presenting <canvas> this renderer appended (transferred to the worker).
   *  Tracked so destroy() removes it — else a fallback to the main-thread renderer
   *  would leave a dead, frozen canvas behind it (#247). */
  private canvasEl: HTMLCanvasElement | null = null
  /** Fired ONCE when the worker posts its first-frame `ready` (#247). The
   *  `FallbackVizRenderer` sets this to learn the worker is healthy. */
  private onReady: (() => void) | null = null

  /** @param kind renderer kind (`'p5'` B-3 / `'hydra'` B-5). @param code raw
   *  sketch source. @param name workspace path (error attribution). */
  constructor(
    private readonly kind: 'p5' | 'hydra',
    private readonly code: string,
    private readonly name: string,
  ) {}

  /** Register a callback fired once when the worker reports its first successful
   *  frame (`ready`). Used by `FallbackVizRenderer` to end the startup probation;
   *  must be set BEFORE `mount`. */
  whenReady(cb: () => void): void {
    this.onReady = cb
  }

  mount(
    container: HTMLDivElement,
    components: Partial<EngineComponents>,
    size: { w: number; h: number },
    onError: (e: Error) => void,
  ): void {
    this.onError = onError
    this.size = { w: size.w, h: size.h }
    perf.gauge('viz.worker', 1) // live worker-viz gauge (#228); -1 in destroy()

    const make = getVizWorkerFactory()
    if (!make) {
      onError(new Error('WorkerVizRenderer: no viz-worker factory registered'))
      return
    }

    try {
      // ── presenting canvas: the worker owns it via transferControlToOffscreen;
      // the browser composites the worker's draws into this element. ──
      const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1
      const canvas = document.createElement('canvas')
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.display = 'block'
      canvas.width = Math.max(1, Math.round(size.w * dpr))
      canvas.height = Math.max(1, Math.round(size.h * dpr))
      container.appendChild(canvas)
      this.canvasEl = canvas
      const offscreen = canvas.transferControlToOffscreen()

      const worker = make()
      this.worker = worker
      this.writer = createPostMessageWriter(worker)

      // Worker → main diagnostics (sketch errors, ready). Forward errors to the
      // host's onError so the existing engineLog/console surfacing applies.
      this.diagHandler = (ev: MessageEvent) => {
        const d = ev.data as
          | WorkerDiagMessage
          | WorkerReadyMessage
          | WorkerFrameAckMessage
          | undefined
        if (!d) return
        if (d.type === 'frameAck') {
          // The worker consumed a frame — free a slot in the bounded pipeline (#261).
          if (this.inFlight > 0) this.inFlight--
          return
        }
        if (d.type === 'ready') {
          // First successful worker frame — end the fallback probation (#247).
          this.onReady?.()
          return
        }
        if (d.type !== 'diag') return
        if (d.level === 'error') {
          // Surface the WORKER-side stack (the throw site) — the forwarded Error
          // only carries the message, so the worker stack would otherwise be lost.
          // eslint-disable-next-line no-console
          console.error(`[viz worker ${this.name}] ${d.message}`, d.stack ? `\n${d.stack}` : '')
          onError(new Error(`[viz worker ${this.name}] ${d.message}`))
        }
      }
      worker.addEventListener('message', this.diagHandler)

      // Bind the live signal feed, then ship the mount with the transferred canvas.
      this.bindSampler(components)
      const aliases = resolveAliasesForEngine(getStoredSignalAliases(), DEFAULT_VIZ_ENGINE)
      const mountMsg: MountMessage = {
        type: 'mount',
        kind: this.kind,
        code: this.code,
        name: this.name,
        canvas: offscreen,
        size: { w: size.w, h: size.h },
        dpr,
        aliases,
      }
      worker.postMessage(mountMsg, [offscreen])

      this.start()
    } catch (e) {
      onError(e as Error)
    }
  }

  update(components: Partial<EngineComponents>): void {
    if (!this.worker) return
    this.bindSampler(components)
  }

  resize(w: number, h: number): void {
    this.size = { w, h }
    const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1
    this.worker?.postMessage({ type: 'resize', w, h, dpr })
  }

  pause(): void {
    this.stop()
    this.worker?.postMessage({ type: 'pause' })
  }

  resume(): void {
    this.worker?.postMessage({ type: 'resume' })
    this.start()
  }

  destroy(): void {
    perf.gauge('viz.worker', -1)
    perf.dropFrames(this.perfId)
    this.stop()
    const worker = this.worker
    this.worker = null
    if (worker) {
      try {
        worker.postMessage({ type: 'destroy' })
      } catch {
        /* ignore */
      }
      if (this.diagHandler) worker.removeEventListener('message', this.diagHandler)
      // Terminate after a microtask so the destroy message is delivered first
      // (terminate is immediate; the message would otherwise be dropped). The
      // worker's own teardown also runs on destroy, so this is belt-and-braces.
      try {
        worker.terminate()
      } catch {
        /* ignore */
      }
    }
    this.diagHandler = null
    try {
      this.writer?.dispose()
    } catch {
      /* ignore */
    }
    this.writer = null
    this.sampler.dispose()
    // Remove the (now frozen) presenting canvas — its control was transferred to
    // the terminated worker, so it can never paint again; leaving it in the DOM
    // would stack a dead canvas behind a fallback main-thread renderer (#247).
    try {
      this.canvasEl?.remove()
    } catch {
      /* ignore */
    }
    this.canvasEl = null
  }

  /** Bind the sampler's live inputs from the component bag (mirror P5VizRenderer:
   *  scheduler + per-track schedulers, master + per-track analysers, hap stream). */
  private bindSampler(components: Partial<EngineComponents>): void {
    this.sampler.bind({
      scheduler: (components.queryable?.scheduler ?? null) as IRPattern | null,
      trackSchedulers: (components.queryable?.trackSchedulers ?? null) as Map<string, IRPattern> | null,
      masterAnalyser: (components.audio?.analyser ?? null) as BusAnalyser | null,
      trackAnalysers: (components.audio?.trackAnalysers ?? null) as Map<string, BusAnalyser> | null,
    })
    this.sampler.bindHapStream(components.streaming?.hapStream ?? null)
  }

  /** Start the main rAF sample→writeFrame loop (the single cadence clock). */
  private start(): void {
    if (this.running) return
    this.running = true
    this.inFlight = 0 // fresh pipeline on (re)start — drop any owed acks (#261)
    const tick = (): void => {
      if (!this.running || !this.writer) return
      // #261 backpressure: only produce while the worker hasn't fallen `cap`
      // frames behind. The rAF keeps ticking (so we resume the instant an ack
      // frees a slot), but we skip sample()+writeFrame() when the pipeline is
      // full — this paces main's output to the worker's actual draw rate, so the
      // worker always draws the freshest frame instead of a stale backlog. NOT
      // sampling when skipped is deliberate: it lets the hap bumps accumulate
      // into the NEXT produced frame (envelope energy preserved, PK22) and saves
      // the duplicated main sample work when the worker is the bottleneck.
      if (this.inFlight < MAX_FRAMES_IN_FLIGHT) {
        perf.frame(this.perfId)
        // Decompose the per-frame main cost into its two parts so the matrix can
        // attribute it (B-4 decision gate, #249): `sample` = analyser reads + the
        // wide scheduler query (duplicated work, only a SHARED sampler removes the
        // N×); `write` = transport (envelope structured-clone + postMessage —
        // bytes already transferred zero-copy; this is the slice SAB removes).
        perf.begin('viz.worker.sample')
        const frame = this.sampler.sample()
        perf.end('viz.worker.sample')
        perf.begin('viz.worker.write')
        this.writer.writeFrame(frame)
        perf.end('viz.worker.write')
        this.inFlight++
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stop(): void {
    this.running = false
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }
}
