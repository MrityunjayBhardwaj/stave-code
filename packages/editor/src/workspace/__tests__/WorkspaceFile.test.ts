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
  deleteWorkspaceFile,
  getFile,
  setContent,
  subscribe,
  __resetWorkspaceFilesForTests,
  setZoneCropOverride,
  pruneZoneOverrides,
  subscribeToZoneOverrides,
  getTrackMeta,
  setTrackMeta,
  subscribeToTrackMeta,
  getTrackMetaMapSnapshot,
  pruneTrackMeta,
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

// Phase 20-12 α-2 — trackMeta (D-01/D-02). Mirrors zoneOverrides; the new
// per-file Y.Map persists track-chrome state (custom palette swatch +
// chevron collapsed). The observer-wire-by-reference idiom protects against
// switchProject Y.Doc swaps (feedback_observer_wire_race.md).
describe('20-12 α-2 — trackMeta', () => {
  beforeEach(() => {
    __resetWorkspaceFilesForTests()
  })

  it('getTrackMeta returns {} for unknown fileId', () => {
    expect(getTrackMeta('nope', 'd1')).toEqual({})
  })

  it('getTrackMeta returns {} for known fileId without any record', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    expect(getTrackMeta('f1', 'd1')).toEqual({})
  })

  it('setTrackMeta({color}) → getTrackMeta sees color', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    setTrackMeta('f1', 'd1', { color: '#ff0000' })
    expect(getTrackMeta('f1', 'd1')).toEqual({ color: '#ff0000' })
  })

  it('setTrackMeta({collapsed:true}) merges with existing color (not a replace)', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    setTrackMeta('f1', 'd1', { color: '#ff0000' })
    setTrackMeta('f1', 'd1', { collapsed: true })
    expect(getTrackMeta('f1', 'd1')).toEqual({ color: '#ff0000', collapsed: true })
  })

  it('setTrackMeta with both fields undefined deletes the key (cleanup)', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    setTrackMeta('f1', 'd1', { color: '#ff0000' })
    setTrackMeta('f1', 'd1', { color: undefined, collapsed: undefined })
    expect(getTrackMeta('f1', 'd1')).toEqual({})
  })

  it('subscribeToTrackMeta fires observer on .set', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    const cb = vi.fn()
    const unsub = subscribeToTrackMeta('f1', cb)
    setTrackMeta('f1', 'd1', { collapsed: true })
    expect(cb).toHaveBeenCalled()
    unsub()
  })

  it('resetFileStore clears wired observers — switchProject Y.Doc swap re-wires fresh', () => {
    // 1. Wire on file A in project 1; set color; observer fires.
    createWorkspaceFile('a', 'p.strudel', 'x', 'strudel')
    const cb1 = vi.fn()
    const unsub1 = subscribeToTrackMeta('a', cb1)
    setTrackMeta('a', 'd1', { color: '#ff0000' })
    expect(cb1).toHaveBeenCalled()
    unsub1()

    // 2. Reset (simulates project switch) — wiredTrackMetaObservers.clear()
    //    drops the Set entry for fileId 'a'. The OLD Y.Map (from the
    //    destroyed Y.Doc) becomes inaccessible.
    __resetWorkspaceFilesForTests()

    // 3. New project, same fileId 'a' — fresh Y.Map under a fresh Y.Doc.
    //    The observer must wire on the NEW map; without the .clear() the
    //    Set still has 'a' and ensureTrackMetaMap would skip wiring →
    //    cb2 would never fire.
    createWorkspaceFile('a', 'p.strudel', 'y', 'strudel')
    const cb2 = vi.fn()
    const unsub2 = subscribeToTrackMeta('a', cb2)
    setTrackMeta('a', 'd1', { color: '#00ff00' })
    expect(cb2).toHaveBeenCalled()
    // The new project starts fresh — old color is gone.
    expect(getTrackMeta('a', 'd1')).toEqual({ color: '#00ff00' })
    unsub2()
  })

  // Phase D (#581) — getTrackMetaMapSnapshot: the whole-file map both colour
  // consumers read. Ref-stability across reads is the useSyncExternalStore
  // contract; it MUST change only after a committed mutation.
  it('getTrackMetaMapSnapshot returns every track keyed by trackId', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    setTrackMeta('f1', 'bass', { color: '#ff0000' })
    setTrackMeta('f1', 'd2', { color: '#00ff00' })
    const map = getTrackMetaMapSnapshot('f1')
    expect(map.get('bass')).toEqual({ color: '#ff0000' })
    expect(map.get('d2')).toEqual({ color: '#00ff00' })
    expect(map.size).toBe(2)
  })

  it('getTrackMetaMapSnapshot is ref-stable until a mutation, then a NEW ref', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    setTrackMeta('f1', 'd1', { color: '#ff0000' })
    const first = getTrackMetaMapSnapshot('f1')
    // Repeated reads with no mutation → SAME reference (no tearing in StrictMode).
    expect(getTrackMetaMapSnapshot('f1')).toBe(first)
    // A mutation invalidates the cache → next read is a DIFFERENT reference that
    // reflects the change.
    setTrackMeta('f1', 'd1', { color: '#0000ff' })
    const second = getTrackMetaMapSnapshot('f1')
    expect(second).not.toBe(first)
    expect(second.get('d1')).toEqual({ color: '#0000ff' })
  })

  it('getTrackMetaMapSnapshot returns the shared empty map for an unknown file', () => {
    const a = getTrackMetaMapSnapshot('nope')
    const b = getTrackMetaMapSnapshot('also-nope')
    expect(a.size).toBe(0)
    expect(a).toBe(b) // shared ref-stable empty map
  })

  // #583 — pruneTrackMeta: per-eval cleanup of orphaned colour/collapse records.
  // Keyed by display name; drops entries whose track no longer exists so a
  // deleted track's override can't leak in the Y.Map or resurrect onto a
  // shifted positional d{N}.
  it('pruneTrackMeta drops records whose trackId is not in the current set', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    setTrackMeta('f1', 'bass', { color: '#ff0000' })
    setTrackMeta('f1', 'd2', { color: '#00ff00' }) // anon track, later removed
    pruneTrackMeta('f1', new Set(['bass']))
    expect(getTrackMeta('f1', 'bass')).toEqual({ color: '#ff0000' }) // kept
    expect(getTrackMeta('f1', 'd2')).toEqual({}) // orphan pruned
  })

  it('pruneTrackMeta keeps every record when all tracks still exist', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    setTrackMeta('f1', 'bass', { color: '#ff0000' })
    setTrackMeta('f1', 'lead', { collapsed: true })
    pruneTrackMeta('f1', ['bass', 'lead', 'drums'])
    expect(getTrackMeta('f1', 'bass')).toEqual({ color: '#ff0000' })
    expect(getTrackMeta('f1', 'lead')).toEqual({ collapsed: true })
  })

  it('pruneTrackMeta accepts an iterable (not only a Set)', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    setTrackMeta('f1', 'bass', { color: '#ff0000' })
    setTrackMeta('f1', 'gone', { color: '#0000ff' })
    pruneTrackMeta('f1', ['bass'])
    expect(getTrackMeta('f1', 'gone')).toEqual({})
    expect(getTrackMeta('f1', 'bass')).toEqual({ color: '#ff0000' })
  })

  it('pruneTrackMeta is a no-op for a file with no trackMeta map (never creates it)', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    expect(() => pruneTrackMeta('f1', new Set(['bass']))).not.toThrow()
    expect(getTrackMetaMapSnapshot('f1').size).toBe(0)
  })

  it('deleteWorkspaceFile clears the trackMeta snapshot cache — no stale override lingers (#588 L7)', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    setTrackMeta('f1', 'bass', { color: '#ff0000' })
    // Populate the ref-stable snapshot cache for the file.
    expect(getTrackMetaMapSnapshot('f1').get('bass')?.color).toBe('#ff0000')
    deleteWorkspaceFile('f1')
    // Without the cache cleanup the stale snapshot (bass→#ff0000) would persist;
    // with it the entry is dropped and the file reads empty.
    expect(getTrackMetaMapSnapshot('f1').size).toBe(0)
  })

  it('pruneTrackMeta notifies subscribers only when something was actually pruned', () => {
    createWorkspaceFile('f1', 'p.strudel', 'x', 'strudel')
    setTrackMeta('f1', 'bass', { color: '#ff0000' })
    setTrackMeta('f1', 'gone', { color: '#0000ff' })
    const cb = vi.fn()
    const unsub = subscribeToTrackMeta('f1', cb)
    // Nothing stale → no transaction → no notify.
    pruneTrackMeta('f1', new Set(['bass', 'gone']))
    expect(cb).not.toHaveBeenCalled()
    // One stale key → one cleanup transaction → notify.
    pruneTrackMeta('f1', new Set(['bass']))
    expect(cb).toHaveBeenCalled()
    unsub()
  })
})
