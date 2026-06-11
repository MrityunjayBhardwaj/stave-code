/**
 * vizFlags — the stave.viz.* localStorage flag readers (#327).
 *
 * Pure logic over a Map-backed localStorage (per feedback_editor_idb_test_split). Each
 * reader's DEFAULT and parse semantics are pinned here so the consolidation can't drift
 * from the per-site behaviour it replaced.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  VIZ_FLAG_KEYS,
  isP5DirectCanvasEnabled,
  isVizGovernorEnabled,
  isVizPumpSharedCacheEnabled,
  isVizWorkerPoolEnabled,
  getVizWorkerOverride,
  getVizMaxFpsOverride,
  getVizMaxDprOverride,
} from '../vizFlags'

function installMockLocalStorage(): Map<string, string> {
  const store = new Map<string, string>()
  const mock = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k)
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: mock })
  return store
}

let store: Map<string, string>
beforeEach(() => {
  store = installMockLocalStorage()
})
afterEach(() => {
  store.clear()
})

describe('vizFlags — default-ON flags (enabled unless exactly "0")', () => {
  const cases: Array<[string, string, () => boolean]> = [
    ['p5direct', VIZ_FLAG_KEYS.p5direct, isP5DirectCanvasEnabled],
    ['governor', VIZ_FLAG_KEYS.governor, isVizGovernorEnabled],
    ['pump', VIZ_FLAG_KEYS.pump, isVizPumpSharedCacheEnabled],
  ]
  for (const [name, key, read] of cases) {
    it(`${name}: absent → enabled`, () => {
      expect(read()).toBe(true)
    })
    it(`${name}: "0" → disabled`, () => {
      store.set(key, '0')
      expect(read()).toBe(false)
    })
    it(`${name}: "1" → enabled`, () => {
      store.set(key, '1')
      expect(read()).toBe(true)
    })
    it(`${name}: any other value → enabled (only "0" disables)`, () => {
      store.set(key, 'nope')
      expect(read()).toBe(true)
    })
  }
})

describe('vizFlags — opt-IN flag (enabled only when exactly "1")', () => {
  it('pool: absent → disabled', () => {
    expect(isVizWorkerPoolEnabled()).toBe(false)
  })
  it('pool: "1" → enabled', () => {
    store.set(VIZ_FLAG_KEYS.pool, '1')
    expect(isVizWorkerPoolEnabled()).toBe(true)
  })
  it('pool: "0" / other → disabled', () => {
    store.set(VIZ_FLAG_KEYS.pool, '0')
    expect(isVizWorkerPoolEnabled()).toBe(false)
    store.set(VIZ_FLAG_KEYS.pool, 'yes')
    expect(isVizWorkerPoolEnabled()).toBe(false)
  })
})

describe('vizFlags — worker tri-state override', () => {
  it('absent → null (no override)', () => {
    expect(getVizWorkerOverride()).toBeNull()
  })
  it('"1" → true, "0" → false', () => {
    store.set(VIZ_FLAG_KEYS.worker, '1')
    expect(getVizWorkerOverride()).toBe(true)
    store.set(VIZ_FLAG_KEYS.worker, '0')
    expect(getVizWorkerOverride()).toBe(false)
  })
  it('garbage → null (not coerced to false)', () => {
    store.set(VIZ_FLAG_KEYS.worker, 'maybe')
    expect(getVizWorkerOverride()).toBeNull()
  })
})

describe('vizFlags — numeric overrides (finite, > 0, else null)', () => {
  it('maxFps/maxDpr: absent → null', () => {
    expect(getVizMaxFpsOverride()).toBeNull()
    expect(getVizMaxDprOverride()).toBeNull()
  })
  it('valid positive numbers parse', () => {
    store.set(VIZ_FLAG_KEYS.maxFps, '30')
    expect(getVizMaxFpsOverride()).toBe(30)
    store.set(VIZ_FLAG_KEYS.maxDpr, '1.5')
    expect(getVizMaxDprOverride()).toBe(1.5)
  })
  it('zero / negative / non-numeric → null', () => {
    for (const bad of ['0', '-2', 'abc', '']) {
      store.set(VIZ_FLAG_KEYS.maxFps, bad)
      expect(getVizMaxFpsOverride(), `value ${JSON.stringify(bad)}`).toBeNull()
    }
  })
})
