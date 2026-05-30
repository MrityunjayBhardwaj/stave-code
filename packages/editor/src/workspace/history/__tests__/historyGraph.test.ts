/**
 * historyGraph — pure commit-graph unit tests (Phase F, #196).
 *
 * Deterministic: ids and timestamps are supplied explicitly (the production
 * driver passes crypto.randomUUID()/Date.now()). No IndexedDB, no Y.Doc.
 */
import { describe, it, expect } from 'vitest'
import {
  seedHistory,
  commitOnto,
  changedFiles,
  getFileContentAt,
  snapshotAt,
  listCommits,
  fileHistory,
  createBranch,
  switchBranch,
  headOf,
  seedCommitId,
  isFileModifiedAt,
  countManualCommits,
  MAIN_BRANCH,
  type ProjectHistory,
} from '../historyGraph'

const order = { fileOrder: { '/': ['f1', 'f2'] }, subfolderOrder: {} }

function seed(): ProjectHistory {
  return seedHistory('p1', { f1: 'a0', f2: 'b0' }, order, 'c0', 1000)
}

describe('seedHistory', () => {
  it('creates a seed commit on main holding all files', () => {
    const h = seed()
    expect(h.currentBranch).toBe(MAIN_BRANCH)
    expect(headOf(h)).toBe('c0')
    expect(h.commits.c0.kind).toBe('seed')
    expect(h.commits.c0.parent).toBeNull()
    expect(h.commits.c0.files).toEqual({ f1: 'a0', f2: 'b0' })
    expect(h.fileIndex).toEqual({ f1: ['c0'], f2: ['c0'] })
  })
})

describe('changedFiles', () => {
  it('returns only files whose content differs from HEAD', () => {
    const h = seed()
    const changed = changedFiles(h, { f1: 'a0', f2: 'b1' })
    expect(changed).toEqual({ f2: 'b1' }) // f1 unchanged, dropped
  })
  it('treats a brand-new file as changed', () => {
    const h = seed()
    expect(changedFiles(h, { f1: 'a0', f3: 'new' })).toEqual({ f3: 'new' })
  })
  it('empty when nothing changed', () => {
    const h = seed()
    expect(changedFiles(h, { f1: 'a0', f2: 'b0' })).toEqual({})
  })
})

describe('commitOnto', () => {
  it('appends a commit with only changed files and advances HEAD', () => {
    const h0 = seed()
    const h1 = commitOnto(h0, { f2: 'b1' }, { kind: 'auto', id: 'c1', createdAt: 2000 })
    expect(headOf(h1)).toBe('c1')
    expect(h1.commits.c1.parent).toBe('c0')
    expect(h1.commits.c1.files).toEqual({ f2: 'b1' }) // only changed file stored
    expect(h1.fileIndex.f2).toEqual(['c0', 'c1'])
    expect(h1.fileIndex.f1).toEqual(['c0']) // untouched
  })
  it('is a no-op when changed is empty', () => {
    const h0 = seed()
    expect(commitOnto(h0, {}, { kind: 'auto', id: 'cX', createdAt: 9 })).toBe(h0)
  })
  it('makes a label-only anchor when changed is empty + allowEmpty (#199)', () => {
    const h0 = seed()
    const h1 = commitOnto(h0, {}, {
      kind: 'manual',
      id: 'man',
      createdAt: 2000,
      label: 'v1 demo',
      allowEmpty: true,
    })
    expect(h1).not.toBe(h0) // a real commit was made
    expect(headOf(h1)).toBe('man')
    expect(h1.commits.man.parent).toBe('c0')
    expect(h1.commits.man.files).toEqual({}) // anchor holds no content
    expect(h1.commits.man.label).toBe('v1 demo')
    expect(listCommits(h1).map((c) => c.id)).toEqual(['man', 'c0'])
    // the anchor is transparent to back-walk — content resolves past it
    expect(getFileContentAt(h1, 'f1', 'man')).toBe('a0')
    expect(getFileContentAt(h1, 'f2', 'man')).toBe('b0')
    // empty commit writes no file, so fileIndex is unchanged
    expect(h1.fileIndex).toEqual({ f1: ['c0'], f2: ['c0'] })
  })
  it('does not mutate the input history (purity)', () => {
    const h0 = seed()
    commitOnto(h0, { f1: 'a1' }, { kind: 'auto', id: 'c1', createdAt: 2000 })
    expect(headOf(h0)).toBe('c0')
    expect(h0.fileIndex.f1).toEqual(['c0'])
  })
})

describe('getFileContentAt — parent back-walk', () => {
  it('returns nearest writer at-or-before the commit', () => {
    let h = seed()
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'c1', createdAt: 2000 })
    h = commitOnto(h, { f2: 'b2' }, { kind: 'auto', id: 'c2', createdAt: 3000 })
    // f1 written at c0 + c1; at c2 the nearest writer is c1
    expect(getFileContentAt(h, 'f1', 'c2')).toBe('a1')
    // at c0, f1 = a0 (c1 not yet reached)
    expect(getFileContentAt(h, 'f1', 'c0')).toBe('a0')
    // f2 at c2 = b2; at c1 still b0 (seed)
    expect(getFileContentAt(h, 'f2', 'c2')).toBe('b2')
    expect(getFileContentAt(h, 'f2', 'c1')).toBe('b0')
  })
  it('returns null for a file that never existed at/before the commit', () => {
    const h = seed()
    expect(getFileContentAt(h, 'ghost', 'c0')).toBeNull()
  })
})

describe('snapshotAt', () => {
  it('reconstructs the full file set + nearest order at a commit', () => {
    let h = seed()
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'c1', createdAt: 2000, order })
    const snap = snapshotAt(h, 'c1')
    expect(snap.files).toEqual({ f1: 'a1', f2: 'b0' }) // f1 from c1, f2 from seed
    expect(snap.order).toEqual(order)
  })
  // #199: restore/fork target an empty manual anchor (files:{}). snapshotAt
  // MUST reconstruct the full project by walking past the anchor, and pick up
  // the anchor's own order snapshot. Guards the fork/restore-from-anchor path.
  it('reconstructs the full file set when the target commit is an empty anchor', () => {
    let h = seed()
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'c1', createdAt: 2000 })
    h = commitOnto(h, {}, { kind: 'manual', id: 'anchor', createdAt: 3000, order, allowEmpty: true })
    const snap = snapshotAt(h, 'anchor')
    expect(snap.files).toEqual({ f1: 'a1', f2: 'b0' }) // nearest writers past the anchor
    expect(snap.order).toEqual(order) // the anchor's own order snapshot
  })
  it('fork from an empty anchor reconstructs the full workspace on switch', () => {
    let h = seed()
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'c1', createdAt: 2000 })
    h = commitOnto(h, {}, { kind: 'manual', id: 'anchor', createdAt: 3000, allowEmpty: true })
    h = createBranch(h, 'fromAnchor', 'anchor', 3500)
    h = switchBranch(h, 'fromAnchor')
    expect(headOf(h)).toBe('anchor')
    expect(snapshotAt(h, headOf(h)!).files).toEqual({ f1: 'a1', f2: 'b0' })
  })
})

describe('seedCommitId / isFileModifiedAt (#191 per-file primitives)', () => {
  it('seedCommitId finds the seed commit, even from a deep branch', () => {
    let h = seed()
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'c1', createdAt: 2000 })
    h = commitOnto(h, { f1: 'a2' }, { kind: 'manual', id: 'c2', createdAt: 3000, label: 'x' })
    expect(seedCommitId(h)).toBe('c0')
  })
  it('isFileModifiedAt is true when live differs from the commit, false when equal', () => {
    let h = seed()
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'c1', createdAt: 2000 })
    // f1 at HEAD (c1) is 'a1'
    expect(isFileModifiedAt(h, 'f1', 'c1', 'a1')).toBe(false)
    expect(isFileModifiedAt(h, 'f1', 'c1', 'a1-EDITED')).toBe(true)
    // vs the seed, f1 was 'a0'
    expect(isFileModifiedAt(h, 'f1', 'c0', 'a0')).toBe(false)
    expect(isFileModifiedAt(h, 'f1', 'c1', 'a0')).toBe(true) // a0 ≠ a1 at c1
  })
  it('isFileModifiedAt treats live-absent (null) as modified iff the file existed', () => {
    const h = seed()
    expect(isFileModifiedAt(h, 'f1', 'c0', null)).toBe(true) // existed at c0, now gone
    expect(isFileModifiedAt(h, 'ghost', 'c0', null)).toBe(false) // never existed → unchanged
  })
  it('countManualCommits counts only manual checkpoints (#207 nudge)', () => {
    let h = seed()
    expect(countManualCommits(h)).toBe(0) // seed is not manual
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'c1', createdAt: 2000 })
    h = commitOnto(h, { f1: 'a2' }, { kind: 'manual', id: 'm1', createdAt: 3000, label: 'one' })
    h = commitOnto(h, {}, { kind: 'manual', id: 'm2', createdAt: 4000, label: 'two', allowEmpty: true })
    expect(countManualCommits(h)).toBe(2) // m1 + m2; auto + seed excluded
  })
})

describe('listCommits / fileHistory', () => {
  it('lists branch lineage newest-first', () => {
    let h = seed()
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'c1', createdAt: 2000 })
    expect(listCommits(h).map((c) => c.id)).toEqual(['c1', 'c0'])
  })
  it('fileHistory returns only commits that wrote the file, newest-first', () => {
    let h = seed()
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'c1', createdAt: 2000 })
    h = commitOnto(h, { f2: 'b2' }, { kind: 'auto', id: 'c2', createdAt: 3000 })
    expect(fileHistory(h, 'f1').map((c) => c.id)).toEqual(['c1', 'c0'])
    expect(fileHistory(h, 'f2').map((c) => c.id)).toEqual(['c2', 'c0'])
  })
})

describe('branches', () => {
  it('createBranch starts a new head at a commit; switchBranch changes authority', () => {
    let h = seed()
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'c1', createdAt: 2000 })
    h = createBranch(h, 'exp', 'c0', 2500)
    expect(h.branches.exp.head).toBe('c0')
    expect(h.branches.exp.createdFrom).toBe('c0')
    expect(h.currentBranch).toBe(MAIN_BRANCH) // create does not switch

    h = switchBranch(h, 'exp')
    expect(h.currentBranch).toBe('exp')
    expect(headOf(h)).toBe('c0')

    // committing on exp advances exp head, not main
    h = commitOnto(h, { f1: 'aExp' }, { kind: 'auto', id: 'e1', createdAt: 3000 })
    expect(h.branches.exp.head).toBe('e1')
    expect(h.branches.main.head).toBe('c1')
    expect(h.commits.e1.branch).toBe('exp')
    expect(h.commits.e1.parent).toBe('c0') // forked from c0, not c1
  })
  it('rejects duplicate branch name and unknown fromCommit', () => {
    const h = seed()
    expect(() => createBranch(h, MAIN_BRANCH, 'c0', 1)).toThrow(/already exists/)
    expect(() => createBranch(h, 'x', 'nope', 1)).toThrow(/not found/)
    expect(() => switchBranch(h, 'nope')).toThrow(/not found/)
  })
})
