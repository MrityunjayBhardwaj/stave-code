/**
 * The engine's BARE-CAPTURE id ↔ the timeline's lane key (#1094).
 *
 * A document that never calls `.p()` plays its last expression, and the engine
 * captures that pattern under the id an anonymous `$:` would have taken. The
 * rule is decided by `bareCaptureIdFor` in
 * `packages/editor/src/visualEdit/mixer/stripModel.ts` — the mixer owns it,
 * because the mixer is what ASSIGNS these ids while numbering its strips.
 *
 * ⚠ THE RULE IS "THE LAST TRACK", `$<n-1>` — NOT `'$0'`. Since #1096 a bare
 * document declares a Track per top-level statement, so a two-statement
 * document has strips `$0` and `$1` and the pattern strudel plays belongs to
 * `$1`. `'$0'` is that same rule at n = 1, which is the case this file pins;
 * it is not the rule itself.
 *
 * That choice is only correct because of what THIS side does with it: a bare
 * statement has no `dollarPos`, so the containment index is empty and the hap
 * falls through to the positional mapping, which lands `$<n-1>` on `d<n>` —
 * the lane the IR produces for the nth bare statement.
 *
 * The two halves live in different packages and nothing else holds them
 * together. Pinned here so a change to either is a failing test rather than a
 * timeline that silently draws a second, empty row beside the real one.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@stave/editor', () => ({
  structuralWalk: () => [],
  wholeWalkWindow: (nCycles: number) => ({ originCycle: 0, spanCycles: nCycles }),
  laneKeyOf: (ev: { trackId?: string; s?: string }) => ev?.trackId ?? ev?.s ?? '$default',
}))

import { laneKeyForHap } from '../timelineMarks'

/**
 * The id a SINGLE-statement bare document resolves to — `bareCaptureIdFor`'s
 * `$<n-1>` at n = 1. Kept in step with
 * `packages/editor/src/visualEdit/mixer/stripModel.ts`.
 *
 * ⚠ DELIBERATELY A LITERAL, not an import. Importing the real constant means
 * importing `@stave/editor` in an app test, and the barrel drags gifenc (CJS)
 * in — which is why this file already `vi.mock`s it below. The literal is the
 * price of that mock, so the citation above is the only thing keeping the two
 * sides in step. Re-point it if the rule moves house again.
 */
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

  it('the positional mapping is what does the work — the id is read, not assumed', () => {
    // The control arm. A NON-positional id has no lane to map to and falls
    // through as itself: if the engine ever keyed the bare capture like this,
    // that is the row the timeline would grow beside the IR lane.
    expect(laneKeyForHap(hap('bare'), [])).toBe('bare')
  })

  it('a multi-statement bare document maps its LAST slot to the LAST lane', () => {
    // ⚠ THIS USED TO BE PART OF THE CONTROL ARM ABOVE, framed as the failure
    // mode — "a different id would NOT land on d1". Since #1096 it is the
    // intended behaviour, not the hazard: a two-statement bare document
    // declares d1 and d2, resolves to `$1`, and `$1` must reach d2 or the
    // meter lands on the neighbour. Left in the negative framing it would tell
    // the next reader that a `$1` sighting is a bug, which is now backwards.
    expect(laneKeyForHap(hap('$1'), [])).toBe('d2')
    expect(laneKeyForHap(hap('$2'), [])).toBe('d3')
  })
})
