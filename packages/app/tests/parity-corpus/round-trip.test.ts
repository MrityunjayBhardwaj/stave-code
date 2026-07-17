/**
 * round-trip.test.ts — opening a view and writing it back must not change the text.
 *
 * THE LAW: for any mini string a view can open, `serialize(parse(mini))` must
 * equal `mini` when nothing was edited. Opening a grid is a READ. A read that
 * rewrites the document is data loss, and it is loss the user never asked for
 * and cannot see coming.
 *
 * THE LAW DOES NOT HOLD TODAY. That is why this file exists and why most of it
 * is a pinned residual rather than a green assertion. Measured over the 1500
 * real-world strings in `mini-corpus.json`:
 *
 *     GRID   opens 781   round-trips 512 (65.6%)   REWRITES 269
 *     ROLL   opens 392   round-trips 230 (58.7%)   REWRITES 160
 *
 * Concretely, today: open `bd hh*2 sd cp` in the grid, nudge one cell, and the
 * user's line becomes `bd ~ hh hh sd ~ cp ~`. Their `*2` is gone. Reading the
 * grid rewrites of the corpus and classifying them by hand rather than trusting
 * the total: 2 are whitespace, 16 swap the user's `-` rests for `~`, and 251
 * are STRUCTURAL — sugar expanded, groups flattened, the grid padded to a
 * uniform resolution. 93% of the rewrites destroy notation.
 *
 * This is not news to the catalogue — `atom*n` is documented as parse-only
 * sugar that "serializes back as the EXPANDED sequence". It was a deliberate
 * choice. What was never recorded is the BLAST RADIUS: a third of everything
 * the grid can open. A design note that reads reasonably as "sugar expands"
 * reads differently as "32% of real content is rewritten on touch".
 *
 * WHAT THIS FILE IS FOR — three jobs, and the middle one is the point:
 *
 *   1. LOCK what already works. The 512 grid / 230 roll strings that round-trip
 *      today are asserted exactly. If a change breaks one, this goes red now,
 *      not in someone's project.
 *   2. PIN the residual, VISIBLY. The failures are snapshotted with what each
 *      mini becomes — so the loss is documented instead of hidden, and it is
 *      reviewable. A number in a summary can be netted away; a list cannot.
 *   3. BE MEANT TO FLIP. This snapshot is a WORKLIST, not a baseline. #903 A2
 *      (span-surgery write) exists to shrink it, and its PR is measured by the
 *      lines LEAVING this file. Entries disappearing is the goal.
 *
 * DRIFT POLICY — read carefully, it differs by direction:
 *   - an entry LEAVING the residual  = A2 working. Expected, good, review it.
 *   - an entry ARRIVING              = a REGRESSION. Something that round-tripped
 *                                      stopped. Do not accept it with `-u`.
 *   - the locked set going red       = stop. That is live data loss.
 * `vitest -u` cannot tell these apart. You can. Read the diff.
 *
 * SCOPE: the UNEDITED open→write path only. An edited grid must of course emit
 * new text; identity is the right bar only when nothing changed. That is also
 * exactly the path a user hits by clicking a cell and clicking away.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Deep source path, not the `@stave/editor` barrel — the barrel pulls
// @strudel/draw -> gifenc (CJS) and crashes the ESM resolver under vite-node
// (same convention as parity.test.ts:38).
import {
  parseStepGrid,
  parsePianoRoll,
} from '../../../editor/src/visualEdit/notation/parse'
import {
  serializeStepGrid,
  serializePianoRoll,
} from '../../../editor/src/visualEdit/notation/serialize'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'mini-corpus.json'), 'utf8'),
)

type Outcome =
  | { kind: 'closed' }
  | { kind: 'identity' }
  | { kind: 'rewritten'; out: string }
  | { kind: 'null' }

/** open → write, with nothing edited in between */
function roundTrip(
  mini: string,
  parse: (m: string) => { ok: boolean; model?: unknown },
  serialize: (model: never) => string | null,
): Outcome {
  const r = parse(mini)
  if (!r.ok) return { kind: 'closed' }
  let out: string | null
  try {
    out = serialize(r.model as never)
  } catch {
    // A serializer THROW on an unedited model is not a residual to pin — it is
    // a crash on the read path. Surfaced separately below.
    return { kind: 'null' }
  }
  if (out === null) return { kind: 'null' }
  return out.trim() === mini.trim() ? { kind: 'identity' } : { kind: 'rewritten', out }
}

const VIEWS = [
  { name: 'grid', parse: parseStepGrid, serialize: serializeStepGrid },
  { name: 'roll', parse: parsePianoRoll, serialize: serializePianoRoll },
] as const

/** the residual, computed once — the same data feeds the lock and the pin */
const outcomes = VIEWS.map((v) => ({
  view: v.name,
  rows: corpus.minis.map(({ mini }) => ({
    mini,
    r: roundTrip(mini, v.parse as never, v.serialize as never),
  })),
}))

describe('round-trip — an unedited open→write must not change the text', () => {
  /**
   * JOB 1 — lock what works: the set of real-world strings a user can safely
   * open TODAY, pinned by name. If one leaves this list, a change made a safe
   * string unsafe, and the diff says exactly which.
   *
   * This is a SNAPSHOT and not a computed check on purpose. The first draft of
   * this test recomputed the round-trip and asserted the result differed from
   * the result — `expect(X).toEqual(X)` with extra steps, on deterministic
   * code. It passed, it looked like a lock, and it could not have failed for
   * any reason. A lock needs a reference OUTSIDE the run it is checking; the
   * snapshot file is that reference.
   */
  it.each(VIEWS.map((v) => v.name))('%s: LOCKED — these round-trip today and must not stop', (name) => {
    const rows = outcomes.find((o) => o.view === name)!.rows
    const safe = rows.filter((x) => x.r.kind === 'identity').map((x) => x.mini)
    expect(safe).toMatchSnapshot(`${name}-round-trips-locked`)
  })

  /**
   * JOB 2 + 3 — pin the loss, visibly, as a worklist meant to shrink.
   * The snapshot records what each mini BECOMES, because "269 fail" is a number
   * that can be argued with and `bd hh*2 sd cp -> bd ~ hh hh sd ~ cp ~` is not.
   */
  it.each(VIEWS.map((v) => v.name))(
    '%s: KNOWN RESIDUAL — these are rewritten today and MUST flip (#903 A2)',
    (name) => {
      const rows = outcomes.find((o) => o.view === name)!.rows
      const residual = rows
        .filter((x): x is typeof x & { r: { kind: 'rewritten'; out: string } } => x.r.kind === 'rewritten')
        .map((x) => `${JSON.stringify(x.mini)}\n  -> ${JSON.stringify(x.r.out)}`)
      expect(residual).toMatchSnapshot(`${name}-rewritten-residual`)
    },
  )

  /**
   * The headline, asserted as a CEILING that A2 lowers. A ceiling rather than
   * an equality so an added fixture cannot trip it — but it cannot silently
   * grow either. When A2 lands, this number comes down and the snapshot shrinks
   * with it; the two must move together, which is what makes either credible.
   */
  it('the rewrite count does not grow', () => {
    const counts = Object.fromEntries(
      outcomes.map((o) => [o.view, o.rows.filter((x) => x.r.kind === 'rewritten').length]),
    )
    // MEASURED 2026-07-17 by running it, over 1500 real strings:
    //   grid 269 of 781 opened (65.6% round-trip) — of these, 251 STRUCTURAL
    //   roll 160 of 392 opened (58.7% round-trip)
    expect(counts.grid).toBeLessThanOrEqual(269)
    expect(counts.roll).toBeLessThanOrEqual(160)
  })

  /**
   * A serializer returning `null`/throwing on an UNEDITED model it just parsed
   * is a different animal from a rewrite: the view opened, and then could not
   * write back what it read. Pinned separately so it is never mistaken for a
   * notation residual A2 will fix.
   */
  it.each(VIEWS.map((v) => v.name))('%s: serializer refuses a model it just parsed', (name) => {
    const rows = outcomes.find((o) => o.view === name)!.rows
    const nulls = rows.filter((x) => x.r.kind === 'null').map((x) => x.mini)
    expect(nulls).toMatchSnapshot(`${name}-serializer-null`)
  })
})
