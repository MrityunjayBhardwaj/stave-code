/**
 * vizVisibility (Phase C, #258) — a renderer runs iff its container is on-screen
 * AND the tab is visible; pause/resume fire only on a state TRANSITION. Driven
 * with a fake IntersectionObserver (jsdom has none) + a controllable
 * document.visibilityState.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { registerVizVisibility } from '../vizVisibility'

/** Fake IntersectionObserver that lets a test emit intersection records. */
class FakeIO {
  static instances: FakeIO[] = []
  cb: IntersectionObserverCallback
  disconnected = false
  observed: Element[] = []
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
    FakeIO.instances.push(this)
  }
  observe(el: Element): void {
    this.observed.push(el)
  }
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  emit(isIntersecting: boolean): void {
    this.cb(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

function setTabVisible(visible: boolean): void {
  Object.defineProperty(document, 'visibilityState', {
    value: visible ? 'visible' : 'hidden',
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

function makeRenderer() {
  return { pause: vi.fn(), resume: vi.fn() }
}

describe('vizVisibility (#258)', () => {
  beforeEach(() => {
    FakeIO.instances = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).IntersectionObserver = FakeIO
    setTabVisible(true)
  })
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).IntersectionObserver
  })

  it('on-screen + visible mount → no pause/resume (already running)', () => {
    const r = makeRenderer()
    const off = registerVizVisibility(r, document.createElement('div'))
    expect(r.pause).not.toHaveBeenCalled()
    expect(r.resume).not.toHaveBeenCalled()
    off()
  })

  it('off-screen → pause; back on-screen → resume', () => {
    const r = makeRenderer()
    const off = registerVizVisibility(r, document.createElement('div'))
    const io = FakeIO.instances[0]

    io.emit(false)
    expect(r.pause).toHaveBeenCalledTimes(1)
    io.emit(true)
    expect(r.resume).toHaveBeenCalledTimes(1)
    off()
  })

  it('tab hidden → pause; tab visible (on-screen) → resume', () => {
    const r = makeRenderer()
    const off = registerVizVisibility(r, document.createElement('div'))

    setTabVisible(false)
    expect(r.pause).toHaveBeenCalledTimes(1)
    setTabVisible(true)
    expect(r.resume).toHaveBeenCalledTimes(1)
    off()
  })

  it('running = on-screen AND tab-visible (no resume while still off-screen)', () => {
    const r = makeRenderer()
    const off = registerVizVisibility(r, document.createElement('div'))
    const io = FakeIO.instances[0]

    io.emit(false) // off-screen → pause
    setTabVisible(false) // also hidden — already paused, no extra pause
    expect(r.pause).toHaveBeenCalledTimes(1)
    io.emit(true) // on-screen but tab still hidden → must stay paused
    setTabVisible(true) // now both true → resume (exactly once)
    expect(r.resume).toHaveBeenCalledTimes(1)
    off()
  })

  it('repeated same-state events do NOT re-fire pause/resume', () => {
    const r = makeRenderer()
    const off = registerVizVisibility(r, document.createElement('div'))
    const io = FakeIO.instances[0]

    io.emit(false)
    io.emit(false)
    io.emit(false)
    expect(r.pause).toHaveBeenCalledTimes(1)
    off()
  })

  it('unregister disconnects the observer and stops responding to visibility', () => {
    const r = makeRenderer()
    const off = registerVizVisibility(r, document.createElement('div'))
    const io = FakeIO.instances[0]

    off()
    expect(io.disconnected).toBe(true)
    setTabVisible(false) // no longer registered → no pause
    expect(r.pause).not.toHaveBeenCalled()
  })

  it('no IntersectionObserver → no-op (renderer keeps running)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).IntersectionObserver
    const r = makeRenderer()
    const off = registerVizVisibility(r, document.createElement('div'))
    setTabVisible(false)
    expect(r.pause).not.toHaveBeenCalled()
    expect(off).toBeTypeOf('function')
    off()
  })
})

/** A renderer that can also be reclaimed (TeardownOnPauseRenderer shape). */
function makeTeardownRenderer() {
  return { pause: vi.fn(), resume: vi.fn(), teardown: vi.fn() }
}

describe('vizVisibility off-screen teardown (#263 B)', () => {
  beforeEach(() => {
    FakeIO.instances = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).IntersectionObserver = FakeIO
    setTabVisible(true)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).IntersectionObserver
  })

  it('off-screen past the threshold → teardown(); back on-screen → resume (re-create)', () => {
    const r = makeTeardownRenderer()
    const off = registerVizVisibility(r, document.createElement('div'), { teardownMs: 60_000 })
    const io = FakeIO.instances[0]

    io.emit(false) // off-screen → pause + arm timer
    expect(r.pause).toHaveBeenCalledTimes(1)
    expect(r.teardown).not.toHaveBeenCalled()

    vi.advanceTimersByTime(60_000) // threshold elapsed, still off-screen
    expect(r.teardown).toHaveBeenCalledTimes(1)

    io.emit(true) // back on-screen → resume (TeardownOnPauseRenderer re-creates)
    expect(r.resume).toHaveBeenCalledTimes(1)
    off()
  })

  it('returns BEFORE the threshold → no teardown', () => {
    const r = makeTeardownRenderer()
    const off = registerVizVisibility(r, document.createElement('div'), { teardownMs: 60_000 })
    const io = FakeIO.instances[0]

    io.emit(false)
    vi.advanceTimersByTime(59_000)
    io.emit(true) // back on-screen before the timer fires → timer cleared
    vi.advanceTimersByTime(60_000)
    expect(r.teardown).not.toHaveBeenCalled()
    expect(r.resume).toHaveBeenCalledTimes(1)
    off()
  })

  it('teardownMs = 0 (default) → never tears down, even off-screen indefinitely', () => {
    const r = makeTeardownRenderer()
    const off = registerVizVisibility(r, document.createElement('div')) // no opts
    const io = FakeIO.instances[0]

    io.emit(false)
    vi.advanceTimersByTime(10 * 60_000)
    expect(r.teardown).not.toHaveBeenCalled()
    expect(r.pause).toHaveBeenCalledTimes(1)
    off()
  })

  it('tab hidden while ON-screen → pause but NEVER teardown (off-screen only)', () => {
    const r = makeTeardownRenderer()
    const off = registerVizVisibility(r, document.createElement('div'), { teardownMs: 60_000 })

    setTabVisible(false) // hidden but still on-screen
    vi.advanceTimersByTime(10 * 60_000)
    expect(r.pause).toHaveBeenCalledTimes(1)
    expect(r.teardown).not.toHaveBeenCalled()
    off()
  })

  it('unregister clears a pending teardown timer (no teardown after off())', () => {
    const r = makeTeardownRenderer()
    const off = registerVizVisibility(r, document.createElement('div'), { teardownMs: 60_000 })
    const io = FakeIO.instances[0]

    io.emit(false) // arm timer
    off() // unregister before it fires
    vi.advanceTimersByTime(60_000)
    expect(r.teardown).not.toHaveBeenCalled()
  })
})
