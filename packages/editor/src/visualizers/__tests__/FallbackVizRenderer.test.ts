/**
 * FallbackVizRenderer (#247) — the startup-probation contract: a worker that
 * fails to start (throws or hangs before its first frame) degrades to the
 * main-thread renderer; a user-sketch error AFTER the worker is healthy does NOT
 * downgrade rendering. Pure unit test with fake renderers + fake timers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { FallbackVizRenderer } from '../renderers/FallbackVizRenderer'
import type { WorkerVizRenderer } from '../renderers/WorkerVizRenderer'
import type { VizRenderer } from '../types'

/** A fake renderer that records calls + exposes the onError it was mounted with. */
class FakeRenderer implements VizRenderer {
  mounted = false
  destroyed = false
  updates = 0
  resizes: Array<[number, number]> = []
  paused = false
  capturedOnError: ((e: Error) => void) | null = null
  mount(
    _c: HTMLDivElement,
    _comp: unknown,
    _s: { w: number; h: number },
    onError: (e: Error) => void,
  ): void {
    this.mounted = true
    this.capturedOnError = onError
  }
  update(): void {
    this.updates++
  }
  resize(w: number, h: number): void {
    this.resizes.push([w, h])
  }
  pause(): void {
    this.paused = true
  }
  resume(): void {
    this.paused = false
  }
  destroy(): void {
    this.destroyed = true
  }
}

/** A fake worker renderer — a FakeRenderer plus the `whenReady` hook the wrapper
 *  arms before mount. */
class FakeWorkerRenderer extends FakeRenderer {
  readyCb: (() => void) | null = null
  whenReady(cb: () => void): void {
    this.readyCb = cb
  }
}

function makeContainer(): HTMLDivElement {
  return document.createElement('div')
}

describe('FallbackVizRenderer — startup probation (#247)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('worker error BEFORE ready → falls back to the main renderer', () => {
    const worker = new FakeWorkerRenderer()
    const main = new FakeRenderer()
    const fb = new FallbackVizRenderer(
      () => worker as unknown as WorkerVizRenderer,
      () => main,
    )
    const onError = vi.fn()
    fb.mount(makeContainer(), {}, { w: 100, h: 100 }, onError)

    expect(worker.mounted).toBe(true)
    expect(main.mounted).toBe(false)

    // Worker throws at startup (e.g. the i18n import bug) — BEFORE any ready.
    worker.capturedOnError?.(new Error('import failed'))

    expect(worker.destroyed).toBe(true)
    expect(main.mounted).toBe(true)
    // The startup error is NOT surfaced to the host — it was recovered by falling back.
    expect(onError).not.toHaveBeenCalled()
  })

  it('worker error AFTER ready → surfaces, does NOT fall back (user sketch error)', () => {
    const worker = new FakeWorkerRenderer()
    const main = new FakeRenderer()
    const fb = new FallbackVizRenderer(
      () => worker as unknown as WorkerVizRenderer,
      () => main,
    )
    const onError = vi.fn()
    fb.mount(makeContainer(), {}, { w: 100, h: 100 }, onError)

    // Worker drew its first frame → healthy.
    worker.readyCb?.()
    // Later, the user's sketch throws on a frame.
    const err = new Error('draw threw')
    worker.capturedOnError?.(err)

    expect(main.mounted).toBe(false) // no downgrade
    expect(worker.destroyed).toBe(false)
    expect(onError).toHaveBeenCalledWith(err) // surfaced normally
  })

  it('worker never frames within probation → timeout falls back', () => {
    const worker = new FakeWorkerRenderer()
    const main = new FakeRenderer()
    const fb = new FallbackVizRenderer(
      () => worker as unknown as WorkerVizRenderer,
      () => main,
    )
    fb.mount(makeContainer(), {}, { w: 100, h: 100 }, vi.fn())

    expect(main.mounted).toBe(false)
    vi.advanceTimersByTime(8001) // past PROBATION_MS
    expect(worker.destroyed).toBe(true)
    expect(main.mounted).toBe(true)
  })

  it('ready before timeout → no fallback on timer fire', () => {
    const worker = new FakeWorkerRenderer()
    const main = new FakeRenderer()
    const fb = new FallbackVizRenderer(
      () => worker as unknown as WorkerVizRenderer,
      () => main,
    )
    fb.mount(makeContainer(), {}, { w: 100, h: 100 }, vi.fn())
    worker.readyCb?.() // healthy before the timer
    vi.advanceTimersByTime(20000)
    expect(main.mounted).toBe(false)
    expect(worker.destroyed).toBe(false)
  })

  it('delegates update/resize/pause/destroy to the active renderer', () => {
    const worker = new FakeWorkerRenderer()
    const main = new FakeRenderer()
    const fb = new FallbackVizRenderer(
      () => worker as unknown as WorkerVizRenderer,
      () => main,
    )
    fb.mount(makeContainer(), {}, { w: 100, h: 100 }, vi.fn())
    worker.readyCb?.() // stay on the worker

    fb.update({})
    fb.resize(640, 480)
    fb.pause()
    fb.resume()
    fb.destroy()

    expect(worker.updates).toBe(1)
    expect(worker.resizes).toEqual([[640, 480]])
    expect(worker.destroyed).toBe(true)
  })

  it('after fallback, update/resize delegate to the MAIN renderer', () => {
    const worker = new FakeWorkerRenderer()
    const main = new FakeRenderer()
    const fb = new FallbackVizRenderer(
      () => worker as unknown as WorkerVizRenderer,
      () => main,
    )
    fb.mount(makeContainer(), {}, { w: 100, h: 100 }, vi.fn())
    worker.capturedOnError?.(new Error('boom')) // fall back

    fb.update({})
    fb.resize(800, 600)
    expect(main.updates).toBe(1)
    expect(main.resizes).toEqual([[800, 600]])
  })
})
