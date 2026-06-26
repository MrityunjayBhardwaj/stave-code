/**
 * trackColor.drift.test.ts — the Mixer and the Timeline must colour a track
 * IDENTICALLY (V-track-1, issue #579). The canonical algorithm now lives in the
 * editor (`visualEdit/trackColor.ts`) so the Mixer can import it; the app's
 * `colors.ts` keeps an identical copy because it CANNOT import the editor barrel
 * (it drags `@strudel/draw → gifenc` into vite-node and crashes app unit tests,
 * P172 — the same reason `resolveLaneKey` mirrors `laneKeyOf`).
 *
 * Two copies can drift. This guard deep-imports the editor module directly (pure
 * file, no barrel → gifenc-free) and asserts the two NEVER diverge — palette,
 * index, slot, and the composed `colorForTrack`. A future edit to either copy
 * fails here instead of silently re-splitting the Mixer's dot colour from the
 * Timeline's lane colour (exactly the bug #579 fixes). Mirror-with-guard, the
 * same pattern as `laneIdentity.test.ts`.
 */
import { describe, it, expect } from 'vitest'

// App-side copy (the Timeline's algorithm, used at FullSongTimeline.tsx).
import { TRACK_PALETTE_32, trackIndexOf, paletteForTrack } from '../colors'
// Editor-canonical copy (the Mixer's algorithm), deep-imported to dodge the
// @stave/editor barrel (gifenc CJS crash under vite-node, P172).
import {
  TRACK_PALETTE_32 as EDITOR_PALETTE_32,
  trackIndexOf as editorTrackIndexOf,
  paletteForTrack as editorPaletteForTrack,
  colorForTrack as editorColorForTrack,
} from '../../../../../editor/src/visualEdit/trackColor'

// A spread of keys exercising every branch: `d{N}` sequential + wrap, stem-family
// hints (drums/bass/pad/melody), the Mixer's positional `#k` ids, anonymous
// engine ids, plain hashed names, the lane sentinel, and the empty string.
const KEYS = [
  'd1', 'd2', 'd3', 'd32', 'd33', 'd64',
  'bd', 'hh', 'sd', 'bass', 'sub', '808', 'pad', 'pads',
  'lead', 'melody', 'synth', 'piano', 'keys', 'guitar',
  '#0', '#1', '#7', '$0', '$1',
  'drums', 'vocals', 'arp', 'chord-1', 'whatever', '$default', '',
]

describe('track colour: editor canonical === app mirror (V-track-1 drift guard, #579)', () => {
  it('shares the exact 32-cell palette', () => {
    expect(EDITOR_PALETTE_32).toEqual(TRACK_PALETTE_32)
  })

  it('agrees on trackIndexOf for every key', () => {
    for (const k of KEYS) {
      expect(editorTrackIndexOf(k)).toBe(trackIndexOf(k))
    }
  })

  it('agrees on paletteForTrack for every key (key as its own stem hint)', () => {
    for (const k of KEYS) {
      expect(editorPaletteForTrack(editorTrackIndexOf(k), k)).toBe(
        paletteForTrack(trackIndexOf(k), k),
      )
    }
  })

  it("colorForTrack equals the Timeline's composed call at FullSongTimeline.tsx", () => {
    // The Timeline computes `paletteForTrack(trackIndexOf(laneKey), laneKey)`.
    // The Mixer computes `colorForTrack(id)`. For the same key they MUST match —
    // that equality is what makes one track read one colour in both views.
    for (const k of KEYS) {
      expect(editorColorForTrack(k)).toBe(paletteForTrack(trackIndexOf(k), k))
    }
  })
})
