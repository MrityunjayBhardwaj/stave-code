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
import {
  TRACK_PALETTE_32,
  trackIndexOf,
  paletteForTrack,
  colorForTrack,
  trackIdentity,
} from '../colors'
// Editor-canonical copy (the Mixer's algorithm), deep-imported to dodge the
// @stave/editor barrel (gifenc CJS crash under vite-node, P172).
import {
  TRACK_PALETTE_32 as EDITOR_PALETTE_32,
  trackIndexOf as editorTrackIndexOf,
  paletteForTrack as editorPaletteForTrack,
  colorForTrack as editorColorForTrack,
  trackIdentity as editorTrackIdentity,
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

// EVERY stem prefix in both modules' STEM_PATTERNS — each must classify
// identically (#586: a fixed KEY list missed prefixes, so a stem pattern added
// to only one copy could pass the guard). Includes prefixes the OLD list omitted
// (`cp`, `hat`, `kick`, `perc`, `ride`, `crash`, `tom`).
const STEM_PREFIXES = [
  'bd', 'hh', 'sd', 'cp', 'hat', 'kick', 'snare', 'drum', 'perc', 'ride', 'crash', 'tom',
  'bass', 'sub', '808',
  'pad', 'pads',
  'lead', 'melody', 'synth', 'piano', 'keys', 'guitar',
]

// Names that DON'T match any stem today but would if a divergent pattern were
// added to one copy (the exact gap #586 flags) — plus prefix+suffix variants that
// exercise the `^`-anchored precedence.
const DIVERGENCE_BAIT = [
  'vox', 'choir', 'kick2', 'drumloop', 'vocal', 'clap', 'cy', 'rim',
  'bd2', 'bassline', 'padthai', 'leadguitar', 'synthwave', 'subwoofer',
]

// Deterministic fuzz — a seeded LCG (no Math.random, so the run is reproducible)
// generating 256 [a-z0-9] names of varying length. Catches any stem-classifier
// divergence on inputs nobody thought to list.
function fuzzNames(count: number): string[] {
  let s = 0x2545f491 // fixed seed
  const next = (): number => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    return s
  }
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const len = 1 + (next() % 8)
    let name = ''
    for (let j = 0; j < len; j++) name += chars[next() % chars.length]
    out.push(name)
  }
  return out
}

const STEM_SAMPLES = [...STEM_PREFIXES, ...DIVERGENCE_BAIT, ...fuzzNames(256)]

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

  it('agrees on the stem-family classifier for every prefix + fuzz (#586)', () => {
    // `paletteForTrack(0, sample)` = TRACK_PALETTE_32[(0*4 + stemHueGroup) % 32]
    // = TRACK_PALETTE_32[stemHueGroup] — and palette[0..3] are distinct families,
    // so this ISOLATES stemHueGroup. Driving it from the union of stem prefixes +
    // divergence-bait + a deterministic fuzz catches a mechanism mismatch (the
    // editor returning a stored index vs the app a loop position) or a stem
    // pattern added to only one copy — neither of which the fixed KEY list saw.
    for (const s of STEM_SAMPLES) {
      expect(editorPaletteForTrack(0, s)).toBe(paletteForTrack(0, s))
      // And the composed colour over a non-zero index, to exercise the full
      // `(trackIndex*4 + hueGroup) % 32` slot maths with the hue from `s`.
      expect(editorColorForTrack(s)).toBe(colorForTrack(s))
      expect(editorPaletteForTrack(7, s)).toBe(paletteForTrack(7, s))
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

  it('trackIdentity(key) matches the Timeline lane: name === laneKey, colour === lane colour', () => {
    // Phase B: the Mixer resolves a strip via trackIdentity(displayKey). The
    // Timeline header shows `laneKey` and colours by paletteForTrack(...). For one
    // track displayKey === laneKey, so the resolver and the Timeline lane MUST
    // agree on BOTH name and colour.
    for (const k of KEYS) {
      const id = editorTrackIdentity(k)
      expect(id.key).toBe(k)
      expect(id.name).toBe(k) // Timeline header === laneKey
      expect(id.color).toBe(paletteForTrack(trackIndexOf(k), k)) // Timeline lane colour
    }
  })

  it('app colorForTrack === editor colorForTrack (V-track-1)', () => {
    for (const k of KEYS) {
      expect(colorForTrack(k)).toBe(editorColorForTrack(k))
    }
  })

  it('app trackIdentity === editor trackIdentity for the DEFAULT (no override)', () => {
    // The app Timeline now resolves lane colour through its OWN trackIdentity
    // mirror; it must equal the editor copy the Mixer uses (V-track-1).
    for (const k of KEYS) {
      const a = trackIdentity(k)
      const e = editorTrackIdentity(k)
      expect(a.key).toBe(e.key)
      expect(a.name).toBe(e.name)
      expect(a.color).toBe(e.color)
    }
  })

  it('app trackIdentity === editor trackIdentity for the OVERRIDE path (V-track-2, #581)', () => {
    // Phase D: a per-track custom colour layers on the palette —
    // `customColor ?? colorForTrack(key)`. Both copies must layer it identically,
    // and an override must win over the deterministic colour for every key.
    const custom = '#abcdef'
    for (const k of KEYS) {
      const a = trackIdentity(k, custom)
      const e = editorTrackIdentity(k, custom)
      expect(a.color).toBe(custom)
      expect(e.color).toBe(custom)
      expect(a.color).toBe(e.color)
    }
    // An explicit `undefined` override falls back to the deterministic colour
    // (the clear-to-default path).
    for (const k of KEYS) {
      expect(trackIdentity(k, undefined).color).toBe(colorForTrack(k))
      expect(editorTrackIdentity(k, undefined).color).toBe(editorColorForTrack(k))
    }
  })
})
