/**
 * historyWorkspace — restore write-path tests (Phase F, #196, Task 4).
 *
 * Uses the in-memory workspace Y.Doc (the WorkspaceFile.test.ts pattern). The
 * point of these tests is the load-bearing #189/P78 path: restore reverts
 * through `setContent`/`createWorkspaceFile`, so the post-choreography
 * workspace state (what `getFile`/`listWorkspaceFiles` report) is correct.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  seedWorkspaceFile,
  getFile,
  setContent,
  deleteWorkspaceFile,
  listWorkspaceFiles,
  __resetWorkspaceFilesForTests,
} from '../../WorkspaceFile'
import {
  readWorkspaceFiles,
  readWorkspaceFileMeta,
  applySnapshot,
} from '../historyWorkspace'

beforeEach(() => {
  __resetWorkspaceFilesForTests()
})

describe('readWorkspaceFiles / readWorkspaceFileMeta', () => {
  it('captures current content + metadata of every file', () => {
    seedWorkspaceFile('f1', '/a.strudel', 'sound("bd")', 'strudel')
    seedWorkspaceFile('f2', '/viz/p.p5js', 'noStroke()', 'p5js', { vizId: 'pianoroll' })

    expect(readWorkspaceFiles()).toEqual({
      f1: 'sound("bd")',
      f2: 'noStroke()',
    })
    expect(readWorkspaceFileMeta()).toEqual({
      f1: { path: '/a.strudel', language: 'strudel' },
      f2: { path: '/viz/p.p5js', language: 'p5js', meta: { vizId: 'pianoroll' } },
    })
  })
})

describe('applySnapshot — restore choreography', () => {
  it('reverts content of an existing file through setContent', () => {
    seedWorkspaceFile('f1', '/a.strudel', 'original', 'strudel')
    const files = readWorkspaceFiles()
    const meta = readWorkspaceFileMeta()

    setContent('f1', 'user edited this')
    expect(getFile('f1')!.content).toBe('user edited this')

    const res = applySnapshot(files, meta)
    expect(getFile('f1')!.content).toBe('original') // reverted
    expect(res.skippedNoMeta).toEqual([])
  })

  it('recreates a file that was deleted since the snapshot', () => {
    seedWorkspaceFile('f1', '/a.strudel', 'keep', 'strudel')
    seedWorkspaceFile('f2', '/b.p5js', 'gone-but-back', 'p5js', { vizId: 'x' })
    const files = readWorkspaceFiles()
    const meta = readWorkspaceFileMeta()

    deleteWorkspaceFile('f2')
    expect(getFile('f2')).toBeUndefined()

    const res = applySnapshot(files, meta)
    const f2 = getFile('f2')
    expect(f2).toBeDefined()
    expect(f2!.content).toBe('gone-but-back')
    expect(f2!.path).toBe('/b.p5js')
    expect(f2!.language).toBe('p5js')
    expect(f2!.meta).toEqual({ vizId: 'x' })
    expect(res.recreatedMissing).toEqual(['f2'])
  })

  it('deletes a file created since the snapshot', () => {
    seedWorkspaceFile('f1', '/a.strudel', 'keep', 'strudel')
    const files = readWorkspaceFiles()
    const meta = readWorkspaceFileMeta()

    seedWorkspaceFile('f3', '/new.strudel', 'added later', 'strudel')
    expect(getFile('f3')).toBeDefined()

    applySnapshot(files, meta)
    expect(getFile('f3')).toBeUndefined() // removed
    expect(listWorkspaceFiles().map((f) => f.id)).toEqual(['f1'])
  })

  it('reports files it cannot recreate (no metadata)', () => {
    seedWorkspaceFile('f1', '/a.strudel', 'keep', 'strudel')
    // snapshot references a file with no metadata sidecar
    const res = applySnapshot({ f1: 'keep', ghost: 'lost' }, { f1: { path: '/a.strudel', language: 'strudel' } })
    expect(res.skippedNoMeta).toEqual(['ghost'])
    expect(getFile('ghost')).toBeUndefined()
  })
})
