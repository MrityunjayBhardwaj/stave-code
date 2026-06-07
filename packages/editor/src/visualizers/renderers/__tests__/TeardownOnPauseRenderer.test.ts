/**
 * TeardownOnPauseRenderer (#263 B) — the decorator that destroys its inner
 * renderer on teardown() and re-creates it on resume(), replaying the remembered
 * mount args. Driven with fake inner renderers (no real worker/p5).
 */
import { describe, it, expect, vi } from 'vitest'
import { TeardownOnPauseRenderer } from '../TeardownOnPauseRenderer'
import type { VizRenderer } from '../../types'

function fakeInner(): VizRenderer & {
  mount: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
} {
  return {
    mount: vi.fn(),
    update: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    destroy: vi.fn(),
  } as never
}

const CONTAINER = (): HTMLDivElement => document.createElement('div')
const SIZE = { w: 100, h: 50 }
const noErr = (): void => {}

describe('TeardownOnPauseRenderer', () => {
  it('mount creates ONE inner via the factory and mounts it with the args', () => {
    const inner = fakeInner()
    const factory = vi.fn(() => inner)
    const r = new TeardownOnPauseRenderer(factory)
    const c = CONTAINER()
    r.mount(c, {}, SIZE, noErr)
    expect(factory).toHaveBeenCalledTimes(1)
    expect(inner.mount).toHaveBeenCalledWith(c, {}, SIZE, noErr)
    expect(r.isTornDown).toBe(false)
  })

  it('teardown() destroys the inner, flags torn-down, fires onAfterTeardown', () => {
    const inner = fakeInner()
    const onAfterTeardown = vi.fn()
    const r = new TeardownOnPauseRenderer(() => inner, { onAfterTeardown })
    r.mount(CONTAINER(), {}, SIZE, noErr)
    r.teardown()
    expect(inner.destroy).toHaveBeenCalledTimes(1)
    expect(r.isTornDown).toBe(true)
    expect(onAfterTeardown).toHaveBeenCalledTimes(1)
  })

  it('teardown() is idempotent (no double-destroy)', () => {
    const inner = fakeInner()
    const r = new TeardownOnPauseRenderer(() => inner)
    r.mount(CONTAINER(), {}, SIZE, noErr)
    r.teardown()
    r.teardown()
    expect(inner.destroy).toHaveBeenCalledTimes(1)
  })

  it('resume() AFTER teardown re-creates a fresh inner, replays mount args, fires onAfterReinit', () => {
    const inners = [fakeInner(), fakeInner()]
    let n = 0
    const factory = vi.fn(() => inners[n++])
    const onAfterReinit = vi.fn()
    const r = new TeardownOnPauseRenderer(factory, { onAfterReinit })
    const c = CONTAINER()
    r.mount(c, { a: 1 } as never, SIZE, noErr)
    r.teardown()
    r.resume()
    expect(factory).toHaveBeenCalledTimes(2)
    expect(inners[1].mount).toHaveBeenCalledWith(c, { a: 1 }, SIZE, noErr)
    expect(r.isTornDown).toBe(false)
    expect(onAfterReinit).toHaveBeenCalledTimes(1)
    // the freshly-created inner runs; the resume must NOT also call the dead one
    expect(inners[0].resume).not.toHaveBeenCalled()
  })

  it('resume() when NOT torn down just resumes the live inner (no re-create)', () => {
    const inner = fakeInner()
    const factory = vi.fn(() => inner)
    const r = new TeardownOnPauseRenderer(factory)
    r.mount(CONTAINER(), {}, SIZE, noErr)
    r.pause()
    r.resume()
    expect(factory).toHaveBeenCalledTimes(1)
    expect(inner.resume).toHaveBeenCalledTimes(1)
  })

  it('update/resize keep the remembered args fresh → a later reinit uses them', () => {
    const inners = [fakeInner(), fakeInner()]
    let n = 0
    const r = new TeardownOnPauseRenderer(() => inners[n++])
    const c = CONTAINER()
    r.mount(c, { v: 0 } as never, SIZE, noErr)
    r.update({ v: 1 } as never)
    r.resize(200, 120)
    expect(inners[0].update).toHaveBeenCalledWith({ v: 1 })
    expect(inners[0].resize).toHaveBeenCalledWith(200, 120)
    r.teardown()
    r.resume()
    expect(inners[1].mount).toHaveBeenCalledWith(c, { v: 1 }, { w: 200, h: 120 }, noErr)
  })

  it('destroy() tears the inner down', () => {
    const inner = fakeInner()
    const r = new TeardownOnPauseRenderer(() => inner)
    r.mount(CONTAINER(), {}, SIZE, noErr)
    r.destroy()
    expect(inner.destroy).toHaveBeenCalledTimes(1)
  })
})
