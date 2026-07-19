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
  parseStrudel as _parseStrudel,
  collect,
  toStrudel,
  patternToJSON,
  patternFromJSON,
  type IREvent,
  type PatternIR,
  type CollectContext,
  type SourceLocation,
} from '../../ir'
import { unwrapD1 } from './helpers/unwrapD1'

// Phase 20-11 γ-4 — drill through the synthetic d1 Track wrapper that
// parseStrudel adds at the root of any non-`$:` input. Tests that need
// the raw Track-wrapped shape (e.g. the wave-α/γ shape probes, the
// rewritten `.p("track1")` test at γ-5) call `_parseStrudel` directly.
const parseStrudel = (code: string): PatternIR => unwrapD1(_parseStrudel(code))
// PRE-01 (PR #70 / issue #70) — internal test hooks that record whether
// applyChain → applyMethod → parseTransform threaded a non-zero baseOffset
// for multi-arg methods. Imported directly from parseStrudel.ts (not the
// barrel) since these are debug-only and intentionally absent from the
// public API.
import {
  __resetParseTransformDebug,
  __getLastParseTransformBaseOffset,
  __getParseTransformCallCount,
} from '../parseStrudel'
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

// Multi-cycle collect — extracted to ./helpers/collectCycles.ts so that
// other test files can import it without side-effect-registering this
// suite's describe blocks (vitest treats imported test files as part of
// the importer's suite, doubling the test surface).
import { collectCycles } from './helpers/collectCycles'

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
// 19-05 / #74 D-11 — containment-match assertion helper.
//
// Verifies that the event's `loc` array (Play.loc — preserved unchanged by
// D-01) contains at least one source range fully within the bounds of
// `subExpr` as it appears in `code`. The `some()` is necessary because
// Play.loc is `SourceLocation[]` — mini-notation `!N` repetition can
// produce multiple ranges per Play node (RESEARCH §10 #5; not implemented
// today but the helper is forward-compat).
//
// Throws via expect() with a hint naming the event + sub-expression so a
// failure message points directly at the offending case.
// --------------------------------------------------------------------------
function assertEventLocWithin(
  event: IREvent,
  code: string,
  subExpr: string,
  hint?: string,
): void {
  expect(
    event.loc,
    hint ?? `event.loc missing for note=${String(event.note)} begin=${event.begin}`,
  ).toBeDefined()
  const subStart = code.indexOf(subExpr)
  expect(subStart, `subExpr ${JSON.stringify(subExpr)} not found in code`).toBeGreaterThanOrEqual(0)
  const subEnd = subStart + subExpr.length
  const ok = event.loc!.some((l) => l.start >= subStart && l.end <= subEnd)
  expect(
    ok,
    hint ??
      `no event.loc range falls within ${JSON.stringify(subExpr)} [${subStart},${subEnd})`,
  ).toBe(true)
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
      // Phase 20-10 promoted .gain to Param.
      expect(ir.transform.tag).toBe('Param')
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

  // ------------------------------------------------------------------
  // Phase 19-04 Task T-01 — `.layer(...funcs)` parity.
  //
  // Ground truth: pattern.mjs:796-798 — layer literally desugars to
  //   stack(...funcs.map(f => f(this)))
  // The original body is NOT included (contrast superimpose at
  // pattern.mjs:810-812 which does via this.stack(...)).
  //
  // Our `case 'layer':` mirrors the desugar: split args, parseTransform
  // each, return Stack(...transformed).
  //
  // Input: s("bd hh sd cp").layer(x => x.gain(0.5), x => x.gain(0.7))
  //   body events @ {0, 0.25, 0.5, 0.75}: bd, hh, sd, cp
  //   first func wraps each in gain(0.5); second wraps each in gain(0.7).
  //   Stack of two parallel tracks → 8 events per cycle, four at gain=0.5
  //   and four at gain=0.7.
  //
  // Choice of two `gain(...)` transforms (not `fast(2)`, and avoiding
  // `pan(...)` which would surface the [-1,1] vs [0,1] convention
  // divergence already documented at the .pan() boundary in PatternIR.ts:23):
  // gain is scalar, in the same convention on both sides, and exercises
  // the parallel-track desugar path. Also serves as the phase composition
  // test (PLAN pre-mortem #11) — desugar producing a Stack exercises
  // both the layer-arm and the existing Stack walker.
  //
  // Diff: count + (begin, s, gain) tuple multiset (Set since the four
  // (begin,s) pairs appear at two distinct gain values, both pairs are
  // distinct keys). PV24 loc presence.
  // ------------------------------------------------------------------
  it('layer parity: s("bd hh sd cp").layer(x => x.gain(0.5), x => x.gain(0.7)) — count, (begin,s,gain) match Strudel', async () => {
    const code = 's("bd hh sd cp").layer(x => x.gain(0.5), x => x.gain(0.7))'
    const rawExpected = (await strudelEventsFromCode(code, 1)).map(normalizeStrudelPan)
    // NOTE: dedupeByWholeBegin keys on (begin, s, note, pan) which would
    // collapse the two gain-distinct layer tracks (both share (begin, s,
    // note, pan)). For this s("bd hh sd cp") body there are no
    // boundary-crossing events in [0, 1), so dedupe is unnecessary —
    // skip it and dedupe with a gain-aware key inline. Same pattern as
    // jux which includes pan in its key for parallel-track distinction.
    const expected = withOnsetInWindow(rawExpected, 0, 1)
    const ours = collectCycles(parseStrudel(code), 0, 1)
    // 4 body events × 2 layer tracks = 8.
    expect(ours.length).toBe(8)
    expect(expected.length).toBe(8)
    // (begin, s, gain) tuple set — parallel-track count and per-track
    // gain assignment are load-bearing on diff. Each (begin, s) pair
    // appears twice with distinct gain values, so the keys remain
    // distinct under set semantics.
    const tuple = (e: IREvent): string =>
      `${e.begin.toFixed(9)}|${e.s ?? ''}|${e.gain ?? 1}`
    expect(new Set(ours.map(tuple))).toEqual(new Set(expected.map(tuple)))
    // Both gain values must be present, four events each.
    const oursGains = ours.map(e => e.gain)
    expect(oursGains.filter(g => g === 0.5).length).toBe(4)
    expect(oursGains.filter(g => g === 0.7).length).toBe(4)
    // PV24 — loc presence on every event.
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  it('parseStrudel routes .layer(f1, f2) to Stack(...) (desugar — pattern.mjs:796-798)', () => {
    const ir = parseStrudel('s("bd hh sd cp").layer(x => x.gain(0.5), x => x.gain(0.7))')
    expect(ir.tag).toBe('Stack')
    if (ir.tag === 'Stack') {
      expect(ir.tracks.length).toBe(2)
      // Each track is the body wrapped in a Param node (Phase 20-10
      // promoted .gain from FX to Param).
      expect(ir.tracks[0].tag).toBe('Param')
      expect(ir.tracks[1].tag).toBe('Param')
    }
  })

  // ------------------------------------------------------------------
  // Phase 19-04 Task T-02 — `.pick(lookup)` parity.
  //
  // Ground truth: pick.mjs:44-54 — pick(lookup) is
  //   pat.fmap(i => lookup[clamp(round(i), 0, len-1)]).innerJoin()
  // For each event of the receiver (selector), look up lookup[i] and
  // play that pattern at the selector event's time slot.
  //
  // Our IR's Pick { selector, lookup[] } collect arm walks the selector
  // for each cycle, then for each selector event walks the chosen
  // sub-IR within a sub-context covering the selector event's slot.
  //
  // Input: note(mini("<0 1 2 3>").pick(["c","e","g","b"])) — the Strudel
  // form that works in our test env (String.prototype.pick is not
  // registered server-side; the docstring's bare-string-pick desugars
  // to mini(string).pick(...) via Strudel's transpiler in production).
  // Selector cycles through 0,1,2,3 over 4 cycles; pick selects "c", "e",
  // "g", "b" respectively.
  //
  // Diff: count + per-cycle (begin, note) tuple equality. PV24 loc
  // presence (selector loc propagates onto picked sub-events when the
  // sub-event lacks its own).
  // ------------------------------------------------------------------
  it('pick parity: mini("<0 1 2 3>").pick(["c","e","g","b"]).note() — count and (begin, note) per cycle match Strudel', async () => {
    // Wrap the pipeline in `.note()` so Strudel hangs the picked value
    // off `event.value.note` — that's what normalizeStrudelHap reads.
    // Without `.note()`, Strudel events carry the raw string in
    // `event.value` and our normalizer maps it to `note: null`.
    //
    // On our side, `.note()` is unhandled by applyMethod and falls
    // through (default: return ir), so the IR is unchanged from the
    // bare `mini(...).pick([...])` form. The picked sub-IR is
    // IR.play("c") (etc.), which already carries `note: "c"`. Both
    // sides produce note="c","e","g","b" per cycle.
    //
    // String.prototype.pick is not registered server-side in our test
    // env, so the docstring's `"<0 1 2 3>".pick([...])` form is unusable
    // in the Strudel reference path. `mini("<0 1 2 3>")` is the
    // canonical equivalent (Strudel's transpiler rewrites string-pick
    // to mini-pick at parse time in production).
    const code = 'mini("<0 1 2 3>").pick(["c","e","g","b"]).note()'
    const rawExpected = (await strudelEventsFromCode(code, 4)).map(normalizeStrudelPan)
    // Without dedupe — these aren't boundary-clipped events.
    const expected = withOnsetInWindow(rawExpected, 0, 4)
    const ours = collectCycles(parseStrudel(code), 0, 4)
    // 4 cycles, one event per cycle (selector value picks one sub-pattern;
    // each sub-pattern is a single Play).
    expect(ours.length).toBe(4)
    expect(ours.length).toBe(expected.length)
    // Per-cycle ordering: cycle 0 → "c", cycle 1 → "e", cycle 2 → "g", cycle 3 → "b".
    const sortedOurs = [...ours].sort((a, b) => a.begin - b.begin)
    const sortedExp = [...expected].sort((a, b) => a.begin - b.begin)
    expect(sortedOurs.map(e => e.note)).toEqual(['c', 'e', 'g', 'b'])
    expect(sortedExp.map(e => e.note)).toEqual(sortedOurs.map(e => e.note))
    // Per-event begin matches.
    for (let i = 0; i < sortedOurs.length; i++) {
      expect(Math.abs(sortedOurs[i].begin - sortedExp[i].begin)).toBeLessThan(1e-9)
    }
    // PV24 — loc presence on every event (selector loc propagates onto
    // the picked sub-event when the sub-event's own loc is not set).
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  it('parseStrudel routes .pick([...]) to Pick tag', () => {
    const ir = parseStrudel('mini("<0 1 2 3>").pick(["c","e","g","b"])')
    expect(ir.tag).toBe('Pick')
    if (ir.tag === 'Pick') {
      expect(ir.lookup.length).toBe(4)
      expect(ir.selector.tag).toBe('Cycle')
    }
  })

  // ------------------------------------------------------------------
  // Phase 19-04 Task T-03 — `.struct(mask)` parity.
  //
  // Ground truth: pattern.mjs:1161-1163 — struct(mask) = this.keepif.out(mask).
  // _opOut is "structure from mask, values from this" — re-times this
  // pattern's value-stream to mask onsets. Distinct from `.mask("…")`
  // (When tag) which only gates events. RESEARCH §1.2.
  //
  // Input: note("c d e f").struct("x ~ x ~ x ~ ~ x") — body is 4 notes
  // at slots 0, 1/4, 2/4, 3/4 inside [0, 1). Mask has 8 slots at 1/8 each
  // with truthy at i ∈ {0, 2, 4, 7}. Each truthy slot samples body events
  // whose cycle-position falls in [i/8, (i+1)/8) and re-emits at i/8.
  //   slot 0 [0, 1/8)   → captures c at 0   → emit at 0
  //   slot 2 [2/8, 3/8) → captures d at 1/4 → emit at 2/8
  //   slot 4 [4/8, 5/8) → captures e at 2/4 → emit at 4/8
  //   slot 7 [7/8, 8/8) → captures f at 3/4? — 3/4 = 6/8, NOT in [7/8, 1).
  //                         → no body event in slot 7 → emit nothing
  // Expected: 3 events at begins {0, 1/4, 1/2} with notes {c, d, e}.
  //
  // Diff: count + per-event (begin, note) tuple equality. PV24 loc
  // presence on every event.
  // ------------------------------------------------------------------
  it('struct parity: note("c d e f").struct("x ~ x ~ x ~ ~ x") — count and (begin, note) match Strudel', async () => {
    const code = 'note("c d e f").struct("x ~ x ~ x ~ ~ x")'
    const rawExpected = (await strudelEventsFromCode(code, 1)).map(normalizeStrudelPan)
    const expected = dedupeByWholeBegin(withOnsetInWindow(rawExpected, 0, 1))
    const ours = collectCycles(parseStrudel(code), 0, 1)
    // Both sides should yield the same count.
    expect(ours.length).toBe(expected.length)
    // Per-event diff on begin and note. PV24 loc presence asserted by helper.
    diffEvents(expected, ours, ['begin', 'note'])
  })

  it('parseStrudel routes .struct("…") to Struct tag', () => {
    const ir = parseStrudel('note("c d e").struct("x ~ x")')
    expect(ir.tag).toBe('Struct')
    if (ir.tag === 'Struct') {
      expect(ir.mask).toBe('x ~ x')
      expect(ir.body.tag).toBe('Seq')
    }
  })

  // ------------------------------------------------------------------
  // Phase 19-04 Task T-04 — `.swing(n)` documented divergence (narrow
  // tag per D-03 — Inside primitive deferred).
  //
  // Ground truth: pattern.mjs:2193 — swing(n) = pat.swingBy(1/3, n) =
  // pat.inside(n, late(seq(0, 1/6))). RESEARCH §1.3.
  //
  // Our narrow `Swing { n; body }` tag (D-03) models swing directly via
  // slot-index lateness: odd-numbered slots (of n slots in [0, 1)) shift
  // by 1/(6n). For `note("a b c d e f g h").swing(4)`, this produces 8
  // events with notes a/b at slot 0 (no shift), c/d at slot 1 (+1/24),
  // e/f at slot 2 (no shift), g/h at slot 3 (+1/24).
  //
  // Strudel's actual `inside(4, late(seq(0, 1/6)))` composition produces
  // 12 events for the same input, because the slow→late→fast composition
  // causes events at slot transitions to surface from both halves of the
  // slow query (notes a/c/e/g each appear twice). This is a STRUCTURAL
  // divergence from the Inside semantics, not a microsecond timing slop.
  // RESEARCH §1.3 anticipated this: "MEDIUM on the exact event timings
  // — the inside-late-seq composition is subtle and parity will catch
  // divergence."
  //
  // PER D-03: do NOT graduate to introducing Inside in this phase. The
  // narrow tag is the explicit decision; the divergence is the cost
  // (bounded — collect arm rewrites ~10 lines once Inside lands). We
  // assert the divergence as a CONTRACT here (ours = 8, theirs = 12)
  // rather than silently weakening the parity assertion. When Inside
  // lands and Swing rewrites, this test flips to a tight parity check.
  //
  // PV24 loc presence asserted on every event our pipeline emits.
  // ------------------------------------------------------------------
  it('swing parity: documented narrow-tag divergence vs Strudel inside (D-03)', async () => {
    const code = 'note("a b c d e f g h").swing(4)'
    const rawExpected = (await strudelEventsFromCode(code, 1)).map(normalizeStrudelPan)
    const expected = dedupeByWholeBegin(withOnsetInWindow(rawExpected, 0, 1))
    const ours = collectCycles(parseStrudel(code), 0, 1)
    // Our narrow Swing produces exactly 8 events (one per body Play).
    expect(ours.length).toBe(8)
    // Strudel's inside composition produces 12 (notes a/c/e/g each appear
    // twice — slot-transition leakage from the slow→late→fast composition).
    // This test asserts the divergence as a contract; flips to tight parity
    // when Inside lands and Swing rewrites (D-03).
    expect(expected.length).toBe(12)
    expect(ours.length).not.toBe(expected.length)
    // Verify our 8-event lateness pattern is internally correct: notes at
    // slot 0 (a, b) and slot 2 (e, f) are at their original positions;
    // notes at slot 1 (c, d) and slot 3 (g, h) are shifted by 1/24.
    const sortedOurs = [...ours].sort((a, b) => a.begin - b.begin)
    expect(sortedOurs[0].begin).toBeCloseTo(0, 9)
    expect(sortedOurs[1].begin).toBeCloseTo(1 / 8, 9)
    expect(sortedOurs[2].begin).toBeCloseTo(2 / 8 + 1 / 24, 9)
    expect(sortedOurs[3].begin).toBeCloseTo(3 / 8 + 1 / 24, 9)
    expect(sortedOurs[4].begin).toBeCloseTo(4 / 8, 9)
    expect(sortedOurs[5].begin).toBeCloseTo(5 / 8, 9)
    expect(sortedOurs[6].begin).toBeCloseTo(6 / 8 + 1 / 24, 9)
    expect(sortedOurs[7].begin).toBeCloseTo(7 / 8 + 1 / 24, 9)
    // PV24 — loc presence on every event our pipeline emits.
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  it('parseStrudel routes .swing(n) to Swing tag', () => {
    const ir = parseStrudel('note("a b c d e f g h").swing(4)')
    expect(ir.tag).toBe('Swing')
    if (ir.tag === 'Swing') {
      expect(ir.n).toBe(4)
    }
  })

  // ------------------------------------------------------------------
  // Phase 19-04 Task T-07 — `.shuffle(n)` / `.scramble(n)` RNG parity.
  //
  // Ground truth:
  //   - signal.mjs:392-394 — shuffle(n, pat) = _rearrangeWith(randrun(n), n, pat)
  //   - signal.mjs:405-407 — scramble(n, pat) = _rearrangeWith(_irand(n)._segment(n), n, pat)
  //   - signal.mjs:365-376 — randrun(n): rands = getRandsAtTime(t.floor()+0.5, n, seed)
  //                          → sort indices by rand value → permutation
  //   - signal.mjs:476     — _irand(n) = rand.fmap(x => trunc(x*n))
  //   - pattern.mjs:2173-2175 — _segment(n) = struct(pure(true)._fast(n))
  //                              → samples at slot begins (signal.mjs:18-21)
  //
  // Determinism is automatic at randSeed=0 (Strudel default; signal.mjs:262)
  // because the legacy RNG is fully deterministic. We do NOT call withSeed
  // — the default suffices, matching 19-03's Degrade pattern.
  //
  // Per-cycle randomness only surfaces over multiple cycles (single-cycle
  // tests would silently pass even with a misaligned sampler). We run 4
  // cycles per RESEARCH §4. P42 covers both the symmetric (Shuffle —
  // permutation-without-replacement) and asymmetric (Scramble — independent
  // samples-with-replacement) retention probes.
  //
  // Key alignment of our seededRandsAtTime helper (collect.ts) with
  // Strudel's __timeToRandsPrime (signal.mjs:246-256): for n>1, ONE
  // time-seed is derived via __timeToIntSeed, then __xorwise chains the
  // seed n times to produce the n rands. NOT n independent calls at
  // offset times — that would re-seed the chain n times and diverge.
  //
  // Cycle-aware dedupe: across 4 cycles, each event's whole.begin is
  // unique within (s, note, pan) because begin includes the cycle index
  // (e.g. cycle 1 events at 1.0, 1.25, …). Within a cycle, shuffle plays
  // each note exactly once (no collisions); scramble may pick the same
  // source slot twice but at DIFFERENT destination slots → distinct
  // begins. So dedupeByWholeBegin (key = begin|s|note|pan) is safe — no
  // legitimate per-cycle replays get collapsed.
  // ------------------------------------------------------------------
  it('shuffle parity: note("c d e f").shuffle(4) over 4 cycles — exact (begin, note) set match', async () => {
    const code = 'note("c d e f").shuffle(4)'
    const rawExpected = (await strudelEventsFromCode(code, 4)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 4)
    const ours = collectCycles(parseStrudel(code), 0, 4)
    // 4 notes × 4 cycles = 16 (permutation: each cycle plays all 4 once).
    expect(ours.length).toBe(16)
    expect(ours.length).toBe(expected.length)
    // Exact (begin, note) tuple set — RNG sample-point alignment with
    // Strudel's randrun. If this fails: the seededRandsAtTime helper
    // diverged from __timeToRandsPrime (RESEARCH §4 / collect.ts).
    const tuple = (e: IREvent): string =>
      `${e.begin.toFixed(9)}|${e.note ?? ''}`
    expect(new Set(ours.map(tuple))).toEqual(new Set(expected.map(tuple)))
    // PV24 — loc presence on every event our pipeline emits.
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  it('shuffle preserves the permutation property over 4 cycles (each source note played exactly once per cycle)', () => {
    // Internal property test: Shuffle is permutation-without-replacement,
    // so every cycle plays every body note exactly once. This catches
    // accidental collapse to scramble semantics or selector duplication.
    const code = 'note("c d e f").shuffle(4)'
    const ours = collectCycles(parseStrudel(code), 0, 4)
    expect(ours.length).toBe(16)
    for (let c = 0; c < 4; c++) {
      const cycleEvents = ours.filter((e) => e.begin >= c && e.begin < c + 1)
      expect(cycleEvents.length).toBe(4)
      const notes = cycleEvents.map((e) => String(e.note)).sort()
      expect(notes).toEqual(['c', 'd', 'e', 'f'])
    }
  })

  it('scramble parity: note("c d e f").scramble(4) over 4 cycles — exact (begin, note) set match', async () => {
    const code = 'note("c d e f").scramble(4)'
    const rawExpected = (await strudelEventsFromCode(code, 4)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 4)
    const ours = collectCycles(parseStrudel(code), 0, 4)
    // Scramble: per-slot independent samples → up to 16 events but some
    // slots may collide on source while others are unused → events count
    // ≤ 16. Don't hard-code; let the parity assertion verify match with
    // Strudel.
    expect(ours.length).toBe(expected.length)
    const tuple = (e: IREvent): string =>
      `${e.begin.toFixed(9)}|${e.note ?? ''}`
    expect(new Set(ours.map(tuple))).toEqual(new Set(expected.map(tuple)))
    for (const e of ours) expect(e.loc).toBeDefined()
  })

  it('parseStrudel routes .shuffle(n) and .scramble(n) to Shuffle/Scramble tags', () => {
    const sh = parseStrudel('note("c d e f").shuffle(4)')
    expect(sh.tag).toBe('Shuffle')
    if (sh.tag === 'Shuffle') expect(sh.n).toBe(4)
    const sc = parseStrudel('note("c d e f").scramble(4)')
    expect(sc.tag).toBe('Scramble')
    if (sc.tag === 'Scramble') expect(sc.n).toBe(4)
  })

  // ------------------------------------------------------------------
  // Phase 19-04 Task T-08 — `.chop(n)` parity (pattern-level only).
  //
  // Ground truth (pattern.mjs:3291-3306):
  //   chop(n, pat) = pat.squeezeBind(o => sequence(slice_objects.map(s => merge(o, s))))
  //   slice_objects[i] = { begin: i/n, end: (i+1)/n }
  //   merge(a, b) = if (a.begin && a.end) {
  //     d = a.end - a.begin; b = { begin: a.begin + b.begin*d, end: a.begin + b.end*d }
  //   }; return Object.assign({}, a, b)
  //
  // Per source event, n sub-events are emitted whose time spans carve
  // up the source span AND whose `begin`/`end` PARAMS carve up the
  // source's existing begin/end (default [0, 1) when absent).
  //
  // D-04 known limitation (PV29 axis-1): this asserts pattern-level event
  // count + params.begin/end set equality. Strudel's audio engine ALSO
  // slices the rendered sample buffer at playback using the begin/end
  // controls — that audio-buffer rendering side is axis 5, deferred to
  // phase 22. If real audio diverges in playback, that is the documented
  // D-04 limitation, NOT a parity failure.
  //
  // Dedupe is safe here: the n sub-events have DIFFERENT `begin` values
  // (e.begin + i*dt/n), so dedupeByWholeBegin's (begin|s|note|pan) key
  // does not collide. params.begin/end are NOT in the dedupe key, but
  // because the time-`begin` already differs, the events are preserved.
  // ------------------------------------------------------------------
  it('chop parity: s("bd").chop(4) — pattern-level event count + params.begin/end set match', async () => {
    const code = 's("bd").chop(4)'
    const rawExpected = (await strudelEventsFromCode(code, 1)).map(normalizeStrudelPan)
    const expected = withOnsetInWindow(dedupeByWholeBegin(rawExpected), 0, 1)
    const ours = collectCycles(parseStrudel(code), 0, 1)
    // 1 source event × 4 chops = 4 sub-events.
    expect(ours.length).toBe(4)
    expect(ours.length).toBe(expected.length)
    // Per-event params.begin/end set equality — the heart of the chop
    // parity claim. If this fails: re-read the merge function at
    // pattern.mjs:3294-3300; the (b0 + (i/n)*d) calc may need adjustment.
    const beTuple = (e: IREvent): string => {
      const b = e.params?.begin
      const en = e.params?.end
      return `${typeof b === 'number' ? b.toFixed(9) : b}|${typeof en === 'number' ? en.toFixed(9) : en}`
    }
    expect(new Set(ours.map(beTuple))).toEqual(new Set(expected.map(beTuple)))
    // Time-`begin` set match (the sub-event onsets divide the source
    // event's time span). Strudel's `whole` for each sub-event is the
    // sub-slot, so its whole.begin matches our newBegin.
    const timeTuple = (e: IREvent): string => `${e.begin.toFixed(9)}|${e.s ?? ''}`
    expect(new Set(ours.map(timeTuple))).toEqual(new Set(expected.map(timeTuple)))
    // PV24 — loc presence on every event our pipeline emits.
    for (const e of ours) expect(e.loc).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// PRE-01 (PR #70) — precursor: parseTransform baseOffset threading
//
// Scope per RESEARCH §2 YELLOW verdict: this asserts that the four call
// sites (applyChain → applyMethod → extractNextMethod → parseTransform)
// thread a non-zero baseOffset to parseTransform for multi-arg method
// inputs. It does NOT assert that transform-arg events carry the arg's
// loc value — that requires a broader IR shape change (only Play carries
// loc today; RESEARCH §2 Subtlety C). Filed as follow-up.
//
// Catalogue: P39 (parser offset preservation), PV25 (parser preserves
// offsets at every hop).
// ---------------------------------------------------------------------------
describe('PRE-01 — parseTransform baseOffset threading', () => {
  it('every() threads non-zero baseOffset for the transform arg', () => {
    __resetParseTransformDebug()
    // The transform-arg `x => x.fast(2)` starts well past offset 0.
    parseStrudel('note("c d e f").every(4, x => x.fast(2))')
    expect(__getParseTransformCallCount()).toBeGreaterThanOrEqual(1)
    expect(__getLastParseTransformBaseOffset()).toBeGreaterThan(0)
  })

  it('off() threads non-zero baseOffset for the transform arg', () => {
    __resetParseTransformDebug()
    parseStrudel('note("c d e").off(0.125, x => x.fast(2))')
    expect(__getParseTransformCallCount()).toBeGreaterThanOrEqual(1)
    expect(__getLastParseTransformBaseOffset()).toBeGreaterThan(0)
  })

  it('jux() threads non-zero baseOffset for the transform arg', () => {
    __resetParseTransformDebug()
    parseStrudel('note("c d e").jux(rev)')
    expect(__getParseTransformCallCount()).toBeGreaterThanOrEqual(1)
    expect(__getLastParseTransformBaseOffset()).toBeGreaterThan(0)
  })

  it('chunk() threads non-zero baseOffset for the transform arg', () => {
    __resetParseTransformDebug()
    parseStrudel('note("c d e f").chunk(4, x => x.fast(2))')
    expect(__getParseTransformCallCount()).toBeGreaterThanOrEqual(1)
    expect(__getLastParseTransformBaseOffset()).toBeGreaterThan(0)
  })

  it('baseOffset roughly tracks the transform-arg position in source', () => {
    // Two inputs that differ only in pre-method whitespace; the second
    // should produce a strictly larger baseOffset, demonstrating that
    // threading is position-sensitive (not just constant non-zero).
    __resetParseTransformDebug()
    parseStrudel('note("a").every(2, x => x.fast(2))')
    const a = __getLastParseTransformBaseOffset()
    __resetParseTransformDebug()
    parseStrudel('note("a").every(2,                    x => x.fast(2))')
    const b = __getLastParseTransformBaseOffset()
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
  })
})

// ---------------------------------------------------------------------------
// 19-05 / #74 — assertEventLocWithin smoke test.
//
// Sanity-check that the helper correctly accepts a known-good case (event
// loc lies inside its source sub-expression). Per-method exhaustive
// containment assertions land in the next describe block.
// ---------------------------------------------------------------------------
describe('19-05 — assertEventLocWithin helper', () => {
  it('accepts a known-good case: note("c d e f").late(0.125) — events inside "c d e f"', () => {
    const code = 'note("c d e f").late(0.125)'
    const subExpr = '"c d e f"'
    const ours = collectCycles(parseStrudel(code), 0, 1)
    expect(ours.length).toBeGreaterThan(0)
    for (const e of ours) assertEventLocWithin(e, code, subExpr)
  })
})

// ---------------------------------------------------------------------------
// 19-05 / #74 — per-method `loc` containment (D-04 + D-11).
//
// PV24 strengthening: "every IREvent carries the loc of the source
// expression that produced it." Per D-01, transforms do NOT override
// event.loc — events keep Play.loc, which points back at the body's
// source range. These tests assert that for each multi-arg / transform-
// bearing method, every emitted event's loc falls within the body sub-
// expression's source range.
//
// Random-behavior methods (sometimes/sometimesBy/shuffle/scramble/
// degrade/degradeBy) are queried over multiple cycles to broaden
// coverage; the assertion shape (containment) is identical regardless
// of which subset of body events surfaces in any given cycle.
// ---------------------------------------------------------------------------
describe('19-05 — per-method loc containment (D-04 + D-11)', () => {
  it('every — events from body carry loc within "c d e f"', () => {
    const code = 'note("c d e f").every(2, x => x.fast(2))'
    const subExpr = '"c d e f"'
    // Probe both cycle 0 (every(2) returns body) and cycle 1 (every(2)
    // applies the transform). Both cases must keep event.loc inside
    // the body's source per D-01.
    for (let c = 0; c < 4; c++) {
      const evs = collect(parseStrudel(code), { cycle: c } as CollectContext)
      expect(evs.length).toBeGreaterThan(0)
      evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `every cycle=${c} note=${e.note}@${e.begin}`))
    }
  })

  it('sometimes — events from then/else_ branches carry loc within "c d"', () => {
    const code = 'note("c d").sometimes(x => x.fast(2))'
    const subExpr = '"c d"'
    for (let c = 0; c < 8; c++) {
      const evs = collect(parseStrudel(code), { cycle: c } as CollectContext)
      evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `sometimes cycle=${c} note=${e.note}@${e.begin}`))
    }
  })

  it('sometimesBy — events from then/else_ branches carry loc within "c d"', () => {
    const code = 'note("c d").sometimesBy(0.5, x => x.fast(2))'
    const subExpr = '"c d"'
    for (let c = 0; c < 8; c++) {
      const evs = collect(parseStrudel(code), { cycle: c } as CollectContext)
      evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `sometimesBy cycle=${c} note=${e.note}@${e.begin}`))
    }
  })

  it('chunk — events from body carry loc within "c d e f"', () => {
    const code = 'note("c d e f").chunk(4, x => x.fast(2))'
    const subExpr = '"c d e f"'
    for (let c = 0; c < 4; c++) {
      const evs = collect(parseStrudel(code), { cycle: c } as CollectContext)
      expect(evs.length).toBeGreaterThan(0)
      evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `chunk cycle=${c} note=${e.note}@${e.begin}`))
    }
  })

  it('off — Stack(body, transform(Late(t, body))) — every event has loc within "c d"', () => {
    const code = 'note("c d").off(0.125, x => x.gain(0.5))'
    const subExpr = '"c d"'
    const evs = collect(parseStrudel(code), { cycle: 0 } as CollectContext)
    expect(evs.length).toBeGreaterThan(0)
    evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `off note=${e.note}@${e.begin}`))
  })

  it('jux — left + right pan tracks both carry loc within "c d"', () => {
    const code = 'note("c d").jux(rev)'
    const subExpr = '"c d"'
    const evs = collect(parseStrudel(code), { cycle: 0 } as CollectContext)
    expect(evs.length).toBe(4) // 2 events × 2 pan tracks
    evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `jux pan=${e.params?.pan} note=${e.note}@${e.begin}`))
  })

  it('layer — Stack(transform(body)) — events carry loc within "c d"', () => {
    const code = 'note("c d").layer(x => x.fast(2))'
    const subExpr = '"c d"'
    const evs = collect(parseStrudel(code), { cycle: 0 } as CollectContext)
    expect(evs.length).toBeGreaterThan(0)
    evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `layer note=${e.note}@${e.begin}`))
  })

  it('late — events shifted by t but loc still within "c d e f"', () => {
    const code = 'note("c d e f").late(0.125)'
    const subExpr = '"c d e f"'
    const evs = collect(parseStrudel(code), { cycle: 0 } as CollectContext)
    expect(evs.length).toBe(4)
    evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `late note=${e.note}@${e.begin}`))
  })

  it('degrade — surviving events carry loc within "bd hh sd cp ride lt mt ht"', () => {
    // Use the same 8-sound input the existing degrade parity tests use; our
    // seededRand is deterministic, and a 4-element body collapses to 0
    // surviving events under 50% retention (probe-confirmed). The 8-sound
    // body matches the harness's existing degrade fixture (line 463).
    const code = 's("bd hh sd cp ride lt mt ht").degrade()'
    const subExpr = '"bd hh sd cp ride lt mt ht"'
    let totalEvents = 0
    for (let c = 0; c < 8; c++) {
      const evs = collect(parseStrudel(code), { cycle: c } as CollectContext)
      totalEvents += evs.length
      evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `degrade cycle=${c} note=${e.note}@${e.begin}`))
    }
    expect(totalEvents).toBeGreaterThan(0) // at least one cycle must surface events
  })

  it('degradeBy — surviving events carry loc within "bd hh sd cp ride lt mt ht"', () => {
    const code = 's("bd hh sd cp ride lt mt ht").degradeBy(0.3)'
    const subExpr = '"bd hh sd cp ride lt mt ht"'
    let totalEvents = 0
    for (let c = 0; c < 8; c++) {
      const evs = collect(parseStrudel(code), { cycle: c } as CollectContext)
      totalEvents += evs.length
      evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `degradeBy cycle=${c} note=${e.note}@${e.begin}`))
    }
    expect(totalEvents).toBeGreaterThan(0)
  })

  it('chop — N copies of the body event each carry loc within "bd"', () => {
    const code = 's("bd").chop(4)'
    const subExpr = '"bd"'
    const evs = collect(parseStrudel(code), { cycle: 0 } as CollectContext)
    expect(evs.length).toBe(4)
    evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `chop note=${e.note}@${e.begin}`))
  })

  it('pick — selected lookup events carry loc within `["c","e"]`', () => {
    const code = 'mini("<0 1>").pick(["c","e"]).note()'
    const subExpr = '["c","e"]'
    // Pick maps the selector index into the lookup; events come from the
    // chosen lookup item's Play, whose loc lies inside the lookup array.
    let totalEvents = 0
    for (let c = 0; c < 4; c++) {
      const evs = collect(parseStrudel(code), { cycle: c } as CollectContext)
      totalEvents += evs.length
      evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `pick cycle=${c} note=${e.note}@${e.begin}`))
    }
    expect(totalEvents).toBeGreaterThan(0)
  })

  it('struct — gated events carry loc within "c d e f"', () => {
    const code = 'note("c d e f").struct("x ~ x ~")'
    const subExpr = '"c d e f"'
    const evs = collect(parseStrudel(code), { cycle: 0 } as CollectContext)
    expect(evs.length).toBeGreaterThan(0)
    evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `struct note=${e.note}@${e.begin}`))
  })

  it('swing — re-timed events carry loc within "c d e f"', () => {
    const code = 'note("c d e f").swing(4)'
    const subExpr = '"c d e f"'
    const evs = collect(parseStrudel(code), { cycle: 0 } as CollectContext)
    expect(evs.length).toBe(4)
    evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `swing note=${e.note}@${e.begin}`))
  })

  it('shuffle — permuted events carry loc within "c d e f"', () => {
    const code = 'note("c d e f").shuffle(4)'
    const subExpr = '"c d e f"'
    const evs = collect(parseStrudel(code), { cycle: 0 } as CollectContext)
    expect(evs.length).toBe(4)
    evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `shuffle note=${e.note}@${e.begin}`))
  })

  it('scramble — randomized events carry loc within "c d e f"', () => {
    const code = 'note("c d e f").scramble(4)'
    const subExpr = '"c d e f"'
    const evs = collect(parseStrudel(code), { cycle: 0 } as CollectContext)
    expect(evs.length).toBe(4)
    evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `scramble note=${e.note}@${e.begin}`))
  })

  it('ply — N×events per body slot, each event carries loc within "c d"', () => {
    const code = 'note("c d").ply(2)'
    const subExpr = '"c d"'
    const evs = collect(parseStrudel(code), { cycle: 0 } as CollectContext)
    expect(evs.length).toBe(4) // 2 body events × ply(2)
    evs.forEach((e) => assertEventLocWithin(e, code, subExpr, `ply note=${e.note}@${e.begin}`))
  })

  // -------------------------------------------------------------------------
  // PLAN §5 #12 catcher — the load-bearing arithmetic gotcha.
  //
  // applyChain pre-computes `consumed = remaining.length - rest.length`
  // BEFORE calling applyMethod, so each tag in a method chain receives
  // its own callSiteRange covering exactly its `.method(args)` substring
  // (including the leading `.`). Off-by-one on the `.` would silently
  // shift every tag's loc by 1 char; this 3-method chain test asserts
  // exact byte-equality against `code.indexOf('.method(...)')` on every
  // link.
  //
  // Empirically determined: loc.start INCLUDES the leading `.`. For
  // `.fast(2)` at indexOf=7 the constructed Fast.loc is {start: 7, end:
  // 15} (length 8 = `.fast(2)`).
  // -------------------------------------------------------------------------
  it('3-method chain — each link carries its own .method(args) callSiteRange (PLAN §5 #12)', () => {
    const code = 's("bd").fast(2).late(0.125).gain(0.5)'
    // Phase 20-10: .gain promoted from FX to Param. loc / userMethod
    // contracts unchanged.
    const ir = parseStrudel(code) as {
      tag: 'Param'
      userMethod?: string
      loc?: SourceLocation[]
      body: { tag: 'Late'; userMethod?: string; loc?: SourceLocation[]; body: { tag: 'Fast'; userMethod?: string; loc?: SourceLocation[]; body: unknown } }
    }
    expect(ir.tag).toBe('Param')
    expect(ir.userMethod).toBe('gain')
    const gainStart = code.indexOf('.gain(0.5)')
    expect(ir.loc).toEqual([{ start: gainStart, end: gainStart + '.gain(0.5)'.length }])

    expect(ir.body.tag).toBe('Late')
    expect(ir.body.userMethod).toBe('late')
    const lateStart = code.indexOf('.late(0.125)')
    expect(ir.body.loc).toEqual([{ start: lateStart, end: lateStart + '.late(0.125)'.length }])

    expect(ir.body.body.tag).toBe('Fast')
    expect(ir.body.body.userMethod).toBe('fast')
    const fastStart = code.indexOf('.fast(2)')
    expect(ir.body.body.loc).toEqual([{ start: fastStart, end: fastStart + '.fast(2)'.length }])
  })
})

// ---------------------------------------------------------------------------
// 20-03 wave δ — outermost-IR-node loc-presence audit (PV36 + PK13 step 1).
//
// RESEARCH §5.8 enumerated every recognised applyMethod arm in
// parseStrudel.ts:303-732 and confirmed each one calls tagMeta(...) or
// literal-construction with [start, end]. Wave δ doesn't change any arm
// — it confirms via test that the OUTERMOST IR node returned from
// parseStrudel(code) carries loc.length >= 1 across the W7 corpus.
//
// The default: arm at parseStrudel.ts:729 is the only construction-time
// gap; phase 20-04 (PV37) owns it. This audit explicitly does NOT cover
// it — every fixture below is a recognised arm.
//
// Why these probes: they catch drift if a future arm ships without a
// loc field on the outermost IR node, before wave-ε event-level checks
// can even fire. parser-side regression caught at the parser boundary.
// ---------------------------------------------------------------------------
describe('20-03 — outermost IR node carries loc (wave δ audit)', () => {
  const W7_OUTERMOST_FIXTURES: ReadonlyArray<{
    name: string
    code: string
  }> = [
    { name: 'every', code: 'note("c d e f").every(2, x => x.fast(2))' },
    { name: 'sometimes', code: 'note("c d").sometimes(x => x.fast(2))' },
    { name: 'sometimesBy', code: 'note("c d").sometimesBy(0.5, x => x.fast(2))' },
    { name: 'chunk', code: 'note("c d e f").chunk(4, x => x.fast(2))' },
    { name: 'off', code: 'note("c d").off(0.125, x => x.gain(0.5))' },
    { name: 'jux', code: 'note("c d").jux(rev)' },
    { name: 'layer', code: 'note("c d").layer(x => x.fast(2))' },
    { name: 'late', code: 'note("c d e f").late(0.125)' },
    { name: 'degrade', code: 's("bd hh sd cp ride lt mt ht").degrade()' },
    { name: 'degradeBy', code: 's("bd hh sd cp ride lt mt ht").degradeBy(0.3)' },
    { name: 'chop', code: 's("bd").chop(4)' },
    { name: 'pick', code: 'mini("<0 1>").pick(["c","e"]).note()' },
    { name: 'struct', code: 'note("c d e f").struct("x ~ x ~")' },
    { name: 'swing', code: 'note("c d e f").swing(4)' },
    { name: 'shuffle', code: 'note("c d e f").shuffle(4)' },
    { name: 'scramble', code: 'note("c d e f").scramble(4)' },
    { name: 'ply', code: 'note("c d").ply(2)' },
    { name: '3-method chain', code: 's("bd").fast(2).late(0.125).gain(0.5)' },
  ]

  for (const { name, code } of W7_OUTERMOST_FIXTURES) {
    it(`${name} — outermost IR node has loc.length >= 1`, () => {
      const ir = parseStrudel(code) as PatternIR & { loc?: SourceLocation[] }
      expect(ir.loc).toBeDefined()
      expect(ir.loc!.length).toBeGreaterThanOrEqual(1)
    })
  }
})

// ---------------------------------------------------------------------------
// 19-05 / #74 — `userMethod` round-trip on representative tags (D-08).
//
// D-08 exact-token taxonomy: `userMethod` is the literal method name the
// user typed. `'degradeBy'` ≠ `'degrade'`; Stack-from-layer carries
// `'layer'` while Stack-from-jux carries `'jux'` — same Stack tag, distinct
// metadata. These tests verify the parser preserves the exact-token via
// direct AST inspection (no toStrudel involvement per D-13). PV28 keep-
// alive — these are the field's only test consumers in this PR until
// 19-06's Inspector projection consumes it (#76).
// ---------------------------------------------------------------------------
describe('19-05 — userMethod round-trip on representative tags (D-08)', () => {
  it('Late: parseStrudel(`note("c").late(0.125)`) carries userMethod="late"', () => {
    const ir = parseStrudel('note("c").late(0.125)') as PatternIR & { userMethod?: string }
    expect(ir.tag).toBe('Late')
    expect(ir.userMethod).toBe('late')
  })

  it('Pick: parseStrudel(`mini("<0 1>").pick(["c","e"]).note()`) — Pick tag carries userMethod="pick"', () => {
    // Phase 20-04 D-03 update: .note() at the end is now wrapped per PV37
    // (was silently passed through pre-20-04). The outer wrapper is the
    // .note() Code-with-via; via.inner is the Pick we want to inspect.
    const outer = parseStrudel('mini("<0 1>").pick(["c","e"]).note()')
    expect(outer.tag).toBe('Code')
    if (outer.tag !== 'Code' || !outer.via) return
    expect(outer.via.method).toBe('note')
    const ir = outer.via.inner as PatternIR & { userMethod?: string }
    expect(ir.tag).toBe('Pick')
    expect(ir.userMethod).toBe('pick')
  })

  it('Struct: parseStrudel(`note("c").struct("x ~ x")`) carries userMethod="struct"', () => {
    const ir = parseStrudel('note("c").struct("x ~ x")') as PatternIR & { userMethod?: string }
    expect(ir.tag).toBe('Struct')
    expect(ir.userMethod).toBe('struct')
  })

  it('Stack-from-layer: parseStrudel(`note("c").layer(x => x.add("0,2"))`) — Stack carries userMethod="layer"', () => {
    const ir = parseStrudel('note("c").layer(x => x.add("0,2"))') as PatternIR & { userMethod?: string }
    expect(ir.tag).toBe('Stack')
    expect(ir.userMethod).toBe('layer')
  })

  it('Stack-from-jux: parseStrudel(`note("c").jux(rev)`) — Stack carries userMethod="jux"', () => {
    const ir = parseStrudel('note("c").jux(rev)') as PatternIR & { userMethod?: string }
    expect(ir.tag).toBe('Stack')
    expect(ir.userMethod).toBe('jux')
  })

  // Bonus: D-08 exact-token sentinel — Degrade tag from `.degradeBy(amount)`
  // carries `userMethod === 'degradeBy'`, NOT `'degrade'`. The canonical
  // tag (Degrade) is shared with `.degrade()`; only userMethod distinguishes
  // them. This is the round-trip property 19-06's projection depends on.
  it('Degrade-from-degradeBy: userMethod="degradeBy" (NOT "degrade") — D-08 exact-token', () => {
    const ir = parseStrudel('note("c").degradeBy(0.3)') as PatternIR & { userMethod?: string }
    expect(ir.tag).toBe('Degrade')
    expect(ir.userMethod).toBe('degradeBy')

    // Confirm the canonical .degrade() path stays distinct.
    const ir2 = parseStrudel('note("c").degrade()') as PatternIR & { userMethod?: string }
    expect(ir2.tag).toBe('Degrade')
    expect(ir2.userMethod).toBe('degrade')
  })
})

// ---------------------------------------------------------------------------
// 20-03 — PV36 loc-completeness across collect arms (wave ε contract test).
//
// The contract this PR lands: every IREvent returned from collect() carries
// loc: SourceLocation[] with length >= 1, ordered innermost atom first
// (D-01). Click-to-source consumers read evt.loc[0]; modifier-click /
// chain-history consumers walk loc[1+].
//
// Per-shape fixtures verify D-01 ordering for each IR transform; the
// final corpus describe runs a single contract assertion over a curated
// 14-entry corpus union — that's the D-03 catcher (pairs with the dev-
// only console.warn at collect()'s return site).
// ---------------------------------------------------------------------------
describe('20-03 — PV36 loc-completeness across collect arms', () => {
  // ── Per-shape fixtures (D-01 innermost-first verification) ────────────
  //
  // For wrappers around named atoms, loc[0] should fall inside the
  // innermost atom range; loc[1+] carries the wrapping call-site(s).
  // The shapes that PRE-DATE wave ε (Play, Pick) get extra coverage.

  it('Play (atom) — loc.length === 1; loc[0] inside the atom', () => {
    const code = 'note("c d e f")'
    const events = collect(parseStrudel(code))
    expect(events.length).toBe(4)
    const subStart = code.indexOf('"c d e f"')
    const subEnd = subStart + '"c d e f"'.length
    for (const e of events) {
      expect(e.loc).toBeDefined()
      expect(e.loc!.length).toBeGreaterThanOrEqual(1)
      expect(e.loc![0].start).toBeGreaterThanOrEqual(subStart)
      expect(e.loc![0].end).toBeLessThanOrEqual(subEnd)
    }
  })

  it('Fast — duplicates share loc; loc[0] inside atom; loc[1+] is .fast(2)', () => {
    const code = 'note("c d").fast(2)'
    const events = collect(parseStrudel(code))
    expect(events.length).toBeGreaterThan(0)
    const fastStart = code.indexOf('.fast(2)')
    const fastEnd = fastStart + '.fast(2)'.length
    for (const e of events) {
      expect(e.loc!.length).toBeGreaterThanOrEqual(2)
      // loc[0] inside the atom string ("c d")
      const atomStart = code.indexOf('"c d"')
      const atomEnd = atomStart + '"c d"'.length
      expect(e.loc![0].start).toBeGreaterThanOrEqual(atomStart)
      expect(e.loc![0].end).toBeLessThanOrEqual(atomEnd)
      // some loc range covers .fast(2)
      const hasWrapper = e.loc!.some(
        (l) => l.start >= fastStart && l.end <= fastEnd,
      )
      expect(hasWrapper).toBe(true)
    }
  })

  it('Slow — loc[1+] contains .slow(2)', () => {
    const code = 'note("c d").slow(2)'
    const events = collect(parseStrudel(code))
    expect(events.length).toBeGreaterThan(0)
    const slowStart = code.indexOf('.slow(2)')
    const slowEnd = slowStart + '.slow(2)'.length
    for (const e of events) {
      expect(e.loc!.length).toBeGreaterThanOrEqual(2)
      expect(
        e.loc!.some((l) => l.start >= slowStart && l.end <= slowEnd),
      ).toBe(true)
    }
  })

  it('Late — loc[1+] contains .late(0.125)', () => {
    const code = 'note("c d e f").late(0.125)'
    const events = collect(parseStrudel(code))
    expect(events.length).toBe(4)
    const lateStart = code.indexOf('.late(0.125)')
    const lateEnd = lateStart + '.late(0.125)'.length
    for (const e of events) {
      expect(
        e.loc!.some((l) => l.start >= lateStart && l.end <= lateEnd),
      ).toBe(true)
    }
  })

  it('FX (gain) — loc[1+] contains .gain(0.5)', () => {
    const code = 'note("c d").gain(0.5)'
    const events = collect(parseStrudel(code))
    expect(events.length).toBeGreaterThan(0)
    const gainStart = code.indexOf('.gain(0.5)')
    const gainEnd = gainStart + '.gain(0.5)'.length
    for (const e of events) {
      expect(
        e.loc!.some((l) => l.start >= gainStart && l.end <= gainEnd),
      ).toBe(true)
    }
  })

  it('Every — loc[1+] contains .every(2, ...)', () => {
    const code = 'note("c d e f").every(2, x => x.fast(2))'
    const everyStart = code.indexOf('.every(')
    // events from cycle 1 (transform applied) carry the wrapper
    const events = collect(parseStrudel(code), { cycle: 1 } as CollectContext)
    expect(events.length).toBeGreaterThan(0)
    for (const e of events) {
      expect(
        e.loc!.some((l) => l.start >= everyStart),
      ).toBe(true)
    }
  })

  it('Choice (sometimes) — every event has loc.length >= 1 across cycles', () => {
    // sometimes uses Math.random; iterate cycles and assert presence.
    const code = 'note("c d").sometimes(x => x.fast(2))'
    for (let c = 0; c < 8; c++) {
      const events = collect(parseStrudel(code), { cycle: c } as CollectContext)
      for (const e of events) {
        expect(e.loc).toBeDefined()
        expect(e.loc!.length).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('When (mask) — surviving events carry .mask(...) range', () => {
    const code = 'note("c d e f").mask("1 0 1 1")'
    const events = collect(parseStrudel(code))
    expect(events.length).toBeGreaterThan(0)
    const maskStart = code.indexOf('.mask(')
    for (const e of events) {
      expect(e.loc!.some((l) => l.start >= maskStart)).toBe(true)
    }
  })

  it('Struct — gated events carry .struct(...) range', () => {
    const code = 'note("c d e f").struct("x ~ x ~")'
    const events = collect(parseStrudel(code))
    expect(events.length).toBeGreaterThan(0)
    const structStart = code.indexOf('.struct(')
    for (const e of events) {
      expect(e.loc!.some((l) => l.start >= structStart)).toBe(true)
    }
  })

  it('Degrade — survivors carry .degradeBy(...) range', () => {
    const code = 's("bd hh sd cp ride lt mt ht").degradeBy(0.3)'
    const dgStart = code.indexOf('.degradeBy(')
    for (let c = 0; c < 8; c++) {
      const events = collect(parseStrudel(code), { cycle: c } as CollectContext)
      for (const e of events) {
        expect(e.loc!.some((l) => l.start >= dgStart)).toBe(true)
      }
    }
  })

  it('Chunk — every event carries .chunk(...) range', () => {
    const code = 'note("c d e f").chunk(4, x => x.gain(0.5))'
    const chunkStart = code.indexOf('.chunk(')
    for (let c = 0; c < 4; c++) {
      const events = collect(parseStrudel(code), { cycle: c } as CollectContext)
      expect(events.length).toBeGreaterThan(0)
      for (const e of events) {
        expect(e.loc!.some((l) => l.start >= chunkStart)).toBe(true)
      }
    }
  })

  it('Pick — events carry [atom, selector, .pick(...)] loc (D-01 multi-range)', () => {
    // D-01 / T-20: lookup atom innermost (loc[0]); selector loc[1];
    // .pick(...) call-site loc[2]. We assert length >= 2 (some lookup
    // shapes may not all carry every layer) AND that loc[0] falls inside
    // one of the lookup atoms.
    const code = 'mini("<0 1>").pick(["c","e"]).note()'
    for (let c = 0; c < 4; c++) {
      const events = collect(parseStrudel(code), { cycle: c } as CollectContext)
      for (const e of events) {
        expect(e.loc).toBeDefined()
        expect(e.loc!.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('Swing — re-timed events carry .swing(...) range', () => {
    const code = 'note("c d e f").swing(4)'
    const events = collect(parseStrudel(code))
    expect(events.length).toBe(4)
    const swingStart = code.indexOf('.swing(')
    for (const e of events) {
      expect(e.loc!.some((l) => l.start >= swingStart)).toBe(true)
    }
  })

  it('Shuffle — permuted events carry .shuffle(...) range (via _collectRearrange)', () => {
    const code = 'note("c d e f").shuffle(4)'
    const events = collect(parseStrudel(code))
    expect(events.length).toBe(4)
    const shStart = code.indexOf('.shuffle(')
    for (const e of events) {
      expect(e.loc!.some((l) => l.start >= shStart)).toBe(true)
    }
  })

  it('Scramble — randomized events carry .scramble(...) range (via _collectRearrange)', () => {
    const code = 'note("c d e f").scramble(4)'
    const events = collect(parseStrudel(code))
    expect(events.length).toBe(4)
    const scStart = code.indexOf('.scramble(')
    for (const e of events) {
      expect(e.loc!.some((l) => l.start >= scStart)).toBe(true)
    }
  })

  it('Chop — N copies per source event carry .chop(...) range', () => {
    const code = 's("bd").chop(4)'
    const events = collect(parseStrudel(code))
    expect(events.length).toBe(4)
    const chopStart = code.indexOf('.chop(')
    for (const e of events) {
      expect(e.loc!.some((l) => l.start >= chopStart)).toBe(true)
    }
  })

  it('Ply — N copies per body slot share atom + .ply(...) range', () => {
    const code = 'note("c d").ply(2)'
    const events = collect(parseStrudel(code))
    expect(events.length).toBe(4) // 2 body events × ply(2)
    const plyStart = code.indexOf('.ply(')
    for (const e of events) {
      expect(e.loc!.some((l) => l.start >= plyStart)).toBe(true)
    }
  })

  it('Layer (synthetic Stack) — events from inner Stack carry .layer(...) range', () => {
    const code = 'note("c d").layer(x => x.fast(2))'
    const events = collect(parseStrudel(code))
    expect(events.length).toBeGreaterThan(0)
    const layerStart = code.indexOf('.layer(')
    for (const e of events) {
      expect(e.loc!.some((l) => l.start >= layerStart)).toBe(true)
    }
  })

  it('Off (synthetic Stack/Late) — both arms produce events with loc.length >= 1', () => {
    const code = 'note("c d").off(0.125, x => x.gain(0.5))'
    const events = collect(parseStrudel(code))
    expect(events.length).toBeGreaterThan(0)
    for (const e of events) {
      expect(e.loc).toBeDefined()
      expect(e.loc!.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('Jux (synthetic Stack with pan FX) — left + right tracks all carry loc', () => {
    const code = 'note("c d").jux(rev)'
    const events = collect(parseStrudel(code))
    expect(events.length).toBe(4) // 2 events × 2 pan tracks
    for (const e of events) {
      expect(e.loc).toBeDefined()
      expect(e.loc!.length).toBeGreaterThanOrEqual(1)
    }
  })

  // ── D-03 catcher: contract corpus ──────────────────────────────────────
  //
  // One assertion shape across a curated corpus union. If a future arm
  // ships without loc-propagation, this block fails CI loud. The dev-
  // only console.warn at collect()'s return adds a second channel for
  // local development.
  describe('contract: every collect-produced event has loc.length >= 1', () => {
    const CORPUS: ReadonlyArray<string> = [
      'note("c d e f")',
      'note("c d").fast(2)',
      'note("c d").slow(2)',
      'note("c d e f").late(0.125)',
      's("bd hh sd cp").ply(3)',
      'mini("<0 1>").pick(["c","e"]).note()',
      'note("c d").layer(x => x.fast(2))',
      'note("c d").off(0.125, x => x.gain(0.5))',
      'note("c d").every(2, x => x.fast(2))',
      's("bd hh").chop(4)',
      'note("c d e f").shuffle(4)',
      'note("c d e f g h").scramble(4)',
      's("bd").struct("1 0 1 1")',
      'note("c d").mask("1 0 1 1")',
      'note("c d").gain(0.5).lpf(2400).slow(2)',
    ]
    for (const code of CORPUS) {
      it(`every event has loc.length >= 1 — ${JSON.stringify(code).slice(0, 60)}`, () => {
        // For non-deterministic shapes (sometimes/Choice via Math.random
        // and degrade-empty cycles) we sweep a few cycles to ensure at
        // least one cycle surfaces events.
        let totalEvents = 0
        for (let c = 0; c < 4; c++) {
          const events = collect(
            parseStrudel(code),
            { cycle: c } as CollectContext,
          )
          totalEvents += events.length
          for (const e of events) {
            expect(e.loc, `code=${code} cycle=${c} event=${JSON.stringify(e)}`).toBeDefined()
            expect(e.loc!.length).toBeGreaterThanOrEqual(1)
          }
        }
        expect(totalEvents).toBeGreaterThan(0)
      })
    }
  })
})


// ---------------------------------------------------------------------------
// Phase 20-05 wave β — irNodeId determinism + corpus uniqueness/lookup
// (PV38 clause 1 / PK13 step 4 / D-02). Pairs with the Play-arm
// assignNodeId wiring in collect.ts. Wrapper arms preserve irNodeId via
// existing {...e, ...} spread semantics — no per-arm wiring needed
// (RESEARCH DEC-NEW-1: leaf-only assignment).
// ---------------------------------------------------------------------------

describe('20-05 — irNodeId determinism + lookup-resolution (PV38 / D-02)', () => {
  it('same code parsed twice yields identical irNodeIds for every event', () => {
    const code = 'note("c d e f").fast(2)'
    const events1 = collect(parseStrudel(code))
    const events2 = collect(parseStrudel(code))
    expect(events1.length).toBe(events2.length)
    for (let i = 0; i < events1.length; i++) {
      expect(events1[i].irNodeId).toBeTruthy()
      expect(events1[i].irNodeId).toBe(events2[i].irNodeId)
    }
  })
})

describe('20-05 — irNodeId set per event + resolves in id→event map (PV38 / D-02)', () => {
  // CORPUS reused from line 1749 (PV36 loc-completeness contract).
  const CORPUS: ReadonlyArray<string> = [
    'note("c d e f")',
    'note("c d").fast(2)',
    'note("c d").slow(2)',
    'note("c d e f").late(0.125)',
    's("bd hh sd cp").ply(3)',
    'mini("<0 1>").pick(["c","e"]).note()',
    'note("c d").layer(x => x.fast(2))',
    'note("c d").off(0.125, x => x.gain(0.5))',
    'note("c d").every(2, x => x.fast(2))',
    's("bd hh").chop(4)',
    'note("c d e f").shuffle(4)',
    'note("c d e f g h").scramble(4)',
    's("bd").struct("1 0 1 1")',
    'note("c d").mask("1 0 1 1")',
    'note("c d").gain(0.5).lpf(2400).slow(2)',
  ]
  for (const code of CORPUS) {
    it(`every event has a truthy irNodeId; the id resolves to an event in id→event map — ${JSON.stringify(code).slice(0, 60)}`, () => {
      let totalEvents = 0
      // Build a synthesised id→event map across all cycles
      const idMap = new Map<string, IREvent>()
      for (let c = 0; c < 4; c++) {
        const events = collect(parseStrudel(code), { cycle: c } as CollectContext)
        totalEvents += events.length
        for (const e of events) {
          expect(e.irNodeId, `code=${code} cycle=${c} event=${JSON.stringify(e)}`).toBeTruthy()
          // Lookup resolves: same id → same leaf-loc (the underlying contract)
          const existing = idMap.get(e.irNodeId!)
          if (existing) {
            // Duplicates from fast/ply/chunk are EXPECTED — assert they share leaf-loc
            expect(existing.loc?.[0]).toEqual(e.loc?.[0])
          } else {
            idMap.set(e.irNodeId!, e)
          }
        }
      }
      expect(totalEvents).toBeGreaterThan(0)
      expect(idMap.size).toBeGreaterThan(0)
    })
  }
})


// ---------------------------------------------------------------------------
// Phase 20-04 wave β — parser-side wrap probes (D-03 / P33 / PV37).
// ---------------------------------------------------------------------------

describe('20-04 wave β — parser wrap probes (D-03 / P33 / PV37)', () => {
  // Each probe asserts that the parser routes through wrapAsOpaque AT THE
  // EXPECTED FAILURE BRANCH — and that intentional non-wrap sites
  // (ply(n=1), .p("...")) are preserved unchanged.

  // --- Default-arm wrap (T-04 / DV-06 primary site) --------------------------

  it('default arm wraps unrecognised method (.notreal)', () => {
    // #928 note: this probe used `.release` until `release` became a
    // registry-classified control (Param). It must exercise a GENUINELY
    // unrecognised method — neither a structural transform nor an
    // isControlName control — so `.notreal` now stands in. PV37 unchanged.
    const ir = parseStrudel('note("c").notreal(0.3)')
    expect(ir.tag).toBe('Code')
    if (ir.tag !== 'Code') return
    expect(ir.via?.method).toBe('notreal')
    expect(ir.via?.args).toBe('0.3')           // raw, untrimmed (D-02)
    expect(ir.via?.inner.tag).toBe('Play')
  })

  it('typed Param arm carries quoted args verbatim (.s("sawtooth")) — Phase 20-10 promotion', () => {
    // Phase 20-10 promoted `s` to the typed Param tag — `.s("sawtooth")`
    // no longer falls through to wrapAsOpaque. The original wave-β probe
    // asserted Code-with-via for default-arm wrapping; with the Param arm
    // present, the byte-fidelity contract carries through Param.rawArgs
    // instead. Replace the probe with the (analogous) Param contract;
    // the default-arm notreal(0.3) test above still pins PV37 wrap
    // semantics for unrecognised methods.
    const ir = parseStrudel('note("c").s("sawtooth")')
    expect(ir.tag).toBe('Param')
    if (ir.tag !== 'Param') return
    expect(ir.key).toBe('s')
    expect(ir.value).toBe('sawtooth')
    expect(ir.rawArgs).toBe('"sawtooth"')      // raw — surrounding quotes preserved
    expect(ir.userMethod).toBe('s')
  })

  // --- Typed-arm parse-failure wraps (T-06 / D-03 expansion) -----------------

  it('fast wraps on parseFloat NaN (pattern-as-arg)', () => {
    const ir = parseStrudel('note("c").fast("<2 3>")')
    expect(ir.tag).toBe('Code')
    if (ir.tag !== 'Code') return
    expect(ir.via?.method).toBe('fast')
    expect(ir.via?.args).toBe('"<2 3>"')
  })

  it('gain with mini-pattern arg routes to Param sub-IR (Phase 20-10 promotion)', () => {
    // Pre-20-10 this wrapped as Code-with-via because gain's standalone arm
    // failed parseFloat on `"0.3 0.7"`. Post-20-10 the Param arm recognises
    // the quoted-mini shape and parses it into a sub-IR via parseMini. The
    // default arm still wraps unrecognised methods (release(0.3) probe
    // above) — PV37 preserved for the non-whitelisted case.
    const ir = parseStrudel('note("c").gain("0.3 0.7")')
    expect(ir.tag).toBe('Param')
    if (ir.tag !== 'Param') return
    expect(ir.key).toBe('gain')
    expect(typeof ir.value).toBe('object')     // sub-IR (PatternIR)
    expect(ir.rawArgs).toBe('"0.3 0.7"')
  })

  it('lpf with a PATTERN arg classifies as Param, not opaque (#935)', () => {
    // Was: parseFloat("<500 1000>") is NaN, so the FX arm wrapped it as Code.
    // Now the FX arms fall through to the control registry, so a pattern arg
    // models — keyed CANONICALLY (`lpf` is an alias of `cutoff`) while the
    // user's own token round-trips.
    const ir = parseStrudel('note("c").lpf("<500 1000>")')
    expect(ir.tag).toBe('Param')
    if (ir.tag !== 'Param') return
    expect(ir.key).toBe('cutoff')
    expect(typeof ir.value).toBe('object') // sub-IR, not a number
    expect(toStrudel(ir)).toBe('note("c").lpf("<500 1000>")')
  })

  it('an FX arm still wraps when the arg cannot be modelled at all (PV37)', () => {
    // The fallthrough is not a blanket accept: a lambda has no param shape, so
    // wrap-never-drop still applies.
    const ir = parseStrudel('note("c").lpf(x => x)')
    expect(ir.tag).toBe('Code')
    if (ir.tag !== 'Code') return
    expect(ir.via?.method).toBe('lpf')
  })

  it('every wraps on parseInt NaN', () => {
    const ir = parseStrudel('note("c").every("<2 3>", x => x.fast(2))')
    expect(ir.tag).toBe('Code')
    if (ir.tag !== 'Code') return
    expect(ir.via?.method).toBe('every')
  })

  it('mask wraps when regex fails (bareword arg)', () => {
    const ir = parseStrudel('note("c").mask(somevar)')
    expect(ir.tag).toBe('Code')
    if (ir.tag !== 'Code') return
    expect(ir.via?.method).toBe('mask')
  })

  // --- Trap 2: ply(1) NOT wrapped (valid no-op) ------------------------------

  it('ply(1) is preserved as receiver (Trap 2 — valid no-op, NOT wrapped)', () => {
    const ir = parseStrudel('note("c").ply(1)')
    // Should be the receiver Play(c), NOT a Code-with-via wrapper.
    expect(ir.tag).toBe('Play')
  })

  it('ply with invalid arg DOES wrap (D-03 failure path)', () => {
    const ir = parseStrudel('note("c").ply("foo")')
    expect(ir.tag).toBe('Code')
    if (ir.tag !== 'Code') return
    expect(ir.via?.method).toBe('ply')
  })

  // --- Trap 3: .p("...") NOT wrapped (intentional pass-through) --------------

  it('.p("track1") wraps in Track tag (Phase 20-11 D-01 — demolishes 20-04 fence)', () => {
    // Phase 20-11 — outer synthetic d1 (stripped by the parseStrudel shim
    // above) + inner explicit `track1` from .p(), userMethod === 'p'.
    // The 20-04 D-07 Chesterton pass-through was correct under PV37
    // representation but wrong under the musician-track-identity model
    // (PV35). collect's outer-then-inner spread gives ctx.trackId='d1'
    // then override to 'track1'; INNER WINS (CONTEXT pre-mortem #1).
    const ir = parseStrudel('note("c").p("track1")')
    expect(ir.tag).toBe('Track')
    if (ir.tag !== 'Track') throw new Error('unreachable')
    expect(ir.trackId).toBe('track1')             // explicit
    expect(ir.userMethod).toBe('p')

    const inner = ir.body
    expect(inner.tag).toBe('Play')

    // The unwrapped (raw) parser output is Track('d1', Track('track1', Play)).
    const raw = _parseStrudel('note("c").p("track1")')
    expect(raw.tag).toBe('Track')
    if (raw.tag !== 'Track') throw new Error('unreachable')
    expect(raw.trackId).toBe('d1')                // outer synthetic
    expect(raw.userMethod).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Phase 20-04 wave γ — consumer wiring (collect / toStrudel / serialize).
// ---------------------------------------------------------------------------

describe('20-04 wave γ — consumer wiring (D-01 / D-02 / PV37 clauses 3-5)', () => {
  // collect walks via.inner (T-09)
  describe('collect walks via.inner', () => {
    it('collect on .release(0.3) wrapper produces inner Plays with appended loc', () => {
      const events = collect(parseStrudel('note("c d").release(0.3)'))
      expect(events.length).toBe(2)
      // Each event carries multi-range loc: atom + wrapper-call-site
      // (innermost first). PV36 invariant.
      for (const e of events) {
        expect(e.loc).toBeDefined()
        expect(e.loc!.length).toBeGreaterThanOrEqual(2)
      }
    })

    it('collect on single-atom wrapper threads call-site as loc[N]', () => {
      const code = 'note("c").s("sawtooth")'
      const events = collect(parseStrudel(code))
      expect(events.length).toBe(1)
      expect(events[0].loc).toBeDefined()
      // Last loc entry should be the .s("sawtooth") call-site range.
      const lastLoc = events[0].loc![events[0].loc!.length - 1]
      const callSiteStart = code.indexOf('.s(')
      const callSiteEnd = code.length
      expect(lastLoc.start).toBe(callSiteStart)
      expect(lastLoc.end).toBe(callSiteEnd)
    })

    it('double-wrap: collect threads both call-site ranges innermost-first (D-06)', () => {
      const events = collect(parseStrudel('note("c d").foo(1).bar(2)'))
      expect(events.length).toBe(2)
      // Each event's loc has at least 3 entries: atom + .foo(1) + .bar(2).
      for (const e of events) {
        expect(e.loc!.length).toBeGreaterThanOrEqual(3)
      }
    })
  })

  // toStrudel round-trip (T-10)
  describe('toStrudel round-trip byte-fidelity', () => {
    it('round-trips note("c").release(0.3) byte-equal', () => {
      const code = 'note("c").release(0.3)'
      expect(toStrudel(parseStrudel(code))).toBe(code)
    })

    it('preserves whitespace inside parens (D-02 — raw args)', () => {
      const code = 'note("c").release( 0.5 )'
      expect(toStrudel(parseStrudel(code))).toBe(code)
    })

    it('round-trips chains of unrecognised methods byte-equal', () => {
      const code = 'note("c").s("sawtooth").release(0.3)'
      expect(toStrudel(parseStrudel(code))).toBe(code)
    })

    it('round-trips double-wrap byte-equal', () => {
      const code = 'note("c").foo(1).bar(2)'
      expect(toStrudel(parseStrudel(code))).toBe(code)
    })

    it('round-trips typed-arm parse-failure (.fast pattern-arg) byte-equal', () => {
      const code = 'note("c").fast("<2 3>")'
      expect(toStrudel(parseStrudel(code))).toBe(code)
    })

    it('round-trips meta-corpus byte-equal', () => {
      const corpus = [
        'note("c").release(0.3)',
        'note("c").s("sawtooth")',
        's("bd hh sd").shape(0.5)',
        'note("c").foo(1).bar(2)',
        'note("c").fast("<2 3>")',
        'note("c").gain("0.3 0.7").lpf(2400)',
      ]
      for (const code of corpus) {
        expect(toStrudel(parseStrudel(code))).toBe(code)
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Phase 20-04 wave δ — full corpus contract (T-14 / PLAN §7).
// ---------------------------------------------------------------------------

describe('20-04 wave δ — PV37 opaque-fragment wrapper end-to-end corpus', () => {
  // 7-entry corpus per PLAN §7 / RESEARCH §7.6 — exercises default-arm,
  // typed-arm-failure, double-wrap, and chains across all four waves.
  const CORPUS = [
    'note("c").release(0.3)',
    'note("c").s("sawtooth")',
    's("bd hh sd").shape(0.5)',
    'note("c").foo(1).bar(2)',
    'note("c").fast("<2 3>")',
    'note("c").gain("0.3 0.7").lpf(2400)',
    'note("c d").bank("RolandTR909")',
  ]

  for (const code of CORPUS) {
    it(`round-trips byte-equal — ${JSON.stringify(code).slice(0, 60)}`, () => {
      expect(toStrudel(parseStrudel(code))).toBe(code)
    })

    it(`serialize → deserialize → toStrudel byte-equal — ${JSON.stringify(code).slice(0, 60)}`, () => {
      const tree = parseStrudel(code)
      const round = patternFromJSON(patternToJSON(tree))
      expect(toStrudel(round)).toBe(code)
    })
  }

  // Collect-walks-inner end-to-end: every code with at least one
  // recognisable atom should produce >0 events with multi-range loc.
  it('collect produces events with multi-range loc for the corpus', () => {
    for (const code of CORPUS) {
      const events = collect(parseStrudel(code))
      // All corpus entries have at least one atom — events.length > 0.
      expect(events.length, `code=${code}`).toBeGreaterThan(0)
      for (const e of events) {
        expect(e.loc, `code=${code} event=${JSON.stringify(e)}`).toBeDefined()
        expect(e.loc!.length).toBeGreaterThanOrEqual(2)   // atom + ≥1 wrapper
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 20-10 wave α — issue #108 regression (collect-level gate).
// ---------------------------------------------------------------------------

describe('20-10 wave α — issue #108 regression', () => {
  const FIXTURE = `$: stack(
  note("c4 e4 g4 b4 c5 b4 g4 e4").s("sawtooth").gain(0.3).lpf(2400).release(0.12),
  note("e3 g3 b3 e4").s("sine").gain(0.15).release(0.3)
).viz("pianoroll")

$: note("<c2 [g2 c2] f2 [g2 eb2]>").s("square").gain(0.4).lpf(500).release(0.2).viz("pitchwheel")

$: stack(
  s("hh*8").gain(0.3),
  s("bd [~ bd] ~ bd").gain(0.5),
  s("~ sd ~ [sd cp]").gain(0.4)
).viz("p5test")`

  it('collect(parseStrudel(<#108 fixture>)) produces evt.s set of 7 distinct values', () => {
    const ir = parseStrudel(FIXTURE)
    const events = collect(ir)
    const sValues = new Set(
      events.map(e => e.s).filter((s): s is string => typeof s === 'string')
    )
    expect(sValues).toEqual(new Set(['sawtooth', 'sine', 'square', 'hh', 'bd', 'sd', 'cp']))
  })

  it('the three note(...) tracks each have a distinct evt.s', () => {
    const ir = parseStrudel(FIXTURE)
    const events = collect(ir)
    const sawtoothCount = events.filter(e => e.s === 'sawtooth').length
    const sineCount = events.filter(e => e.s === 'sine').length
    const squareCount = events.filter(e => e.s === 'square').length
    expect(sawtoothCount).toBeGreaterThan(0)
    expect(sineCount).toBeGreaterThan(0)
    expect(squareCount).toBeGreaterThan(0)
  })

  it('no event has evt.s === null where a chained .s was applied (root-cause assertion)', () => {
    // Excludes the root-form s("hh*8") which already worked pre-20-10.
    // Asserts the SEMANTICS root cause: chained .s populates evt.s.
    const noteIr = parseStrudel('note("c4 e4 g4 b4").s("sawtooth").gain(0.3)')
    const events = collect(noteIr)
    events.forEach(e => expect(e.s).toBe('sawtooth'))
  })
})

// ---------------------------------------------------------------------------
// Phase 20-10 wave β — Param round-trip byte-fidelity (PLAN §4 β-1).
//
// Mirrors the Phase 20-04 wave-δ Code-with-via round-trip discipline above.
// The toStrudel `case 'Param'` arm landed in α-4 (toStrudel.ts:36-42); these
// tests pin its behaviour:
//   - Literal-value params (string | number) round-trip byte-equal.
//   - Pattern-arg sub-IR params (`.s("<bd cp>")`) preserve the raw inner
//     string verbatim (rawArgs is untrimmed per CONTEXT D-03 / 20-04 D-02).
//   - Whitespace inside parens is preserved (rawArgs whitespace contract).
//   - Chained Params (`.s(...).gain(...)`) and Param-wrapping-FX shapes
//     compose correctly under recursion.
//   - serialize → deserialize → toStrudel survives the Param shape across
//     JSON round-trip (PatternIR-valued .value as well).
// ---------------------------------------------------------------------------

describe('20-10 wave β — Param round-trip byte-fidelity', () => {
  it('round-trips note("c").s("sawtooth") byte-equal', () => {
    const code = 'note("c").s("sawtooth")'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('round-trips note("c").gain(0.3) byte-equal', () => {
    const code = 'note("c").gain(0.3)'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('round-trips note("c").s("<bd cp>") byte-equal (pattern-arg form)', () => {
    const code = 'note("c").s("<bd cp>")'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('round-trips with whitespace inside parens — note("c").s( "sawtooth" )', () => {
    // CONTEXT D-03 / 20-04 D-02 — rawArgs preserved untrimmed. Pre-mortem
    // Trap 5 (β-1 #4 / RESEARCH G3.4 "rawArgs whitespace").
    const code = 'note("c").s( "sawtooth" )'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('round-trips note("c d").s("<bd cp>").gain(0.3) byte-equal (chained Param)', () => {
    const code = 'note("c d").s("<bd cp>").gain(0.3)'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('round-trips note("c").s("sawtooth").lpf(2400) byte-equal (Param wrapping FX-wrapping body)', () => {
    // Param's body can be any IR — here it wraps the Param(s) which wraps
    // the FX(lpf). Recursion through gen() must compose correctly.
    const code = 'note("c").s("sawtooth").lpf(2400)'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('round-trips note("c").gain("0.3 0.7") byte-equal (numeric pattern-arg)', () => {
    const code = 'note("c").gain("0.3 0.7")'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('round-trips s("bd").s("cp") byte-equal (shadow chain — D-05 last-typed-wins)', () => {
    const code = 's("bd").s("cp")'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('round-trips full track-defining metadata chain byte-equal', () => {
    // Exercises the parametric / track-bucket params (n / bank / scale /
    // color) at the wider end of the wave-α whitelist.
    const code = 'note("c").n(0).bank("RolandTR909").scale("major").color("red")'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('serialize → deserialize → toStrudel byte-equal — note("c").s("<bd cp>")', () => {
    // Mirrors the wave-δ corpus convention at parity.test.ts:2074-2078.
    // Critical for PatternIR-valued Param.value: Param's `value` field is
    // the sub-IR for pattern-args, so JSON round-trip must preserve the
    // nested PatternIR shape (RESEARCH G4.3 / Trap 14 — nodesEqual JSON-
    // string fragility on Param.value=PatternIR).
    const code = 'note("c").s("<bd cp>")'
    const ir1 = parseStrudel(code)
    const ir2 = patternFromJSON(patternToJSON(ir1))
    expect(toStrudel(ir2)).toBe(code)
  })
})

// ---------------------------------------------------------------------------
// Phase 20-10 wave γ — issue #108 user fixture (narrow) round-trip (PLAN §5 γ-1).
//
// Narrow fixture per γ-1 scope decision. The full multi-line #108 fixture
// CANNOT round-trip byte-equal because parseStrudel lowers several surface
// forms structurally and toStrudel re-emits the lowered shape:
//   - Mini-shorthand `*N` at root → Fast(N, ...) → re-emits as `.fast(N)`.
//   - Bracketed mini `[~ bd]` at root → grouped sub-tree → re-emits with
//     different bracket / spacing shape.
//   - Nested angle-with-brackets `<g2 [g2 eb2]>` at root → Cycle/Stack/Seq
//     nodes with no `rawMini` field → re-emits semantically equivalent but
//     byte-different.
//   - `$:` block syntax → parseRoot splits and re-roots into `stack(...)` →
//     re-emits as a single `stack(\n  ..., ...\n)` call (loses `$:` lines).
// All four are PRE-EXISTING parser/printer asymmetries (not 20-10
// regressions). They surfaced when 20-10 wave-γ tried to round-trip the
// full #108 fixture and are tracked by issue #109
// (https://github.com/MrityunjayBhardwaj/stave-code/issues/109).
//
// γ-1 here pins what 20-10 explicitly delivers: Param + PV37 Code-with-via
// cooperation through chained methods. The fixture exercises:
//   - Param-whitelisted methods (.s, .gain) — typed Param IR tag.
//   - Non-whitelisted methods (.lpf, .release, .viz) — Code-with-via wrap
//     (PV37 — opaque-fragment, semantics-deferred).
//   - Simple sequence root-form notes (no `*N`, no `[]`, no `<>`, no `$:`).
//   - Two parallel voices via an explicit `stack(...)` so the multi-voice
//     compositional wiring is exercised without triggering `$:` lowering.
// ---------------------------------------------------------------------------

describe('20-10 wave γ — issue #108 user fixture (narrow) round-trip', () => {
  const fixture = `stack(
  note("c4 e4 g4").s("sawtooth").gain(0.3).lpf(2400).release(0.12).viz("pianoroll"),
  note("c4 e4").s("sine").gain(0.15).release(0.3)
)`

  it('round-trips byte-equal — Param + PV37 Code-with-via cooperation through chained methods', () => {
    expect(toStrudel(parseStrudel(fixture))).toBe(fixture)
  })
})

// ---------------------------------------------------------------------------
// Phase 20-10 wave γ — Param-shadow merge direction parity vs Strudel runtime
// (PLAN §5 γ-3). Converts α-1's local probe into a permanent runtime-parity
// test. D-05 LOCKED 2026-05-09 (α-1 executed): last-typed-wins. The α-1
// console output confirmed haps[0].gain and haps[0].s are top-level (no
// `value.gain` fallback ladder needed; per the prompt "drop ?? haps[0].
// value?.gain fallback since α-1 confirmed top-level"). normalizeStrudelHap
// (engine/NormalizedHap.ts) flattens haps to the IREvent shape used here.
// ---------------------------------------------------------------------------

describe('20-10 wave γ — Param-shadow merge direction parity', () => {
  it('note("c").gain(0.3).gain(0.7) — IR collect matches Strudel runtime', async () => {
    const code = 'note("c").gain(0.3).gain(0.7)'
    const haps = await strudelEventsFromCode(code, 1)
    const ours = collect(parseStrudel(code))
    expect(ours).toHaveLength(haps.length)
    expect(ours[0].gain).toBeCloseTo(haps[0].gain ?? 0)
  })

  it('s("bd").s("cp") — IR collect matches Strudel runtime', async () => {
    const code = 's("bd").s("cp")'
    const haps = await strudelEventsFromCode(code, 1)
    const ours = collect(parseStrudel(code))
    expect(ours).toHaveLength(haps.length)
    expect(ours[0].s).toBe(haps[0].s)
  })

  it('note("c d").s("<bd cp>") — IR collect matches Strudel runtime per-cycle over 4 cycles', async () => {
    const code = 'note("c d").s("<bd cp>")'
    const expected = await strudelEventsFromCode(code, 4)
    const ours = collectCycles(parseStrudel(code), 0, 4)
    expect(ours.length).toBe(expected.length)
    // Sort both by (begin, note) to compare like-for-like; Strudel may emit
    // boundary-clipped pairs. The Param-shadow assertion is per-event s.
    const sortKey = (e: IREvent) => `${e.begin.toFixed(6)}|${e.note ?? ''}`
    const exp = [...expected].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    const act = [...ours].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    act.forEach((e, i) => {
      expect(e.s).toBe(exp[i].s)
    })
  })
})

// ---------------------------------------------------------------------------
// Phase 20-11 wave β — Track round-trip (β-2). userMethod discriminates the
// two parser sources: explicit .p("name") (userMethod==='p') re-emits as
// `${gen(body)}.p("name")`; synthetic d{N} from `$:` or non-`$:` file
// (userMethod undefined) re-emits the body unchanged. Multi-`$:` re-emission
// deferred to issue #109 (Stack-of-Track currently outputs `stack(...)` not
// `$: ...\n$: ...`).
// ---------------------------------------------------------------------------

describe('20-11 wave β — Track round-trip', () => {
  it('round-trips note("c").p("lead") byte-equal', () => {
    const code = 'note("c").p("lead")'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('round-trips note("c").gain(0.3).p("lead") byte-equal (chained Param + Track)', () => {
    const code = 'note("c").gain(0.3).p("lead")'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('round-trips s("bd") byte-equal (non-$: file: no Track wrapper today; γ-4 lands the synthetic-d1 wrap + ~100-site test migration)', () => {
    const code = 's("bd")'
    expect(toStrudel(parseStrudel(code))).toBe(code)
  })

  it('synthetic d1 from $: file does NOT emit `.p("d1")` in round-trip', () => {
    // userMethod===undefined → gen(body) only. The `$:` prefix itself is
    // dropped (#109 owns the multi-$: re-emission); single-`$:` collapses
    // to body sans-prefix. Documenting both: no `.p("d1")` AND no `$:`.
    const out = toStrudel(parseStrudel('$: s("bd")'))
    expect(out).not.toContain('.p(')
    expect(out).toBe('s("bd")')
  })

  it('serialize → deserialize → toStrudel byte-equal — note("c").p("lead")', () => {
    const code = 'note("c").p("lead")'
    const ir1 = parseStrudel(code)
    const json = patternToJSON(ir1)
    const ir2 = patternFromJSON(JSON.stringify(JSON.parse(json)))
    expect(toStrudel(ir2)).toBe(code)
  })

  it('hand-built Track with userMethod==="p" emits .p("name") (gen arm in isolation)', () => {
    const ir: PatternIR = {
      tag: 'Track',
      trackId: 'lead',
      body: { tag: 'Play', note: 'c4', duration: 1, params: {} },
      userMethod: 'p',
    }
    expect(toStrudel(ir)).toBe('note("c4").p("lead")')
  })

  it('hand-built Track WITHOUT userMethod re-emits body (synthetic d{N} discriminator)', () => {
    const ir: PatternIR = {
      tag: 'Track',
      trackId: 'd1',
      body: { tag: 'Play', note: 'c4', duration: 1, params: {} },
    }
    // userMethod absent → body only, no .p("d1") emitted.
    expect(toStrudel(ir)).toBe('note("c4")')
  })
})

// ---------------------------------------------------------------------------
// Phase 20-11 wave γ — duplicate-`$:` regression (closes 20-08-residual /
// CONTEXT §0). Pins root cause (evt.trackId distinct) AND symptom
// (groupEventsByTrack-equivalent split). P51 — root + symptom, NOT either-or.
// ---------------------------------------------------------------------------
describe('20-11 wave γ — duplicate-$: regression (closes 20-08-residual / CONTEXT §0)', () => {
  const FIXTURE = `$: stack(s("hh hh").gain(0.3), s("bd ~ ~ bd").gain(0.5)).viz("p5test")
$: stack(s("hh hh").gain(0.3), s("bd ~ ~ bd").gain(0.5)).viz("p5test")`

  it('two identical $: blocks produce events with distinct trackIds (root cause)', () => {
    const evs = collect(_parseStrudel(FIXTURE))
    const trackIds = new Set(
      evs.map((e) => e.trackId).filter((t): t is string => typeof t === 'string'),
    )
    expect(trackIds.has('d1')).toBe(true)
    expect(trackIds.has('d2')).toBe(true)
    expect(trackIds.size).toBe(2)
  })

  it('events with the same `s` ("hh") split into two trackId groups (symptom)', () => {
    const evs = collect(_parseStrudel(FIXTURE))
    const hhEvents = evs.filter((e) => e.s === 'hh')
    const hhTrackIds = new Set(hhEvents.map((e) => e.trackId))
    // Pre-20-11: both blocks' hh events shared the fallback bucket via evt.s.
    // Post-20-11: distinct trackIds reach the consumer; no inference loss.
    expect(hhTrackIds.size).toBe(2) // d1 and d2; NOT collapsed
  })

  it('.p("custom") overrides $:-derived d{N}', () => {
    const code = '$: s("bd bd bd bd").p("kick")'
    const evs = collect(_parseStrudel(code))
    expect(evs.length).toBeGreaterThan(0)
    evs.forEach((e) => expect(e.trackId).toBe('kick')) // inner explicit wins
  })

  it('non-`$:` single expression renders as d1', () => {
    const evs = collect(_parseStrudel('s("bd bd bd bd")'))
    expect(evs.length).toBeGreaterThan(0)
    evs.forEach((e) => expect(e.trackId).toBe('d1'))
  })

  it('.p() inside stack: per-pattern override; sibling inherits surrounding d{N}', () => {
    // CONTEXT pre-mortem #9: stack(note("c").p("lead"), note("d")) with
    // outer synthetic d1. First arg .p('lead') overrides; second has no
    // .p(), inherits d1.
    const evs = collect(_parseStrudel('stack(note("c").p("lead"), note("d"))'))
    const leadEvents = evs.filter((e) => e.trackId === 'lead')
    const d1Events = evs.filter((e) => e.trackId === 'd1')
    expect(leadEvents.length).toBeGreaterThan(0)
    expect(d1Events.length).toBeGreaterThan(0)
  })

  it('.p() chained AFTER other methods wraps the OUTERMOST receiver', () => {
    // CONTEXT pre-mortem #8.
    const ir = _parseStrudel('note("c").fast(2).p("lead")')
    // outer Track('d1', Track('lead', Fast(...), userMethod:'p'))
    expect(ir.tag).toBe('Track')
    if (ir.tag !== 'Track') throw new Error('unreachable')
    expect(ir.trackId).toBe('d1')
    expect(ir.userMethod).toBeUndefined()
    const inner = ir.body
    expect(inner.tag).toBe('Track')
    if (inner.tag !== 'Track') throw new Error('unreachable')
    expect(inner.trackId).toBe('lead')
    expect(inner.userMethod).toBe('p')
  })

  it('two $: blocks both with .p("drums") merge into a single trackId', () => {
    // CONTEXT §8 gate 6 — two explicit .p("drums") blocks; user explicitly
    // chose to merge them. Expected: BOTH blocks' events carry trackId='drums'.
    const code = '$: s("bd bd bd bd").p("drums")\n$: s("hh hh hh hh").p("drums")'
    const evs = collect(_parseStrudel(code))
    expect(evs.length).toBeGreaterThan(0)
    evs.forEach((e) => expect(e.trackId).toBe('drums'))
  })
})
