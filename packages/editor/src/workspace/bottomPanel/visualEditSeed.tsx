/**
 * visualEditSeed — registers the visual-editing tabs (Sequencer / Mixer /
 * Piano Roll) as standby tabs alongside "Timeline".
 *
 * Mirrors `seedTabs.ts` (the Timeline placeholder): imported for side-effects
 * from BottomPanel.tsx so the seed runs when the drawer bundle first loads,
 * not at the @stave/editor barrel top level (which would seed in package
 * consumers that never render the drawer). Each panel later re-registers its
 * own id with a live UI; the registry's idempotent replace (DA-05) makes the
 * swap flicker-free.
 *
 * Vocabulary discipline (PV32 / D-06): titles and hints are musician-facing,
 * no IR jargon. (#380)
 */
import * as React from 'react'

import { registerBottomPanelTab } from './bottomPanelRegistry'
import { Mixer } from '../../visualEdit/panels/Mixer'
import { SequencerGrid } from '../../visualEdit/panels/SequencerGrid'
import { PianoRollGrid } from '../../visualEdit/panels/PianoRollGrid'
import {
  VISUAL_EDIT_TABS,
  MIXER_TAB_ID,
  SEQUENCER_TAB_ID,
  PIANO_ROLL_TAB_ID,
} from '../../visualEdit/panels/tabs'

const PANELS: Record<string, () => React.ReactElement> = {
  [MIXER_TAB_ID]: Mixer,
  [SEQUENCER_TAB_ID]: SequencerGrid,
  [PIANO_ROLL_TAB_ID]: PianoRollGrid,
}

/**
 * Register the visual-editing tabs with their live panels (Mixer #381,
 * Sequencer #382, Piano Roll #383). Idempotent — re-seeding or a panel
 * re-registering its id just replaces the entry.
 */
export function seedVisualEditTabs(): void {
  for (const tab of VISUAL_EDIT_TABS) {
    const Panel = PANELS[tab.id]
    registerBottomPanelTab({
      id: tab.id,
      title: tab.title,
      icon: tab.icon,
      content: React.createElement(Panel),
    })
  }
}

seedVisualEditTabs()
