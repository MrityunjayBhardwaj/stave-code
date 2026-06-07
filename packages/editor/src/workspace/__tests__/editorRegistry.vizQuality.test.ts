/**
 * editorRegistry — viz quality / "performance mode" setting (Phase D, #269).
 *
 * Covers the wiring that distinguishes this from a plain scalar setting: a
 * quality LEVEL drives TWO downstream channels — the inline render resolution
 * (composite) AND the vizConfig `density` (sketch LOD, marshalled to the worker).
 *
 *   1. set → get round-trips the level; invalid input clamps to the default.
 *   2. setVizQuality pushes BOTH knobs: resolution (getInlineVizResolution) and
 *      density (getVizConfig().density) move per deriveVizQuality.
 *   3. density is applied via MERGE (updateVizConfig) — a prior unrelated config
 *      field (hydraAudioBins) survives the quality change.
 *   4. onVizQualityChange fires on set; unsubscribe stops it.
 *
 * Per feedback_editor_idb_test_split: PURE logic over a Map-backed localStorage
 * mock — plain-object assertions, no IndexedDB / Y.Doc.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getVizQuality,
  setVizQuality,
  onVizQualityChange,
  getInlineVizResolution,
} from '../editorRegistry'
import {
  DEFAULT_VIZ_CONFIG,
  deriveVizQuality,
  getVizConfig,
  setVizConfig,
} from '../../visualizers/vizConfig'

const VIZ_QUALITY_STORAGE = 'stave:vizQuality'

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
  setVizConfig(DEFAULT_VIZ_CONFIG)
})

describe('vizQuality — round-trip + default', () => {
  it('defaults to balanced when nothing stored', () => {
    expect(getVizQuality()).toBe('balanced')
  })

  it('set → get round-trips a level', () => {
    setVizQuality('performance')
    expect(getVizQuality()).toBe('performance')
    expect(store.get(VIZ_QUALITY_STORAGE)).toBe('performance')
  })

  it('an invalid stored value falls back to the default', () => {
    store.set(VIZ_QUALITY_STORAGE, 'ludicrous')
    expect(getVizQuality()).toBe('balanced')
  })
})

describe('vizQuality — drives BOTH knobs (#232)', () => {
  it('applies resolution AND density from deriveVizQuality', () => {
    setVizQuality('performance')
    const expected = deriveVizQuality('performance')
    expect(getInlineVizResolution()).toBe(expected.resolution)
    expect(getVizConfig().density).toBe(expected.density)

    setVizQuality('high')
    const hi = deriveVizQuality('high')
    expect(getInlineVizResolution()).toBe(hi.resolution)
    expect(getVizConfig().density).toBe(hi.density)
  })

  it('density is MERGED (updateVizConfig) — unrelated config survives', () => {
    setVizConfig({ hydraAudioBins: 8 })
    setVizQuality('performance')
    // The density write must NOT wipe hydraAudioBins (the #253 merge bug).
    expect(getVizConfig().hydraAudioBins).toBe(8)
    expect(getVizConfig().density).toBe(deriveVizQuality('performance').density)
  })
})

describe('vizQuality — listeners', () => {
  it('fires on set and unsubscribes', () => {
    const seen: string[] = []
    const unsub = onVizQualityChange((l) => seen.push(l))
    setVizQuality('high')
    setVizQuality('performance')
    unsub()
    setVizQuality('balanced') // not observed
    expect(seen).toEqual(['high', 'performance'])
  })
})
