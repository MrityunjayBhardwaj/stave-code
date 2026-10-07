/**
 * What a mini-notation string PLAYS, asked of Strudel (#1971, part of #1869, epic #1007).
 *
 * `miniPattern` evaluates the string with `@strudel/mini`'s own `mini()`; `hapsInCycle`
 * queries one cycle of the result. The views never re-derive what sounds when — they
 * read it here. With `./tree.ts` this is the only product code that imports
 * `@strudel/mini`; the boundary test (`modellingRatchet/boundary.ts`) fails on any other.
 *
 * Kept apart from `./tree.ts` on purpose: this file loads `@strudel/core` (through
 * `mini.mjs`), and the parser half must stay importable from the engine's graph
 * without it. See the note there.
 *
 * Hap FIELDS are still read where they were read before this file existed.
 */
import { mini as reifyMini } from '@strudel/mini/mini.mjs'

/** one of Strudel's exact time values (fraction.js) */
export type MiniTime = { valueOf(): number; sub?: (n: number) => MiniTime; toFraction?: () => string }

/** a hap as `queryArc` hands it back — the fields the views read, nothing invented */
export interface MiniHap {
  hasOnset?: () => boolean
  whole?: { begin: MiniTime; end: MiniTime }
  value: unknown
  /** where in the evaluated string the hap's leaves were written */
  context?: { locations?: Array<{ start: number; end: number }> }
}

/**
 * The pattern `mini` evaluates to. THROWS what Strudel throws — each caller turns that
 * into its own answer (`not-a-pattern`, "the edit did not read back", null).
 */
export function miniPattern(mini: string): unknown {
  return reifyMini(mini)
}

/**
 * Every hap of `pat` in cycle `cyc` — the half-open window `[cyc, cyc + 1)`, the one
 * window every reader here uses. THROWS when the pattern cannot be queried (or `pat`
 * is not a pattern at all); the caller decides what that means.
 */
export function hapsInCycle(pat: unknown, cyc: number): MiniHap[] {
  return (pat as { queryArc(a: number, b: number): MiniHap[] }).queryArc(cyc, cyc + 1)
}
