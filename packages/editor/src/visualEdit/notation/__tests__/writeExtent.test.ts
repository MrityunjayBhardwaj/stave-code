/**
 * writeExtent.test.ts — the grid writer reports how much of the document it moved
 * (#1058).
 *
 * The corpus gate for the property lives in `@stave/app`
 * (`1058-refined-placement.test.ts`) because it needs the mini corpus and the
 * engine oracle. This is the unit half: the four paths and the two counts, on
 * fixtures small enough to read.
 *
 * WHY THE COUNTS ARE REPORTED RATHER THAN RECONSTRUCTED — the alternative
 * instrument walks `prefix`/`before`/`raw`/`after`/`suffix` back into absolute
 * byte offsets and reads a diff against them. Measured against this report over
 * 15,200 corpus asks, that walk calls 208 whole-part rebuilds "local" and gets
 * nothing wrong in the other direction, because a rebuilt one-element part and a
 * re-emitted element produce a diff of the same shape (#1137).
 */
import { describe, expect, it } from 'vitest'
import { parseStepGrid } from '../parse'
import { serializeStepGrid, serializeStepGridWithExtent } from '../serialize'
import { toggleCell } from '../place'

const model = (mini: string, scale?: number) => {
  const r = scale === undefined ? parseStepGrid(mini) : parseStepGrid(mini, scale)
  if (!r.ok) throw new Error(`${mini} did not open: ${r.gate}`)
  return r.model
}

describe('the grid writer reports what it moved', () => {
  it('an unedited round trip re-emits NOTHING — every region is copied verbatim', () => {
    // the baseline the whole splice path exists for, stated as a number rather
    // than as "the string came back the same"
    const { mini, extent } = serializeStepGridWithExtent(model('bd ~ sn cp'))
    expect(mini).toBe('bd ~ sn cp')
    expect(extent).toEqual({ path: 'splice', regions: 4, regionsReemitted: 0, rebuiltParts: [] })
  })

  it('a hit on a refined column re-emits ONE region of four', () => {
    const m = model('bd ~ sn ~', 2)
    expect(m.steps).toBe(8)
    const { mini, extent } = serializeStepGridWithExtent(toggleCell(m, 0, 1, true))
    // the element under the cursor subdivides; the other three come back as the
    // user's own bytes
    expect(mini).toBe('[bd bd] ~ sn ~')
    expect(extent).toEqual({ path: 'splice', regions: 4, regionsReemitted: 1, rebuiltParts: [] })
  })

  it('one of one is reported as one of ONE — locality is vacuous there', () => {
    // `hh*8` is a single element owning the whole cycle, so any edit re-emits the
    // entire pattern while satisfying "only one region moved". Reporting the
    // denominator is what makes that visible to a caller (#994).
    const m = model('hh*8', 2)
    const { extent } = serializeStepGridWithExtent(toggleCell(m, 0, 1, true))
    expect(extent).toEqual({ path: 'splice', regions: 1, regionsReemitted: 1, rebuiltParts: [] })
  })

  it('a leaf-anchored grid says which path answered, and offers no counts', () => {
    // byte surgery at each note's own span — there are no regions to count, and a
    // zero would read as "moved nothing", so the shape does not allow one
    const m = model('bd [~ [hh ~]] sn ~')
    expect(m.leafSource).toBeDefined()
    expect(serializeStepGridWithExtent(m).extent).toEqual({ path: 'leaf' })
  })

  it('`serializeStepGrid` is the same write, projected', () => {
    // not a tautology by construction alone: it is what stops a future caller
    // from getting an extent that describes a different write than it received
    for (const [mini, scale] of [
      ['bd ~ sn cp', undefined],
      ['bd ~ sn ~', 2],
      ['hh*8', 2],
      ['bd [~ [hh ~]] sn ~', undefined],
      ['bd sd cp hh oh cp, cr hh bd', 2],
    ] as [string, number | undefined][]) {
      const m = model(mini, scale)
      const edited = toggleCell(m, 0, 1, true)
      expect(serializeStepGrid(edited), mini).toBe(serializeStepGridWithExtent(edited).mini)
    }
  })

  it('a comma-part that stops tiling is reported as a REBUILT PART, not a re-emit', () => {
    // the mechanism behind every non-local write in the corpus (#1137). The bytes
    // alone cannot tell this from a local edit; the writer can.
    const m = model('bd sd cp hh oh cp, cr hh bd', 2)
    const lane = m.lanes.findIndex((l) => (l.part ?? 0) === 1)
    expect(lane).toBeGreaterThan(-1)
    const { extent } = serializeStepGridWithExtent(toggleCell(m, lane, 1, true))
    expect(extent.path).toBe('splice')
    if (extent.path !== 'splice') return
    // and it says how big that part was, which is what makes "a one-element part
    // may not be non-local at all" a question a caller can ask (#1137)
    expect(extent.rebuiltParts).toEqual([3])
    expect(extent.regionsReemitted).toBe(0)
  })
})
