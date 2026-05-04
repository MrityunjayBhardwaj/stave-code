/**
 * PatternIR — the free monad over musical effects.
 *
 * The universal structural representation of music patterns.
 * PatternIR is the tree — IREvent[] is the derived flattened denotation.
 * Both coexist: PatternIR for structure/editing, IREvent[] for rendering.
 *
 * Design decisions:
 * - Tagged union (not generic <A>) — no return values needed for Phase F interpreters
 * - No Bind node — Seq covers musical sequencing without data dependency
 * - Code node — opaque fallback for fragments the parser can't handle
 * - All nodes are plain objects — serializable, no methods
 */

import type { SourceLocation } from './IREvent'

export interface PlayParams {
  s?: string            // instrument/sample name
  gain?: number         // 0-1
  velocity?: number     // 0-1
  sustain?: number      // seconds
  release?: number      // seconds
  pan?: number          // -1 to 1
  color?: string        // display color
  [key: string]: unknown  // extensible
}

export type PatternIR =
  | { tag: 'Pure' }
  | { tag: 'Seq';    children: PatternIR[] }
  | { tag: 'Stack';  tracks: PatternIR[] }
  | { tag: 'Play';   note: string | number; duration: number; params: PlayParams; loc?: SourceLocation[] }
  | { tag: 'Sleep';  duration: number }
  | { tag: 'Choice'; p: number; then: PatternIR; else_: PatternIR }
  | { tag: 'Every';  n: number; body: PatternIR; default_?: PatternIR }
  | { tag: 'Cycle';  items: PatternIR[] }
  | { tag: 'When';   gate: string; body: PatternIR }
  | { tag: 'FX';     name: string; params: Record<string, number | string>; body: PatternIR }
  | { tag: 'Ramp';   param: string; from: number; to: number; cycles: number; body: PatternIR }
  | { tag: 'Fast';   factor: number; body: PatternIR }
  | { tag: 'Slow';   factor: number; body: PatternIR }
  | { tag: 'Elongate'; factor: number; body: PatternIR }  // Mini-notation `a@N` — weights this slot inside a parent Seq
  | { tag: 'Late';   offset: number; body: PatternIR }  // Tier 4 — shifts events forward by `offset` cycles, preserving cycle length
  | { tag: 'Degrade'; p: number; body: PatternIR }  // Tier 4 — `p` is the per-event RETENTION probability; .degrade() ⇒ p=0.5; .degradeBy(x) ⇒ p=1-x
  | { tag: 'Chunk';  n: number; transform: PatternIR; body: PatternIR }  // Tier 4 — per-cycle slot rotation; `transform` is the body with the user transform pre-applied
  | { tag: 'Ply';    n: number; body: PatternIR }  // Tier 4 — repeats each event of body n times within its own slot (pattern.mjs:1905-1911)
  | { tag: 'Pick';   selector: PatternIR; lookup: PatternIR[] }  // Tier 4 — for each event of selector, pick lookup[clamp(round(value), 0, len-1)] and play at the selector event's slot (pick.mjs:44-54). First list-of-sub-IRs shape.
  | { tag: 'Struct'; mask: string; body: PatternIR }  // Tier 4 — re-times body's value-stream to mask onsets (pattern.mjs:1161, this.keepif.out). Distinct from When/mask which only gates.
  | { tag: 'Loop';   body: PatternIR }
  | { tag: 'Code';   code: string; lang: 'strudel' }  // Opaque fallback for unparseable fragments

/** Smart constructors — reduce boilerplate when building trees by hand. */
export const IR = {
  pure: (): PatternIR => ({ tag: 'Pure' }),
  play: (
    note: string | number,
    duration = 0.25,
    params: Partial<PlayParams> = {},
    loc?: SourceLocation[],
  ): PatternIR => {
    const node: PatternIR = {
      tag: 'Play',
      note,
      duration,
      params: { gain: 1, velocity: 1, ...params },
    }
    if (loc && loc.length > 0) (node as { loc?: SourceLocation[] }).loc = loc
    return node
  },
  sleep: (duration: number): PatternIR => ({ tag: 'Sleep', duration }),
  seq: (...children: PatternIR[]): PatternIR => ({ tag: 'Seq', children }),
  stack: (...tracks: PatternIR[]): PatternIR => ({ tag: 'Stack', tracks }),
  choice: (p: number, then: PatternIR, else_: PatternIR = { tag: 'Pure' }): PatternIR =>
    ({ tag: 'Choice', p, then, else_ }),
  every: (n: number, body: PatternIR, default_?: PatternIR): PatternIR =>
    ({ tag: 'Every', n, body, default_ }),
  cycle: (...items: PatternIR[]): PatternIR => ({ tag: 'Cycle', items }),
  when: (gate: string, body: PatternIR): PatternIR => ({ tag: 'When', gate, body }),
  fx: (name: string, params: Record<string, number | string>, body: PatternIR): PatternIR =>
    ({ tag: 'FX', name, params, body }),
  ramp: (param: string, from: number, to: number, cycles: number, body: PatternIR): PatternIR =>
    ({ tag: 'Ramp', param, from, to, cycles, body }),
  fast: (factor: number, body: PatternIR): PatternIR => ({ tag: 'Fast', factor, body }),
  slow: (factor: number, body: PatternIR): PatternIR => ({ tag: 'Slow', factor, body }),
  elongate: (factor: number, body: PatternIR): PatternIR => ({ tag: 'Elongate', factor, body }),
  late: (offset: number, body: PatternIR): PatternIR => ({ tag: 'Late', offset, body }),
  degrade: (p: number, body: PatternIR): PatternIR => ({ tag: 'Degrade', p, body }),
  chunk: (n: number, transform: PatternIR, body: PatternIR): PatternIR =>
    ({ tag: 'Chunk', n, transform, body }),
  ply: (n: number, body: PatternIR): PatternIR => ({ tag: 'Ply', n, body }),
  pick: (selector: PatternIR, lookup: PatternIR[]): PatternIR => ({ tag: 'Pick', selector, lookup }),
  struct: (mask: string, body: PatternIR): PatternIR => ({ tag: 'Struct', mask, body }),
  loop: (body: PatternIR): PatternIR => ({ tag: 'Loop', body }),
  code: (code: string): PatternIR => ({ tag: 'Code', code, lang: 'strudel' }),
} as const
