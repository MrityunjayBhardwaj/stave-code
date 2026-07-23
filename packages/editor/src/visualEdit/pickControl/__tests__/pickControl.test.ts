/**
 * pickControl.test — #463 Stage 2 control-string write-back.
 *
 * Detection + the 5 section ops on a `pick*` control `<…@w …>`. Each structural
 * op asserts the resulting SOURCE STRING (the write-back — the op's own output).
 * The per-cycle SECTION TIMING those edits produce is a runtime property of
 * Strudel's eval (the retired collect engine's `pick`/`pickRestart` selection),
 * verified end-to-end by the app's full-song e2e, not re-collected here.
 */
import { describe, it, expect } from 'vitest'
import { detectPickControlAt } from '../parse'
import { setWeight, splitArm, removeArm, reorderArm, duplicateArm } from '../serialize'
import type { OffsetEdit } from '../../writeback'

const SONG = '"<~@2 verse@2 chorus@2>".pickRestart({verse: s("bd"), chorus: s("hh")})'
// The control `<…>` starts at index 1 (after the opening quote).
const CTRL_POS = 5

function apply(doc: string, edits: OffsetEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.range[0] - a.range[0])
  let out = doc
  for (const e of sorted) out = out.slice(0, e.range[0]) + e.text + out.slice(e.range[1])
  return out
}

describe('#463 Stage 2 — detect pick control', () => {
  it('finds the pick* call + its weighted arms with correct ranges', () => {
    const ctl = detectPickControlAt(SONG, CTRL_POS)
    expect(ctl).not.toBeNull()
    expect(ctl!.method).toBe('pickRestart')
    expect(ctl!.arms).toHaveLength(3)
    expect(ctl!.arms.map((a) => a.weight)).toEqual([2, 2, 2])
    // Each arm's head text slices back to its token.
    expect(ctl!.arms.map((a) => SONG.slice(a.headRange[0], a.headRange[1]))).toEqual(['~', 'verse', 'chorus'])
    // The weight digits address the `2`s.
    expect(ctl!.arms.map((a) => (a.weightRange ? SONG.slice(a.weightRange[0], a.weightRange[1]) : null))).toEqual(['2', '2', '2'])
  })

  it('returns null when the cursor is not inside a pick* call', () => {
    expect(detectPickControlAt('s("bd hh")', 3)).toBeNull()
  })
})

describe('#463 Stage 2 — control ops (source write-back)', () => {
  it('TRIM (setWeight) — verse@2 → verse@4 lengthens the section', () => {
    const ctl = detectPickControlAt(SONG, CTRL_POS)!
    const out = apply(SONG, setWeight(SONG, ctl, 1, 4))
    // verse now spans c2-5, chorus c6-7 at runtime.
    expect(out).toContain('<~@2 verse@4 chorus@2>')
  })

  it('SPLIT — verse@2 → verse@1 verse@1 (two clips, same content)', () => {
    const ctl = detectPickControlAt(SONG, CTRL_POS)!
    const out = apply(SONG, splitArm(SONG, ctl, 1, 1))
    // Same audible timing (verse still c2-3), now two arms.
    expect(out).toContain('<~@2 verse@1 verse@1 chorus@2>')
  })

  it('DELETE (removeArm) — drop chorus; the lane loses that section', () => {
    const ctl = detectPickControlAt(SONG, CTRL_POS)!
    const out = apply(SONG, removeArm(SONG, ctl, 2))
    // period now 4: rest c0-1, verse c2-3, repeat — no hh anywhere.
    expect(out).toContain('<~@2 verse@2>')
  })

  it('MOVE (reorderArm) — swap verse and chorus order', () => {
    const ctl = detectPickControlAt(SONG, CTRL_POS)!
    const out = apply(SONG, reorderArm(SONG, ctl, 1, 2))
    expect(out).toContain('<~@2 chorus@2 verse@2>')
  })

  it('DUPLICATE — clone verse right after itself', () => {
    const ctl = detectPickControlAt(SONG, CTRL_POS)!
    const out = apply(SONG, duplicateArm(SONG, ctl, 1))
    // period 8: rest c0-1, verse c2-5 (two arms back-to-back), chorus c6-7.
    expect(out).toContain('<~@2 verse@2 verse@2 chorus@2>')
  })

  it('the section patterns + pickRestart object stay byte-verbatim after an op', () => {
    const ctl = detectPickControlAt(SONG, CTRL_POS)!
    const out = apply(SONG, reorderArm(SONG, ctl, 1, 2))
    expect(out).toContain('.pickRestart({verse: s("bd"), chorus: s("hh")})')
  })
})
