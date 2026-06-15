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

/** width of the pinned Mixer column */
const MIXER_WIDTH = 300

export function PatternPanel(): React.ReactElement {
  const { chunk } = useActiveChunk()
  const kind = patternKind(chunk)

  const grid =
    kind === 'step' ? (
      <SequencerGrid />
    ) : kind === 'roll' ? (
      <PianoRollGrid />
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
        <Mixer />
      </div>
    </div>
  )
}
