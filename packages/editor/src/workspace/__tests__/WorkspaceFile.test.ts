/**
 * WorkspaceFile store — unit tests (Phase 10.2 Task 01).
 *
 * Covers:
 * - create / get round-trip
 * - setContent produces a NEW object reference (snapshot identity)
 * - setContent preserves path/language/meta
 * - setContent with identical content is a no-op (no notify, same ref)
 * - setContent on unknown id is a no-op (no throw)
 * - subscribe fires on change, stops firing after unsubscribe
 * - subscribers are scoped per file id (change to "a" does not notify "b")
 * - create-on-existing-id replaces snapshot AND notifies
 * - unrelated file's reference is stable across another file's change
 *   (this is the load-bearing invariant for useSyncExternalStore)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createWorkspaceFile,
  getFile,
  setContent,
  subscribe,
  __resetWorkspaceFilesForTests,
  setZoneCropOverride,
  pruneZoneOverrides,
  subscribeToZoneOverrides,
} from '../WorkspaceFile'

describe('WorkspaceFile store', () => {
  beforeEach(() => {
    __resetWorkspaceFilesForTests()
  })

  it('createWorkspaceFile + getFile round-trip returns the same snapshot', () => {
    const created = createWorkspaceFile('a', 'pattern.strudel', 's("bd")', 'strudel')
    const fetched = getFile('a')
    expect(fetched).toBe(created)
    expect(fetched).toMatchObject({
      id: 'a',
      path: 'pattern.strudel',
      content: 's("bd")',
      language: 'strudel',
    })
  })

  it('getFile returns undefined for unknown id', () => {
    expect(getFile('missing')).toBeUndefined()
  })

  it('setContent produces a new object reference (snapshot identity)', () => {
    const first = createWorkspaceFile('a', 'p.strudel', 'a', 'strudel')
    setContent('a', 'b')
    const second = getFile('a')
    expect(second).not.toBe(first) // new reference
    expect(second?.content).toBe('b')
  })

  it('setContent preserves path, language, and meta', () => {
    createWorkspaceFile('a', 'p.strudel', 'a', 'strudel', { preset: 'foo' })
    setContent('a', 'b')
    const updated = getFile('a')!
    expect(updated.path).toBe('p.strudel')
    expect(updated.language).toBe('strudel')
    expect(updated.meta).toEqual({ preset: 'foo' })
  })

  it('setContent with identical content is a no-op (same reference)', () => {
    const first = createWorkspaceFile('a', 'p.strudel', 'same', 'strudel')
    setContent('a', 'same')
    const second = getFile('a')
    expect(second).toBe(first) // reference stable when content unchanged
  })

  it('setContent with identical content does NOT notify subscribers', () => {
    createWorkspaceFile('a', 'p.strudel', 'same', 'strudel')
    let calls = 0
    subscribe('a', () => { calls++ })
    setContent('a', 'same')
    expect(calls).toBe(0)
  })

  it('setContent on unknown id is a silent no-op', () => {
    expect(() => setContent('ghost', 'anything')).not.toThrow()
    expect(getFile('ghost')).toBeUndefined()
  })

  it('subscribe fires on content change', () => {
    createWorkspaceFile('a', 'p.strudel', 'a', 'strudel')
    let calls = 0
    subscribe('a', () => { calls++ })
    setContent('a', 'b')
    setContent('a', 'c')
    expect(calls).toBe(2)
  })

  it('unsubscribe stops further notifications', () => {
    createWorkspaceFile('a', 'p.strudel', 'a', 'strudel')
    let calls = 0
    const unsubscribe = subscribe('a', () => { calls++ })
    setContent('a', 'b')
    expect(calls).toBe(1)
    unsubscribe()
    setContent('a', 'c')
    expect(calls).toBe(1) // no further calls
  })

  it('unsubscribe is idempotent', () => {
    createWorkspaceFile('a', 'p.strudel', 'a', 'strudel')
    const unsubscribe = subscribe('a', () => {})
    expect(() => {
      unsubscribe()
      unsubscribe()
    }).not.toThrow()
  })

  it('subscribers are scoped per file id', () => {
    createWorkspaceFile('a', 'a.strudel', 'x', 'strudel')
    createWorkspaceFile('b', 'b.strudel', 'x', 'strudel')
    let aCalls = 0
    let bCalls = 0
    subscribe('a', () => { aCalls++ })
    subscribe('b', () => { bCalls++ })
    setContent('a', 'y')
    expect(aCalls).toBe(1)
    expect(bCalls).toBe(0)
    setContent('b', 'z')
    expect(aCalls).toBe(1)
    expect(bCalls).toBe(1)
  })

  it('unrelated file reference stays stable across another file\u2019s change', () => {
    // This is THE critical invariant for useSyncExternalStore — if
    // getFile('b') returned a fresh reference after setContent('a', …)
    // React would mark the 'b' consumer as changed and re-render it
    // spuriously, defeating the per-file scoping and risking loops.
    const b = createWorkspaceFile('b', 'b.strudel', 'b', 'strudel')
    createWorkspaceFile('a', 'a.strudel', 'a', 'strudel')
    setContent('a', 'a2')
    setContent('a', 'a3')
    expect(getFile('b')).toBe(b)
  })

  it('multiple subscribers on the same id all fire', () => {
    createWorkspaceFile('a', 'p.strudel', 'x', 'strudel')
    let c1 = 0
    let c2 = 0
    subscribe('a', () => { c1++ })
    subscribe('a', () => { c2++ })
    setContent('a', 'y')
    expect(c1).toBe(1)
    expect(c2).toBe(1)
  })

  it('createWorkspaceFile on existing id replaces and notifies', () => {
    const first = createWorkspaceFile('a', 'p.strudel', 'old', 'strudel')
    let calls = 0
    subscribe('a', () => { calls++ })
    const second = createWorkspaceFile('a', 'p.strudel', 'new', 'strudel')
    expect(second).not.toBe(first)
    expect(getFile('a')?.content).toBe('new')
    expect(calls).toBe(1)
  })

  // Regression for #30 — pruneZoneOverrides must NOT fire override
  // subscribers. Firing them during an in-flight zone-mount caused the
  // mount to re-enter itself and leak orphan zones in Monaco.
  it('pruneZoneOverrides does not notify zone-override subscribers (prevents reentrant mount)', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    // Plant a stale override: vizId "old" on track "$0".
    setZoneCropOverride('f1', '$0', { x: 0, y: 0, w: 0.5, h: 0.5 }, 'old')

    const overrideCb = vi.fn()
    const unsub = subscribeToZoneOverrides('f1', overrideCb)

    // currentViz has a DIFFERENT vizId for the same trackKey → prune
    // should remove the stale override.
    pruneZoneOverrides('f1', new Map([['$0', 'new']]))

    // The override is gone, but subscribers MUST NOT be fired — this
    // mutation is internal bookkeeping, not a user-driven change.
    expect(overrideCb).not.toHaveBeenCalled()
    unsub()
  })

  it('setZoneCropOverride still notifies subscribers (user-driven path unaffected)', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    const overrideCb = vi.fn()
    const unsub = subscribeToZoneOverrides('f1', overrideCb)

    setZoneCropOverride('f1', '$0', { x: 0, y: 0, w: 1, h: 1 }, 'viz')
    expect(overrideCb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('a subscriber can unsubscribe itself during its own callback', () => {
    // Guards against mutation-during-iteration bugs in notify().
    createWorkspaceFile('a', 'p.strudel', 'x', 'strudel')
    let unsub: () => void
    // eslint-disable-next-line prefer-const
    unsub = subscribe('a', () => {
      unsub()
    })
    expect(() => setContent('a', 'y')).not.toThrow()
    // Second change should not re-fire the removed subscriber.
    let further = 0
    subscribe('a', () => { further++ })
    setContent('a', 'z')
    expect(further).toBe(1)
  })
})
