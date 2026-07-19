/**
 * krillAdapterHaps.test.ts — the IR must contain the notes Strudel PLAYS.
 *
 * The oracle is `@strudel/mini`'s own evaluator queried for real haps, never a
 * table of expectations someone typed in — the same discipline as
 * `euclidAuthority.test.ts`, and for the same reason: the bugs this file pins
 * existed BECAUSE the hand-rolled grammar encoded a belief about the syntax.
 * A test asserting our own output would have passed against the broken parser
 * forever. Asking Strudel what it actually triggers is the only check that can
 * disagree with us.
 *
 * WHAT WENT WRONG (all fixed by the #943 krill adapter, all silent — nothing
 * ever threw, and each drew a plausible-looking timeline):
 *   - `!n` replicate     — `bd!3` drew `bd` + a phantom note named "3"
 *   - leading decimals   — `.5` drew a note "5"; `.speed(".5")` became speed 5
 *   - `-` silence        — drew a note literally named "-" instead of a rest
 *   - `/n` slow          — `c4/2` drew `c4` + a phantom note "2"
 *   - top-level `,`      — a CHORD was flattened into a SEQUENCE (notes that
 *                          should sound together played one after another)
 *   - `:word` tails      — `C:major` drew `C` + a phantom note "major"
 * Each phantom note is the parser inventing music the audio never played.
 */
import { describe, it, expect } from 'vitest'
import { mini } from '@strudel/mini/mini.mjs'
import { parseMini } from '../parseMini'
import { collectCycles } from '../collect'

/* eslint-disable @typescript-eslint/no-explicit-any */

const CYCLES = 4

/**
 * Strudel coerces a numeric atom to a Number (`.5` → `0.5`); the IR keeps the
 * SOURCE TOKEN so a re-emit is byte-faithful (`.5` must not become `0.5` in the
 * user's file). Same value, different spelling — compare them numerically so
 * the check tests the note, not the notation.
 */
const norm = (v: unknown): string => {
  const s = String(v)
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) ? String(n) : s
}

/** what Strudel actually triggers: `begin@value`, sorted */
function played(pat: string): string[] {
  const haps = (mini(pat) as any).queryArc(0, CYCLES)
  return haps
    .map((h: any) => `${Number(h.part.begin).toFixed(3)}@${norm(h.value)}`)
    .sort()
}

/** what the IR carries, through the same collect pipeline the views consume */
function drawn(pat: string): string[] {
  const events = collectCycles(parseMini(pat), 0, CYCLES)
  return events
    .map((e: any) => `${Number(e.begin).toFixed(3)}@${norm(e.note)}`)
    .sort()
}

describe('the krill-backed IR carries the notes Strudel plays', () => {
  const CASES: [string, string][] = [
    ['bd!3 sd', '`!n` replicate — was bd + a phantom note "3"'],
    ['a!2 b!2', '`!n` on every element'],
    ['.5 .8', 'leading decimals — were "5" and "8" (10x wrong)'],
    ['.33 .6 .166', 'more decimals'],
    ['bd - sd', '`-` is silence, not a note named "-"'],
    ['bd ~ sd', '`~` silence (the case that always worked)'],
    ['c4/2 e4', '`/n` slow — was c4 + a phantom note "2"'],
    ['c4*2 e4', '`*n` fast (the case that always worked)'],
    ['bd(3,8)', 'euclid — the #907 regression guard'],
    ['bd(3,8,2)', 'euclid with rotation'],
    ['c4@2 e4', '`@n` elongation'],
    ['<a b c>', 'plain alternation'],
    ['[a b] c', 'sub-sequence'],
  ]

  it.each(CASES)('%s — %s', (pat) => {
    expect(drawn(pat)).toEqual(played(pat))
  })

  /**
   * A top-level `,` is a STACK: the voices sound TOGETHER. The hand parser
   * ignored commas outside brackets and produced one flat sequence, so a chord
   * played as an arpeggio — the notes were all present, which is why no test
   * caught it; only their ONSETS were wrong. Comparing begins (not just values)
   * is what makes this visible.
   */
  const STACKS: string[] = ['a,b', 'a,b,c', 'bd*2, ~ sd', '0,2,[7 6]']

  it.each(STACKS)('top-level comma is a stack, not a sequence: %s', (pat) => {
    expect(drawn(pat)).toEqual(played(pat))
  })
})

/**
 * NOT COVERED HERE, deliberately: weighted alternation arms (`<a@2 b@2>`).
 * Strudel emits ONE hap spanning the arm's 2 cycles; `collect` emits a separate
 * event per cycle (a retrigger, not a sustain). That is the IR's cycle model,
 * not the grammar — the adapter builds the same Cycle+Elongate the hand parser
 * did, and `weightedSlowcat.test.ts` pins the per-cycle behaviour deliberately.
 * The hap-vs-event granularity gap belongs to the engine consolidation (#945).
 */
