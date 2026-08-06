/**
 * bareCapture — the bare document's captureId, pinned against the rule that
 * actually assigns captureIds (#1097).
 *
 * The point of these tests is NOT that `resolveBareCaptureId` returns `'$0'`.
 * Asserting that against a literal would pass just as happily if the mixer
 * renumbered its strips tomorrow, and the failure would then show up as a dead
 * meter nobody could trace. So the agreement is asserted against
 * `buildStripModels` itself — the function the mixer joins on — and a literal is
 * used only where it is the fact under test (the id's own value).
 */
import { describe, it, expect } from 'vitest'

import { resolveBareCaptureId } from '../bareCapture'
import { detectAllChunks } from '../../visualEdit/chunkDetect'
// BARE_CAPTURE_ID is imported from the mixer, not from `bareCapture`, because
// that is where the id is ASSIGNED (#1174). Importing it from the engine side
// would be reading the answer from the party that only asks the question.
import { buildStripModels, BARE_CAPTURE_ID } from '../../visualEdit/mixer/stripModel'

/** the captureIds the mixer will draw for this document, in source order */
const stripCaptureIds = (code: string): string[] =>
  buildStripModels(detectAllChunks(code)).map((s) => s.captureId)

describe('resolveBareCaptureId — accepts only the unambiguous single bare track', () => {
  it('a lone bare statement resolves, and to the id the mixer gives that strip', () => {
    const code = 's("bd*4")'
    const id = resolveBareCaptureId(code)
    expect(id).not.toBeNull()
    // THE JOIN, stated against the real numbering rather than a literal.
    expect(stripCaptureIds(code)).toEqual([id])
  })

  it('a config head before the track does not consume a slot', () => {
    // `setcps` is not a track, so the bare statement is still the only one and
    // still numbers `$0` — the off-by-one the strip model warns about.
    const code = 'setcps(0.5)\ns("bd*4")'
    const id = resolveBareCaptureId(code)
    expect(id).not.toBeNull()
    expect(stripCaptureIds(code)).toEqual([id])
  })

  it('TWO bare statements are refused — strudel plays the last, the mixer numbers from the first', () => {
    const code = 's("bd*4")\ns("hh*8")'
    expect(resolveBareCaptureId(code)).toBeNull()
    // The refusal is not fussiness: these are two different strips, and the one
    // pattern that exists belongs to the SECOND. That binding is #1096.
    expect(stripCaptureIds(code)).toHaveLength(2)
    expect(stripCaptureIds(code)[0]).not.toBe(stripCaptureIds(code)[1])
  })

  it('a labelled track is refused — the .p() path owns it', () => {
    expect(resolveBareCaptureId('$: s("bd*4")')).toBeNull()
    expect(resolveBareCaptureId('d1: s("bd*4")')).toBeNull()
  })

  it('a MUTED lone track is refused, so the entry cannot contradict the mute', () => {
    const code = '_$: s("bd*4")'
    expect(resolveBareCaptureId(code)).toBeNull()
    // The mixer keys a muted anonymous track `_$<index>`, which is deliberately
    // never a live scheduler key — writing `$0` here would light a strip the
    // user silenced, and would not even be the strip's own id.
    expect(stripCaptureIds(code)).not.toContain(BARE_CAPTURE_ID)
  })

  it('an empty or track-less document resolves to nothing', () => {
    expect(resolveBareCaptureId('')).toBeNull()
    expect(resolveBareCaptureId('setcps(0.5)')).toBeNull()
  })

  it('the id is the first anonymous slot — the value the hap→lane join maps to d1', () => {
    expect(BARE_CAPTURE_ID).toBe('$0')
  })
})
