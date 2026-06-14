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
import { VisualEditStandby } from '../../visualEdit/panels/VisualEditStandby'
import { VISUAL_EDIT_TABS } from '../../visualEdit/panels/tabs'

/** Register all visual-editing tabs in standby. Idempotent (re-registers by id). */
export function seedVisualEditTabs(): void {
  for (const tab of VISUAL_EDIT_TABS) {
    registerBottomPanelTab({
      id: tab.id,
      title: tab.title,
      icon: tab.icon,
      content: React.createElement(VisualEditStandby, {
        panel: tab.id,
        hint: tab.hint,
        icon: tab.icon,
      }),
    })
  }
}

seedVisualEditTabs()
