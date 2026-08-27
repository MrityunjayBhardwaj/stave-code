/**
 * The `songExtent` census over the real saved corpus — the pin that says what
 * fraction of real documents a "whole arrangement" bounce can actually serve
 * (#1359).
 *
 * WHY A CENSUS AND NOT ONLY UNIT TESTS. The unit tests next door pin the walk's
 * SEMANTICS against synthetic IR. They cannot say whether those semantics reach
 * anything real, and the number that decides the feature's shape is exactly
 * that: measured here, 2 documents in 150 yield a trustworthy arrangement
 * extent. A change that quietly widened `arranged` — dropping the opaque taint,
 * say — would keep every unit test green while handing three documents a
 * confident length a bounce would truncate to. This arm is what notices.
 *
 * ⚠ THE CORPUS IS SAVED LIVE-CODING SKETCHES, NOT STAVE SONGS. It skews hard to
 * loops because arrangements of the kind the full-song work is about mostly do
 * not exist out there yet. So `loop: 145` is a fact about what people write
 * TODAY, not a ceiling on the feature — read it as "the loop case cannot be the
 * unsupported half", never as "arrangements do not matter".
 */
import { describe, it, expect } from 'vitest'
import { hasCorpusArchive, loadCorpus } from './songPeriodSweep'
import { parseStrudel } from '../../../editor/src/ir/parseStrudel'
import { songExtent } from '../../../editor/src/ir/songExtent'

describe('songExtent over the real corpus', () => {
  it.skipIf(!hasCorpusArchive())('pins the arranged / loop / opaque split', async () => {
    const docs = await loadCorpus()
    const tally: Record<string, number> = { arranged: 0, loop: 0, opaque: 0 }
    const arranged: string[] = []
    for (const d of docs) {
      let ir = null
      try {
        ir = parseStrudel(d.code)
      } catch {
        continue
      }
      const e = songExtent(ir)
      tally[e.kind] += 1
      if (e.kind === 'arranged') arranged.push(`${d.name}=${e.cycles}`)
    }

    // 150 documents, all of which parse.
    expect(tally.arranged + tally.loop + tally.opaque).toBe(docs.length)
    expect(tally).toEqual({ arranged: 2, loop: 145, opaque: 3 })

    // The two measurable arrangements, named — so a change that moves a CYCLE
    // COUNT is caught as loudly as one that moves a verdict.
    expect(arranged.sort()).toEqual(['0/-HyFCSbuSlq5=274', '0/-P5TIfAEmiGv=32'])

    // ⚠ One of the two (274) runs PAST the 256-cycle horizon cap that
    // `SongAnalysis.displaySpan` stops at — which is precisely why a bounce
    // cannot read the display span. Asserted off the measured value, not off a
    // literal, so it still means something if the corpus moves.
    const longest = Math.max(...arranged.map((a) => Number(a.split('=')[1])))
    expect(longest).toBeGreaterThan(256)
  })
})
