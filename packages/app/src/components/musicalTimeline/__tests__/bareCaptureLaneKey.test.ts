/**
 * The engine's BARE-CAPTURE id ↔ the timeline's lane key (#1094).
 *
 * A document that never calls `.p()` plays its last expression, and the engine
 * now captures that pattern under the id an anonymous `$:` would have taken
 * (`BARE_CAPTURE_ID = '$0'` in `StrudelEngine.ts`). That choice is only correct
 * because of what THIS side does with it: a bare statement has no `dollarPos`,
 * so the containment index is empty and the hap falls through to the positional
 * mapping, which must land it on `d1` — the lane the IR produces for a bare
 * statement.
 *
 * The two halves live in different packages and nothing else holds them
 * together. Pinned here so a change to either is a failing test rather than a
 * timeline that silently draws a second, empty row beside the real one.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@stave/editor', () => ({
  structuralWalk: () => [],
  laneKeyOf: (ev: { trackId?: string; s?: string }) => ev?.trackId ?? ev?.s ?? '$default',
}))

import { laneKeyForHap } from '../timelineMarks'

/** Kept in step with `BARE_CAPTURE_ID` in packages/editor/src/engine/StrudelEngine.ts. */
const BARE_CAPTURE_ID = '$0'

const hap = (trackId: string, start?: number) =>
  ({
    begin: 0,
    end: 1,
    trackId,
    ...(start === undefined ? {} : { loc: [{ start, end: start + 2 }] }),
  }) as Parameters<typeof laneKeyForHap>[0]

describe('#1094 — the bare capture lands on the IR lane, not beside it', () => {
  it('with no anchors (a bare document has no `dollarPos`) the capture id maps to d1', () => {
    expect(laneKeyForHap(hap(BARE_CAPTURE_ID), [])).toBe('d1')
    // …and with a `loc`, which a located hap always carries: still d1, because
    // there is no anchor for containment to hit.
    expect(laneKeyForHap(hap(BARE_CAPTURE_ID, 3), [])).toBe('d1')
  })

  it('a labelled document is unaffected — containment still wins over the id', () => {
    // Two `$:` statements at offsets 0 and 30; a hap inside the second belongs to
    // d2 even though its producer id would map to d1.
    const anchors: Array<[string, number]> = [
      ['d1', 0],
      ['d2', 30],
    ]
    expect(laneKeyForHap(hap('$0', 40), anchors)).toBe('d2')
    expect(laneKeyForHap(hap('$0', 10), anchors)).toBe('d1')
  })

  it('the positional mapping is what does the work — a different id would NOT land on d1', () => {
    // The control arm: if the engine ever keyed the bare capture as something
    // else, this is the row the timeline would grow beside the IR lane.
    expect(laneKeyForHap(hap('bare'), [])).toBe('bare')
    expect(laneKeyForHap(hap('$1'), [])).toBe('d2')
  })
})
