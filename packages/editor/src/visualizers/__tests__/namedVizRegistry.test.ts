/**
 * namedVizRegistry — unit tests.
 *
 * Exercises the runtime Map + listener set. The registry is module-
 * level state, so every test calls `__resetNamedVizRegistryForTests`
 * in a `beforeEach` to keep cases isolated.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerNamedViz,
  unregisterNamedViz,
  getNamedViz,
  getNamedVizByNormalized,
  normalizeVizName,
  listNamedVizNames,
  listNamedVizEntries,
  onNamedVizChanged,
  __resetNamedVizRegistryForTests,
} from '../namedVizRegistry'
import { resolveDescriptor } from '../resolveDescriptor'
import type { VizDescriptor } from '../types'

// Minimal stand-in descriptor — `resolveDescriptor` only reads `.id`
// from descriptors in its fallbacks, so we don't need a real factory
// for these tests.
function descriptor(id: string, label = id): VizDescriptor {
  return {
    id,
    label,
    factory: () => {
      throw new Error('factory not implemented for test stub')
    },
  } as unknown as VizDescriptor
}

describe('namedVizRegistry', () => {
  beforeEach(() => {
    __resetNamedVizRegistryForTests()
  })

  describe('register / get / list', () => {
    it('registers a descriptor under a name', () => {
      const d = descriptor('my-viz:hydra')
      registerNamedViz('My Viz', d)
      expect(getNamedViz('My Viz')).toBe(d)
    })

    it('returns undefined for unknown names', () => {
      expect(getNamedViz('nothing')).toBeUndefined()
    })

    it('lists every registered name in insertion order', () => {
      registerNamedViz('a', descriptor('a'))
      registerNamedViz('b', descriptor('b'))
      registerNamedViz('c', descriptor('c'))
      expect(listNamedVizNames()).toEqual(['a', 'b', 'c'])
    })

    it('lists every (name, descriptor) entry', () => {
      const d1 = descriptor('a1')
      const d2 = descriptor('b2')
      registerNamedViz('first', d1)
      registerNamedViz('second', d2)
      const entries = listNamedVizEntries()
      expect(entries).toHaveLength(2)
      expect(entries[0][0]).toBe('first')
      expect(entries[0][1]).toBe(d1)
      expect(entries[1][0]).toBe('second')
      expect(entries[1][1]).toBe(d2)
    })

    it('replaces an existing entry when re-registered with a different descriptor', () => {
      const d1 = descriptor('old')
      const d2 = descriptor('new')
      registerNamedViz('v', d1)
      registerNamedViz('v', d2)
      expect(getNamedViz('v')).toBe(d2)
      expect(listNamedVizNames()).toEqual(['v'])
    })

    it('re-registering with the same descriptor is a no-op', () => {
      const d = descriptor('same')
      const listener = vi.fn()
      registerNamedViz('v', d)
      onNamedVizChanged(listener)
      registerNamedViz('v', d)
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('normalized lookup', () => {
    it('normalizeVizName strips case, spaces, hyphens, underscores', () => {
      expect(normalizeVizName('Piano Roll')).toBe('pianoroll')
      expect(normalizeVizName('pitch-wheel')).toBe('pitchwheel')
      expect(normalizeVizName('My_Viz')).toBe('myviz')
      // Colon is NOT stripped — it carries the mode:renderer convention.
      expect(normalizeVizName('scope:hydra')).toBe('scope:hydra')
    })

    it('resolves a registered display name by its normalized id', () => {
      const d = descriptor('pianoroll-preset')
      registerNamedViz('Piano Roll', d)
      // The exact map misses "pianoroll"; the normalized index hits.
      expect(getNamedViz('pianoroll')).toBeUndefined()
      expect(getNamedVizByNormalized('pianoroll')).toBe(d)
    })

    it('exact registrations are still findable by their exact key', () => {
      const d = descriptor('scope-preset')
      registerNamedViz('scope', d)
      expect(getNamedViz('scope')).toBe(d)
      expect(getNamedVizByNormalized('scope')).toBe(d)
    })

    it('returns undefined when no name normalizes to the key', () => {
      registerNamedViz('Piano Roll', descriptor('p'))
      expect(getNamedVizByNormalized('spectrum')).toBeUndefined()
    })

    it('drops the normalized index on unregister', () => {
      registerNamedViz('Piano Roll', descriptor('p'))
      unregisterNamedViz('Piano Roll')
      expect(getNamedVizByNormalized('pianoroll')).toBeUndefined()
    })

    it('keeps the normalized key alive when a later name overwrote it', () => {
      // Two names sharing a normalized key — last write wins, and
      // unregistering the FIRST must not orphan the live entry.
      const dA = descriptor('a')
      const dB = descriptor('b')
      registerNamedViz('my viz', dA)
      registerNamedViz('My-Viz', dB) // same norm key "myviz", overwrites
      expect(getNamedVizByNormalized('myviz')).toBe(dB)
      unregisterNamedViz('my viz') // first name gone; index still points at My-Viz
      expect(getNamedVizByNormalized('myviz')).toBe(dB)
    })
  })

  describe('unregister', () => {
    it('removes a registered name', () => {
      const d = descriptor('v')
      registerNamedViz('v', d)
      unregisterNamedViz('v')
      expect(getNamedViz('v')).toBeUndefined()
    })

    it('is a no-op for unknown names', () => {
      const listener = vi.fn()
      onNamedVizChanged(listener)
      unregisterNamedViz('missing')
      expect(listener).not.toHaveBeenCalled()
    })

    it('fires listeners only when an entry is actually removed', () => {
      const listener = vi.fn()
      registerNamedViz('v', descriptor('v'))
      onNamedVizChanged(listener)
      unregisterNamedViz('v')
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('onNamedVizChanged', () => {
    it('fires on register', () => {
      const listener = vi.fn()
      onNamedVizChanged(listener)
      registerNamedViz('v', descriptor('v'))
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('fires on replace (same name, new descriptor)', () => {
      const listener = vi.fn()
      registerNamedViz('v', descriptor('old'))
      onNamedVizChanged(listener)
      registerNamedViz('v', descriptor('new'))
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('returns an unsubscribe function that stops future fires', () => {
      const listener = vi.fn()
      const unsub = onNamedVizChanged(listener)
      unsub()
      registerNamedViz('v', descriptor('v'))
      expect(listener).not.toHaveBeenCalled()
    })

    it('unsubscribe is idempotent', () => {
      const listener = vi.fn()
      const unsub = onNamedVizChanged(listener)
      unsub()
      unsub() // must not throw
      registerNamedViz('v', descriptor('v'))
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('resolveDescriptor integration', () => {
    it('returns the named viz when the name matches the registry', () => {
      const custom = descriptor('custom:hydra', 'My Custom Viz')
      registerNamedViz('My Custom Viz', custom)
      expect(resolveDescriptor('My Custom Viz', [])).toBe(custom)
    })

    it('named viz wins over a built-in with the same name (shadowing)', () => {
      const custom = descriptor('custom:hydra')
      const builtin = descriptor('pianoroll:hydra')
      registerNamedViz('pianoroll', custom)
      // Even though the built-in list would match "pianoroll" via the
      // default-renderer fallback, the registry hit comes first.
      expect(resolveDescriptor('pianoroll', [builtin])).toBe(custom)
    })

    it('falls through to the descriptor list when the name is not registered', () => {
      const builtin = descriptor('pianoroll:hydra')
      expect(resolveDescriptor('pianoroll', [builtin])).toBe(builtin)
    })

    it('still resolves the built-in prefix fallback when registry is empty', () => {
      const builtin = descriptor('pitchwheel:p5')
      expect(resolveDescriptor('pitchwheel', [builtin])).toBe(builtin)
    })

    it('resolves .viz("pianoroll") to the "Piano Roll" preset over the built-in (P73)', () => {
      // This is the core Model-B fix: inline `.viz("pianoroll")` must reach
      // the editable preset (registered under its display name), not the
      // divergent built-in sketch the backdrop never uses.
      const preset = descriptor('pianoroll-preset', 'Piano Roll')
      const builtin = descriptor('pianoroll')
      registerNamedViz('Piano Roll', preset)
      expect(resolveDescriptor('pianoroll', [builtin])).toBe(preset)
    })

    it('exact name still shadows a normalized match', () => {
      const exact = descriptor('exact')
      const display = descriptor('display')
      registerNamedViz('Piano Roll', display)
      registerNamedViz('pianoroll', exact) // literal lowercase id
      // Exact lookup wins over the normalized fallback.
      expect(resolveDescriptor('pianoroll', [])).toBe(exact)
    })
  })
})
