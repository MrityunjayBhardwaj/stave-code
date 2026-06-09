/**
 * vizFramePump — the single rAF clock + shared sampler for ALL worker viz (PV72,
 * #302). The MAIN-THREAD-side partner to `vizGovernor`: the governor coordinates the
 * TOTAL GPU frame budget (the GPU-bound heavy-viz case, P122); this pump collapses the
 * duplicated MAIN-THREAD per-frame SAMPLE work (the many-LIGHT-viz case).
 *
 * ── Why this exists ──
 * Before this, each `WorkerVizRenderer` ran its OWN `requestAnimationFrame` loop and
 * its OWN `MainSignalSampler.sample()`. With N worker viz the per-frame analyser
 * reads + scheduler queries ran N times — B-4 (#249) measured `viz.worker.sample`
 * ≈0.33ms per call, FLAT in N → the duplicated read is the only per-viz main cost
 * that scales. The frame is NOT shareable wholesale (the analyser buffers are
 * transfer-detached, and inline zones bind PER-TRACK so the scheduler/bumps/seq are
 * genuinely per-viz, viewZones.ts:341). So the pump shares the EXPENSIVE READ, not the
 * frame: one rAF, one `FrameSampleCache` per tick that dedups analyser reads +
 * shared-scheduler queries by input-object identity. Each renderer still builds its
 * OWN frame (own sampler/bumps/seq → byte-identical reactivity, PV75).
 *
 * ── What it owns ──
 *   - ONE `requestAnimationFrame` loop, alive only while ≥1 renderer is registered.
 *   - ONE `vizGovernor.observeFrame(ts)` per tick (was per-renderer; idempotent per
 *     ts, so this is equivalent — and now there's exactly one caller).
 *   - A fresh `FrameSampleCache` per tick, passed to every registered renderer.
 *
 * Each registered renderer (`PumpDriven`) keeps ALL its existing per-viz gates
 * (#261 backpressure, maxFps cap, `governor.mayProduce`, resolution lever, paused) —
 * the pump just calls `pumpTick(ts, cache)` instead of the renderer self-scheduling.
 * Registration is on the renderer's start (mount/resume); unregister on stop
 * (pause/destroy) — mirrors `vizGovernor.register`/`unregister` exactly so the two
 * stay in lockstep.
 *
 * The main-thread `P5VizRenderer` / `HydraVizRenderer` / `GLSLVizRenderer` fallback
 * paths are NOT driven here — they keep their own draw loops; only worker renderers
 * (whose sample work is the duplicated cost) join the pump.
 *
 * REF: PV72, vizGovernor.ts (the sibling cadence owner + observeFrame), PV80/#261
 *      (the per-viz backpressure this preserves), PK22 (1:1 cadence), frameSampleCache.ts,
 *      WorkerVizRenderer.pumpTick (the gate sequence), #302.
 */

import { vizGovernor } from './vizGovernor'
import { FrameSampleCache } from './worker/frameSampleCache'

/** A renderer the pump drives once per rAF tick. Implemented by `WorkerVizRenderer`. */
export interface PumpDriven {
  /** Stable id for the registry (the renderer's `perfId`). */
  readonly perfId: string
  /** Run this renderer's per-frame produce gates + sample(cache)+writeFrame. Called
   *  once per tick while registered. `cache` is the shared per-tick sampler memo
   *  (PV72) — `undefined` when the shared cache is disabled (A/B / escape hatch), in
   *  which case the renderer samples without dedup (every read runs locally). MUST
   *  NOT throw (the pump drives every renderer; one throw would skip the rest) — the
   *  renderer guards its own body. */
  pumpTick(ts: number, cache: FrameSampleCache | undefined): void
}

class VizFramePump {
  private readonly driven = new Map<string, PumpDriven>()
  private rafId = 0
  private running = false
  /** Whether the per-tick shared sampler cache is active (the PV72 dedup). On by
   *  default; `localStorage['stave.viz.pump'] === '0'` disables it — the pump still
   *  runs its single rAF, but each viz samples WITHOUT the shared cache (every
   *  analyser read + query runs per-viz, the pre-pump behaviour). The A/B lever for
   *  the matrix gate + an escape hatch (mirrors `stave.viz.governor`). */
  private sharedCache = true

  constructor() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('stave.viz.pump') === '0') {
        this.sharedCache = false
      }
    } catch {
      /* private mode / no DOM — leave on */
    }
  }

  /** Join the pump (renderer loop START — mount/resume). Idempotent. Starts the
   *  single rAF if it wasn't already running. */
  register(d: PumpDriven): void {
    this.driven.set(d.perfId, d)
    this.ensureLoop()
  }

  /** Leave the pump (renderer loop STOP — pause/destroy). Stops the rAF when the
   *  last renderer leaves so an idle app holds no animation callback. */
  unregister(id: string): void {
    this.driven.delete(id)
    if (this.driven.size === 0) this.stopLoop()
  }

  private ensureLoop(): void {
    if (this.running) return
    if (typeof requestAnimationFrame !== 'function') return // SSR / jsdom — no loop
    this.running = true
    this.rafId = requestAnimationFrame(this.tick)
  }

  private stopLoop(): void {
    this.running = false
    if (this.rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId)
    }
    this.rafId = 0
  }

  private readonly tick = (ts: number): void => {
    if (!this.running) return
    // ONE cadence observation per frame (the governor derives stress from it).
    vizGovernor.observeFrame(ts)
    // ONE cache per tick: dedups the analyser FFT read + shared-scheduler query
    // across every registered viz that shares an input object (PV72). Discarded
    // after the tick — never serves a stale read across frames. `undefined` when
    // the shared cache is disabled (A/B) → each viz samples locally, no dedup.
    const cache = this.sharedCache ? new FrameSampleCache() : undefined
    // Snapshot the values so a renderer that unregisters mid-iteration (e.g. an
    // error → destroy) can't perturb the live Map we're iterating. Guard each call
    // (defense-in-depth beyond the renderer's own try/catch): one driven throwing
    // must not skip the rest or — critically — stop the shared loop for everyone.
    for (const d of [...this.driven.values()]) {
      try {
        d.pumpTick(ts, cache)
      } catch {
        /* a misbehaving driven can't take down the pump */
      }
    }
    this.rafId = requestAnimationFrame(this.tick)
  }

  /** Observability / test hook. */
  state(): { running: boolean; n: number; sharedCache: boolean } {
    return { running: this.running, n: this.driven.size, sharedCache: this.sharedCache }
  }

  /** Test helper — force-clear the registry + stop the loop deterministically.
   *  `sharedCache` defaults back ON unless overridden (matches the constructor). */
  _resetForTest(sharedCache = true): void {
    this.driven.clear()
    this.stopLoop()
    this.sharedCache = sharedCache
  }
}

export const vizFramePump = new VizFramePump()
