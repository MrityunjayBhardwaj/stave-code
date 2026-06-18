/**
 * editorRegistry — reveal helpers (#472).
 *
 * The distinction that matters: `revealLineInFile` parks the cursor at column 1
 * (fine for a top-level statement), while `revealOffsetInFile` maps a source
 * CHARACTER OFFSET to its exact line+column via the model's getPositionAt — so
 * the cursor can land INSIDE one arm of a combinator on a shared line, where the
 * grid binds (column 1 there resolves to the whole combinator → standby).
 *
 * Per feedback_editor_idb_test_split: plain spies over a fake Monaco editor, no
 * Monaco runtime — the real cursor behaviour is gated by the Playwright spec.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { registerEditor, unregisterEditor, revealLineInFile, revealOffsetInFile } from '../editorRegistry'

interface Pos {
  lineNumber: number
  column: number
}

function fakeEditor() {
  const calls = { setPosition: [] as Pos[], revealed: [] as number[], focused: 0 }
  const editor = {
    // model maps an offset → a position deterministically for assertions:
    // line = floor(offset / 10) + 1, column = (offset % 10) + 1.
    getModel: () => ({
      getPositionAt: (offset: number): Pos => ({
        lineNumber: Math.floor(offset / 10) + 1,
        column: (offset % 10) + 1,
      }),
    }),
    revealLineInCenter: (line: number) => calls.revealed.push(line),
    setPosition: (p: Pos) => calls.setPosition.push(p),
    focus: () => {
      calls.focused += 1
    },
  }
  return { editor, calls }
}

describe('editorRegistry — reveal helpers (#472)', () => {
  const FILE = 'file-1'
  let f: ReturnType<typeof fakeEditor>

  beforeEach(() => {
    f = fakeEditor()
    registerEditor(FILE, f.editor)
  })
  afterEach(() => {
    unregisterEditor(FILE, f.editor)
  })

  it('revealLineInFile parks the cursor at column 1', () => {
    expect(revealLineInFile(FILE, 4)).toBe(true)
    expect(f.calls.setPosition).toEqual([{ lineNumber: 4, column: 1 }])
    expect(f.calls.revealed).toEqual([4])
  })

  it('revealOffsetInFile sets the cursor at the offset’s line AND column (not column 1)', () => {
    // offset 23 → line 3, column 4 under the fake model mapping.
    expect(revealOffsetInFile(FILE, 23)).toBe(true)
    expect(f.calls.setPosition).toEqual([{ lineNumber: 3, column: 4 }])
    expect(f.calls.revealed).toEqual([3])
    expect(f.calls.focused).toBe(1)
  })

  it('both return false for an unknown file', () => {
    expect(revealLineInFile('nope', 1)).toBe(false)
    expect(revealOffsetInFile('nope', 1)).toBe(false)
  })
})
