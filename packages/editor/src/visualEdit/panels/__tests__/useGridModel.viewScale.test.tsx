/**
 * `useGridModel` at a refined view (#1057) — the WRITE side of the free zone.
 *
 * The free-zone tests in `notation/__tests__/resolution.test.ts` pin the pure rule:
 * which targets are a view change, and what a model collapses to. They cannot see
 * the thing that actually reaches the user's file, because the decision to absorb
 * the refinement and the choice of which model to serialize both live in the hook.
 *
 * That gap is not hypothetical: it is where a velocity drag respelled `bd ~ sn ~`
 * as `bd _ ~ ~ sn _ ~ ~` and widened the `.gain` mini to match, while every pure
 * test stayed green. So this drives the REAL hook against a real document and reads
 * the bytes back — the same question the panel asks, asked where the panel asks it.
 *
 * The Monaco surface is stood in for rather than mocked away: a single-line model
 * with the five methods `Writeback` actually calls, so the write goes through the
 * production `applyEdit` → `Writeback.replaceRanges` path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { render, act } from '@testing-library/react'

// ── a single-line Monaco stand-in ────────────────────────────────────────────
let DOC = ''
let cursorOffset = 0

class FakeRange {
  constructor(
    public startLineNumber: number,
    public startColumn: number,
    public endLineNumber: number,
    public endColumn: number,
  ) {}
}

const fakeModel = {
  getValue: () => DOC,
  getOffsetAt: (p: { column: number }) => p.column - 1,
  getPositionAt: (o: number) => ({ lineNumber: 1, column: o + 1 }),
  onDidChangeContent: () => ({ dispose: () => {} }),
  pushStackElement: () => {},
  pushEditOperations: (_sel: unknown, ops: { range: FakeRange; text: string }[]) => {
    // right-to-left so earlier offsets stay valid, matching Monaco's own semantics
    for (const op of [...ops].sort((a, b) => b.range.startColumn - a.range.startColumn)) {
      DOC = DOC.slice(0, op.range.startColumn - 1) + op.text + DOC.slice(op.range.endColumn - 1)
    }
    return null
  },
}

const fakeEditor = {
  getModel: () => fakeModel,
  getPosition: () => ({ lineNumber: 1, column: cursorOffset + 1 }),
  onDidChangeCursorPosition: () => ({ dispose: () => {} }),
}

vi.mock('../../../workspace/editorRegistry', () => ({
  getActiveEditor: () => fakeEditor,
  onActiveEditorChange: () => () => {},
  getMonacoNamespace: () => ({ Range: FakeRange }),
  requestReeval: () => {},
  getFileIdForEditor: () => 'test-file',
}))

import { parseStepGrid, applyStepGain } from '../../notation/parse'
import { serializeStepGrid, serializeStepGain } from '../../notation/serialize'
import { collapseStepGridToDocument } from '../../notation/resolution'
import { isStepChunk } from '../patternKind'
import { useGridModel } from '../useGridModel'
import { setColumnGain } from '../inspector'
import { toggleCell } from '../../notation/place'
import { UNREFINED, documentSteps, type ViewScale } from '../../notation/viewResolution'
import type { StepGridModel } from '../../notation/model'

// ── a harness wired exactly as `SequencerGrid` wires it ──────────────────────
interface Handle {
  model: StepGridModel | null
  mutate: (fn: (m: StepGridModel) => StepGridModel) => void
  setViewScale: (s: ViewScale) => void
  viewScale: ViewScale
}
let h: Handle

function Harness(): React.ReactElement {
  const [viewScale, setViewScale] = React.useState<ViewScale>(UNREFINED)
  const { model, mutate } = useGridModel<StepGridModel>({
    source: 'seq',
    eligible: isStepChunk,
    parse: parseStepGrid,
    serialize: serializeStepGrid,
    applyGain: applyStepGain,
    serializeGain: serializeStepGain,
    viewScale,
    onViewScaleConsumed: () => setViewScale(UNREFINED),
    collapseToDocument: collapseStepGridToDocument,
  })
  h = { model, mutate, setViewScale, viewScale }
  return React.createElement('div')
}

describe('useGridModel — writing from a refined view (#1057)', () => {
  beforeEach(() => {
    DOC = 's("bd ~ sn ~")'
    cursorOffset = 5 // inside the mini
  })

  it('refining alone writes nothing', () => {
    render(React.createElement(Harness))
    const before = DOC
    expect(h.model?.steps).toBe(4)

    act(() => h.setViewScale(2))

    expect(DOC, 'a view preference must not reach the file').toBe(before)
    expect(h.model?.steps).toBe(8) // …but the panel really is drawing finer
    expect(documentSteps(h.model as StepGridModel)).toBe(4)
  })

  it('THE DEFECT: a velocity edit while refined leaves the notation alone', () => {
    render(React.createElement(Harness))
    act(() => h.setViewScale(2))

    act(() => h.mutate((prev) => setColumnGain(prev, 0, 0.42)))

    // the notation is byte-identical — only `.gain` was added
    expect(DOC).toBe('s("bd ~ sn ~").gain("0.42 ~ 1 ~")')
    // …and the user's zoom survived, because the document's spelling never changed
    expect(h.viewScale).toBe(2)
    expect(h.model?.steps).toBe(8)
  })

  it('CONTROL ARM: the same edit unrefined produces the same document', () => {
    // If these two diverged, the refinement would still be reaching the file.
    render(React.createElement(Harness))
    act(() => h.mutate((prev) => setColumnGain(prev, 0, 0.42)))
    expect(DOC).toBe('s("bd ~ sn ~").gain("0.42 ~ 1 ~")')
    expect(h.viewScale).toBe(UNREFINED)
  })

  it('an edit that USES a view-only column does spell it, and absorbs the view', () => {
    render(React.createElement(Harness))
    act(() => h.setViewScale(2))

    // drawn column 1 exists only at ×2 — this is what refining is FOR
    act(() => h.mutate((prev) => toggleCell(prev, 0, 1, true)))

    expect(DOC).toBe('s("[bd bd] ~ sn ~")')
    // the document now spells what was drawn, so the marker is dropped and the
    // panel returns to its own resolution — with no change in what is on screen
    expect(h.viewScale).toBe(UNREFINED)
    expect(h.model?.steps).toBe(8)
    expect(documentSteps(h.model as StepGridModel)).toBe(8)
  })

  it('a second velocity edit does not drift the document', () => {
    // The write path is asked twice; a rule that only holds on the first ask would
    // show up here as an accumulating respelling.
    render(React.createElement(Harness))
    act(() => h.setViewScale(2))
    act(() => h.mutate((prev) => setColumnGain(prev, 0, 0.42)))
    const afterFirst = DOC
    // drawn column 4 is the `sn` — a column that CARRIES a hit, so its gain has
    // something to serialize. (Column 2 is the empty `~`, and gain on nothing is
    // nothing: the first draft asserted against that and passed vacuously.)
    act(() => h.mutate((prev) => setColumnGain(prev, 4, 0.7)))
    expect(DOC).not.toBe(afterFirst) // the second edit really did land…
    expect(DOC.startsWith('s("bd ~ sn ~")'), DOC).toBe(true) // …and notation held
    expect(h.viewScale).toBe(2)
  })
})
