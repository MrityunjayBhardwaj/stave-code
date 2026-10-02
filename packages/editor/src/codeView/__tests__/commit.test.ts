import { describe, it, expect, vi } from 'vitest'
import type * as Monaco from 'monaco-editor'
import { Writeback, commit, type OffsetEdit, type WriteSource } from '../writeback'
import { assignmentEdit } from '../assign/soundAssign'

/**
 * #1900 — `commit` is the one way an operation's result reaches the open
 * document. These run it against a small in-memory model with the same surface
 * `Writeback` drives (offset ↔ position, `pushEditOperations`, undo boundaries),
 * and record which source was up while each change landed.
 */
function fakeEditor(initial: string, opts: { noModel?: boolean } = {}) {
  let text = initial
  const changes: { source: WriteSource | null; text: string }[] = []
  let undoStops = 0
  let wb: Writeback | null = null
  const offsetOf = (p: { lineNumber: number; column: number }): number => {
    const lines = text.split('\n')
    let off = 0
    for (let i = 0; i < p.lineNumber - 1; i++) off += lines[i].length + 1
    return off + p.column - 1
  }
  const model = {
    getValue: () => text,
    getPositionAt: (offset: number) => {
      const before = text.slice(0, offset).split('\n')
      return { lineNumber: before.length, column: before[before.length - 1].length + 1 }
    },
    pushStackElement: () => {
      undoStops++
    },
    pushEditOperations: (
      _sel: unknown,
      ops: { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }[],
    ) => {
      const spans = ops
        .map((o) => ({
          s: offsetOf({ lineNumber: o.range.startLineNumber, column: o.range.startColumn }),
          e: offsetOf({ lineNumber: o.range.endLineNumber, column: o.range.endColumn }),
          t: o.text,
        }))
        .sort((a, b) => b.s - a.s)
      for (const { s, e, t } of spans) text = text.slice(0, s) + t + text.slice(e)
      changes.push({ source: wb?.currentSource ?? null, text })
      return null
    },
  }
  const editor = { getModel: () => (opts.noModel ? null : model) }
  const monaco = {
    Range: class {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number,
      ) {}
    },
  }
  wb = new Writeback(
    editor as unknown as Monaco.editor.IStandaloneCodeEditor,
    monaco as unknown as typeof Monaco,
  )
  return { wb, editor, changes, text: () => text, undoStops: () => undoStops }
}

describe('commit — an operation result into the document', () => {
  const doc = '$: s("bd").gain(0.5)'
  const gainArg: [number, number] = [doc.indexOf('0.5'), doc.indexOf('0.5') + 3]

  it('writes one edit, tagged with the source it was given', () => {
    const f = fakeEditor(doc)
    expect(commit(f.wb, { range: gainArg, text: '0.8' }, 'mixer')).toBe('written')
    expect(f.text()).toBe('$: s("bd").gain(0.8)')
    expect(f.changes).toEqual([{ source: 'mixer', text: '$: s("bd").gain(0.8)' }])
  })

  it('writes several edits as ONE change (one undo step)', () => {
    const f = fakeEditor(doc)
    const edits: OffsetEdit[] = [
      { range: gainArg, text: '1' },
      { range: [doc.indexOf('bd'), doc.indexOf('bd') + 2], text: 'hh' },
    ]
    expect(commit(f.wb, edits, 'rename')).toBe('written')
    expect(f.text()).toBe('$: s("hh").gain(1)')
    expect(f.changes).toHaveLength(1)
    expect(f.changes[0].source).toBe('rename')
    expect(f.undoStops()).toBe(2) // one boundary each side of the single change
  })

  it('an operation that returned nothing writes nothing', () => {
    const f = fakeEditor(doc)
    expect(commit(f.wb, null, 'knob')).toBe('nothing-to-write')
    expect(commit(f.wb, [], 'knob')).toBe('nothing-to-write')
    expect(f.changes).toEqual([])
    expect(f.undoStops()).toBe(0)
  })

  it('says so when there is no document to write to', () => {
    const f = fakeEditor(doc, { noModel: true })
    expect(commit(f.wb, { range: gainArg, text: '0.8' }, 'mixer')).toBe('no-document')
  })

  it('the source is down again once the edit has landed', () => {
    const f = fakeEditor(doc)
    commit(f.wb, { range: gainArg, text: '0.8' }, 'knob')
    expect(f.wb.currentSource).toBeNull()
  })
})

/**
 * #1906 — the two other forms of the door. Both reach the registry, which holds
 * the monaco namespace and the editors once per module instance, so each arm
 * takes a fresh module pair (the same reason `editorRegistry.writeOutcome.test`
 * resets per arm).
 */
async function freshDoor() {
  vi.resetModules()
  const reg = await import('../../workspace/editorRegistry')
  const door = await import('../writeback')
  return { reg, door }
}
class Range {
  constructor(
    public startLineNumber: number,
    public startColumn: number,
    public endLineNumber: number,
    public endColumn: number,
  ) {}
}

describe('commitToEditor — the editor route without a writer in hand', () => {
  const doc = '$: s("bd")'
  const bd: [number, number] = [doc.indexOf('bd'), doc.indexOf('bd') + 2]

  it('writes, tagged, when Monaco is loaded', async () => {
    const { reg, door } = await freshDoor()
    reg.registerMonacoNamespace({ Range } as never)
    const f = fakeEditor(doc)
    const spy = vi.spyOn(door.Writeback.prototype, 'replaceRanges')
    expect(door.commitToEditor(f.editor as never, { range: bd, text: 'hh' }, 'rename')).toBe('written')
    expect(spy.mock.calls.map((c) => c[1])).toEqual(['rename'])
    expect(f.text()).toBe('$: s("hh")')
    expect(f.changes.map((c) => c.text)).toEqual(['$: s("hh")'])
  })

  it('says no-document (and writes nothing) before Monaco is loaded', async () => {
    const { door } = await freshDoor()
    const f = fakeEditor(doc)
    expect(door.commitToEditor(f.editor as never, { range: bd, text: 'hh' }, 'mixer')).toBe('no-document')
    expect(f.text()).toBe(doc)
  })

  it('nothing to write is nothing-to-write', async () => {
    const { reg, door } = await freshDoor()
    reg.registerMonacoNamespace({ Range } as never)
    const f = fakeEditor(doc)
    expect(door.commitToEditor(f.editor as never, null, 'mixer')).toBe('nothing-to-write')
    expect(f.changes).toEqual([])
  })
})

describe('commitToFile — the file route keeps its stale-document check', () => {
  const FILE = 'song.js'
  const doc = '$: s("bd").gain(0.5)'
  const g: [number, number] = [doc.indexOf('0.5'), doc.indexOf('0.5') + 3]

  it('applies one edit against the document it was computed from', async () => {
    const { reg, door } = await freshDoor()
    reg.registerMonacoNamespace({ Range } as never)
    const f = fakeEditor(doc)
    reg.registerEditor(FILE, f.editor as never)
    expect(door.commitToFile(FILE, { range: g, text: '0.8' }, 'mixer', doc)).toBe('applied')
    expect(f.text()).toBe('$: s("bd").gain(0.8)')
  })

  it('refuses a moved document as stale-document and writes nothing', async () => {
    const { reg, door } = await freshDoor()
    reg.registerMonacoNamespace({ Range } as never)
    const f = fakeEditor(doc)
    reg.registerEditor(FILE, f.editor as never)
    expect(door.commitToFile(FILE, { range: g, text: '0.8' }, 'mixer', doc + ' ')).toBe('stale-document')
    expect(f.text()).toBe(doc)
  })

  it('names the other refusals: no editor, nothing to write', async () => {
    const { reg, door } = await freshDoor()
    reg.registerMonacoNamespace({ Range } as never)
    expect(door.commitToFile('nope.js', { range: g, text: '0.8' }, 'mixer', doc)).toBe('no-editor')
    const f = fakeEditor(doc)
    reg.registerEditor(FILE, f.editor as never)
    expect(door.commitToFile(FILE, null, 'mixer', doc)).toBe('no-edits')
    expect(door.commitToFile(FILE, [], 'mixer', doc)).toBe('no-edits')
    expect(f.text()).toBe(doc)
  })
})

describe('assignmentEdit — a plan as the plain edit it stands for', () => {
  it('replace keeps its range; insert is zero-width at its offset', () => {
    expect(assignmentEdit({ kind: 'replace', range: [3, 7], text: "'piano'" })).toEqual({ range: [3, 7], text: "'piano'" })
    expect(assignmentEdit({ kind: 'insert', offset: 12, text: '\ns("bd")' })).toEqual({ range: [12, 12], text: '\ns("bd")' })
  })
})
