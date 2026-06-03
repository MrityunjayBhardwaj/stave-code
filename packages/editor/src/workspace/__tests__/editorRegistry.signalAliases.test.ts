/**
 * editorRegistry — signalAliases setting (Phase 21 PLAN-ALIASES T1).
 *
 * The FIRST JSON/object-valued editorRegistry setting. These tests cover
 * the four traps that distinguish it from the existing scalar settings:
 *   1. set → get round-trips a `Record<string, string | string[]>`.
 *   2. corrupt JSON in storage → getSignalAliases() returns {} (no throw).
 *   3. shape validation — a bad entry (number / empty array) is dropped,
 *      not passed through to the downstream bus.
 *   4. onSignalAliasesChange fires on set, and the returned unsubscribe stops it.
 *
 * Per feedback_editor_idb_test_split: this is PURE logic over a Map-backed
 * localStorage mock — plain-object assertions, NOT IndexedDB / Y.Doc.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getSignalAliases,
  getStoredSignalAliases,
  setSignalAliases,
  onSignalAliasesChange,
} from '../editorRegistry'

const SIGNAL_ALIASES_STORAGE = 'stave:signalAliases'

// jsdom in this repo's vitest config provides a non-functional localStorage
// stub. Install a Map-backed mock so the SSR-safe readers/writers run.
function installMockLocalStorage(): Map<string, string> {
  const store = new Map<string, string>()
  const mock: Storage = {
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
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: mock,
  })
  return store
}

let store: Map<string, string>

beforeEach(() => {
  store = installMockLocalStorage()
})

afterEach(() => {
  store.clear()
})

describe('signalAliases — round-trip', () => {
  it('set → get round-trips a string|string[] map', () => {
    setSignalAliases({ kick: ['bd', 'kick9'], lead: 'sawtooth' })
    expect(getSignalAliases()).toEqual({ kick: ['bd', 'kick9'], lead: 'sawtooth' })
  })

  it('returns {} when nothing has been stored', () => {
    expect(getSignalAliases()).toEqual({})
  })

  it('persists ENGINE-KEYED JSON under the stave:signalAliases key', () => {
    // The flat write goes into the active engine's slot (Strudel).
    setSignalAliases({ kick: 'bd' })
    expect(JSON.parse(store.get(SIGNAL_ALIASES_STORAGE) as string)).toEqual({
      kick: { strudel: 'bd' },
    })
  })
})

describe('signalAliases — engine-keyed storage + migration', () => {
  it('getStoredSignalAliases exposes the raw engine-keyed map', () => {
    setSignalAliases({ kick: ['bd', 'kick9'] })
    expect(getStoredSignalAliases()).toEqual({
      kick: { strudel: ['bd', 'kick9'] },
    })
  })

  it('migrates a LEGACY FLAT stored map to engine-keyed on read', () => {
    // Pre-engine-keyed shape written by an older build.
    store.set(SIGNAL_ALIASES_STORAGE, JSON.stringify({ kick: 'bd', tom: ['lt', 'mt'] }))
    expect(getStoredSignalAliases()).toEqual({
      kick: { strudel: 'bd' },
      tom: { strudel: ['lt', 'mt'] },
    })
    // The flat strudel view is unchanged across the migration.
    expect(getSignalAliases()).toEqual({ kick: 'bd', tom: ['lt', 'mt'] })
  })

  it('round-trips an engine-keyed stored map and reads per engine', () => {
    store.set(
      SIGNAL_ALIASES_STORAGE,
      JSON.stringify({ kick: { strudel: ['bd', 'kick9'], sonicpi: ['drum_heavy_kick'] } }),
    )
    expect(getSignalAliases('strudel')).toEqual({ kick: ['bd', 'kick9'] })
    expect(getSignalAliases('sonicpi')).toEqual({ kick: ['drum_heavy_kick'] })
  })

  it('keeps ANY engine slot with a valid value (forward-compat for new engines)', () => {
    store.set(
      SIGNAL_ALIASES_STORAGE,
      JSON.stringify({ kick: { strudel: 'bd', tau5: 'kick' } }),
    )
    expect(getStoredSignalAliases()).toEqual({
      kick: { strudel: 'bd', tau5: 'kick' },
    })
  })

  it('setting one engine preserves the other engine slots of surviving names', () => {
    store.set(
      SIGNAL_ALIASES_STORAGE,
      JSON.stringify({ kick: { strudel: 'bd', sonicpi: 'drum_heavy_kick' } }),
    )
    // Edit only the Strudel column — sonicpi must survive.
    setSignalAliases({ kick: ['bd', 'kick9'] }, 'strudel')
    expect(getStoredSignalAliases()).toEqual({
      kick: { strudel: ['bd', 'kick9'], sonicpi: 'drum_heavy_kick' },
    })
  })

  it('drops a slot whose value is malformed within an engine-keyed object', () => {
    store.set(
      SIGNAL_ALIASES_STORAGE,
      JSON.stringify({
        kick: { strudel: 'bd', sonicpi: 5 },
        bad: { strudel: [] },
      }),
    )
    expect(getStoredSignalAliases()).toEqual({ kick: { strudel: 'bd' } })
  })
})

describe('signalAliases — corrupt JSON', () => {
  it('returns {} (no throw) when the stored value is not valid JSON', () => {
    store.set(SIGNAL_ALIASES_STORAGE, '{not valid json,,,')
    expect(() => getSignalAliases()).not.toThrow()
    expect(getSignalAliases()).toEqual({})
  })

  it('returns {} when the stored JSON is not an object (legacy scalar)', () => {
    store.set(SIGNAL_ALIASES_STORAGE, '42')
    expect(getSignalAliases()).toEqual({})
    store.set(SIGNAL_ALIASES_STORAGE, '["bd","sd"]')
    expect(getSignalAliases()).toEqual({})
    store.set(SIGNAL_ALIASES_STORAGE, 'null')
    expect(getSignalAliases()).toEqual({})
  })
})

describe('signalAliases — shape validation', () => {
  it('drops a numeric-valued entry but keeps a valid one', () => {
    store.set(SIGNAL_ALIASES_STORAGE, JSON.stringify({ kick: 5, ok: 'bd' }))
    expect(getSignalAliases()).toEqual({ ok: 'bd' })
  })

  it('drops empty-string, empty-array, and non-string-array entries', () => {
    store.set(
      SIGNAL_ALIASES_STORAGE,
      JSON.stringify({
        empty: '',
        emptyArr: [],
        mixed: ['bd', 7],
        nested: { x: 1 },
        good: 'bd',
        goodArr: ['lt', 'mt'],
      }),
    )
    expect(getSignalAliases()).toEqual({ good: 'bd', goodArr: ['lt', 'mt'] })
  })

  it('sanitizes a bad value passed to setSignalAliases (storage stays clean)', () => {
    // @ts-expect-error — exercising the defensive sanitize on the write path
    setSignalAliases({ kick: 123, ok: 'bd' })
    expect(getSignalAliases()).toEqual({ ok: 'bd' })
  })
})

describe('signalAliases — onSignalAliasesChange', () => {
  it('fires the callback with the sanitized map on setSignalAliases', () => {
    const cb = vi.fn()
    onSignalAliasesChange(cb)
    setSignalAliases({ kick: ['bd', 'kick9'] })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ kick: ['bd', 'kick9'] })
  })

  it('the returned unsubscribe stops further notifications', () => {
    const cb = vi.fn()
    const unsubscribe = onSignalAliasesChange(cb)
    setSignalAliases({ a: 'bd' })
    expect(cb).toHaveBeenCalledTimes(1)
    unsubscribe()
    setSignalAliases({ b: 'sd' })
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
