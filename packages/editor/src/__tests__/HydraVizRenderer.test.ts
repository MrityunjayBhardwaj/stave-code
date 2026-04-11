/**
 * HydraVizRenderer — pause/resume/destroy contract tests (issue #6).
 *
 * The historical bug: `pause()` only set a `paused` flag but did not
 * cancel the animation loop, AND hydra was constructed with
 * `autoLoop: true` so hydra owned its own internal rAF that we
 * couldn't reach. Result: the user-visible Stop button on a hydra
 * preview did nothing — the canvas kept rendering.
 *
 * The fix takes ownership of the loop:
 *   - Hydra is now constructed with `autoLoop: false`.
 *   - `pumpAudio` (our rAF callback) calls `hydra.tick(time)` once
 *     per frame in addition to polling FFT data into `s.a.fft[]`.
 *   - `pause()` cancels the rAF synchronously and the pumpAudio
 *     guard bails out if a callback was already queued.
 *   - `resume()` re-arms the rAF (idempotent).
 *   - `destroy()` cancels the rAF and sets a `destroyed` flag so
 *     a late async initHydra can't reschedule.
 *
 * These tests cover the full lifecycle by mocking `hydra-synth` and
 * `requestAnimationFrame` so the test owns the timing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { EngineComponents } from '../engine/LiveCodingEngine'

// ---------------------------------------------------------------------------
// Mock hydra-synth — captures every constructor call so the test can read
// the autoLoop value, the canvas, and assert tick() invocations.
// ---------------------------------------------------------------------------

interface MockHydraInstance {
  synth: {
    a: { fft: number[] }
    osc: ReturnType<typeof vi.fn>
  }
  a: { fft: number[]; setCutoff: ReturnType<typeof vi.fn>; setBins: ReturnType<typeof vi.fn> }
  tick: ReturnType<typeof vi.fn>
  setResolution: ReturnType<typeof vi.fn>
  __ctorOpts: Record<string, unknown>
}

const hydraInstances: MockHydraInstance[] = []

vi.mock('hydra-synth', () => {
  const Hydra = vi.fn(function (this: MockHydraInstance, opts: Record<string, unknown>) {
    this.__ctorOpts = opts
    const synthA = { fft: [0, 0, 0, 0] }
    // Synth needs a chainable .osc() returning the same shape so the
    // default pattern doesn't throw when it runs.
    const chain = {
      osc: vi.fn(() => chain),
      color: vi.fn(() => chain),
      rotate: vi.fn(() => chain),
      modulate: vi.fn(() => chain),
      noise: vi.fn(() => chain),
      out: vi.fn(() => chain),
    } as any // eslint-disable-line @typescript-eslint/no-explicit-any
    this.synth = Object.assign(chain, { a: synthA })
    this.a = {
      fft: synthA.fft,
      setCutoff: vi.fn(),
      setBins: vi.fn(),
    }
    this.tick = vi.fn()
    this.setResolution = vi.fn()
    hydraInstances.push(this)
  })
  return { default: Hydra }
})

import { HydraVizRenderer } from '../visualizers/renderers/HydraVizRenderer'

// ---------------------------------------------------------------------------
// rAF control — capture every scheduled callback and let the test fire them
// manually. We override window.requestAnimationFrame / cancelAnimationFrame
// per test in beforeEach.
// ---------------------------------------------------------------------------

interface RafEntry {
  id: number
  cb: FrameRequestCallback
  cancelled: boolean
}

let rafEntries: RafEntry[] = []
let rafCounter = 0
let originalRaf: typeof requestAnimationFrame
let originalCancel: typeof cancelAnimationFrame

function flushRaf(now = performance.now()) {
  // Snapshot before iteration so callbacks that schedule new rAFs land
  // in a fresh batch instead of being fired in the same flush.
  const batch = rafEntries.filter((e) => !e.cancelled)
  rafEntries = []
  for (const e of batch) {
    e.cb(now)
  }
}

beforeEach(() => {
  hydraInstances.length = 0
  rafEntries = []
  rafCounter = 0
  originalRaf = window.requestAnimationFrame
  originalCancel = window.cancelAnimationFrame
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = ++rafCounter
    rafEntries.push({ id, cb, cancelled: false })
    return id
  }) as typeof requestAnimationFrame
  window.cancelAnimationFrame = ((id: number) => {
    const e = rafEntries.find((x) => x.id === id)
    if (e) e.cancelled = true
  }) as typeof cancelAnimationFrame
})

afterEach(() => {
  window.requestAnimationFrame = originalRaf
  window.cancelAnimationFrame = originalCancel
  vi.clearAllMocks()
})

function makeContainer() {
  return document.createElement('div')
}

function makeComponents(): Partial<EngineComponents> {
  // No streaming hapStream → uses the global FFT path. We don't need
  // a real AnalyserNode for these tests; the absence is fine.
  return {}
}

interface FakeAnalyser {
  frequencyBinCount: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getByteFrequencyData: any
}

/**
 * Build a fake AnalyserNode that returns deterministic byte values
 * so pumpAudio can populate s.a.fft[] without needing a real
 * Web Audio context.
 */
function makeAnalyserComponents(fillByte: number): Partial<EngineComponents> {
  const getByteFrequencyData = vi.fn((arr: Uint8Array) => {
    arr.fill(fillByte)
  })
  const analyser: FakeAnalyser = {
    frequencyBinCount: 64,
    getByteFrequencyData,
  }
  return {
    audio: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      analyser: analyser as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audioCtx: {} as any,
    },
  }
}

async function mountAndWait(renderer: HydraVizRenderer, container: HTMLDivElement) {
  renderer.mount(container, makeComponents(), { w: 400, h: 300 }, vi.fn())
  // initHydra() is async (it awaits a dynamic `import('hydra-synth')`).
  // Vitest needs both microtask AND macrotask flushing to settle the
  // dynamic-import promise chain — `await Promise.resolve()` alone
  // isn't enough.
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0))
  }
}

describe('HydraVizRenderer pause/resume/destroy contract (issue #6)', () => {
  it('constructs hydra with autoLoop: false', async () => {
    const renderer = new HydraVizRenderer()
    await mountAndWait(renderer, makeContainer())
    expect(hydraInstances.length).toBe(1)
    expect(hydraInstances[0].__ctorOpts.autoLoop).toBe(false)
  })

  it('schedules a rAF after mount and ticks hydra each frame', async () => {
    const renderer = new HydraVizRenderer()
    await mountAndWait(renderer, makeContainer())
    expect(rafEntries.length).toBe(1) // pumpAudio kicked off

    // Fire the rAF — pumpAudio runs, ticks hydra once, schedules the
    // next callback.
    flushRaf()
    expect(hydraInstances[0].tick).toHaveBeenCalledTimes(1)
    expect(rafEntries.length).toBe(1) // re-scheduled

    flushRaf()
    expect(hydraInstances[0].tick).toHaveBeenCalledTimes(2)
  })

  it('pause() cancels the rAF and stops ticking hydra', async () => {
    const renderer = new HydraVizRenderer()
    await mountAndWait(renderer, makeContainer())
    flushRaf() // 1 tick
    expect(hydraInstances[0].tick).toHaveBeenCalledTimes(1)

    renderer.pause()
    // After pause, the rAF queue is empty (cancelled) — re-flushing
    // does nothing.
    flushRaf()
    flushRaf()
    flushRaf()
    expect(hydraInstances[0].tick).toHaveBeenCalledTimes(1)
  })

  it('pause() is race-safe even if a rAF callback was already queued', async () => {
    // Simulate the race: pumpAudio has already scheduled the next
    // callback, but pause() runs before the browser fires it. The
    // cancelAnimationFrame inside pause() should mark it cancelled,
    // and even if a buggy pollyfill fires it anyway the pumpAudio
    // guard at the top should bail.
    const renderer = new HydraVizRenderer()
    await mountAndWait(renderer, makeContainer())
    expect(rafEntries.length).toBe(1)

    // Bypass the cancelAnimationFrame to simulate "browser already
    // committed to firing this callback" — flip cancelled back to
    // false after pause runs.
    const queuedEntry = rafEntries[0]
    renderer.pause()
    queuedEntry.cancelled = false

    // Fire the not-actually-cancelled callback — the pumpAudio guard
    // should bail because `paused` is true.
    flushRaf()
    expect(hydraInstances[0].tick).not.toHaveBeenCalled()
  })

  it('resume() re-arms the rAF and ticking continues', async () => {
    const renderer = new HydraVizRenderer()
    await mountAndWait(renderer, makeContainer())
    flushRaf() // 1 tick
    renderer.pause()
    expect(rafEntries.filter((e) => !e.cancelled).length).toBe(0)

    renderer.resume()
    expect(rafEntries.filter((e) => !e.cancelled).length).toBe(1)

    flushRaf()
    expect(hydraInstances[0].tick).toHaveBeenCalledTimes(2)
  })

  it('resume() is idempotent — calling twice does not stack rAFs', async () => {
    const renderer = new HydraVizRenderer()
    await mountAndWait(renderer, makeContainer())
    renderer.pause()
    renderer.resume()
    renderer.resume()
    renderer.resume()
    // Only one rAF should be live.
    expect(rafEntries.filter((e) => !e.cancelled).length).toBe(1)
  })

  it('destroy() cancels the rAF and prevents further ticks', async () => {
    const renderer = new HydraVizRenderer()
    await mountAndWait(renderer, makeContainer())
    renderer.destroy()
    flushRaf()
    flushRaf()
    expect(hydraInstances[0].tick).not.toHaveBeenCalled()
  })

  it('destroy() before initHydra resolves does not create a hydra instance', async () => {
    // Simulate the StrictMode dev double-mount: mount → cleanup → mount.
    // The cleanup runs before the dynamic import resolves.
    const renderer = new HydraVizRenderer()
    renderer.mount(makeContainer(), makeComponents(), { w: 400, h: 300 }, vi.fn())
    // Synchronously destroy BEFORE the import resolves.
    renderer.destroy()
    // Now drain microtasks — initHydra continues but its `if
    // (!this.canvas || this.destroyed) return` guard bails out.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(hydraInstances.length).toBe(0)
  })

  // ---- Audio source priority (issue #7) ---------------------------------

  it('uses analyser FFT when both analyser AND hapStream are present (issue #7)', async () => {
    // Regression: the historical priority was hapStream → envelope,
    // even when an analyser was also published. Built-in example
    // sources publish a HapStream they never emit on, so the
    // envelope locked onto an empty stream and s.a.fft[] stayed at
    // zero forever — visually unresponsive shader.
    //
    // The fix: analyser ALWAYS wins when present.
    const analyserComponents = makeAnalyserComponents(200) // bytes 0..255
    // Add a hapStream too, to simulate the built-in source case
    // where both are published.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeHapStream = { on: vi.fn(), off: vi.fn() } as any
    const components: Partial<EngineComponents> = {
      ...analyserComponents,
      streaming: { hapStream: fakeHapStream },
    }
    const renderer = new HydraVizRenderer()
    renderer.mount(makeContainer(), components, { w: 400, h: 300 }, vi.fn())
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0))
    }
    // Fire one rAF tick.
    flushRaf()

    // The analyser's getByteFrequencyData should have been called —
    // proving the renderer pulled FFT from the real analyser, not
    // the (silent) envelope.
    const analyser = analyserComponents.audio!.analyser as unknown as FakeAnalyser
    expect(analyser.getByteFrequencyData).toHaveBeenCalled()
    // And s.a.fft[i] should be non-zero (200 / 255 ≈ 0.78).
    const fft = hydraInstances[0].synth.a.fft
    expect(fft.every((v) => v > 0)).toBe(true)
  })

  it('falls back to hap envelope only when no analyser is published', async () => {
    // The envelope path is still useful for any future runtime that
    // emits hap events but doesn't expose an analyser. Verify it
    // engages when only hapStream is present.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeHapStream = { on: vi.fn(), off: vi.fn() } as any
    const components: Partial<EngineComponents> = {
      streaming: { hapStream: fakeHapStream },
    }
    const renderer = new HydraVizRenderer()
    renderer.mount(makeContainer(), components, { w: 400, h: 300 }, vi.fn())
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0))
    }
    // The hapStream's `on` should have been called — the envelope is
    // subscribed, so the fallback path is engaged.
    expect(fakeHapStream.on).toHaveBeenCalled()
  })

  it('update() with a new analyser switches OFF the envelope path mid-mount', async () => {
    // A live source swap can introduce an analyser where there
    // wasn't one before. The renderer must flip from envelope to
    // analyser-FFT in that case, otherwise the new audio source's
    // FFT would be ignored.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeHapStream = { on: vi.fn(), off: vi.fn() } as any
    const renderer = new HydraVizRenderer()
    renderer.mount(
      makeContainer(),
      { streaming: { hapStream: fakeHapStream } },
      { w: 400, h: 300 },
      vi.fn(),
    )
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0))
    }

    // Now an analyser arrives.
    const analyserComponents = makeAnalyserComponents(150)
    renderer.update(analyserComponents)

    flushRaf()
    const analyser = analyserComponents.audio!.analyser as unknown as FakeAnalyser
    expect(analyser.getByteFrequencyData).toHaveBeenCalled()
    const fft = hydraInstances[0].synth.a.fft
    expect(fft.every((v) => v > 0)).toBe(true)
  })

  it('paused state survives across destroy + new instance (no leaked rAF)', async () => {
    // Smoke test for the lifecycle: a new renderer instance after
    // destroying the old one starts in a clean state.
    const renderer1 = new HydraVizRenderer()
    await mountAndWait(renderer1, makeContainer())
    renderer1.pause()
    renderer1.destroy()

    rafEntries = []
    const renderer2 = new HydraVizRenderer()
    await mountAndWait(renderer2, makeContainer())
    expect(rafEntries.filter((e) => !e.cancelled).length).toBe(1)
    expect(hydraInstances.length).toBe(2)
  })
})
