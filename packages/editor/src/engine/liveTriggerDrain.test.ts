// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createLiveTriggerDrain } from './liveTriggerDrain'

/**
 * #1656 — the drain's own rules, with a fake clock. Whether a live note keeps
 * its context across a bounce is measured in the browser
 * (`packages/app/tests/bounce-paths.spec.ts`).
 */

function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A clock that only moves when `sleep` is called, and records what was asked. */
function fakeClock(start = 10) {
  const state = { now: start, slept: [] as number[] }
  return {
    state,
    now: () => state.now,
    sleep: (ms: number) => {
      state.slept.push(ms)
      state.now += ms / 1000
      return new Promise<void>((r) => setTimeout(r, 0))
    },
  }
}

const OPTS = { capSeconds: 2, marginSeconds: 0.05 }

describe('createLiveTriggerDrain (#1656)', () => {
  it('with nothing in flight it returns at once and never sleeps', async () => {
    const d = createLiveTriggerDrain()
    const c = fakeClock()
    expect(await d.drain({ ...OPTS, now: c.now, sleep: c.sleep })).toEqual({ waited: 0, gaveUp: 0 })
    expect(c.state.slept).toEqual([])
  })

  it('waits for a trigger that settles before its start time, and gives up on none', async () => {
    const d = createLiveTriggerDrain()
    const c = fakeClock(10)
    const load = deferred()
    d.track(load.promise, 10.25)
    const draining = d.drain({ now: c.now, capSeconds: 2, marginSeconds: 0.05, sleep: () => new Promise(() => {}) })
    load.resolve()
    expect(await draining).toEqual({ waited: 1, gaveUp: 0 })
    expect(d.pending()).toBe(0)
  })

  it('stops waiting once the latest start time has passed, and reports what it gave up on', async () => {
    const d = createLiveTriggerDrain()
    const c = fakeClock(10)
    d.track(new Promise(() => {}), 10.1)
    d.track(new Promise(() => {}), 10.25)
    const out = await d.drain({ ...OPTS, now: c.now, sleep: c.sleep })
    expect(out).toEqual({ waited: 2, gaveUp: 2 })
    // The latest start (10.25) plus the margin, from now (10): 300 ms.
    expect(c.state.slept).toHaveLength(1)
    expect(c.state.slept[0]).toBeCloseTo(300, 6)
  })

  it('never waits longer than the cap, however far off a start time is', async () => {
    const d = createLiveTriggerDrain()
    const c = fakeClock(10)
    d.track(new Promise(() => {}), 99)
    await d.drain({ ...OPTS, now: c.now, sleep: c.sleep })
    expect(c.state.slept).toEqual([2000])
  })

  it('a start time already in the past waits not at all', async () => {
    const d = createLiveTriggerDrain()
    const c = fakeClock(10)
    d.track(new Promise(() => {}), 9)
    expect(await d.drain({ ...OPTS, now: c.now, sleep: c.sleep })).toEqual({ waited: 1, gaveUp: 1 })
    expect(c.state.slept).toEqual([0])
  })

  it('a trigger that throws counts as settled, and leaves no unhandled rejection', async () => {
    const d = createLiveTriggerDrain()
    const c = fakeClock(10)
    const load = deferred()
    load.promise.catch(() => {}) // the engine awaits and handles it
    d.track(load.promise, 10.2)
    const draining = d.drain({ ...OPTS, now: c.now, sleep: () => new Promise(() => {}) })
    load.reject(new Error('sound not found'))
    expect(await draining).toEqual({ waited: 1, gaveUp: 0 })
  })

  it('a trigger that settles is forgotten, so a later drain does not wait on it', async () => {
    const d = createLiveTriggerDrain()
    const load = deferred()
    d.track(load.promise, 10.2)
    load.resolve()
    await load.promise
    await new Promise((r) => setTimeout(r, 0))
    expect(d.pending()).toBe(0)
  })
})
