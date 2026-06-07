/**
 * vizWorkerPool (#263 A) — warm-worker reuse. The pool REUSES a parked worker
 * instead of spawning a fresh one (the memory fix B's terminate path couldn't
 * deliver, P112). Driven with fake workers + a fake factory.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  acquireVizWorker,
  releaseVizWorker,
  parkedVizWorkerCount,
  drainVizWorkerPool,
} from '../vizWorkerPool'
import { setVizWorkerFactory } from '../vizWorkerFactory'

function fakeWorker(): Worker {
  return {
    terminate: vi.fn(),
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Worker
}
const term = (w: Worker): ReturnType<typeof vi.fn> =>
  (w as unknown as { terminate: ReturnType<typeof vi.fn> }).terminate

describe('vizWorkerPool (#263 A)', () => {
  beforeEach(() => {
    drainVizWorkerPool()
    // cap = max(2, hardwareConcurrency − 2) = 2
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true })
  })
  afterEach(() => {
    drainVizWorkerPool()
    setVizWorkerFactory(null)
  })

  it('acquire spawns via the factory when nothing is parked', () => {
    const made: Worker[] = []
    setVizWorkerFactory(() => {
      const w = fakeWorker()
      made.push(w)
      return w
    })
    const a = acquireVizWorker()
    const b = acquireVizWorker()
    expect(a).toBe(made[0])
    expect(b).toBe(made[1])
    expect(parkedVizWorkerCount()).toBe(0)
  })

  it('release parks a worker; the next acquire REUSES it (no fresh spawn)', () => {
    let spawns = 0
    setVizWorkerFactory(() => {
      spawns++
      return fakeWorker()
    })
    const a = acquireVizWorker()!
    expect(spawns).toBe(1)
    releaseVizWorker(a)
    expect(parkedVizWorkerCount()).toBe(1)
    const b = acquireVizWorker()
    expect(b, 'reuses the parked worker').toBe(a)
    expect(spawns, 'no fresh spawn on reuse').toBe(1)
    expect(parkedVizWorkerCount()).toBe(0)
  })

  it('release beyond cap terminates the surplus (parked stays at cap)', () => {
    setVizWorkerFactory(() => fakeWorker())
    const ws = [acquireVizWorker()!, acquireVizWorker()!, acquireVizWorker()!]
    releaseVizWorker(ws[0])
    releaseVizWorker(ws[1])
    expect(parkedVizWorkerCount()).toBe(2)
    releaseVizWorker(ws[2]) // over cap → terminate, don't park
    expect(parkedVizWorkerCount()).toBe(2)
    expect(term(ws[2])).toHaveBeenCalledTimes(1)
    expect(term(ws[0])).not.toHaveBeenCalled()
  })

  it('acquire returns null when no factory is registered and nothing is parked', () => {
    setVizWorkerFactory(null)
    expect(acquireVizWorker()).toBeNull()
  })

  it('drain terminates + clears all parked workers', () => {
    setVizWorkerFactory(() => fakeWorker())
    const a = acquireVizWorker()!
    const b = acquireVizWorker()!
    releaseVizWorker(a)
    releaseVizWorker(b)
    expect(parkedVizWorkerCount()).toBe(2)
    drainVizWorkerPool()
    expect(parkedVizWorkerCount()).toBe(0)
    expect(term(a)).toHaveBeenCalled()
    expect(term(b)).toHaveBeenCalled()
  })
})
