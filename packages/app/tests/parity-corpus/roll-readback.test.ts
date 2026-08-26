/**
 * THE ROLL'S RESIZE, ASKED WHETHER THE DOCUMENT REOPENS AS WHAT IT WROTE (#1331).
 *
 * `roll-isolation.test.ts` already asks three questions of every resize — did an unnamed
 * note change, did the bytes spell, do the bytes parse. This defect passes all three. The
 * model still holds the sibling voice; the loss happens in serialize → parse, and the
 * bytes parse perfectly. They just come back one note short.
 *
 * So the property here is the fourth question, and it is the one the document actually
 * poses: reopened, does it hold the same notes? Measured at the lengths an ordinary drag
 * asks for (`d±1`), 1,099 of 10,960 asks fail it — stretching one member of a comma-stack
 * re-spells the group as `[g3@4 ~ ~]` and the sibling is gone.
 *
 * ⚠ THE DEFAULT WRITER IS UNCHANGED AND THAT IS ASSERTED, not assumed. `readback` is
 * opt-in because it parses and resize runs per pointermove (#1324 measured p99 549ms when
 * this ran on the hot path). The panel turns it on once, at gesture commit. The control
 * arm below pins the default path's lossy count so a change to the cheap rule cannot hide
 * behind the strict one.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePianoRoll } from '../../../editor/src/visualEdit/notation/parse'
import { resizeNote } from '../../../editor/src/visualEdit/notation/place'
import { serializePianoRoll } from '../../../editor/src/visualEdit/notation/serialize'
import type { PianoRollModel } from '../../../editor/src/visualEdit/notation/model'

const dir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(dir, 'mini-corpus.json'), 'utf8'),
)
const minis = corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== '')

/** measured 2026-08-26 over the corpus, resizing every note by one column either way */
const UNITS = 595
const ASKS = 10960
/** what the CHEAP rule ships today: writes whose reopen holds different notes (#1331) */
const LOSSY_UNDER_DEFAULT = 1099
/** of those, the ones the writer cannot express faithfully at all — it declines */
const READBACK_REFUSALS = 1099
/**
 * of those, the ones a DIFFERENT rung rescues — measured at ZERO, and the zero is the
 * finding.
 *
 * ⚠ A PROBE THAT IGNORED THE WRITER'S OTHER CONSTRAINTS PUT THIS AT 54, and that number
 * was an upper bound rather than a prediction: faithful rungs DO exist for 54 of these
 * asks, and every one of them is skipped by `degradesLocality` before readback is ever
 * consulted. So the ladder rescues nothing here and the readback rule is a pure GATE.
 *
 * Recovering them is a real option and deliberately NOT taken: it means preferring a
 * write that re-authors the whole pattern over one that edits the note's own bytes, to
 * save 0.5% of asks from refusing. That trade belongs to the locality arc (#1327), not to
 * this fix, and pinning the zero is what will make it visible if the guard ever moves.
 */
const READBACK_SAVES = 0

/**
 * Does this model survive the round trip? Deliberately a SECOND, independent statement of
 * the rule the writer now applies — if the writer's own helper were reused here the arm
 * could only ever agree with it, and a regression in that helper would go unseen.
 * ⚠ Multiset, not set: a comma-stack holds the same pitch twice at one start (#1321).
 */
const readsBack = (m: PianoRollModel): boolean => {
  const out = serializePianoRoll(m)
  if (out === null) return false
  const back = parsePianoRoll(out)
  if (!back.ok) return false
  if (back.model.steps !== m.steps) return false
  const key = (n: { pitch: string; start: number; duration: number }): string =>
    `${n.pitch}@${n.start}+${n.duration}`
  const meant = m.notes.map(key).sort()
  const got = back.model.notes.map(key).sort()
  return meant.length === got.length && meant.every((s, i) => s === got[i])
}

interface Sweep {
  units: number
  asks: number
  lossyDefault: number
  lossyStrict: number
  refusals: number
  saves: number
  example: string | null
}

function sweep(): Sweep {
  let units = 0
  let asks = 0
  let lossyDefault = 0
  let lossyStrict = 0
  let refusals = 0
  let saves = 0
  let example: string | null = null
  for (const mini of minis) {
    const r = parsePianoRoll(mini)
    if (!r.ok) continue
    const m = r.model
    if (serializePianoRoll(m) !== mini) continue
    if (m.notes.length === 0) continue
    units++
    const baseBytes = serializePianoRoll(m)
    for (const n of m.notes) {
      for (const duration of [n.duration + 1, Math.max(1, n.duration - 1)]) {
        asks++
        const loose = resizeNote(m, n.start, n.pitch, duration)
        const strict = resizeNote(m, n.start, n.pitch, duration, { readback: true })

        // what ships today
        const looseLossy = loose !== m && !readsBack(loose)
        if (looseLossy) {
          lossyDefault++
          if (example === null)
            example = `${mini} — resize ${n.pitch}@${n.start} (d=${n.duration}) to ${duration} wrote ${serializePianoRoll(loose)}`
        }

        // what the strict rule does with the same ask
        if (strict !== m && !readsBack(strict)) lossyStrict++
        if (looseLossy) {
          if (strict === m || serializePianoRoll(strict) === baseBytes) refusals++
          else saves++
        }
      }
    }
  }
  return { units, asks, lossyDefault, lossyStrict, refusals, saves, example }
}

describe('the roll reopens as what it wrote (#1331)', () => {
  const s = sweep()

  it('the sweep actually ran — denominators before verdicts', () => {
    expect(s.units, 'roll units that round-trip and hold a note').toBe(UNITS)
    expect(s.asks, 'resizes posed, one column either way').toBe(ASKS)
  })

  it('⚠ THE INVARIANT: under readback, no resize writes a document that reopens changed', () => {
    expect(
      s.lossyStrict,
      'resizes accepted under readback whose bytes do not reopen intact — must be 0',
    ).toBe(0)
  })

  it('the CONTROL: the cheap rule still ships the defect, so the two rules are distinguishable', () => {
    // Not an endorsement — a control. If this ever reads 0 the strict arm above proves
    // nothing, because both rules would agree everywhere and the invariant would be
    // vacuous. It is the positive half of the pair.
    expect(
      s.lossyDefault,
      `writes whose reopen differs, under the per-frame rule — ${s.example}`,
    ).toBe(LOSSY_UNDER_DEFAULT)
  })

  it('the split between refusing and rescuing is pinned, so a silent shift shows up', () => {
    // Named separately rather than summed: a change that turns saves into refusals is a
    // real regression in the ladder and an aggregate would absorb it.
    expect(s.refusals, 'lossy asks the writer cannot express faithfully — it declines').toBe(
      READBACK_REFUSALS,
    )
    expect(
      s.saves,
      'lossy asks a different rung rescues — 0 today, because every faithful rung degrades locality',
    ).toBe(READBACK_SAVES)
    expect(s.refusals + s.saves).toBe(s.lossyDefault)
  })
})
