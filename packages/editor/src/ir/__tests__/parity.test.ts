// @vitest-environment node
/**
 * parity.test.ts — Tier 4 JS API parity harness.
 *
 * Scope (Phase 19-03 D-03): each modeled Strudel transform (jux/off/late/
 * degrade/chunk/ply) gets an `it()` block that compares two pipelines and
 * asserts event-list equivalence on the dimensions our IR claims to model.
 *
 * Pipeline A (reference): the *real* Strudel evaluator path documented in
 *   RESEARCH §6.1 — `await evalScope(core, mini); miniAllStrings()` once
 *   in `beforeAll`, then per-test `await evaluate(code)` followed by
 *   `pattern.queryArc(c, c+1)` per cycle. This is the same boot sequence
 *   the production engine uses (StrudelEngine.init), so parity mismatches
 *   here would surface in real playback.
 *
 * Pipeline B (ours): parseStrudel → collect, looped per-cycle via the
 *   inline `collectCycles` helper.
 *
 * --- Boot enablement: vitest config + kabelsalat stub ---
 *
 * `@strudel/core` (package root → dist/index.mjs) imports `SalatRepl`
 * from `@kabelsalat/web`. Under vite-node the kabelsalat package
 * resolves to its CJS UMD `dist/index.js`, which has no named ESM
 * exports — the static linker rejects the import before any test setup
 * runs. We work around this in TWO PLACES that must both be present:
 *
 *   1. `vitest.config.ts` aliases `@kabelsalat/web` to a tiny ESM stub
 *      (`test/stubs/kabelsalat-web.mjs`) exporting `class SalatRepl {}`.
 *   2. `vitest.config.ts` inlines `@strudel/*` via `server.deps.inline`
 *      so vite-node transforms Strudel rather than externalising it
 *      through Node's resolver. Aliases applied to externalised package
 *      transitive imports are silently ignored; inlining flips that.
 *
 * We never call into `repl.mjs` during tests, so the stub is sufficient.
 * Production builds use the real kabelsalat package — the alias is
 * scoped to vitest only.
 *
 * Diff: sort both sides by (begin, s, note); dedupe Strudel's clipped
 *   boundary pairs by `(whole.begin, s)`; assert lengths; per pair
 *   assert each requested dimension matches and `loc` is present on the
 *   actual (ours) event (PV24 — every IREvent must carry loc).
 *
 * Known scope limitations (documented in test bodies as they land):
 *   - Inputs use decimal literals (`0.125`), not fraction literals
 *     (`1/8`); same as `.fast()` today.
 *   - `chunk` parity uses single-cycle bodies; multi-cycle bodies need
 *     Strudel's repeatCycles(n) modelling (follow-up).
 *   - `degrade` uses event-count tolerance (seededRand differs from
 *     Strudel's getRandsAtTime; RESEARCH §5).
 */
import { describe, it, expect, beforeAll } from 'vitest'
// Documented Strudel evaluator path (RESEARCH §6.1). The package-root
// import works under vitest because the config inlines `@strudel/*` and
// aliases `@kabelsalat/web` to a stub — see header comment.
import { evalScope, evaluate } from '@strudel/core/evaluate.mjs'
import * as strudelCore from '@strudel/core'
import { mini, miniAllStrings } from '@strudel/mini/mini.mjs'

import {
  parseStrudel,
  collect,
  type IREvent,
  type PatternIR,
  type CollectContext,
} from '../../ir'
// normalizeStrudelHap lives in engine/, imported directly to keep the
// parity test surface lean. PK10 barrel discipline is enforced by tasks
// that introduce *new* exports (e.g., `collectCycles` in Task 19-03-08).
import { normalizeStrudelHap } from '../../engine/NormalizedHap'

// --------------------------------------------------------------------------
// One-time Strudel scope boot. evalScope+miniAllStrings registers core
// combinators on Pattern.prototype and wires the mini-notation transpiler
// into the global scope so `evaluate('s("bd hh")')` parses the string.
// --------------------------------------------------------------------------
beforeAll(async () => {
  await evalScope(Promise.resolve(strudelCore), Promise.resolve({ mini }))
  miniAllStrings()
})

// --------------------------------------------------------------------------
// Pipeline A — Strudel reference events from a code string.
// `evaluate(code)` returns `{ pattern, mode, meta }`. We query the
// pattern per cycle and normalise haps into IREvents.
//
// `whole.begin` (preserved by normalizeStrudelHap as `event.begin`) is
// the un-clipped onset — events crossing a cycle boundary are returned
// twice by Strudel (once on each side, both clipped); both copies share
// the same `whole.begin`. We dedupe by `(begin, s)` to recover the
// whole-event view that our IR uses.
// --------------------------------------------------------------------------
type StrudelPattern = {
  queryArc: (begin: number, end: number) => unknown[]
}

async function strudelEventsFromCode(
  code: string,
  cyclesToQuery = 1,
  startCycle = 0,
): Promise<IREvent[]> {
  const evaluated = await evaluate(code)
  const pattern = evaluated.pattern as StrudelPattern
  const haps: unknown[] = []
  for (let c = startCycle; c < startCycle + cyclesToQuery; c++) {
    haps.push(...pattern.queryArc(c, c + 1))
  }
  return haps.map((h) => normalizeStrudelHap(h))
}

/**
 * Reduce Strudel's hap stream to one event per unique
 *   (whole.begin, s, note, pan)
 * Boundary-crossing events that Strudel returns as two clipped pieces
 * share the same `whole.begin`, `s`, `note`, and `pan` — collapse to one.
 *
 * `pan` is part of the key because transforms like `jux(f)` produce
 * legitimately distinct events at the same `(begin, s)` on different
 * pan channels (left/right). Dedupe must NOT collapse those — they are
 * real, simultaneous events on parallel tracks. Including pan in the
 * key keeps boundary collapse working without losing channel-distinct
 * events.
 */
function dedupeByWholeBegin(events: IREvent[]): IREvent[] {
  const seen = new Set<string>()
  const out: IREvent[] = []
  for (const e of events) {
    const pan = e.params?.pan ?? ''
    const key = `${e.begin.toFixed(9)}|${e.s ?? ''}|${e.note ?? ''}|${pan}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/**
 * Filter Strudel events to those whose un-clipped onset (`whole.begin`)
 * falls inside the queried cycle window. Strudel's transforms can leak
 * neighbouring cycles' events into a queried window (e.g. `late(t)`
 * pulls the previous cycle's tail forward into the current cycle).
 * Our IR collects per-cycle and wraps within the cycle window — to
 * compare like-for-like, drop the leaked neighbours.
 */
function withOnsetInWindow(
  events: IREvent[],
  begin: number,
  end: number,
): IREvent[] {
  return events.filter((e) => e.begin >= begin && e.begin < end)
}

// --------------------------------------------------------------------------
// Pan normalisation — Strudel uses [0,1] centered at 0.5; we use [-1,1]
// centered at 0 (PatternIR.ts:23). Apply to expected (Strudel) side only.
// --------------------------------------------------------------------------
export function normalizeStrudelPan(e: IREvent): IREvent {
  if (e.params && typeof e.params.pan === 'number') {
    const p = e.params.pan as number
    return { ...e, params: { ...e.params, pan: p * 2 - 1 } }
  }
  return e
}

// --------------------------------------------------------------------------
// Multi-cycle collect — loops per-cycle calls and concatenates events.
// Lives inline in the test for Wave 1; promoted to ir/collect.ts in
// Task 19-03-08 when Chunk semantics need it for production callers.
// --------------------------------------------------------------------------
export function collectCycles(
  ir: PatternIR,
  startCycle: number,
  endCycle: number,
): IREvent[] {
  const events: IREvent[] = []
  for (let c = startCycle; c < endCycle; c++) {
    const ctx: Partial<CollectContext> = {
      cycle: c,
      time: c,
      begin: c,
      end: c + 1,
      duration: 1,
    }
    events.push(...collect(ir, ctx))
  }
  return events
}

// --------------------------------------------------------------------------
// Diff helper — sort both sides; assert lengths; per pair assert each
// dimension and loc presence on ours.
// --------------------------------------------------------------------------
export type DiffDim = 'note' | 'begin' | 'end' | 's' | 'gain' | 'pan'

function sortKey(e: IREvent): string {
  return `${e.begin.toFixed(6)}|${e.s ?? ''}|${e.note ?? ''}`
}

function readDim(e: IREvent, dim: DiffDim): unknown {
  if (dim === 'pan') return e.params?.pan
  return (e as unknown as Record<string, unknown>)[dim]
}

export function diffEvents(
  expected: IREvent[],
  actual: IREvent[],
  dims: DiffDim[],
): void {
  const exp = [...expected].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const act = [...actual].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  expect(act.length).toBe(exp.length)
  for (let i = 0; i < exp.length; i++) {
    for (const dim of dims) {
      const e = readDim(exp[i], dim)
      const a = readDim(act[i], dim)
      // Numeric tolerance for time/pan/gain — Strudel uses Fraction; we use
      // Number. Equivalence within 1e-9 is the standard PatternIR tolerance.
      if (typeof e === 'number' && typeof a === 'number') {
        expect(Math.abs(a - e)).toBeLessThan(1e-9)
      } else {
        expect(a).toEqual(e)
      }
    }
    // PV24 — every IREvent must carry loc on our side.
    expect(act[i].loc).toBeDefined()
  }
}

// --------------------------------------------------------------------------
// Boot smoke — verifies evalScope+miniAllStrings ran cleanly and the
// mini-notation transpiler is wired into the global scope.
// --------------------------------------------------------------------------
describe('parity harness', () => {
  it('boots: evalScope+miniAllStrings registered combinators and mini transpiler', async () => {
    const r = await evaluate('s("bd")')
    const haps = (r.pattern as StrudelPattern).queryArc(0, 1)
    expect(haps.length).toBe(1)
  })

  it('empty pattern yields 0 events on the ours pipeline', () => {
    const ours = collectCycles(parseStrudel(''), 0, 1)
    expect(ours.length).toBe(0)
  })

  // ------------------------------------------------------------------
  // Phase 19-03 Task 03 — `.late(t)` parity.
  //
  // Parses the user-typed Strudel string into our IR (Late tag), then
  // collects events. Asks Strudel's real evaluator for the same code
  // string and queries the resulting pattern. Diff asserts EVENT COUNT,
  // SET-OF-(s,note), and PER-EVENT `begin`.
  //
  // Strudel's `queryArc(0, 1)` returns clipped haps for events that
  // cross the cycle boundary (an event at [0.875, 1.125) becomes two
  // clipped pieces [0.875, 1) and [0, 0.125)). `whole.begin` (preserved
  // as IREvent.begin via normalizeStrudelHap) is the stable un-clipped
  // onset; we dedupe by `(begin, s)` to recover the whole-event view
  // our IR uses, then compare per-event begins directly.
  // ------------------------------------------------------------------
  it('late parity: s("bd hh sd cp").late(0.125) — count, (s,note) set, and per-event begin match Strudel', async () => {
    const code = 's("bd hh sd cp").late(0.125)'
    // Strudel's queryArc(0,1) for `late(t)` returns:
    //   - 4 in-window haps with whole.begin in [0.125, 0.875]
    //   - the boundary-crossing cp split into two clipped pieces (same
    //     whole.begin=0.875)
    //   - the *previous* cycle's cp leaking forward (whole.begin=-0.125)
    // We dedupe by `whole.begin` to collapse the boundary pair, then
    // restrict to onsets in [0, 1) so the leaked previous-cycle hap
    // doesn't inflate the count. The result is the same whole-event
    // view our IR produces.
    const rawExpected = (await strudelEventsFromCode(code, 1)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 1)
    const ours = collectCycles(parseStrudel(code), 0, 1)
    // Count + (s,note) set.
    const expectedSounds = new Set(expected.map((e) => e.s))
    const oursSounds = new Set(ours.map((e) => e.s))
    expect(oursSounds).toEqual(expectedSounds)
    expect(ours.length).toBe(oursSounds.size)
    expect(ours.length).toBe(expected.length)
    // Per-event `begin` — the load-bearing assertion that the relaxed
    // Wave 1 harness could not check. Strudel reports `whole.begin` for
    // each hap; our IR's `Late` wraps within the cycle window. They
    // should agree on the unique-by-`s` onset.
    const byS = (es: IREvent[]) => new Map(es.map((e) => [e.s as string, e]))
    const expBy = byS(expected)
    const ourBy = byS(ours)
    for (const [s, oe] of ourBy) {
      const ee = expBy.get(s)
      expect(ee).toBeDefined()
      expect(Math.abs(oe!.begin - ee!.begin)).toBeLessThan(1e-9)
    }
    // PV24 — every IREvent on our side must carry loc.
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  // ------------------------------------------------------------------
  // Phase 19-03 Task 04 — `.off(t, f)` parity.
  //
  // Ground truth: pattern.mjs:2236-2238 — off literally desugars to
  //   stack(pat, func(pat.late(time_pat)))
  // Our `case 'off':` in parseStrudel mirrors this 1:1 as
  //   Stack(body, transform(Late(t, body)))
  // — transform is applied to `body.late(t)`, so Late is INSIDE the
  // transform, not outside. Order matters when the transform re-times.
  //
  // Input: s("bd hh sd cp").off(0.125, x => x.gain(0.5))
  //   body events @ {0, 0.25, 0.5, 0.75}: bd, hh, sd, cp
  //   late(0.125)(body) shifts each by +0.125, wrapping cp@0.875 → 0.0.
  //   gain(0.5) applied to that adds {gain: 0.5} to each event's params.
  //   Stack of body + offset gives 8 unique-by-(begin,s) events per cycle.
  //
  // Choice of `gain(0.5)` (not `fast(2)` as the orchestrator brief
  // suggested): Strudel's `fast(N)` plays the body N times per cycle
  // (event-count-multiplying), but our IR's `Fast` only compresses time
  // without re-playing the body — a documented limitation predating this
  // wave. A `fast(2)` transform on the offset side produces 8 Strudel
  // events but only 4 ours. To keep the parity assertion strict and
  // load-bearing for the off-desugar (rather than a Fast-semantics
  // discrepancy), we use a non-multiplying transform. Fast-multiplication
  // parity is its own follow-up.
  //
  // We dedupe Strudel's clipped boundary pairs by (begin, s, note) and
  // restrict to in-window onsets. Diff is on count, (begin, s) tuples,
  // and gain dimension on the offset side.
  // ------------------------------------------------------------------
  it('off parity: s("bd hh sd cp").off(0.125, x => x.gain(0.5)) — count and per-event (begin, s) match Strudel', async () => {
    const code = 's("bd hh sd cp").off(0.125, x => x.gain(0.5))'
    const rawExpected = (await strudelEventsFromCode(code, 1)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 1)
    const ours = collectCycles(parseStrudel(code), 0, 1)
    // 4 body + 4 offset = 8.
    expect(ours.length).toBe(expected.length)
    expect(ours.length).toBe(8)
    // (begin, s) tuples must match as sets — same onset set, same sample
    // assignments. This is the load-bearing diff for the off desugar.
    const tuple = (e: IREvent): string =>
      `${e.begin.toFixed(9)}|${e.s ?? ''}`
    const expSet = new Set(expected.map(tuple))
    const oursSet = new Set(ours.map(tuple))
    expect(oursSet).toEqual(expSet)
    // PV24 — every IREvent on our side must carry loc (presence, not
    // value precision — parseTransform doesn't thread baseOffset, so
    // events from the transform sub-tree carry the body's loc, which
    // is acceptable per pre-mortem item 10).
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  // ------------------------------------------------------------------
  // Phase 19-03 Task 05 — `.jux(f)` parity.
  //
  // Ground truth: pattern.mjs:2379-2381 (jux) + 2356-2368 (juxBy).
  //   jux(f)(pat) = pat._juxBy(1, f, pat)
  //   juxBy halves `by` → 0.5; emits two pans on a stack:
  //     left  pan = (default 0.5) - 0.5 = 0.0   (full left,  Strudel [0,1])
  //     right pan = (default 0.5) + 0.5 = 1.0   (full right, Strudel [0,1])
  //   right channel is `func` applied to the panned body.
  //
  // Our IR uses [-1, 1] pan convention (PatternIR.ts:23). Strudel pan 0.0
  // maps to our -1; Strudel pan 1.0 maps to our +1. The harness applies
  // normalizeStrudelPan (p*2-1) to the Strudel side before diff.
  //
  // Input: s("bd hh sd cp").jux(x => x.gain(0.5))
  //   Strudel emits 8 haps: 4 panned 0.0 (gain default ~1) + 4 panned
  //   1.0 with gain=0.5. After normalisation: pans ∈ {-1, +1}.
  //   Our desugar produces Stack(FX(pan,-1, body), FX(pan,+1, gain(0.5)(body))) — also 8.
  //
  // Diff: count + (begin, s) set + per-event pan dimension matches.
  // ------------------------------------------------------------------
  it('jux parity: s("bd hh sd cp").jux(x => x.gain(0.5)) — count, (begin,s), and pan match Strudel', async () => {
    const code = 's("bd hh sd cp").jux(x => x.gain(0.5))'
    const rawExpected = (await strudelEventsFromCode(code, 1)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 1)
    const ours = collectCycles(parseStrudel(code), 0, 1)
    // 4 left-panned + 4 right-panned = 8 events (count multiset, since
    // the same (begin, s) pair appears at both pans we cannot collapse
    // by (begin, s) alone — diff on (begin, s, pan)).
    expect(ours.length).toBe(8)
    expect(expected.length).toBe(8)
    // Per-event tuples include pan so left/right channels are distinct.
    const tupleWithPan = (e: IREvent): string => {
      const pan = e.params?.pan
      return `${e.begin.toFixed(9)}|${e.s ?? ''}|${pan}`
    }
    const expSet = new Set(expected.map(tupleWithPan))
    const oursSet = new Set(ours.map(tupleWithPan))
    expect(oursSet).toEqual(expSet)
    // Every ours event has pan ∈ {-1, +1} after the desugar.
    const oursPans = new Set(ours.map((e) => e.params?.pan))
    expect(oursPans).toEqual(new Set([-1, 1]))
    // PV24 — loc presence on every event.
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  // ------------------------------------------------------------------
  // Phase 19-03 Task 07 — `.degrade()` / `.degradeBy(amount)` parity.
  //
  // Ground truth: signal.mjs:686-720 — degradeBy(x) is
  //   pat._degradeByWith(rand, x)
  //   = pat.fmap(a => _ => a).appLeft(rand.filterValues(v => v > x))
  // i.e. keep an event when rand at that event's time exceeds x. `rand`
  // is signal((t, ctrl) => getRandsAtTime(t, 1, ctrl.randSeed)) at
  // signal.mjs:449. With default randSeed=0, the legacy generator at
  // signal.mjs:237-264 is fully deterministic.
  //
  // Our Degrade.p = retention probability = 1 - Strudel's drop amount.
  // collect.ts:seededRand mirrors __timeToRands(t,1) for seed=0 verbatim,
  // so for matching event onsets the drop decisions match Strudel
  // event-for-event — we can assert exact-set equality (NOT count
  // tolerance, the orchestrator brief's fallback). The harness probes:
  //
  //   - .degrade()         → retention 50%, n=8 over 4 cycles → 32 trials
  //   - .degradeBy(0.3)    → retention 70% (p=0.7)
  //   - .degradeBy(0.8)    → retention 20% (p=0.2) — the asymmetric
  //                          probe per plan-check warning #4 (catches
  //                          p↔(1-p) inversion that 0.3↔0.7 doesn't).
  //
  // Plus boundary tests: degradeBy(0) keeps all; degradeBy(1) drops all.
  // ------------------------------------------------------------------
  it('degrade parity: s("bd hh sd cp ride lt mt ht").degrade() — exact retention set matches Strudel', async () => {
    const code = 's("bd hh sd cp ride lt mt ht").degrade()'
    const rawExpected = (await strudelEventsFromCode(code, 4)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 4)
    const ours = collectCycles(parseStrudel(code), 0, 4)
    // seededRand mirrors Strudel's __timeToRands for seed=0 → exact
    // event-set match (count and per-event begin).
    expect(ours.length).toBe(expected.length)
    const tuple = (e: IREvent): string => `${e.begin.toFixed(9)}|${e.s ?? ''}`
    const expSet = new Set(expected.map(tuple))
    const oursSet = new Set(ours.map(tuple))
    expect(oursSet).toEqual(expSet)
    // PV24 — loc presence on every retained event.
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  it('degradeBy(0.3) parity: retention ~70% — exact set match', async () => {
    const code = 's("bd hh sd cp ride lt mt ht").degradeBy(0.3)'
    const rawExpected = (await strudelEventsFromCode(code, 4)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 4)
    const ours = collectCycles(parseStrudel(code), 0, 4)
    expect(ours.length).toBe(expected.length)
    const tuple = (e: IREvent): string => `${e.begin.toFixed(9)}|${e.s ?? ''}`
    expect(new Set(ours.map(tuple))).toEqual(new Set(expected.map(tuple)))
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  it('degradeBy(0.8) parity: retention ~20% — asymmetric probe catches p↔(1-p) inversion', async () => {
    const code = 's("bd hh sd cp ride lt mt ht").degradeBy(0.8)'
    const rawExpected = (await strudelEventsFromCode(code, 4)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 4)
    const ours = collectCycles(parseStrudel(code), 0, 4)
    expect(ours.length).toBe(expected.length)
    const tuple = (e: IREvent): string => `${e.begin.toFixed(9)}|${e.s ?? ''}`
    expect(new Set(ours.map(tuple))).toEqual(new Set(expected.map(tuple)))
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  // Strudel's `degradeBy` uses STRICT > comparison (signal.mjs:686-706).
  // degradeBy(0) keeps when rand > 0 — drops events whose rand samples
  // to exactly 0 (the legacy RNG returns 0 at t=0). So `degradeBy(0)`
  // on a 4-event pattern across [0,1) returns 3 events (the t=0 onset
  // is dropped) — verified against Strudel.
  it('degradeBy(0) matches Strudel exactly (boundary — strict > comparison)', async () => {
    const code = 's("bd hh sd cp").degradeBy(0)'
    const expected = withOnsetInWindow(
      dedupeByWholeBegin((await strudelEventsFromCode(code, 1)).map(normalizeStrudelPan)),
      0, 1,
    )
    const ours = collectCycles(parseStrudel(code), 0, 1)
    expect(ours.length).toBe(expected.length)
  })

  it('degradeBy(1) drops every event (boundary — rand > 1 never)', () => {
    const ours = collectCycles(parseStrudel('s("bd hh sd cp").degradeBy(1)'), 0, 1)
    expect(ours.length).toBe(0)
  })

  it('parseStrudel routes .degrade() and .degradeBy(amount) to Degrade tag', () => {
    const a = parseStrudel('s("bd").degrade()')
    expect(a.tag).toBe('Degrade')
    if (a.tag === 'Degrade') expect(a.p).toBe(0.5)
    const b = parseStrudel('s("bd").degradeBy(0.3)')
    expect(b.tag).toBe('Degrade')
    if (b.tag === 'Degrade') expect(b.p).toBeCloseTo(0.7, 9)
  })

  // ------------------------------------------------------------------
  // Phase 19-03 Task 09 — `.chunk(n, f)` parity.
  //
  // Ground truth: pattern.mjs:2569-2578 (chunk) + 2490-2497 (_iter) +
  // 2530-2545 (repeatCycles).
  //   chunk(n, func, pat) = _chunk(n, func, pat, false, false)
  //   _chunk: binary = [true, false × (n-1)]
  //           binary_pat = _iter(n, sequence(binary), true)
  //           pat = pat.repeatCycles(n)
  //           return pat.when(binary_pat, func)
  //
  // CRITICAL: `repeatCycles(n)` does NOT slow the body — it repeats
  // the same source cycle on every outer cycle (verified directly:
  // `s("bd hh sd cp").chunk(4, x=>x.gain(0.5))` over 4 cycles produces
  // 16 raw haps (4 per cycle), with exactly 4 carrying gain=0.5 — one
  // per cycle, rotating through the slot positions). The rotated binary
  // picks slot k%n on cycle k; `func` is applied to events whose
  // time-within-cycle falls in [slot/n, (slot+1)/n).
  //
  // Our Chunk.collect plays the FULL body on every cycle and swaps
  // body events for transformed events when they're in the active slot.
  //
  // Input: s("bd hh sd cp").chunk(4, x => x.gain(0.5)) over 4 cycles
  //   ⇒ 16 events. On cycle k, the event in slot k carries gain=0.5;
  //   the other three carry the body's default gain (1).
  //
  // Choice of `gain(0.5)` (not `fast(2)`): same Fast-IR limitation as
  // off (W2) — Fast in our IR compresses time without re-playing the
  // body, so a `fast(2)` transform on a chunk slot wouldn't multiply
  // events the way Strudel's does. gain(0.5) exercises the slot-
  // replacement path with a non-multiplying parameter change.
  //
  // Diff: count, (begin, s, gain) tuples — gain in the key so we
  // catch the slot-rotation semantic, not just event positions. PV24.
  // ------------------------------------------------------------------
  it('chunk parity: s("bd hh sd cp").chunk(4, x => x.gain(0.5)) — full body each cycle, transform on rotating slot, matches Strudel', async () => {
    const code = 's("bd hh sd cp").chunk(4, x => x.gain(0.5))'
    const rawExpected = (await strudelEventsFromCode(code, 4)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 4)
    const ours = collectCycles(parseStrudel(code), 0, 4)
    // 4 events per cycle × 4 cycles = 16.
    expect(ours.length).toBe(16)
    expect(ours.length).toBe(expected.length)
    // (begin, s, gain) tuples — gain in the key so the slot rotation is
    // load-bearing on the diff. Strudel marks un-transformed body
    // events with `gain=undefined` (no gain key set); our IR uses the
    // body's default gain=1. To compare like-for-like, treat both as
    // "default" — the load-bearing assertion is which events GOT the
    // transform applied.
    const norm = (g: unknown): unknown => (g === undefined ? 1 : g)
    const tuple = (e: IREvent): string =>
      `${e.begin.toFixed(9)}|${e.s ?? ''}|${norm(e.gain)}`
    expect(new Set(ours.map(tuple))).toEqual(new Set(expected.map(tuple)))
    // Slot rotation check: exactly 4 of our 16 events have gain=0.5
    // (one per cycle), and they follow the slot rotation bd,hh,sd,cp.
    const transformed = ours.filter((e) => e.gain === 0.5)
    expect(transformed.length).toBe(4)
    const transformedSorted = [...transformed].sort((a, b) => a.begin - b.begin)
    expect(transformedSorted.map((e) => e.s)).toEqual(['bd', 'hh', 'sd', 'cp'])
    // PV24 — loc presence on every event.
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  it('parseStrudel routes .chunk(n, f) to Chunk tag', () => {
    const ir = parseStrudel('s("bd hh sd cp").chunk(4, x => x.gain(0.5))')
    expect(ir.tag).toBe('Chunk')
    if (ir.tag === 'Chunk') {
      expect(ir.n).toBe(4)
      expect(ir.transform.tag).toBe('FX')
    }
  })

  // ------------------------------------------------------------------
  // Phase 19-03 Task 10 — `.ply(n)` parity.
  //
  // Ground truth: pattern.mjs:1905-1911 — ply repeats each event of the
  // body `factor` times within the event's own time slot:
  //   ply(factor, pat) = pat.fmap(x => pure(x)._fast(factor)).squeezeJoin()
  //
  // The plan called for desugaring to `Fast(n, Seq(body × n))`. A probe
  // (W4 T10) showed our Fast scales `ctx.speed` rather than re-playing
  // the body, so for `s("bd hh sd cp").ply(3)` the desugar compresses
  // 12 events into [0, 1/3) at spacing 1/36 instead of [0, 1) at 1/12.
  // No structural rewrite over current primitives reproduces ply's per-
  // event multiplication while preserving cycle length, so we promoted
  // Ply to a forced new IR tag (D-02 rule). collect.ts:Ply walks the
  // body, then for each emitted event substitutes n compressed copies
  // covering the original [begin, end) window.
  //
  // Input: s("bd hh sd cp").ply(3), query [0, 1).
  //   Body emits 4 events at spacing 0.25 with duration 0.25.
  //   Ply(3) replaces each with 3 copies at spacing 0.25/3, totalling 12.
  //
  // Diff: count + (begin, s) tuple set + loc presence (PV24).
  // Pan/gain dimensions aren't load-bearing here — ply doesn't touch
  // them — and verifying the (begin, s) set already pins down both the
  // event-multiplication count and the per-event time positions.
  // ------------------------------------------------------------------
  it('ply parity: s("bd hh sd cp").ply(3) — count, (begin,s) set match Strudel', async () => {
    const code = 's("bd hh sd cp").ply(3)'
    const rawExpected = (await strudelEventsFromCode(code, 1)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 1)
    const ours = collectCycles(parseStrudel(code), 0, 1)
    // 4 body events × 3 = 12 per cycle.
    expect(ours.length).toBe(12)
    expect(ours.length).toBe(expected.length)
    // (begin, s) tuple set — pins down both the multiplication count and
    // per-event timing. Strudel reports `whole.begin` per copy via
    // normalizeStrudelHap, which already uses fractional begins; our IR
    // also produces fractional begins, so direct set-equality holds.
    const tuple = (e: IREvent): string =>
      `${e.begin.toFixed(9)}|${e.s ?? ''}`
    expect(new Set(ours.map(tuple))).toEqual(new Set(expected.map(tuple)))
    // PV24 — loc presence on every event (each copy carries the body
    // event's loc; ply doesn't introduce new source ranges).
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  it('parseStrudel routes .ply(3) to Ply tag', () => {
    const ir = parseStrudel('s("bd hh sd cp").ply(3)')
    expect(ir.tag).toBe('Ply')
    if (ir.tag === 'Ply') {
      expect(ir.n).toBe(3)
      // Body is the parsed `s("bd hh sd cp")` — a Seq of 4 Plays.
      expect(ir.body.tag).toBe('Seq')
    }
  })

  it('parseStrudel falls through silently on non-integer .ply (drops the method)', () => {
    // `.ply(2.5)` and `.ply("<2 3 4>")` aren't supported by our v1 desugar
    // — the case branch returns `ir` unchanged, so the body parses as if
    // the .ply method weren't present. This matches how parseStrudel
    // handles any unrecognised method-arg shape today (default branch).
    const a = parseStrudel('s("bd hh sd cp").ply(2.5)')
    // Falls through ⇒ tree is the body — no Ply wrapper.
    expect(a.tag).not.toBe('Ply')
    const b = parseStrudel('s("bd hh sd cp").ply("<2 3 4>")')
    expect(b.tag).not.toBe('Ply')
    // .ply(1) is a no-op identity — no Ply wrapper either.
    const c = parseStrudel('s("bd hh sd cp").ply(1)')
    expect(c.tag).not.toBe('Ply')
  })
})
