import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'

import {
  TAB_LOCK,
  hashesInDocUpdates,
  otherTabCount,
  planSweep,
  projectDocDbNames,
} from '../soundCollector'

/**
 * #1785 — the pure halves of the collector. The IndexedDB and Web Locks halves
 * cannot run here (no IndexedDB in this package's tests) and are observed in a
 * browser instead (`packages/app/tests/sound-collector.spec.ts`).
 */

const ID_A = '11111111-2222-4333-8444-555555555555'
const ID_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('which databases are project documents', () => {
  it('reads a registry project only when its database exists', () => {
    expect(projectDocDbNames([`stave-${ID_A}`], [ID_A, ID_B])).toEqual([`stave-${ID_A}`])
  })

  it('reads a document database the registry no longer lists', () => {
    // A delete interrupted between the row and the database still protects
    // the sounds that document names.
    expect(projectDocDbNames([`stave-${ID_B}`], [])).toEqual([`stave-${ID_B}`])
  })

  it('never opens the stores that are not project documents', () => {
    const others = ['stave-assets', 'stave-projects', 'stave-snapshots', 'stave-viz-presets', 'stave-e2e-filler']
    expect(projectDocDbNames(others, [])).toEqual([])
  })
})

describe('the hashes a saved document names', () => {
  it('reads records spread across several updates, as y-indexeddb stores them', () => {
    const doc = new Y.Doc()
    const updates: Uint8Array[] = []
    doc.on('update', (u: Uint8Array) => updates.push(u))
    const assets = doc.getMap('assets')
    assets.set('r1', { id: 'r1', name: 'kick', blobHash: 'h1', mime: 'audio/wav' })
    assets.set('r2', { id: 'r2', name: 'take_1', blobHash: 'h2', mime: 'audio/webm' })
    assets.delete('r1')
    doc.getMap('files').set('f', new Y.Map())
    expect(updates.length).toBeGreaterThan(2)
    expect([...hashesInDocUpdates(updates)]).toEqual(['h2'])
  })

  it('a document with no assets names nothing', () => {
    expect(hashesInDocUpdates([]).size).toBe(0)
  })
})

describe('what the sweep deletes', () => {
  const blob = (hash: string, size: number) => ({ hash, size, mime: 'audio/wav', storedAt: 0 })

  it('only blobs no mark names, with their bytes summed', () => {
    const plan = planSweep([blob('h1', 10), blob('h2', 20), blob('h3', 30)], new Set(['h2']))
    expect({ hashes: plan.unused.map((b) => b.hash), bytes: plan.bytes }).toEqual({
      hashes: ['h1', 'h3'],
      bytes: 40,
    })
  })

  it('nothing when every blob is named', () => {
    expect(planSweep([blob('h1', 10)], new Set(['h1'])).unused).toEqual([])
  })
})

describe('other tabs', () => {
  const lock = (name: string) => ({ name, mode: 'shared' as const, clientId: 'c' })

  it('this tab alone is no other tab', () => {
    expect(otherTabCount({ held: [lock(TAB_LOCK)], pending: [] })).toBe(0)
  })

  it('a second holder is another tab', () => {
    expect(otherTabCount({ held: [lock(TAB_LOCK), lock(TAB_LOCK)], pending: [] })).toBe(1)
  })

  it('a tab still starting up counts', () => {
    expect(otherTabCount({ held: [lock(TAB_LOCK)], pending: [lock(TAB_LOCK)] })).toBe(1)
  })

  it('other locks are not tabs', () => {
    expect(otherTabCount({ held: [lock(TAB_LOCK), lock('stave-sound-refs')], pending: [] })).toBe(0)
  })
})
