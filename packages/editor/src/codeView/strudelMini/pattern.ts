/**
 * What a mini-notation string PLAYS, asked of Strudel (#1971, part of #1869, epic #1007).
 *
 * `miniPattern` evaluates the string with `@strudel/mini`'s own `mini()`; the pattern it
 * returns answers one question, `hits(cycle)`. The views never re-derive what sounds
 * when — they read it here. With `./tree.ts` this is the only product code that imports
 * `@strudel/mini`; the boundary test (`modellingRatchet/boundary.ts`) fails on any other.
 *
 * Kept apart from `./tree.ts` on purpose: this file loads `@strudel/core` (through
 * `mini.mjs`), and the parser half must stay importable from the engine's graph
 * without it. See the note there.
 *
 * Strudel's own hap never leaves this file (#1973). A caller gets a `MiniHit`: plain
 * data, with every location already in the coordinates of the string it passed in. The
 * two rules a caller no longer knows:
 *   1. which haps are hits — the ones with an onset and a whole span;
 *   2. `mini()` evaluates the string QUOTED, so every location Strudel reports counts
 *      the opening quote. It is taken back off here, once.
 * `./joined.ts` pairs these hits with the nodes of `./shape.ts`.
 */
import { mini as reifyMini } from '@strudel/mini/mini.mjs'
import type { MiniSpan } from './shape'

/** one of Strudel's exact time values (fraction.js) */
export type MiniTime = { valueOf(): number; sub?: (n: number) => MiniTime; toFraction?: () => string }

/** one onset Strudel plays in a cycle */
export interface MiniHit {
  /** when it starts and ends, exactly, in cycles from the start of the pattern */
  begin: MiniTime
  end: MiniTime
  /** what Strudel yields: a token, a number, an array for a `:`-variant */
  value: unknown
  /**
   * Where in the string the hit was written, IN STRUDEL'S ORDER — the written note is
   * not always first (`sd:2` reports the `2` before the `sd`), and Strudel takes spaces
   * but not newlines or tabs off a location. `./joined.ts` settles both; a caller that
   * wants "the note this hit came from" asks there.
   */
  locations: MiniSpan[]
}

/** a mini-notation string, evaluated: something that can be asked what it plays */
export interface MiniPattern {
  /** the string that was evaluated, exactly as given */
  readonly mini: string
  /**
   * Every hit in cycle `cyc` — the half-open window `[cyc, cyc + 1)`, the one window
   * every reader here uses. THROWS when Strudel cannot query the pattern; the caller
   * decides what that means.
   */
  hits(cyc: number): MiniHit[]
}

/** a hap as `queryArc` hands it back — the fields read below, nothing invented */
interface StrudelHap {
  hasOnset?: () => boolean
  whole?: { begin: MiniTime; end: MiniTime }
  value: unknown
  context?: { locations?: Array<{ start?: unknown; end?: unknown }> }
}

function spansOf(hap: StrudelHap): MiniSpan[] {
  const out: MiniSpan[] = []
  for (const l of hap.context?.locations ?? []) {
    if (typeof l?.start === 'number' && typeof l.end === 'number') out.push({ start: l.start - 1, end: l.end - 1 })
  }
  return out
}

/**
 * The pattern `mini` evaluates to. THROWS what Strudel throws — each caller turns that
 * into its own answer (`not-a-pattern`, "the edit did not read back", null).
 */
export function miniPattern(mini: string): MiniPattern {
  const pat = reifyMini(mini) as { queryArc(a: number, b: number): StrudelHap[] }
  return {
    mini,
    hits(cyc) {
      const out: MiniHit[] = []
      for (const h of pat.queryArc(cyc, cyc + 1)) {
        if (!(h.hasOnset?.() ?? false) || !h.whole) continue
        out.push({ begin: h.whole.begin, end: h.whole.end, value: h.value, locations: spansOf(h) })
      }
      return out
    },
  }
}
