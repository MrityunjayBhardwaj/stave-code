/**
 * #1580 — an arrangement's length folded with the period of every parameter
 * playing over it.
 *
 * `arrange(...)` is a definite end of the STRUCTURE. A parameter whose period
 * does not divide that length keeps moving after the last bar, so the song first
 * comes back round at the fold of the two: four bars under a three-step gain
 * repeat at twelve, and a bounce of four hands back `.2 .5 .9 .2` and loops it,
 * which is not the song.
 *
 * ⚠ THE CONTROLS ARE THE POINT. A fold that returns something bigger is easy to
 * write and easy to be wrong about, so every arm here sits beside one where the
 * answer must NOT move: a period that divides the arrangement, a document with no
 * automation at all, and a muted track whose automation must not stretch a bounce
 * of what is audible.
 *
 * Real documents through the real parser, because the thing being folded
 * (`songPeriodOf`, `signalDimensionsOf`) reads placements the IR builders would
 * have to fake.
 */
import { describe, it, expect } from 'vitest'
import { parseStrudel } from '../parseStrudel'
import { arrangedRepeatCycles, songPeriodOf } from '../songAnalysis'
import { steppedAutomations } from '../steppedAutomation'
import { songExtent } from '../songExtent'

/** The arrangement both halves of every arm share: two arms of two bars. */
const ARRANGEMENT = 'arrange([2,s("bd*2")],[2,s("hh*4")])'

/** What the app does: read the extent, then fold. Returns both, so an arm can
 *  show the structure's own answer beside the song's. */
function measure(code: string): { extent: number | null; repeat: number | null } {
  const ir = parseStrudel(code)
  const ex = songExtent(ir)
  if (ex.kind !== 'arranged') return { extent: null, repeat: null }
  return { extent: ex.cycles, repeat: arrangedRepeatCycles(ir, ex.cycles) }
}

describe('arrangedRepeatCycles (#1580)', () => {
  it('folds a stepped period that does NOT divide the arrangement', () => {
    expect(measure(`${ARRANGEMENT}.gain("<.2 .5 .9>")`)).toEqual({ extent: 4, repeat: 12 })
  })

  it('leaves a period that DIVIDES the arrangement alone', () => {
    // The control that separates "folds" from "multiplies": 2 into 4 is 4.
    expect(measure(`${ARRANGEMENT}.gain("<.2 .5>")`)).toEqual({ extent: 4, repeat: 4 })
    expect(measure(`${ARRANGEMENT}.gain("<.2 .5 .9 .7>")`)).toEqual({ extent: 4, repeat: 4 })
  })

  it('leaves an arrangement with no automation alone', () => {
    expect(measure(ARRANGEMENT)).toEqual({ extent: 4, repeat: 4 })
  })

  it('does not let a MUTED track stretch the song', () => {
    // `signalDimensionsOf` walks audible tracks; `steppedAutomations` walks
    // playable parameters and never looks at `muted`. Left unfiltered, a silenced
    // track's gain would hand a bounce a length nothing can be heard playing.
    const muted = `$: ${ARRANGEMENT}\n_$: s("cp").gain("<.2 .5 .9>")`
    const audible = `$: ${ARRANGEMENT}\n$: s("cp").gain("<.2 .5 .9>")`
    expect(measure(muted).repeat, 'a muted track stretched the song').toBe(4)
    // The positive control: the SAME track unmuted does extend it, so the arm
    // above is reading the mute and not a parse failure.
    expect(measure(audible).repeat).toBe(12)
  })

  it('keeps the arrangement when the fold passes its cap', () => {
    // Nothing is offered that the analysis would not stand behind: past the cap
    // the answer stays the structure's own, which is what this branch gave before.
    const ir = parseStrudel(`${ARRANGEMENT}.gain("<.2 .5 .9>")`)
    expect(arrangedRepeatCycles(ir, 4, 5)).toBe(4)
    expect(arrangedRepeatCycles(ir, 4, 12)).toBe(12)
  })

  it('answers the arrangement itself for a degenerate length', () => {
    const ir = parseStrudel(`${ARRANGEMENT}.gain("<.2 .5 .9>")`)
    expect(arrangedRepeatCycles(ir, 0)).toBe(0)
    expect(arrangedRepeatCycles(null, 4)).toBe(4)
  })

  it('reads the same period the pipeline already reads', () => {
    // Not a second measurement: the number folded is `songPeriodOf`'s.
    const ir = parseStrudel(`${ARRANGEMENT}.gain("<.2 .5 .9>")`)
    const [a] = steppedAutomations(ir)
    expect(songPeriodOf(a)).toBe(3)
  })
})
