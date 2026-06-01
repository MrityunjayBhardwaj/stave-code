/**
 * historyService — selective commit + discard primitives (#211, Tier 1.1/1.2).
 *
 * Drives the real graph + the in-memory workspace Y.Doc bridge (the
 * WorkspaceFile/historyWorkspace pattern), mocking ONLY the IDB store
 * (`historyStore`) so no fake-indexeddb is needed (see the editor IDB-test
 * split convention). This exercises the honest end-to-end path:
 * initHistory → commitWorkspace({only}) / discardFileChanges → observe
 * getCurrentHistory() + the live workspace.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// IDB bridge: first load is empty (seed from workspace); persist is a no-op.
vi.mock('../historyStore', () => ({
  loadHistory: vi.fn(async () => null),
  saveHistory: vi.fn(async () => {}),
  deleteHistory: vi.fn(async () => {}),
}))

import {
  seedWorkspaceFile,
  setContent,
  getFile,
  __resetWorkspaceFilesForTests,
} from '../../WorkspaceFile'
import {
  initHistory,
  resetHistoryState,
  commitWorkspace,
  discardFileChanges,
  getCurrentHistory,
  getModifiedFileIdsSinceHead,
} from '../historyService'
import { getFileContentAt, headOf, listCommits } from '../historyGraph'

beforeEach(async () => {
  resetHistoryState()
  __resetWorkspaceFilesForTests()
})

async function seedProject(): Promise<void> {
  seedWorkspaceFile('f1', '/a.strudel', 'A0', 'strudel')
  seedWorkspaceFile('f2', '/b.strudel', 'B0', 'strudel')
  await initHistory('proj-1')
}

describe('commitWorkspace — selective `only` subset (#211 Tier 1.2)', () => {
  it('commits only the chosen file; the other stays dirty', async () => {
    await seedProject()
    setContent('f1', 'A1')
    setContent('f2', 'B1')
    // both dirty vs HEAD (the seed)
    expect(getModifiedFileIdsSinceHead()).toEqual(new Set(['f1', 'f2']))

    const id = await commitWorkspace('manual', { label: 'just f1', only: new Set(['f1']) })
    expect(id).not.toBeNull()

    const h = getCurrentHistory()!
    const head = headOf(h)!
    // the commit recorded ONLY f1's new content...
    expect(Object.keys(h.commits[head].files)).toEqual(['f1'])
    expect(getFileContentAt(h, 'f1', head)).toBe('A1')
    expect(getFileContentAt(h, 'f1', h.commits[head].parent!)).toBe('A0')
    // ...and f2 is still uncommitted (dirty vs the new HEAD)
    expect(getModifiedFileIdsSinceHead()).toEqual(new Set(['f2']))
  })

  it('absent `only` captures the full working diff (byte-identical default)', async () => {
    await seedProject()
    setContent('f1', 'A1')
    setContent('f2', 'B1')

    const id = await commitWorkspace('manual', {})
    expect(id).not.toBeNull()
    const h = getCurrentHistory()!
    const head = headOf(h)!
    expect(new Set(Object.keys(h.commits[head].files))).toEqual(new Set(['f1', 'f2']))
    expect(getModifiedFileIdsSinceHead()).toEqual(new Set())
  })

  it('empty intersection with a real diff → no commit (returns null)', async () => {
    await seedProject()
    setContent('f1', 'A1')
    const before = listCommits(getCurrentHistory()!).length
    // only references a file with no changes → empty subset, not allowEmpty
    const id = await commitWorkspace('auto', { only: new Set(['f2']) })
    expect(id).toBeNull()
    expect(listCommits(getCurrentHistory()!).length).toBe(before)
    expect(getModifiedFileIdsSinceHead()).toEqual(new Set(['f1'])) // f1 still dirty
  })
})

describe('discardFileChanges — revert working file to HEAD, NO commit (#211 Tier 1.1)', () => {
  it('restores the live file to HEAD content without recording a commit', async () => {
    await seedProject()
    setContent('f1', 'edited away')
    expect(getModifiedFileIdsSinceHead()).toEqual(new Set(['f1']))
    const commitsBefore = listCommits(getCurrentHistory()!).length

    await discardFileChanges('f1')

    expect(getFile('f1')!.content).toBe('A0') // reverted to HEAD (seed)
    expect(getModifiedFileIdsSinceHead()).toEqual(new Set()) // clean again
    // crucial: Discard ≠ Restore — no new commit appended
    expect(listCommits(getCurrentHistory()!).length).toBe(commitsBefore)
  })

  it('leaves other dirty files untouched', async () => {
    await seedProject()
    setContent('f1', 'A1')
    setContent('f2', 'B1')

    await discardFileChanges('f1')

    expect(getFile('f1')!.content).toBe('A0') // discarded
    expect(getFile('f2')!.content).toBe('B1') // still dirty
    expect(getModifiedFileIdsSinceHead()).toEqual(new Set(['f2']))
  })

  it('is a no-op when the file is not dirty', async () => {
    await seedProject()
    const commitsBefore = listCommits(getCurrentHistory()!).length
    await discardFileChanges('f1')
    expect(getFile('f1')!.content).toBe('A0')
    expect(listCommits(getCurrentHistory()!).length).toBe(commitsBefore)
  })
})
