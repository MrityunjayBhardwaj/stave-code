/**
 * trackId — the mute-invariant identity rule (#737).
 *
 * A muted track (`_` label prefix) must resolve to the SAME lane identity as its
 * unmuted self, so muting keeps a track in its place (and doesn't collapse every
 * anon `_$:` onto one lane). Guards the P235 trap: identity must strip `_` the
 * same way the DISPLAY deriver (`labelAtOffset`) already does.
 */
import { describe, it, expect } from 'vitest'
import { trackIdFromLabel, trackIdsFromLabels, isMutedLabel } from '../trackId'
import { parseStrudel } from '../parseStrudel'
import type { PatternIR } from '../PatternIR'

function trackIds(ir: PatternIR): string[] {
  if (ir.tag === 'Stack') return ir.tracks.map((t) => (t.tag === 'Track' ? t.trackId : '?'))
  if (ir.tag === 'Track') return [ir.trackId]
  return []
}

describe('trackIdFromLabel — mute-invariant identity', () => {
  it('anon `$:` (bare or muted) keeps the positional `d{i+1}`', () => {
    expect(trackIdFromLabel('$', 0)).toBe('d1')
    expect(trackIdFromLabel('_$', 0)).toBe('d1') // muted anon → still positional, NOT '_$'
    expect(trackIdFromLabel('$', 1)).toBe('d2')
    expect(trackIdFromLabel('_$', 1)).toBe('d2')
  })

  it('named track: mute is invariant (same id muted or not)', () => {
    expect(trackIdFromLabel('drums', 0)).toBe('drums')
    expect(trackIdFromLabel('_drums', 0)).toBe('drums') // muted named → same lane, NOT '_drums'
  })

  it('undefined label falls to positional', () => {
    expect(trackIdFromLabel(undefined, 0)).toBe('d1')
  })
})

describe('parseStrudel — muted tracks keep their lane (#737 regression)', () => {
  it('two muted anon `$:` do NOT collapse into one lane', () => {
    // Without the `_`-strip both became trackId `_$` → ONE lane.
    expect(trackIds(parseStrudel('_$: s("bd")\n_$: s("hh")'))).toEqual(['d1', 'd2'])
  })

  it('a muted named track keeps its unmuted identity', () => {
    // Without the strip the muted track became `_drums` — a new lane.
    expect(trackIds(parseStrudel('drums: s("bd")\n_lead: s("hh")'))).toEqual(['drums', 'lead'])
  })

  it('mixed muted/unmuted anon stay in their positional slots', () => {
    expect(trackIds(parseStrudel('$: s("bd")\n_$: s("hh")\n$: s("cp")'))).toEqual(['d1', 'd2', 'd3'])
  })
})

describe('trackIdsFromLabels — ids are unique across the DOCUMENT (#1667)', () => {
  it('leaves every non-colliding document byte-identical', () => {
    // The safety property: the positional id starts at its own position, so a
    // document whose names do not collide is assigned exactly what the
    // per-track rule assigned before.
    expect(trackIdsFromLabels(['$', '$', '$'])).toEqual(['d1', 'd2', 'd3'])
    expect(trackIdsFromLabels(['drums', '$', 'bass'])).toEqual(['drums', 'd2', 'bass'])
    expect(trackIdsFromLabels(['_$', '_drums'])).toEqual(['d1', 'drums'])
    expect(trackIdsFromLabels([])).toEqual([])
  })

  it('counts a positional id past a name a LABEL claimed', () => {
    // `d2:` is a legal label. The second statement's positional id was `d2` too
    // — the same string, for a different track.
    expect(trackIdsFromLabels(['d2', '$'])).toEqual(['d2', 'd3'])
    // The claim holds wherever the label sits, before or after.
    expect(trackIdsFromLabels(['$', 'd1'])).toEqual(['d2', 'd1'])
  })

  it('counts past a name ANOTHER POSITIONAL id took', () => {
    // Positions 2 and 4 are unlabelled. Position 2 passes `d2` and `d3` (both
    // claimed) to reach `d4`; position 4 must then pass THAT. Seeding the taken
    // set with labels alone leaves these two positional ids equal — a collision
    // between two ids the tool invented, with no label involved at all.
    expect(trackIdsFromLabels(['d2', '$', 'd3', '$'])).toEqual(['d2', 'd4', 'd3', 'd5'])
  })

  it('assigns a distinct id to every track, for any arrangement of labels', () => {
    const labels = ['d1', '$', 'd3', '$', 'd2', '$', '$']
    const ids = trackIdsFromLabels(labels)
    expect(new Set(ids).size).toBe(labels.length)
    // and the user's own labels are never moved
    expect([ids[0], ids[2], ids[4]]).toEqual(['d1', 'd3', 'd2'])
  })

  it('agrees with the per-track rule wherever that rule is still used', () => {
    // `trackIdFromLabel` is the single-track entry point (index 0) — no
    // siblings, so nothing to collide with. The two must not read a label
    // differently.
    for (const label of ['$', '_$', 'drums', '_drums', undefined]) {
      expect(trackIdsFromLabels([label])).toEqual([trackIdFromLabel(label, 0)])
    }
  })
})

describe('parseStrudel — no two tracks share an id (#1667 regression)', () => {
  it('a `d2:` label no longer swallows the track written after it', () => {
    // Both statements became `Track('d2')`. `declaredTracks` de-dupes by id, so
    // the Song timeline drew ONE row for two tracks and the second disappeared.
    expect(trackIds(parseStrudel('d2: s("bd*2")\n$: s("hh*4")'))).toEqual(['d2', 'd3'])
  })

  it('keeps all three when a label collides with a later position', () => {
    expect(trackIds(parseStrudel('d3: s("bd")\n$: s("hh")\n$: s("cp")'))).toEqual([
      'd3',
      'd2',
      'd4',
    ])
  })

  it('leaves a document with no collision exactly as it was', () => {
    expect(trackIds(parseStrudel('drums: s("bd")\n$: s("hh")'))).toEqual(['drums', 'd2'])
  })

  it('holds for a muted colliding label too', () => {
    // Identity strips the marker first, so `_d2:` claims `d2` just as `d2:`
    // does — a muted track still owns its lane.
    expect(trackIds(parseStrudel('_d2: s("bd")\n$: s("hh")'))).toEqual(['d2', 'd3'])
  })
})

describe('isMutedLabel — the other half of the `_` prefix (#1488)', () => {
  it('reads the mute marker on both label spellings', () => {
    expect(isMutedLabel('_$')).toBe(true)
    expect(isMutedLabel('_drums')).toBe(true)
  })

  it('is false for an unmuted label', () => {
    expect(isMutedLabel('$')).toBe(false)
    expect(isMutedLabel('drums')).toBe(false)
  })

  it('is false — not unknown — for a statement with NO label', () => {
    // Muting is a prefix ON a label, so a bare `s("bd*4")` has nothing to
    // prefix and cannot be muted. Treating absence as unknown would make every
    // unwrapped document unreadable to the period rule.
    expect(isMutedLabel(undefined)).toBe(false)
  })

  it('agrees with the identity strip: same marker, opposite halves', () => {
    // `trackIdFromLabel` throws the marker away so a muted track keeps its
    // lane; this reads it. The two must never disagree about what a marker is.
    expect(trackIdFromLabel('_drums', 0)).toBe('drums')
    expect(isMutedLabel('_drums')).toBe(true)
    expect(trackIdFromLabel('_$', 2)).toBe('d3')
    expect(isMutedLabel('_$')).toBe(true)
  })
})
