/**
 * Pattern — the single adaptive visual-editing panel (#398).
 *
 * One tab that follows the cursor instead of three the musician has to choose
 * between. The chain head decides which grid editor the focused pattern needs
 * (`patternKind`): a drum pattern (`s`/`sound`) gets the Sequencer step grid, a
 * melody (`note`/`n`) gets the Piano Roll, and anything else shows a standby
 * hint. The Mixer is pinned on the right for whatever is focused — it edits the
 * numeric chain args of any pattern, so it stays constant across the switch.
 *
 * This is pure composition: SequencerGrid / PianoRollGrid / Mixer keep their
 * own binding, write-back and standby behaviour unchanged. Each binds the
 * active chunk independently through useActiveChunk, so they all converge on
 * the same pattern under the cursor; this panel only picks which grid mounts.
 *
 * There is no "both grids at once" case — a chunk is drum XOR melody, and the
 * cursor→chunk binding resolves exactly one chain.
 */
import * as React from 'react'

import { useActiveChunk } from './useActiveChunk'
import { patternKind } from './patternKind'
import { SequencerGrid } from './SequencerGrid'
import { PianoRollGrid } from './PianoRollGrid'
import { Mixer } from './Mixer'
import { VisualEditStandby } from './VisualEditStandby'
import { PATTERN_TAB_ID } from './tabs'
import type { SelectedNote } from './inspector'
import { type Division, DEFAULT_DIVISION } from './division'
import { type Tool, DEFAULT_TOOL } from './tool'
import { ToolPalette } from './ToolPalette'

/** width of the pinned Mixer column */
const MIXER_WIDTH = 300

export function PatternPanel(): React.ReactElement {
  const { chunk } = useActiveChunk()
  const kind = patternKind(chunk)

  // The inspector's selected note/step (#432). Owned here so the grid (which
  // sets it) and the Mixer (which reads + edits it) share one source. Cleared
  // when the cursor moves to a different statement — selection is per-pattern.
  const [selected, setSelected] = React.useState<SelectedNote | null>(null)
  const stmtId = chunk ? chunk.statementRange[0] : null
  const stmtRef = React.useRef<number | null>(stmtId)
  React.useEffect(() => {
    if (stmtRef.current !== stmtId) {
      stmtRef.current = stmtId
      setSelected(null)
    }
  }, [stmtId])

  // The Piano Roll snap/quantize division (#432 Slice 2). A UI preference, so —
  // unlike the selection — it PERSISTS across pattern switches (Logic keeps the
  // Snap value global). Owned here so the grid (snaps to it) and the Mixer
  // (renders the picker) share one source.
  const [division, setDivision] = React.useState<Division>(DEFAULT_DIVISION)

  // The active edit tool (#433). Like the division, a UI preference that
  // PERSISTS across pattern switches (Logic keeps the tool selection global).
  const [tool, setTool] = React.useState<Tool>(DEFAULT_TOOL)
  const hasGrid = kind === 'step' || kind === 'roll'

  const grid =
    kind === 'step' ? (
      <SequencerGrid selected={selected} onSelect={setSelected} tool={tool} />
    ) : kind === 'roll' ? (
      <PianoRollGrid selected={selected} onSelect={setSelected} division={division} tool={tool} />
    ) : (
      <VisualEditStandby
        panel={PATTERN_TAB_ID}
        hint="Click a drum or melodic pattern to edit it here."
        icon="symbol-array"
      />
    )

  return (
    <div
      data-bottom-panel-tab="pattern"
      style={{ display: 'flex', height: '100%', width: '100%', minWidth: 0 }}
    >
      {/* adaptive grid — Sequencer for drums, Piano Roll for melodies. The tool
          palette (#433) is a PINNED OVERLAY (top-left), not an in-flow row: any
          element that takes vertical space above the grid shifts it down and
          silently makes its move/resize drags inert (PV143, verified). The grid
          keeps its full original layout; the toolbar floats over the top-left
          like the NoteColor toggle floats top-right. */}
      <div
        data-pattern-grid
        style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden', position: 'relative' }}
      >
        {hasGrid && (
          <div style={{ position: 'absolute', top: 8, left: 12, zIndex: 4 }}>
            <ToolPalette tool={tool} onTool={setTool} />
          </div>
        )}
        {grid}
      </div>
      {/* Mixer — pinned, constant across the grid switch */}
      <div
        data-pattern-mixer
        style={{
          width: MIXER_WIDTH,
          flexShrink: 0,
          height: '100%',
          overflow: 'hidden',
          borderLeft: '1px solid var(--border, #3a3a42)',
        }}
      >
        <Mixer
          selected={selected}
          onSelect={setSelected}
          division={division}
          onDivisionChange={setDivision}
        />
      </div>
    </div>
  )
}
