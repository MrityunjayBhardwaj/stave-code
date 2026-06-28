/**
 * Mixer — the Pattern tab's cursor-bound inspector (#381).
 *
 * Finds the Strudel statement under the cursor (via `useActiveChunk`) and shows
 * its full knob chain. Since S4b the body itself lives in `MixerBody` (shared
 * with the Mixer console's per-strip expand drawer); `Mixer` is the thin wrapper
 * that supplies the *cursor* binding: it tracks the chunk under the cursor and
 * shows a standby when there's nothing editable there, then delegates the body
 * (picker + Snap + transforms + knob grid) to `MixerBody`. Behaviour is
 * unchanged from the pre-S4b single-file component — same write path, same DOM,
 * same #381 tests.
 *
 * Standby fires when the cursor isn't in a chunk with an editable chain (the
 * conservatism rule); `MixerBody` itself never standbys (an empty-chain chunk
 * still shows the transforms row to ADD effects — wanted in the drawer).
 */
import * as React from 'react'

import { VisualEditStandby } from './VisualEditStandby'
import { MIXER_TAB_ID } from './tabs'
import { useActiveChunk } from './useActiveChunk'
import { MixerBody } from './MixerBody'
import { type Division } from './division'

const MIXER_HINT = 'Click a pattern to adjust its sound with knobs.'

export interface MixerProps {
  /** Piano-Roll snap/quantize division (#432 Slice 2), owned by PatternPanel */
  division?: Division
  onDivisionChange?: (d: Division) => void
}

export function Mixer({ division, onDivisionChange }: MixerProps = {}): React.ReactElement {
  const { chunk, applyEdit, beginGesture, endGesture } = useActiveChunk()

  // Standby only when there's no editable pattern under the cursor. A pattern
  // with no numeric args still shows the quick-transform row (MixerBody) so
  // effects can be added (then dragged).
  if (!chunk || chunk.chain.length === 0) {
    return React.createElement(VisualEditStandby, {
      panel: MIXER_TAB_ID,
      hint: MIXER_HINT,
      icon: 'settings',
    })
  }

  return (
    <MixerBody
      chunk={chunk}
      applyEdit={applyEdit}
      beginGesture={beginGesture}
      endGesture={endGesture}
      division={division}
      onDivisionChange={onDivisionChange}
      dataTab={MIXER_TAB_ID}
      // A nested stack voice (#395) isn't a top-level track, so the channel-strip
      // fader (which mixes the track) doesn't reach its gain — surface a per-voice
      // gain control here instead (#620). A top-level track's gain stays on the strip.
      showGain={chunk.nested}
    />
  )
}
