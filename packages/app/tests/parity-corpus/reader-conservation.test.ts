/**
 * reader-conservation.test.ts — the readers DROP NOTHING (#1036).
 *
 * WHY THIS IS A SEPARATE KIND OF GATE. Every other assertion about a reader checks
 * a VALUE: this pattern yields these atoms at these instants with these lengths.
 * No assertion of that shape can see a reader that keeps one of two real notes,
 * because the value it keeps is real — plausible on every input, on every axis, in
 * every existing test. That is not hypothetical: `readGridOnsets` resolved a
 * same-token `,`-stack to ONE of its two source leaves for the whole life of the
 * file, through three sessions specifically spent hunting for dropped axes, and no
 * test noticed. The axis-diff instruments could not find it either — they compare
 * the grid's reader against the roll's, and the field was present in both.
 *
 * What found it was COUNTING: 19375 occurrences played, 19331 kept. Conservation
 * is the property, so conservation is what gets pinned.
 *
 * THE STATEMENT, per surface: for any unit the reader ACCEPTS, the number of
 * records it returns equals the number of haps the engine played that a reader is
 * obliged to consider — one with an onset and a `whole`. A reader may REFUSE a
 * unit (that is a gate verdict, measured elsewhere); what it may not do is accept
 * a unit and silently return fewer notes than were played.
 *
 * THE ROLL IS THE CONTROL ARM, not a second subject. `readRollOnsets` pushes every
 * qualifying hap unconditionally — it has no dedupe guard and cannot drop one — so
 * its arm must read EXACTLY zero violations. If it ever reads non-zero, the fault
 * is in this file's hap counting rather than in the reader, and the grid arm's
 * zero would be worthless. A detector that cannot be shown to fire is not evidence
 * of absence, and a detector that fires on its own control is not evidence either.
 *
 * PROVEN TO FIRE (2026-07-26). Restoring the old dedupe guard and re-running turns
 * the grid arm red at **31 violating unit×cycle pairs, 19331 kept against 19375
 * played** — the 44 dropped notes — while the roll control stays at 0. Both halves
 * matter: a detector that cannot fire is not evidence of absence, and one that also
 * fires on its conserving sibling is measuring its own arithmetic.
 *
 * POPULATION AND WINDOW ARE PART OF THE CLAIM, and are stated in the assertions
 * rather than in prose: the committed `mini-corpus.json` (1500 distinct minis
 * harvested from 360 real tunes), cycles 0-3. The totals are pinned to literals so
 * that a corpus refresh or a window change announces itself instead of quietly
 * re-scoping the guarantee — a figure produced at this boundary has three times
 * shipped carrying an unstated restriction, and a gate that only asserts ">= 0
 * violations" would be the fourth.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mini as reifyMini } from '@strudel/mini/mini.mjs'
import { readGridOnsets, rollOnsets, type Onset } from '../../../editor/src/visualEdit/notation/parse'

const corpusDir = path.dirname(fileURLToPath(import.meta.url))
const corpus: { minis: { mini: string }[] } = JSON.parse(
  fs.readFileSync(path.join(corpusDir, 'mini-corpus.json'), 'utf8'),
)
const minis = corpus.minis.map((o) => o.mini.trim()).filter((m) => m !== '')

/** the window the claim is scoped to — part of the assertion, not a detail */
const CYCLES = [0, 1, 2, 3]

/**
 * The engine's own count of what it played: haps a reader is obliged to consider.
 * Both readers skip exactly `!hasOnset() || !whole` and nothing else, so this is
 * their shared denominator — taken from the engine, never re-derived from a reader.
 */
function playedCount(pat: unknown, cyc: number): number | null {
  let haps: Array<{ hasOnset?: () => boolean; whole?: unknown }>
  try {
    haps = (pat as { queryArc(a: number, b: number): typeof haps }).queryArc(cyc, cyc + 1)
  } catch {
    return null
  }
  return haps.filter((h) => (h.hasOnset?.() ?? false) && h.whole != null).length
}

interface Arm {
  /** records the reader returned for an accepted unit, or null if it refused */
  kept: (pat: unknown, cyc: number) => number | null
}

const GRID: Arm = {
  kept: (pat, cyc) => {
    const r = readGridOnsets(pat, cyc)
    if (!r.ok) return null
    return (r.onsets as Onset[]).reduce((n, o) => n + o.occ.length, 0)
  },
}

const ROLL: Arm = {
  kept: (pat, cyc) => {
    const r = rollOnsets(pat, cyc)
    return r === null ? null : r.length
  },
}

type Result = { accepted: number; kept: number; played: number; violations: string[] }

/** memoized — three tests ask the same two questions and the corpus is 1500 units */
const cache = new Map<Arm, Result>()
const sweep = (arm: Arm): Result => {
  const hit = cache.get(arm)
  if (hit) return hit
  const r = sweepUncached(arm)
  cache.set(arm, r)
  return r
}

function sweepUncached(arm: Arm): Result {
  let accepted = 0
  let kept = 0
  let played = 0
  const violations: string[] = []
  for (const mini of minis) {
    let pat: unknown
    try {
      pat = reifyMini(mini)
    } catch {
      continue
    }
    for (const cyc of CYCLES) {
      const k = arm.kept(pat, cyc)
      if (k === null) continue // the reader REFUSED — a gate verdict, measured elsewhere
      const p = playedCount(pat, cyc)
      if (p === null) continue
      accepted++
      kept += k
      played += p
      if (k !== p) {
        violations.push(`${JSON.stringify(mini)} @cyc${cyc}: played ${p}, kept ${k}`)
      }
    }
  }
  return { accepted, kept, played, violations }
}

describe('#1036 — an accepted unit keeps every note the engine played', () => {
  it('CONTROL: the roll conserves, which is what calibrates the grid arm', () => {
    // `readRollOnsets` pushes every qualifying hap with no guard, so a non-zero
    // reading here indicts this file's counting, not the reader.
    const r = sweep(ROLL)
    console.log(
      `\n  ROLL (control): accepted ${r.accepted} unit×cycle pairs, ` +
        `played ${r.played}, kept ${r.kept}, violations ${r.violations.length}`,
    )
    if (r.violations.length) console.log(r.violations.slice(0, 10).join('\n'))
    expect(r.violations).toEqual([])
    expect(r.kept).toBe(r.played)
  })

  it('the grid reader drops nothing across the committed corpus', () => {
    const r = sweep(GRID)
    console.log(
      `\n  GRID: accepted ${r.accepted} unit×cycle pairs, ` +
        `played ${r.played}, kept ${r.kept}, violations ${r.violations.length}`,
    )
    if (r.violations.length) console.log(r.violations.slice(0, 20).join('\n'))
    // Enumerated, not counted: a violation must name the unit that regressed.
    expect(r.violations).toEqual([])
    expect(r.kept).toBe(r.played)
  })

  it('pins the population and the window, so a re-scope cannot pass silently', () => {
    // These are the numbers the two arms above are a statement ABOUT. Without them
    // the gate still passes on a corpus of one mini over zero cycles.
    expect(minis.length).toBe(1500)
    expect(CYCLES).toEqual([0, 1, 2, 3])
    const grid = sweep(GRID)
    const roll = sweep(ROLL)
    expect(grid.accepted).toBe(GRID_ACCEPTED)
    expect(grid.kept).toBe(GRID_KEPT)
    expect(roll.accepted).toBe(ROLL_ACCEPTED)
    expect(roll.kept).toBe(ROLL_KEPT)
  })
})

/**
 * Observed 2026-07-26 on the committed corpus over cycles 0-3.
 *
 * `GRID_KEPT` is the figure the #1034 fix moved: the old reader kept 19331 of the
 * 19375 notes it accepted, and the 44 it dropped were 32 anchors, 8 lengths and 12
 * true duplicates. Pinned here so that number can never drift unremarked again.
 */
const GRID_ACCEPTED = 4662
const GRID_KEPT = 19375
const ROLL_ACCEPTED = 2873
const ROLL_KEPT = 15872
