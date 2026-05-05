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

// 19-05 (#74): every non-Play tag carries optional source-correspondence
// metadata — `loc?: SourceLocation[]` (the source range the parser saw)
// and `userMethod?: string` (the literal method name the user typed at
// the call site, per D-08 exact-token taxonomy). Both are optional because
// non-parser code paths (test fixtures, IR transforms) construct nodes
// without metadata. CONTEXT D-03, D-07, D-12.
//
// 19-07 (#79) — the 6 root-eligible union members (Pure, Seq, Stack, Play,
// Cycle, Code) carry two optional stage-transition metadata fields:
// `unresolvedChain?: string` and `chainOffset?: number`. These are SET by
// `runMiniExpandedStage` on each track root, READ + DROPPED by
// `runChainAppliedStage`, and IRRELEVANT for engine consumption (collect,
// toStrudel, irProjection ignore them per CONTEXT D-03). The other 16
// union members (Fast, Slow, Every, ...) are constructed only inside
// applyChain and never sit at a track root post-parseRoot, so they do
// NOT carry these fields. Narrow-union additive change preserves PV32
// (implicit-IR principle). RESEARCH §3.1 fallback option.
export type PatternIR =
  | { tag: 'Pure'; loc?: SourceLocation[]; userMethod?: string; unresolvedChain?: string; chainOffset?: number }
  | { tag: 'Seq';    children: PatternIR[]; loc?: SourceLocation[]; userMethod?: string; unresolvedChain?: string; chainOffset?: number }
  | { tag: 'Stack';  tracks: PatternIR[]; loc?: SourceLocation[]; userMethod?: string; unresolvedChain?: string; chainOffset?: number }
  | { tag: 'Play';   note: string | number; duration: number; params: PlayParams; loc?: SourceLocation[]; unresolvedChain?: string; chainOffset?: number }
  | { tag: 'Sleep';  duration: number; loc?: SourceLocation[]; userMethod?: string }
  | { tag: 'Choice'; p: number; then: PatternIR; else_: PatternIR; loc?: SourceLocation[]; userMethod?: string }
  | { tag: 'Every';  n: number; body: PatternIR; default_?: PatternIR; loc?: SourceLocation[]; userMethod?: string }
  | { tag: 'Cycle';  items: PatternIR[]; loc?: SourceLocation[]; userMethod?: string; unresolvedChain?: string; chainOffset?: number }
  | { tag: 'When';   gate: string; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }
  | { tag: 'FX';     name: string; params: Record<string, number | string>; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }
  | { tag: 'Ramp';   param: string; from: number; to: number; cycles: number; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }
  | { tag: 'Fast';   factor: number; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }
  | { tag: 'Slow';   factor: number; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }
  | { tag: 'Elongate'; factor: number; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }  // Mini-notation `a@N` — weights this slot inside a parent Seq
  | { tag: 'Late';   offset: number; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }  // Tier 4 — shifts events forward by `offset` cycles, preserving cycle length
  | { tag: 'Degrade'; p: number; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }  // Tier 4 — `p` is the per-event RETENTION probability; .degrade() ⇒ p=0.5; .degradeBy(x) ⇒ p=1-x
  | { tag: 'Chunk';  n: number; transform: PatternIR; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }  // Tier 4 — per-cycle slot rotation; `transform` is the body with the user transform pre-applied
  | { tag: 'Ply';    n: number; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }  // Tier 4 — repeats each event of body n times within its own slot (pattern.mjs:1905-1911)
  | { tag: 'Pick';   selector: PatternIR; lookup: PatternIR[]; loc?: SourceLocation[]; userMethod?: string }  // Tier 4 — for each event of selector, pick lookup[clamp(round(value), 0, len-1)] and play at the selector event's slot (pick.mjs:44-54). First list-of-sub-IRs shape.
  | { tag: 'Struct'; mask: string; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }  // Tier 4 — re-times body's value-stream to mask onsets (pattern.mjs:1161, this.keepif.out). Distinct from When/mask which only gates.
  | { tag: 'Swing';  n: number; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }  // Tier 4 — narrow tag per D-03; pattern.mjs:2193 swing(n) = pat.swingBy(1/3, n) = pat.inside(n, late(seq(0, 1/6))). Inside primitive deferred.
  | { tag: 'Shuffle';  n: number; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }  // Tier 4 (Phase 19-04 T-05) — signal.mjs:392 shuffle(n) = _rearrangeWith(randrun(n), n, pat); per-cycle permutation of n slices, each played exactly once per cycle.
  | { tag: 'Scramble'; n: number; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }  // Tier 4 (Phase 19-04 T-05) — signal.mjs:405 scramble(n) = _rearrangeWith(_irand(n)._segment(n), n, pat); per-slot independent samples (with replacement) of n slices.
  | { tag: 'Chop';   n: number; body: PatternIR; loc?: SourceLocation[]; userMethod?: string }  // Tier 4 (Phase 19-04 T-08) — pattern.mjs:3291-3306 chop(n) = pat.squeezeBind(o => sequence(slice_objects.map(s => merge(o, s)))). Per-event sample-range slicing — each source event becomes n sub-events with progressive begin/end controls. D-04: pattern-level only; audio-buffer slicing deferred to phase 22 (axis 5).
  | { tag: 'Loop';   body: PatternIR; loc?: SourceLocation[]; userMethod?: string }
  | { tag: 'Code';   code: string; lang: 'strudel'; loc?: SourceLocation[]; userMethod?: string; unresolvedChain?: string; chainOffset?: number }  // Opaque fallback for unparseable fragments

/**
 * Optional metadata accepted by every non-rest-spread smart constructor
 * below. The smart constructor mirrors `IR.play`'s convention — only sets
 * each field when truthy, so test fixtures that build nodes without
 * metadata and assert via `toEqual({ tag: 'Fast', factor: 2, body: ... })`
 * keep working unchanged. CONTEXT D-07.
 *
 * Rest-spread constructors (`seq`, `stack`, `cycle`) CANNOT take a trailing
 * positional `meta?` parameter (TypeScript rejects positional-after-rest);
 * desugar / root sites that need metadata on those tags use literal
 * construction `{ tag: 'Stack', tracks, loc, userMethod }` directly.
 * RESEARCH §2 / §11 Q1.
 */
type TagMeta = { loc?: SourceLocation[]; userMethod?: string }

function attachMeta<T extends object>(node: T, meta?: TagMeta): T {
  if (meta?.loc && meta.loc.length > 0) (node as { loc?: SourceLocation[] }).loc = meta.loc
  if (meta?.userMethod) (node as { userMethod?: string }).userMethod = meta.userMethod
  return node
}

/** Smart constructors — reduce boilerplate when building trees by hand. */
export const IR = {
  pure: (meta?: TagMeta): PatternIR => attachMeta({ tag: 'Pure' }, meta),
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
  sleep: (duration: number, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Sleep', duration }, meta),
  // Rest-spread: cannot accept trailing meta?. Desugar / root sites that need
  // metadata use literal construction `{ tag: 'Seq', children, loc, userMethod }`.
  seq: (...children: PatternIR[]): PatternIR => ({ tag: 'Seq', children }),
  // Rest-spread: cannot accept trailing meta?. Desugar / root sites that need
  // metadata use literal construction `{ tag: 'Stack', tracks, loc, userMethod }`.
  stack: (...tracks: PatternIR[]): PatternIR => ({ tag: 'Stack', tracks }),
  choice: (p: number, then: PatternIR, else_: PatternIR = { tag: 'Pure' }, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Choice', p, then, else_ }, meta),
  every: (n: number, body: PatternIR, default_?: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Every', n, body, default_ }, meta),
  // Rest-spread: cannot accept trailing meta?. Sites needing metadata use
  // literal construction `{ tag: 'Cycle', items, loc, userMethod }`.
  cycle: (...items: PatternIR[]): PatternIR => ({ tag: 'Cycle', items }),
  when: (gate: string, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'When', gate, body }, meta),
  fx: (name: string, params: Record<string, number | string>, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'FX', name, params, body }, meta),
  ramp: (param: string, from: number, to: number, cycles: number, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Ramp', param, from, to, cycles, body }, meta),
  fast: (factor: number, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Fast', factor, body }, meta),
  slow: (factor: number, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Slow', factor, body }, meta),
  elongate: (factor: number, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Elongate', factor, body }, meta),
  late: (offset: number, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Late', offset, body }, meta),
  degrade: (p: number, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Degrade', p, body }, meta),
  chunk: (n: number, transform: PatternIR, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Chunk', n, transform, body }, meta),
  ply: (n: number, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Ply', n, body }, meta),
  pick: (selector: PatternIR, lookup: PatternIR[], meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Pick', selector, lookup }, meta),
  struct: (mask: string, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Struct', mask, body }, meta),
  swing: (n: number, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Swing', n, body }, meta),
  shuffle: (n: number, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Shuffle', n, body }, meta),
  scramble: (n: number, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Scramble', n, body }, meta),
  chop: (n: number, body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Chop', n, body }, meta),
  loop: (body: PatternIR, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Loop', body }, meta),
  code: (code: string, meta?: TagMeta): PatternIR =>
    attachMeta({ tag: 'Code', code, lang: 'strudel' }, meta),
} as const
