/**
 * editorRegistry — backdrop opacity/blur defaults (#783).
 *
 * Regression: on a FRESH profile (no stored key) the numeric read did
 * `Number(ls.getItem(key))` → Number(null) === 0, and the range guard
 * `saved >= 0` accepted 0, so the backdrop defaulted to opacity 0 (fully
 * INVISIBLE) / blur 0 instead of the intended DEFAULT_* values. The viz
 * still rendered (frames flowed) but the layer was transparent — "background
 * not working". The other numeric reads (font size ≥8, etc.) escaped only
 * because their min is > 0. Fix: guard the raw string for null/'' before Number().
 *
 * Per feedback_editor_idb_test_split: PURE logic over a Map-backed localStorage
 * mock — no IndexedDB / Y.Doc.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getBackdropOpacity,
  setBackdropOpacity,
  getEditorBackdropBlur,
  setEditorBackdropBlur,
} from '../editorRegistry'

const OPACITY_STORAGE = 'stave:backdropOpacity'
const BLUR_STORAGE = 'stave:backdropBlur'

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
afterEach(() => store.clear())

describe('backdrop opacity — default when nothing stored (#783)', () => {
  it('defaults to 1 (VISIBLE), not 0, on a fresh profile', () => {
    // The bug: Number(null)===0 passed `>= 0` and returned 0 (invisible).
    expect(store.has(OPACITY_STORAGE)).toBe(false)
    expect(getBackdropOpacity()).toBe(1)
  })

  it('still honours a legitimately-saved 0', () => {
    setBackdropOpacity(0)
    expect(getBackdropOpacity()).toBe(0)
  })

  it('round-trips a normal value', () => {
    setBackdropOpacity(0.65)
    expect(getBackdropOpacity()).toBeCloseTo(0.65)
  })
})

describe('backdrop blur — default when nothing stored (#783)', () => {
  it('defaults to 8, not 0, on a fresh profile', () => {
    expect(store.has(BLUR_STORAGE)).toBe(false)
    expect(getEditorBackdropBlur()).toBe(8)
  })

  it('still honours a legitimately-saved 0', () => {
    setEditorBackdropBlur(0)
    expect(getEditorBackdropBlur()).toBe(0)
  })
})
