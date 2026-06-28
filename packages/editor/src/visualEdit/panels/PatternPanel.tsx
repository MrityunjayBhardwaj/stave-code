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
import { MixerPanel } from '../mixer/MixerPanel'
import { VisualEditStandby } from './VisualEditStandby'
import { PATTERN_TAB_ID } from './tabs'
import type { SelectedNote } from './inspector'
import { type Division, DEFAULT_DIVISION } from './division'

/** width of the pinned Mixer column. The channel strip moved to a horizontal
 *  bar atop the inspector (#600), so the param panel no longer shares the column
 *  with a side strip — it fits a narrower column, and the grid reclaims the
 *  difference (was 300 when the strip sat beside the panel). */
const MIXER_WIDTH = 220

export function PatternPanel(): React.ReactElement {
  const { chunk } = useActiveChunk()
  const kind = patternKind(chunk)

  // The copy/paste selection (#528) — a ⌘/Ctrl-clicked cell on the Piano Roll.
  // Owned here so it survives the grid's own re-renders. Cleared when the cursor
  // moves to a different statement — selection is per-pattern.
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

  const grid =
    kind === 'step' ? (
      <SequencerGrid />
    ) : kind === 'roll' ? (
      <PianoRollGrid selected={selected} onSelect={setSelected} division={division} />
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
      {/* adaptive grid — Sequencer for drums, Piano Roll for melodies */}
      <div data-pattern-grid style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden' }}>
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
        <MixerPanel division={division} onDivisionChange={setDivision} />
      </div>
    </div>
  )
}
