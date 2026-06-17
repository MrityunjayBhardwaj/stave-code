/**
 * collect — the "Execute" interpreter for PatternIR.
 *
 * Walks a PatternIR tree and produces IREvent[].
 * The flattening operation: evaluates the tree at a given time range and
 * returns concrete events with absolute time positions.
 *
 * Ownership: collect() CREATES IREvents. It is the sole producer.
 * Consumers (viz, DAW, highlighting) read the resulting array.
 */

import type { PatternIR } from './PatternIR'
import type { IREvent, SourceLocation } from './IREvent'

// ---------------------------------------------------------------------------
// Deterministic seeded PRNG used by the `Degrade` tag. We mirror Strudel's
// legacy random algorithm (signal.mjs:237-258) so per-event drop decisions
// match Strudel's `degradeBy` event-for-event when seed=0:
//   __timeToIntSeed(t) = __xorwise(trunc(frac(t/300) * 2**29))
//   __xorwise(x)       = ((((x<<13)^x) >> 17) ^ ((x<<13)^x)) << 5 ^ ...
//   __intSeedToRand(s) = (s % 2**29) / 2**29
//   rand(t)            = abs(__intSeedToRand(__timeToIntSeed(t + seed)))
// `degradeBy(x)` keeps an event when `rand(begin) > x`, so retention prob
// `p` (our IR convention) corresponds to filtering by `rand < p`.
// All operations done in 32-bit space via Math.imul/|0 to match JS bitwise
// semantics for negative shifts. `RAND_SEED = 0` is the Strudel default.
// ---------------------------------------------------------------------------
const RAND_SEED = 0

function xorwise(x: number): number {
  // 32-bit signed semantics — match Strudel's __xorwise exactly.
  const a = ((x << 13) ^ x) | 0
  const b = ((a >> 17) ^ a) | 0
  return ((b << 5) ^ b) | 0
}

function timeToIntSeed(t: number): number {
  const frac = t / 300 - Math.trunc(t / 300)
  return xorwise(Math.trunc(frac * 536870912))
}

function intSeedToRand(s: number): number {
  return (s % 536870912) / 536870912
}

/**
 * `rand` at time `t` with default seed 0 — deterministic, matches
 * Strudel's `getRandsAtTime(t, 1, 0)` for the legacy RNG path
 * (signal.mjs:262-264, the default in @strudel/core@1.2.6).
 */
function seededRand(t: number, seed: number): number {
  return Math.abs(intSeedToRand(timeToIntSeed(t + seed)))
}

/**
 * `getRandsAtTime(t, n, seed)` mirror — returns `n` deterministic rands
 * derived from a SINGLE time-seed via the xorwise chain. Matches Strudel's
 * `__timeToRandsPrime` (signal.mjs:246-256) verbatim:
 *   seed₀ = __timeToIntSeed(t + seed)
 *   result[i] = __intSeedToRand(seedᵢ)
 *   seedᵢ₊₁ = __xorwise(seedᵢ)
 *
 * Used by `Shuffle` (signal.mjs:368) — `randrun(n)` calls
 * `getRandsAtTime(t.floor().add(0.5), n, randSeed)`, producing n
 * CHAINED rands from one time-seed. This is NOT n independent
 * `seededRand(t+i/n, ...)` calls — those would re-seed the xorwise
 * chain n times. Confirmed against `__timeToRandsPrime` source: when
 * n>1, the seed is xorwised between samples, not re-derived from t.
 *
 * Note `intSeedToRand` is signed (`s % 2**29`) and `seededRand` takes
 * its absolute value; here we follow the same convention so the result
 * matches `__timeToRandsPrime` returning raw values, then absolute
 * value via the consumer (`randrun` later sorts by magnitude — sort key
 * uses raw values; for shuffle's permutation extraction the sign drops
 * out because sort is stable on pairs).
 *
 * BUT: `randrun` does NOT take Math.abs before sorting (signal.mjs:371).
 * It sorts by raw `(a[0] > b[0]) - (a[0] < b[0])`. Mirror that exactly.
 */
function seededRandsAtTime(t: number, n: number, seed: number): number[] {
  if (n === 1) {
    return [Math.abs(intSeedToRand(timeToIntSeed(t + seed)))]
  }
  let s = timeToIntSeed(t + seed)
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    out.push(intSeedToRand(s))
    s = xorwise(s)
  }
  return out
}

/**
 * Append a wrapper IR node's loc range to each event's existing loc array,
 * preserving D-01 innermost-first ordering. Used by class-B/A collect arms
 * to thread parent IR's source range onto produced events without
 * overwriting child-atom provenance.
 *
 * Append, never prepend — child events arriving here may already carry
 * multi-element loc[] (e.g. Play inside Late inside Off); the wrapper's
 * range becomes loc[N], not loc[0]. Consumers reading loc[0] continue
 * to get the most-specific atom range.
 *
 * PV36 / PK13 step 3.
 */
function withWrapperLoc(
  events: IREvent[],
  wrapper?: PatternIR['loc'],
): IREvent[] {
  if (!wrapper || wrapper.length === 0) return events
  const range = wrapper[0]
  return events.map((e) => ({
    ...e,
    loc: e.loc ? [...e.loc, range] : [range],
  }))
}

/**
 * FNV-1a 32-bit hash. Used by `assignNodeId` to derive content-addressed
 * irNodeIds (PV38 D-02). Inputs: `${loc.start}:${loc.end}:${tag}:${position}`.
 *
 * Determinism: pure function, same input → same output.
 * Uniqueness: 32-bit space; corpus-wide collision probability negligible
 * for snapshot-scoped event counts. The uniqueness/lookup-resolves probe
 * in parity.test.ts catches any real-world collision before ship.
 *
 * Why FNV-1a over crypto.subtle.digest: subtle is async; synchronous
 * digestSync does not exist; the entire walk is sync. Why over DJB2: FNV-1a
 * has slightly better avalanche on short keys (the str-length here is ~10).
 *
 * Exported as the documentation-grade public surface for the test harness
 * (`packages/editor/src/ir/__tests__/fnv1a.test.ts`); no other consumer
 * imports it directly — `assignNodeId` is the production caller.
 */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5 // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) // FNV prime, 32-bit safe via Math.imul
  }
  // >>> 0 forces unsigned 32-bit; toString(16) hex; padStart for stable width.
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Compute a stable content-addressed id for an IR node that produced this
 * event (PV38 clause 1 / D-02). Inputs: `loc[0].start + loc[0].end + tag +
 * position`. Hash function: FNV-1a 32-bit, hex-encoded.
 *
 * Under the leaf-only-assignment scheme (RESEARCH DEC-NEW-1), this is
 * called from the Play arm with position=0; future leaf arms (e.g. a
 * hypothetical RawHap tag) can pass meaningful positions if they emit
 * multiple events per direct return.
 *
 * If the IR node is loc-less (which violates PV36 and dev-warns at the
 * collect() boundary), this falls back to start=-1, end=-1 so the id is
 * still produced — but the dev-warn surfaces the underlying contract
 * violation. PV36 enforcement remains the loud gate.
 */
function assignNodeId(ir: PatternIR, position: number): string {
  const start = ir.loc?.[0]?.start ?? -1
  const end = ir.loc?.[0]?.end ?? -1
  return fnv1a(`${start}:${end}:${ir.tag}:${position}`)
}

export interface CollectContext {
  /** Query window start (cycles) */
  begin: number
  /** Query window end (cycles) */
  end: number
  /** Current position within the query window */
  time: number
  /** Current cycle number — used for Every, Cycle selection */
  cycle: number
  /** Base duration for one "slot" in cycles (1 = full cycle) */
  duration: number
  /** Accumulated speed factor (Fast multiplies, Slow divides) */
  speed: number
  /** Inherited parameters from enclosing FX/Ramp nodes */
  params: Record<string, number | string>
  /**
   * Phase 20-11 — populated by Track wrapper arm (β-1). Outer-then-inner
   * spread: nested Track sets ctx.trackId via simple override (last walk-
   * pass wins → outer wins → matches "last-typed-source-wins" because
   * parser places the LAST-chained .p() as the OUTERMOST wrapper).
   * Absent for hand-built IR without Track wrapper (test fixtures); that
   * case yields IREvent.trackId === undefined (omitted via conditional
   * spread in makeEvent — CONTEXT pre-mortem #6).
   */
  trackId?: string
  /**
   * Phase 20-12.1 follow-up — source-position anchor of the OUTERMOST
   * `$:` Track enclosing this event. Set ONCE at the outer Track entry
   * (via `ctx.dollarPos ?? ir.loc?.[0]?.start` — outer-wins so inner
   * `.p()`-wrapped Tracks don't override). Threaded onto events so the
   * timeline can key rows by source position rather than by `.p()` name,
   * preserving slot identity across `.p()` renames.
   */
  dollarPos?: number
  /**
   * Phase 20-12 — populated by voice-defining Stack arm. Each voice-row
   * inside a `$:` block (each `stack(...)` arg) gets a sequential leaf
   * index 0..N-1, threaded onto produced events for chrome sub-row
   * partitioning. RESET to undefined at Track entry so inner Tracks
   * start a fresh leaf counter. Nested voice-defining Stacks continue
   * the parent's counter (sequential numbering across recursion).
   */
  leafIndex?: number
  /**
   * Phase 5a (#386) — set by the Arrange arm to the index of the active
   * time-sequence arm (clip) for the current cycle. Threaded onto produced
   * events so the timeline can attribute events to clips. Unlike leafIndex it
   * is NOT reset at Track entry — an Arrange typically IS the Track body, so
   * its arm index must reach the leaves below it.
   */
  armIndex?: number
}

const DEFAULT_CONTEXT: CollectContext = {
  begin: 0,
  end: Infinity,  // no window by default — all events emitted
  time: 0,
  cycle: 0,
  duration: 1,
  speed: 1,
  params: {},
}

/**
 * Convert a note to frequency in Hz.
 * - String notes: parsed as MIDI note name (c4 = middle C = 261.63 Hz)
 * - Numeric notes: treated as MIDI note number and converted to Hz
 * Returns null if the string format is unrecognised.
 */
/**
 * Count voice-leaves contributed by an IR subtree to its enclosing Track.
 * Mirrors `flattenLeafVoices` in irProjection.ts (app package): voice-
 * defining Stack (`userMethod ∈ {undefined, 'stack'}`) recurses; single-
 * body uniform-modifier wrappers (Code-with-via, Param, FX, Fast, Slow,
 * Elongate, Late, Degrade, Ply, Struct, Swing, Shuffle, Scramble, Chop,
 * When, Every, Loop, Ramp) are peeled; everything else terminates as 1
 * leaf. Used by the Stack arm to advance the leaf counter past a child
 * subtree that may itself contribute multiple leaves (nested voice-
 * defining Stacks). Phase 20-12 — sub-row partition support.
 */
function countLeavesInIR(node: PatternIR): number {
  if (node.tag === 'Stack') {
    if (node.userMethod === undefined || node.userMethod === 'stack') {
      let n = 0
      for (const t of node.tracks) n += countLeavesInIR(t)
      return n
    }
    return 1
  }
  // Peel single-body uniform-modifier wrappers (mirrors flattenLeafVoices
  // peel set in app's irProjection.ts).
  // 20-17 D-1c — discriminate Code.via union: the wrapAsOpaque arm has
  // `inner` (recurse); the literal arm (`{literal:true;raw}`) is a LEAF
  // (do not recurse). A literal node still counts as 1 leaf via the
  // default branch below. Keep the inner truthiness check too — preserves
  // pre-20-17 byte-semantics on the opaque arm.
  if (node.tag === 'Code' && node.via && !('literal' in node.via) && node.via.inner) {
    return countLeavesInIR(node.via.inner)
  }
  switch (node.tag) {
    case 'Param':
    case 'FX':
    case 'Fast':
    case 'Slow':
    case 'Elongate':
    case 'Late':
    case 'Degrade':
    case 'Ply':
    case 'Struct':
    case 'Swing':
    case 'Shuffle':
    case 'Scramble':
    case 'Chop':
    case 'When':
    case 'Every':
    case 'Loop':
    case 'Ramp':
      return countLeavesInIR(node.body)
    // Phase 20-18 Wave A — Signal/Builder chain-ROOT family.
    // LEAF — a recognised chain root contributes one leaf voice (matches
    // default's `return 1` for Code/Play/Pure/... leaves). Made explicit
    // per PK18 FLOOR-grep completeness rule; the default arm stays
    // byte-unchanged (Chesterton — pre-20-18 behaviour preserved).
    case 'Signal':
    case 'Builder':
      return 1
    default:
      return 1
  }
}

function noteToFreq(note: string | number): number | null {
  if (typeof note === 'number') {
    // MIDI note number → Hz (MIDI 69 = A4 = 440 Hz)
    return 440 * Math.pow(2, (note - 69) / 12)
  }
  const noteNames = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b']
  const lower = note.toLowerCase()
  for (let i = 0; i < noteNames.length; i++) {
    const name = noteNames[i]
    if (lower.startsWith(name)) {
      const octaveStr = lower.slice(name.length)
      const octave = parseInt(octaveStr, 10)
      if (!isNaN(octave)) {
        const midi = (octave + 1) * 12 + i
        return 440 * Math.pow(2, (midi - 69) / 12)
      }
    }
  }
  return null
}

function makeEvent(ctx: CollectContext, note: string | number, params: Record<string, unknown>): IREvent {
  const duration = ctx.duration / ctx.speed
  // ctx.params (from FX/Ramp) override Play's own params — Ramp/FX are intentional overrides
  const merged = { ...params, ...ctx.params }
  return {
    begin: ctx.time,
    end: ctx.time + duration,
    endClipped: ctx.time + duration,
    note: note,
    freq: noteToFreq(note),
    s: (merged.s as string | null) ?? null,
    type: merged.s ? 'sample' : 'synth',
    gain: (merged.gain as number) ?? 1,
    velocity: (merged.velocity as number) ?? 1,
    color: (merged.color as string | null) ?? null,
    params: merged,
    // Phase 20-11 — conditional spread: omits the field entirely when
    // ctx.trackId is undefined (hand-built IR without Track wrapper).
    // Avoids polluting IREvent with enumerable `trackId: undefined`
    // (CONTEXT pre-mortem #6 — IREvent.trackId is optional).
    ...(ctx.trackId !== undefined ? { trackId: ctx.trackId } : {}),
    // Phase 20-12.1 follow-up — conditional spread for dollarPos. Absent
    // for hand-built IR (no `$:` Track wrapper); present for parser-
    // produced events. MusicalTimeline uses this as the slot identity
    // when present so `.p()` rename doesn't relocate the row.
    ...(ctx.dollarPos !== undefined ? { dollarPos: ctx.dollarPos } : {}),
    ...(ctx.leafIndex !== undefined ? { leafIndex: ctx.leafIndex } : {}),
    // Phase 5a — conditional spread (mirrors leafIndex). Absent for tracks
    // with no arrangement combinator → timeline treats them as one clip.
    ...(ctx.armIndex !== undefined ? { armIndex: ctx.armIndex } : {}),
  }
}

/**
 * Shared slice-and-place for `Shuffle` and `Scramble` (D-02 — two distinct
 * tags per PV28; one implementation since the arms are ~95% identical).
 *
 * Strudel's `_rearrangeWith(ipat, n, pat)` (signal.mjs:378-381):
 *   pats = [pat.zoom(i/n, (i+1)/n) for i in 0..n]
 *   ipat.fmap(i => pats[i].repeatCycles(n)._fast(n)).innerJoin()
 *
 * For each destination slot `d` in [0, n), the index pattern selects a
 * source slot `s = selector[d]`. We slice body events whose cycle-position
 * falls in `[s/n, (s+1)/n)` and re-emit them at destination slot `d`,
 * preserving the within-slot offset:
 *   newBegin = ctx.cycle + d/n + (sourcePos - s/n)
 *
 * `selector` is a length-n array of source slot indices; the caller
 * (Shuffle / Scramble arms) computes it per-cycle from RNG.
 *
 * `loc` flows through unchanged (PV24 — every IREvent retains its loc).
 */
function _collectRearrange(
  selector: number[],
  n: number,
  body: PatternIR,
  ctx: CollectContext,
  wrapperLoc?: SourceLocation,
): IREvent[] {
  const bodyEvents = walk(body, ctx)
  const out: IREvent[] = []
  for (let d = 0; d < n; d++) {
    const sourceIdx = ((selector[d] % n) + n) % n
    const srcStart = sourceIdx / n
    const srcEnd = (sourceIdx + 1) / n
    const dstStart = d / n
    for (const e of bodyEvents) {
      const cyclePos = e.begin - ctx.cycle
      // Begin-membership in source slot — matches Strudel's zoom which
      // includes events whose onset is in [s/n, (s+1)/n).
      if (cyclePos >= srcStart - 1e-9 && cyclePos < srcEnd - 1e-9) {
        const offsetWithinSrc = cyclePos - srcStart
        const newBegin = ctx.cycle + dstStart + offsetWithinSrc
        const dur = e.end - e.begin
        out.push({
          ...e,
          begin: newBegin,
          end: newBegin + dur,
          endClipped: newBegin + dur,
        })
      }
    }
  }
  // PV36 / D-01 — append the .shuffle(N)/.scramble(N) call-site range
  // after each event's existing loc (innermost stays at loc[0]). When
  // wrapperLoc is omitted (legacy callers), behaviour is unchanged.
  if (!wrapperLoc) return out
  return out.map((e) => ({
    ...e,
    loc: e.loc ? [...e.loc, wrapperLoc] : [wrapperLoc],
  }))
}

/**
 * Walk a PatternIR tree and return a flat array of IREvents.
 *
 * @param ir - the pattern tree to evaluate
 * @param partialCtx - optional context override (begin, end, cycle, etc.)
 */
export function collect(ir: PatternIR, partialCtx?: Partial<CollectContext>): IREvent[] {
  const ctx: CollectContext = { ...DEFAULT_CONTEXT, ...partialCtx }
  const events = walk(ir, ctx)
  // PV36 / D-03 — dev-only loc-completeness catcher. esbuild substitutes
  // process.env.NODE_ENV at build time; production builds dead-code-
  // eliminate the entire block. vitest runs with NODE_ENV='test' so the
  // warn fires alongside the contract test, giving two complementary
  // signals when a future arm ships without loc-propagation.
  //
  // Phase 20-04: ambient process declaration so tsup's dts builder doesn't
  // need @types/node (the editor package intentionally avoids that dep —
  // runtime esbuild-substitution doesn't require it).
  const proc = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process
  if (proc?.env?.NODE_ENV !== 'production') {
    for (const e of events) {
      if (!e.loc || e.loc.length === 0) {
        // eslint-disable-next-line no-console
        console.warn('[PV36] event produced without loc', { ir, event: e })
      }
    }
  }
  return events
}

function walk(ir: PatternIR, ctx: CollectContext): IREvent[] {
  switch (ir.tag) {
    case 'Pure':
      return []

    // Phase 20-18 Wave A — Signal/Builder chain-ROOT family.
    // EVENT-NEUTRAL LEAF — matches Pure's leaf-leaf shape above. A
    // chain-root signal (`sine`, `perlin`, ...) or builder (`irand(12)`,
    // `binary(...)`) without a recursable body contributes no IR-level
    // events on its own; downstream chain methods (carried opaquely by
    // `applyChain` once the root is recognised — Wave-0 ACTION 5 verdict
    // (a)) supply the event semantics. COMPOSE-not-SUBSUME: every
    // existing RNG/Pure/wrapper case below is byte-UNCHANGED (Chesterton —
    // collect.ts already models the RNG chain at line 1095/1124+; we do
    // not touch it). The `body?` field on Builder is OPAQUE-pending →
    // Wave C (chord/arrange ground-first); absent in Wave A, so leaf-
    // event-neutral covers every Wave-A producer output.
    case 'Signal':
    case 'Builder':
      return []

    case 'Track': {
      // Phase 20-11 D-02 — musician-track-identity propagation. Mirrors
      // Param's wrapper-arm shape: spread ctx, set trackId, walk body,
      // thread Track's own loc onto produced events via withWrapperLoc.
      //
      // Outer-then-inner spread: nested Track (e.g. Track('d1', Track('lead'))
      // from `$:` + .p()) overrides correctly — inner walk's spread of
      // {...ctx, trackId: ir.trackId} replaces ctx.trackId in childCtx for
      // that subtree. With parser placing the LAST-chained method as the
      // OUTERMOST wrapper, walk runs outer-first so OUTER wins. This matches
      // the source-order "last-typed-wins" convention (D-05).
      // CONTEXT pre-mortem #1 + RESEARCH G8-Trap C verified safe.
      // Phase 20-12 — RESET leafIndex to undefined at Track entry. Each
      // Track scope owns its own voice-counter; nested Track must not
      // inherit the outer's leafIndex (otherwise inner-track events
      // would carry the outer's leaf id and chrome's sub-row partition
      // would mis-bucket them). The first voice-defining Stack the body
      // reaches initialises the counter at 0.
      // Phase 20-12.1 follow-up — `dollarPos` is OUTER-WINS: only set
      // from this Track's loc when the parent context doesn't already
      // carry one. trackId stays inner-wins (current `.p()` override
      // semantics for the display label).
      const childCtx: CollectContext = {
        ...ctx,
        trackId: ir.trackId,
        dollarPos:
          ctx.dollarPos !== undefined
            ? ctx.dollarPos
            : ir.loc?.[0]?.start,
        leafIndex: undefined,
      }
      return withWrapperLoc(walk(ir.body, childCtx), ir.loc)
    }

    case 'Code': {
      // Phase 20-04 T-09 (D-01 / PV37 / PK13 step 3).
      // Wrapper case: walk via.inner; thread our call-site range onto
      // produced events as loc[N+] per D-01-from-20-03 (innermost first).
      // Parse-failure case (no via): return [] as before — DV-08 unchanged.
      // 20-17 D-1c — discriminate Code.via union: the wrapAsOpaque arm
      // has `inner` events to walk; the literal arm (`{literal:true;raw}`)
      // is a value-leaf with no events (treat as opaque — return []).
      if (ir.via && !('literal' in ir.via)) {
        const innerEvents = walk(ir.via.inner, ctx)
        return withWrapperLoc(innerEvents, ir.loc)
      }
      // Opaque fallback — cannot be evaluated without Strudel runtime
      return []
    }

    case 'Param': {
      // Phase 20-10 — semantics-completeness pair-of PV37. Whitelisted
      // chain methods inject their effect into ctx.params before the body
      // walks, so makeEvent reads the right value at line 230.
      //
      // Two branches:
      //   (a) Literal value (string | number) — last-typed-wins per α-1
      //       (D-05). Diverges from FX merge convention (which is
      //       first-typed-wins; FX bug, follow-up issue).
      //   (b) Pattern-arg value (PatternIR sub-IR) — slot-table pre-walk
      //       (RESEARCH G2.2 Option A). Sub-IR events consumed LOCALLY for
      //       lookup; NEVER pushed onto out (PV36 + RESEARCH G2.3 #5).

      // Branch (a) — literal. Last-typed-wins (D-05): outer wrapper sets
      // the key first; inner wrappers DO NOT override an already-set key.
      // Implemented by spreading `ir.params` FIRST, then `ctx.params`.
      if (typeof ir.value === 'string' || typeof ir.value === 'number') {
        const childCtx: CollectContext = {
          ...ctx,
          params: { [ir.key]: ir.value, ...ctx.params },
        }
        return withWrapperLoc(walk(ir.body, childCtx), ir.loc)
      }

      // Branch (b) — pattern-arg sub-IR.
      // Pre-walk the sub-IR ONCE with the parent ctx — produces a slot
      // table of (begin, endClipped, value) tuples we look up per body event.
      const slotEvents = walk(ir.value, ctx)
      const bodyEvents = walk(ir.body, ctx)
      const isNumericKey =
        ir.key === 'gain' || ir.key === 'velocity' ||
        ir.key === 'pan'  || ir.key === 'speed'

      const out: IREvent[] = bodyEvents.map(e => {
        // Find slot covering this body event's begin time. Half-open
        // interval — [begin, endClipped) — same convention groupEventsByTrack
        // and eventsActiveAt use.
        const slot = slotEvents.find(s => {
          const sEnd = s.endClipped ?? s.end
          return s.begin <= e.begin && e.begin < sEnd
        })
        if (!slot) return e   // silence (`~` slot) — preserve body event unchanged.

        // Coerce slot value: parseMini's Play leaves carry note: string for
        // both sample and value-stream forms (RESEARCH G1.3). Numeric keys
        // → Number(slot.note). Sample/category keys → slot.s ?? String(slot.note).
        const v = isNumericKey
          ? (typeof slot.note === 'number' ? slot.note : Number(slot.note ?? 0))
          : (slot.s ?? String(slot.note ?? ''))

        // Patch event-level fields. The `params` merge follows the literal
        // branch's direction lock. The shorthand top-level fields mirror
        // makeEvent's destructure at collect.ts:230 (s, gain, velocity, color).
        return {
          ...e,
          params: { ...e.params, [ir.key]: v },
          ...(ir.key === 's' ? { s: v as string, type: 'sample' as const } : {}),
          ...(ir.key === 'gain' ? { gain: v as number } : {}),
          ...(ir.key === 'velocity' ? { velocity: v as number } : {}),
          ...(ir.key === 'color' ? { color: v as string } : {}),
          // n / note / bank / scale / pan / speed flow through params only;
          // they don't have top-level event shorthand fields per IREvent.
        }
      })

      // CRITICAL: slotEvents are NOT included in `out`. The sub-IR is a
      // VALUE PROVIDER, not an event producer. Re-emitting them duplicates
      // events AND leaks mini-string-atom loc onto the output (PV36 violation,
      // RESEARCH G8 Trap 10). γ-2 has an event-count test that pins this.
      return withWrapperLoc(out, ir.loc)
    }

    case 'Play': {
      // Respect the query window: skip events outside [begin, end)
      if (ctx.time < ctx.begin || ctx.time >= ctx.end) return []
      const event = makeEvent(ctx, ir.note, { ...ir.params })
      // Propagate parser-side loc onto the produced event so consumers
      // (Inspector click-to-source, Monaco highlighting) can map this
      // event back to its source range. parseMini sets this when it
      // sees an atom; nodes built by hand via IR.play() without loc
      // produce events with loc undefined.
      if (ir.loc && ir.loc.length > 0) event.loc = ir.loc
      // PV38 clause 1 / PK13 step 4 / D-02 — assign content-addressed
      // identity at the Play leaf. Wrapper arms preserve via existing
      // {...e, ...} spread semantics (see withWrapperLoc, line 106-116).
      // Position is 0: Play emits exactly one event per execution.
      event.irNodeId = assignNodeId(ir, 0)
      return [event]
    }

    case 'Sleep':
      // Sleep advances the cursor but produces no events
      return []

    case 'Seq': {
      // Sequential: each child runs after the previous, advancing time.
      // Children weight the available cycle proportionally — default 1
      // per child, with `Elongate(f, body)` declaring weight = f. Total
      // weight is the sum; each slot gets `(weight / total) * ctx.duration`.
      if (ir.children.length === 0) return []
      const weights = ir.children.map(c => (c.tag === 'Elongate' ? c.factor : 1))
      const total = weights.reduce((s, w) => s + w, 0)
      if (total <= 0) return []
      const events: IREvent[] = []
      let cursor = ctx.time
      for (let i = 0; i < ir.children.length; i++) {
        const child = ir.children[i]
        const slotDuration = ctx.duration * (weights[i] / total)
        // Unwrap Elongate so its body sees the weighted slot directly.
        const target = child.tag === 'Elongate' ? child.body : child
        const childCtx: CollectContext = {
          ...ctx,
          time: cursor,
          duration: slotDuration,
        }
        const childEvents = walk(target, childCtx)
        events.push(...childEvents)
        cursor += slotDuration / ctx.speed
      }
      // PV36 — top-level Seq nodes (synthetic from extractTracks) have
      // no loc; user-visible Seq nodes (from sequence(...)) carry their
      // call-site range. withWrapperLoc no-ops when ir.loc is empty.
      return withWrapperLoc(events, ir.loc)
    }

    case 'Stack': {
      // Parallel: all tracks at same time.
      // Phase 20-12 — voice-defining Stack (`userMethod ∈ {undefined,
      // 'stack'}`) assigns sequential `leafIndex` to each child for
      // chrome sub-row partitioning. Nested voice-defining Stacks
      // continue the parent counter (matches flattenLeafVoices'
      // depth-first source-order traversal in irProjection.ts). Stack
      // with userMethod 'layer' / 'jux' / 'off' is a TRANSFORM, not
      // parallel composition — events concatenate without leafIndex
      // re-assignment so the ambient ctx.leafIndex carries through.
      const isVoiceDefining =
        ir.userMethod === undefined || ir.userMethod === 'stack'
      const events: IREvent[] = []
      if (isVoiceDefining) {
        let leafIdx = ctx.leafIndex ?? 0
        for (const track of ir.tracks) {
          const childCtx: CollectContext = { ...ctx, leafIndex: leafIdx }
          events.push(...walk(track, childCtx))
          leafIdx += countLeavesInIR(track)
        }
      } else {
        for (const track of ir.tracks) {
          events.push(...walk(track, ctx))
        }
      }
      // PV36 — synthetic Stack from layer/jux/off carries the call-site
      // range as ir.loc (parseStrudel.ts:392-397/517-522/593-599); that
      // becomes the wrapper provenance on every produced event. Multi-
      // track top-level Stack from extractTracks has no loc; helper
      // no-ops in that case.
      return withWrapperLoc(events, ir.loc)
    }

    case 'Choice': {
      // Probabilistic: pick one branch (seeded determinism deferred to Phase 19)
      const chosen = Math.random() < ir.p ? ir.then : ir.else_
      // PV36 — the .sometimes(...) / .sometimesBy(...) call-site is the
      // wrapper provenance the user clicked.
      return withWrapperLoc(walk(chosen, ctx), ir.loc)
    }

    case 'Every': {
      // Periodic: body fires on matching cycles, default otherwise
      const fires = ctx.cycle % ir.n === 0
      // PV36 — both branches share the .every(n, ...) call-site as wrapper.
      if (fires) return withWrapperLoc(walk(ir.body, ctx), ir.loc)
      if (ir.default_) return withWrapperLoc(walk(ir.default_, ctx), ir.loc)
      return []
    }

    case 'Cycle': {
      // Alternation: pick item based on current cycle
      if (ir.items.length === 0) return []
      const item = ir.items[ctx.cycle % ir.items.length]
      return withWrapperLoc(walk(item, ctx), ir.loc)
    }

    case 'Arrange': {
      // Phase 5a (#386) — weighted multi-cycle alternation (slowcat family).
      // GROUNDED 2026-06-17 against real haps (pattern.mjs:1469-1473):
      //   period P = Σ weight; arm i occupies cycles [start_i, start_i+w_i);
      //   within its span the arm plays at NATURAL rate and its INTERNAL
      //   cycle ADVANCES (so an alternating arm `<a b>` over weight 2 yields
      //   a then b, NOT a then a — verified). So: select the arm by the
      //   modular cycle position, recurse with cycle := localCycle (position
      //   within the arm), keep time/duration so events land in THIS cycle.
      // This is `Cycle` generalised with per-arm weights + arm tagging. The
      // whole-node loc wraps produced events (PV36); each event also carries
      // `armIndex` for clip attribution (the timeline's horizontal partition).
      if (ir.arms.length === 0) return []
      const period = ir.arms.reduce((s, a) => s + (a.weight > 0 ? a.weight : 0), 0)
      if (period <= 0) return []
      const pos = ((ctx.cycle % period) + period) % period
      let acc = 0
      let armIndex = 0
      let localCycle = 0
      for (let i = 0; i < ir.arms.length; i++) {
        const w = ir.arms[i].weight > 0 ? ir.arms[i].weight : 0
        if (pos < acc + w) {
          armIndex = i
          localCycle = pos - acc
          break
        }
        acc += w
      }
      const childCtx: CollectContext = {
        ...ctx,
        cycle: localCycle,
        // Outermost combinator wins (#451): a nested arrange/cat inherits the
        // OUTER arm index rather than overwriting it, so the song timeline sees
        // the top-level arm as ONE clip (the whole nested block) and the clip
        // gesture binds the OUTER combinator. `armIndex` is timeline-only, so
        // this is safe; flat (non-nested) cases keep `ctx.armIndex` undefined
        // here and so use this level's index unchanged.
        armIndex: ctx.armIndex ?? armIndex,
      }
      return withWrapperLoc(walk(ir.arms[armIndex].pattern, childCtx), ir.loc)
    }

    case 'When': {
      // Conditional: evaluate gate string at current time
      // Gate is a mini-notation boolean pattern like "1 0 1 1"
      // Simple evaluation: split by spaces, pick slot by position
      const slots = ir.gate.trim().split(/\s+/)
      if (slots.length === 0) return []
      const slotIndex = Math.floor((ctx.time % 1) * slots.length)
      const slot = slots[Math.min(slotIndex, slots.length - 1)]
      const active = slot !== '0' && slot !== '' && slot !== '~'
      // PV36 — DV-06 atomic gate-token loc is deferred; loc on the
      // entire .mask(...) / .struct(...) call site is sufficient for v1.
      if (active) return withWrapperLoc(walk(ir.body, ctx), ir.loc)
      return []
    }

    case 'FX': {
      // FX adds params metadata — does not affect timing
      const childCtx: CollectContext = {
        ...ctx,
        params: { ...ctx.params, ...ir.params },
      }
      // PV36 — .gain(N) / .pan(N) / .lpf(N) etc. call-site as wrapper.
      return withWrapperLoc(walk(ir.body, childCtx), ir.loc)
    }

    case 'Ramp': {
      // Ramp interpolates a param value over cycles
      const progress = ir.cycles > 0 ? Math.min(ctx.cycle / ir.cycles, 1) : 1
      const value = ir.from + (ir.to - ir.from) * progress
      const childCtx: CollectContext = {
        ...ctx,
        params: { ...ctx.params, [ir.param]: value },
      }
      return withWrapperLoc(walk(ir.body, childCtx), ir.loc)
    }

    case 'Fast': {
      // Strudel `pat.fast(N)` (≡ mini `pat*N`): play `body` N times per
      // cycle. For integer N >= 1 we walk the body N times, each over a
      // slot of width `ctx.duration / N` advancing `ctx.time` by that
      // slot. Speed is also scaled so per-event durations shrink by 1/N.
      // PV36 — duplicates inherit the same loc[1+] (Inspector dedupes by
      // (loc[0], begin) pair). Non-integer factors (rare; e.g. fast(1.5))
      // fall back to compressed-once behaviour pre-fix; full fractional
      // semantics is deferred (would need partial-slot probabilistic
      // sampling like Strudel runtime). factor <= 0 / non-finite is a
      // pathological input → treat as identity.
      const factor = ir.factor
      if (!Number.isFinite(factor) || factor <= 0) {
        return withWrapperLoc(walk(ir.body, ctx), ir.loc)
      }
      if (Number.isInteger(factor) && factor >= 1) {
        const events: IREvent[] = []
        const slotDuration = ctx.duration / factor
        for (let i = 0; i < factor; i++) {
          const childCtx: CollectContext = {
            ...ctx,
            time: ctx.time + i * slotDuration,
            duration: slotDuration,
            // Don't scale speed: the duration shrink already encodes the
            // "twice as fast" semantic for the iterated body. Multiplying
            // speed too would double-shrink Play durations and Seq cursor
            // advance (`slotDuration / ctx.speed`), leaving inter-slot
            // gaps that violate the "fill the cycle" expectation.
          }
          events.push(...walk(ir.body, childCtx))
        }
        return withWrapperLoc(events, ir.loc)
      }
      // Non-integer factor: legacy compressed-once behaviour.
      const childCtx: CollectContext = {
        ...ctx,
        speed: ctx.speed * factor,
        duration: ctx.duration,
      }
      return withWrapperLoc(walk(ir.body, childCtx), ir.loc)
    }

    case 'Slow': {
      // Strudel `pat.slow(N)`: play body once over N cycles. For our
      // single-cycle collect window, only the FRACTION of body's events
      // that falls within `[ctx.begin, ctx.end)` is visible. Walking body
      // once with `duration *= N` and `speed /= N` puts the first
      // 1/N-fraction of body's events into the current cycle window;
      // Play's window-clip in the leaf arm filters out events outside it.
      // For integer N >= 2, that means only events in body's first slot
      // appear in cycle 0. Cycle 1 sees the next 1/N. Approximation: for
      // a single-event Play body, slow(N) shows the event in cycle 0
      // only with longer duration. PV36 loc preserved via withWrapperLoc.
      const factor = ir.factor
      if (!Number.isFinite(factor) || factor <= 0) {
        return withWrapperLoc(walk(ir.body, ctx), ir.loc)
      }
      const childCtx: CollectContext = {
        ...ctx,
        speed: ctx.speed / factor,
        duration: ctx.duration,
      }
      return withWrapperLoc(walk(ir.body, childCtx), ir.loc)
    }

    case 'Loop': {
      // Loop is structural — the scheduler handles repetition.
      // collect() evaluates body once (for the current cycle window).
      return withWrapperLoc(walk(ir.body, ctx), ir.loc)
    }

    case 'Elongate': {
      // Inside a Seq parent the weight is consumed there. Standalone
      // (e.g. `Elongate(2, Play(c4))` at the top level) is degenerate
      // — there is no sibling to take time from, so we just walk the
      // body unchanged. The factor is recoverable from the tree if a
      // future consumer needs structural intent.
      return withWrapperLoc(walk(ir.body, ctx), ir.loc)
    }

    case 'Late': {
      // Strudel's late(t) = early(-t). early(t) does
      //   pat.withQueryTime(t => t.add(offset)).withHapTime(t => t.sub(offset))
      // (pattern.mjs:2061-2069). The net effect is a forward time shift
      // by `offset` cycles that PRESERVES cycle length — i.e., events
      // wrap modulo 1 within the current cycle window.
      //
      // Per-cycle collect (ctx.begin..ctx.end == [cycle, cycle+1)) means
      // the wrap reduces to: shifted begin >= cycle+1 → subtract 1;
      // shifted begin < cycle → add 1. For offsets in (-1, 1) — the
      // overwhelming-typical Strudel use case — at most one wrap unit is
      // needed.
      const events = walk(ir.body, ctx)
      const shifted = events.map((e) => {
        let begin = e.begin + ir.offset
        let end = e.end + ir.offset
        let endClipped = e.endClipped + ir.offset
        if (begin >= ctx.cycle + 1) {
          begin -= 1
          end -= 1
          endClipped -= 1
        } else if (begin < ctx.cycle) {
          begin += 1
          end += 1
          endClipped += 1
        }
        return { ...e, begin, end, endClipped }
      })
      // PV36 — .late(t) call-site (or off-derived synthetic Late carrying
      // the .off(...) range as ir.loc per parseStrudel.ts:585-588).
      return withWrapperLoc(shifted, ir.loc)
    }

    case 'Degrade': {
      // Strudel's `degradeBy(x)` (signal.mjs:699-706) is
      //   pat._degradeByWith(rand, x)
      //   = pat.fmap(a => _ => a).appLeft(rand.filterValues(v => v > x))
      // i.e. keep events where `rand` at the event's time STRICTLY
      // EXCEEDS x. Strudel's amount `x` is the drop probability; our
      // IR's `p` is the retention probability, so x = 1 - p.
      // Retention condition: `seededRand(begin) > (1 - p)`.
      //
      // The strictness matters at boundaries:
      //   degradeBy(0) ⇒ keep when rand > 0 — drops events whose rand
      //                  samples to exactly 0 (e.g. the t=0 hap on
      //                  legacy RNG). Verified against Strudel:
      //                  `s("bd hh sd cp").degradeBy(0)` returns 3 haps
      //                  not 4 (bd@0 dropped because rand(0) = 0 fails
      //                  `> 0`).
      //   degradeBy(1) ⇒ keep when rand > 1 — never (rand ∈ [0,1)).
      //
      // The seededRand helper mirrors Strudel's legacy __timeToRands
      // for seed=0 verbatim, so the drop set matches event-for-event
      // when event onsets match.
      const events = walk(ir.body, ctx)
      const dropAmount = 1 - ir.p
      const survivors = events.filter(
        (e) => seededRand(e.begin, RAND_SEED) > dropAmount,
      )
      // PV36 — .degrade() / .degradeBy(x) call-site as wrapper.
      return withWrapperLoc(survivors, ir.loc)
    }

    case 'Chunk': {
      // Strudel's `chunk(n, func)` (pattern.mjs:2569-2578):
      //   binary = [true, false × (n-1)]
      //   binary_pat = _iter(n, sequence(binary), true)
      //   pat = pat.repeatCycles(n)
      //   return pat.when(binary_pat, func)
      //
      // `repeatCycles(n)` (pattern.mjs:2530-2545) does NOT slow the body
      // — it repeats the SAME source cycle on every outer cycle. The
      // rotated binary pattern picks slot k mod n on cycle k, and `func`
      // is applied to events whose time-within-cycle falls in the active
      // slot. So on each outer cycle we see the FULL body, with the
      // transform applied to the slot-k events and the un-transformed
      // body events filling the rest. Verified directly:
      //   s("bd hh sd cp").chunk(4, x=>x.gain(0.5)) over 4 cycles emits
      //   16 haps (4 per cycle), and exactly 4 of them carry gain=0.5
      //   (one per cycle, rotating through bd,hh,sd,cp).
      //
      // Algorithm: walk both `body` and `transform` for the current
      // ctx (NOT a rebuilt single-cycle ctx — Strudel queries the full
      // outer cycle's body unchanged). For events whose time-within-
      // cycle falls in the active slot [slot/n, (slot+1)/n), take the
      // transform's version (matched by event begin within tolerance).
      // For events outside the active slot, take the body version.
      // `loc` flows through naturally because both walks pass ctx
      // unchanged (PV24).
      //
      // v1 limitation (PLAN pre-mortem #3): bodies that are themselves
      // multi-cycle aren't fully captured — Strudel's `repeatCycles`
      // resamples every outer cycle to the SAME source cycle, so a
      // multi-cycle body would freeze at source cycle 0. Our IR walks
      // the body with the outer cycle's ctx, so it naturally advances —
      // the divergence shows up as different events on cycles 1..n-1.
      // Single-cycle bodies (the common case) are exact.
      const slot = ((ctx.cycle % ir.n) + ir.n) % ir.n
      const slotStart = slot / ir.n
      const slotEnd = (slot + 1) / ir.n
      const baseEvents = walk(ir.body, ctx)
      const transformedEvents = walk(ir.transform, ctx)
      const inSlot = (e: IREvent): boolean => {
        const cyclePos = e.begin - ctx.cycle
        return cyclePos >= slotStart - 1e-9 && cyclePos < slotEnd - 1e-9
      }
      // Index transformed events by begin so we can swap the matching
      // body event with its transformed counterpart. We compare with
      // tolerance because Strudel uses Fraction; our IR uses Number.
      const findTransformed = (e: IREvent): IREvent | undefined =>
        transformedEvents.find((t) => Math.abs(t.begin - e.begin) < 1e-9)
      const composed = baseEvents.map((e) => {
        if (inSlot(e)) {
          const replaced = findTransformed(e)
          return replaced ?? e
        }
        return e
      })
      // PV36 — .chunk(n, transform) call-site as wrapper. Both branches
      // (replaced and pass-through) need it; map after the swap.
      return withWrapperLoc(composed, ir.loc)
    }

    case 'Pick': {
      // Strudel's `pick(lookup)` (pick.mjs:44-54) is
      //   pat.fmap(i => lookup[clamp(round(i), 0, len-1)]).innerJoin()
      // i.e. for each event of `selector`, look up the sub-pattern at
      // index = clamp(round(value)) and play that pattern at the
      // selector event's time slot. innerJoin queries the inner pattern
      // over the outer event's whole window.
      //
      // Algorithm: walk the selector with the current ctx. For each
      // selector event, derive its value-as-index, fetch lookup[idx],
      // and walk it with a sub-context restricted to the selector
      // event's [begin, end) slot. The sub-IR walks at its own cycle 0
      // — matches innerJoin semantics (each outer event resets the
      // inner pattern's cycle origin).
      //
      // v1 limitation (PLAN pre-mortem #2): array-form lookup only;
      // selector must produce numeric values. Object/named-key form
      // and non-numeric selectors are deferred to a follow-up.
      // RESEARCH §1.4.
      if (ir.lookup.length === 0) return []
      const selectorEvents = walk(ir.selector, ctx)
      const out: IREvent[] = []
      for (const sel of selectorEvents) {
        const rawIdx = typeof sel.note === 'number'
          ? sel.note
          : Number(sel.note ?? 0)
        const idx = Math.max(0, Math.min(ir.lookup.length - 1, Math.round(rawIdx)))
        const subIR = ir.lookup[idx]
        const subDuration = sel.end - sel.begin
        const subCtx: CollectContext = {
          ...ctx,
          time: sel.begin,
          cycle: 0,
          duration: subDuration,
          begin: sel.begin,
          end: sel.end,
          // Inherit accumulated speed/params; the sub-pattern walks at
          // its own cycle 0 within the selector event's slot.
        }
        const subEvents = walk(subIR, subCtx)
        // PV36 / D-01 — multi-range loc: lookup atom is innermost
        // (loc[0]), selector is loc[1], .pick(...) call-site is loc[2].
        // Replaces the pre-PV36 conditional-assignment shape (which only
        // wrote selector.loc when child lacked one). When the child has
        // its own loc it stays at loc[0]; consumers reading loc[0]
        // continue to get the most-specific atom range.
        const selectorLoc = sel.loc?.[0]
        const wrapperLoc = ir.loc?.[0]
        for (const e of subEvents) {
          const childLoc = e.loc ?? []
          const newLoc = [
            ...childLoc,
            ...(selectorLoc ? [selectorLoc] : []),
            ...(wrapperLoc ? [wrapperLoc] : []),
          ]
          out.push(newLoc.length > 0 ? { ...e, loc: newLoc } : e)
        }
      }
      return out
    }

    case 'Struct': {
      // Strudel's `struct(mask)` (pattern.mjs:1161-1163):
      //   struct(mask, pat) = pat.keepif.out(mask)
      // _opOut is `this.fmap(keepif).appRight(reify(mask))` (pattern.mjs:748).
      // appRight (pattern.mjs:218-237) queries the mask, then for each mask
      // hap queries `this` over the MASK HAP'S SPAN, producing one output
      // hap per (mask hap, intersecting body hap). The output's `whole` and
      // `part` come from the mask (structure from right), the value comes
      // from `this`. Net effect: re-times body's value-stream to mask onsets,
      // and a body event spanning multiple mask slots can produce multiple
      // output events (one per intersecting mask onset). RESEARCH §1.2; P43
      // (the Strudel docstring's "draws values from pat" understates the
      // intersection-based query — it's not "begin in slot" but
      // "body span intersects slot span").
      //
      // Distinct from When/`.mask("…")` (keepif.in / structure from `this`)
      // which only GATES body events through unchanged.
      //
      // Algorithm: split mask into slots, walk body once with current ctx.
      // For each truthy slot at index i with span [i/N, (i+1)/N), find body
      // events whose cycle-window INTERSECTS the slot span (not just begin
      // inside). Re-emit each at the mask onset with slot-width duration.
      // `loc` flows through unchanged (PV24). Cycle-counter aware via
      // ctx.cycle (no parallel state — re-uses the field threaded through
      // Every/Cycle/Chunk).
      const slots = ir.mask.trim().split(/\s+/)
      const total = slots.length
      if (total === 0) return []
      const bodyEvents = walk(ir.body, ctx)
      const slotWidth = 1 / total
      const out: IREvent[] = []
      for (let i = 0; i < total; i++) {
        const slot = slots[i]
        if (slot === '~' || slot === '0' || slot === '') continue
        const onsetTime = ctx.cycle + i / total
        const slotLo = ctx.cycle + i / total
        const slotHi = ctx.cycle + (i + 1) / total
        for (const e of bodyEvents) {
          // Span-intersection: event covers [e.begin, e.end). Intersects
          // slot when e.begin < slotHi AND e.end > slotLo.
          if (e.begin < slotHi - 1e-9 && e.end > slotLo + 1e-9) {
            out.push({
              ...e,
              begin: onsetTime,
              end: onsetTime + slotWidth,
              endClipped: onsetTime + slotWidth,
            })
          }
        }
      }
      // PV36 — .struct("...") call-site as wrapper. DV-06 atomic gate-
      // token loc is deferred.
      return withWrapperLoc(out, ir.loc)
    }

    case 'Swing': {
      // Strudel's `swing(n)` (pattern.mjs:2193) = `pat.swingBy(1/3, n)`
      // = `pat.inside(n, late(seq(0, 1/6)))` (pattern.mjs:2184).
      // `inside(n, f)` (pattern.mjs:1971-1973) is `f(pat._slow(n))._fast(n)`,
      // which net-effect on the active cycle delays events in odd-numbered
      // slots (of n total slots in [0, 1)) by `1/(6n)` cycles. RESEARCH §1.3.
      //
      // Narrow tag per D-03 — the faithful desugar would require an
      // `Inside` primitive (the Strudel author's idiomatic "do this at a
      // larger time-scale, then shrink back"), but Inside has its own
      // family (outside/zoom/compress) and warrants its own phase. We
      // model `Swing` directly via slot-index lateness, accepting that
      // when `Inside` lands later, this collect arm rewrites (~10 lines).
      // The shape `{ n; body }` is locked — no extra fields — to keep
      // the future migration cheap (Pre-mortem #6).
      //
      // Per PV28 we do NOT desugar via Fast (Fast scales speed, doesn't
      // re-play body — same trap that promoted Ply to a forced tag).
      // Instead we apply lateness directly to body events.
      const events = walk(ir.body, ctx)
      if (ir.n < 1) return withWrapperLoc(events, ir.loc)
      const swingAmount = 1 / (6 * ir.n)
      const swung = events.map((e) => {
        const cyclePos = e.begin - ctx.cycle
        const slotIdx = Math.floor(cyclePos * ir.n)
        if (slotIdx % 2 === 1) {
          return {
            ...e,
            begin: e.begin + swingAmount,
            end: e.end + swingAmount,
            endClipped: (e.endClipped ?? e.end) + swingAmount,
          }
        }
        return e
      })
      // PV36 — .swing(n) call-site as wrapper. Both branches (swung and
      // pass-through) need it; map after the lateness application.
      return withWrapperLoc(swung, ir.loc)
    }

    case 'Ply': {
      // Strudel's `ply(factor)` (pattern.mjs:1905-1911):
      //   ply(factor, pat) = pat.fmap(x => pure(x)._fast(factor)).squeezeJoin()
      // Per-event semantics: each emitted hap of `pat` becomes `factor` rapid
      // copies, each filling 1/factor of the original event's slot. The body
      // itself plays once at its normal time scale; ply only multiplies events
      // *within* their existing slots.
      //
      // Why a tag, not a desugar — empirical probe (Phase 19-03 Task 10):
      //   Fast(n, Seq(body × n)) compresses everything into [0, 1/n) because
      //   our Fast scales speed (cursor advances at slotDuration / speed).
      //   For `s("bd hh sd cp").ply(3)` the desugar gives 12 events spanning
      //   [0, 1/3) at spacing 1/36 — wrong (Strudel gives [0, 1) at 1/12).
      //   No structural rewrite using existing primitives reproduces ply's
      //   per-event multiplication while preserving cycle length, so ply is
      //   a forced new tag (D-02 rule).
      //
      // Algorithm: walk body to get its events, then for each event emit n
      // copies whose `begin` and `end` carve up the original [begin, end)
      // window. `loc` flows through the spread (PV24).
      const baseEvents = walk(ir.body, ctx)
      if (ir.n <= 1) return withWrapperLoc(baseEvents, ir.loc)
      const out: IREvent[] = []
      for (const e of baseEvents) {
        const slotLen = (e.end - e.begin) / ir.n
        for (let i = 0; i < ir.n; i++) {
          const newBegin = e.begin + i * slotLen
          const newEnd = newBegin + slotLen
          out.push({
            ...e,
            begin: newBegin,
            end: newEnd,
            endClipped: newEnd,
          })
        }
      }
      // PV36 — .ply(n) call-site as wrapper. The n duplicates per source
      // event share child atom (loc[0]) AND ply call-site (loc[1+]).
      return withWrapperLoc(out, ir.loc)
    }

    case 'Shuffle': {
      // Strudel's `shuffle(n)` (signal.mjs:392-394):
      //   shuffle(n, pat) = _rearrangeWith(randrun(n), n, pat)
      // `randrun(n)` (signal.mjs:365-376) produces a per-cycle PERMUTATION
      // of [0..n-1]:
      //   nums = [0..n-1] sorted by getRandsAtTime(t.floor().add(0.5), n, seed)
      //   at slot i, return nums[i]
      //
      // Critical: `getRandsAtTime(t, n, seed)` for n>1 derives ONE time-seed
      // from t and then chains xorwise to produce the n rands — NOT n
      // independent calls at offset times. Mirror this with
      // `seededRandsAtTime(ctx.cycle + 0.5, n, RAND_SEED)` so that for
      // randSeed=0 the permutation matches Strudel event-for-event.
      //
      // Strudel's sort comparator uses raw values (signal.mjs:371) —
      // `(a[0] > b[0]) - (a[0] < b[0])` — so we sort raw, not absolute.
      //
      // PV28: re-time direct via _collectRearrange, NOT through Fast.
      // PV36 — pass .shuffle(n) call-site to the shared helper so both
      // Shuffle and Scramble thread their wrapper provenance the same way.
      if (ir.n < 1) return withWrapperLoc(walk(ir.body, ctx), ir.loc)
      const rands = seededRandsAtTime(ctx.cycle + 0.5, ir.n, RAND_SEED)
      const perm = rands
        .map((r, i) => [r, i] as const)
        .sort((a, b) => (a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0))
        .map((x) => x[1])
      return _collectRearrange(perm, ir.n, ir.body, ctx, ir.loc?.[0])
    }

    case 'Scramble': {
      // Strudel's `scramble(n)` (signal.mjs:405-407):
      //   scramble(n, pat) = _rearrangeWith(_irand(n)._segment(n), n, pat)
      // `_irand(n)` = `rand.fmap(x => Math.trunc(x * n))` (signal.mjs:476).
      // `_segment(n) = struct(pure(true)._fast(n))` (pattern.mjs:2173-2175)
      // re-times the continuous `_irand(n)` signal to slot onsets at i/n.
      // For each slot the signal evaluates at the slot's begin time —
      // `signal((t, ctrl) => …)` queries with `state.span.begin`
      // (signal.mjs:18-21) — i.e. `cycle + slot/n`. Independent samples
      // per slot (with replacement); slices may repeat or not appear.
      //
      // PV28: re-time direct via _collectRearrange, NOT through Fast.
      // PV36 — pass .scramble(n) call-site to the shared helper.
      if (ir.n < 1) return withWrapperLoc(walk(ir.body, ctx), ir.loc)
      const selector: number[] = []
      for (let slot = 0; slot < ir.n; slot++) {
        const r = seededRand(ctx.cycle + slot / ir.n, RAND_SEED)
        selector.push(Math.trunc(r * ir.n))
      }
      return _collectRearrange(selector, ir.n, ir.body, ctx, ir.loc?.[0])
    }

    case 'Chop': {
      // Strudel's `chop(n)` (pattern.mjs:3291-3306):
      //   chop(n, pat) = pat.squeezeBind(o => sequence(slice_objects.map(s => merge(o, s))))
      //   slice_objects[i] = { begin: i/n, end: (i+1)/n }
      //   merge(a, b) = if (a.begin && a.end) {
      //     d = a.end - a.begin
      //     b = { begin: a.begin + b.begin*d, end: a.begin + b.end*d }
      //   }; return Object.assign({}, a, b)
      //
      // Per-event semantics: each source event becomes n sub-events whose
      // time spans carve up the source event's [begin, end) window, AND
      // whose `begin`/`end` PARAMS (sample-buffer addresses) carve up the
      // source event's existing `begin`/`end` controls (default [0, 1) when
      // the source has none). The merge composes nested chops correctly —
      // e.g. Chop(2, Chop(2, body)) yields slot 0: (0, 0.25), slot 1:
      // (0.25, 0.5), etc. on the OUTER level when each sub-slot is itself
      // chopped in two. RESEARCH §1.7.
      //
      // D-04 limitation (PV29 axis-1): this is the IR-level / pattern-level
      // model. Strudel's audio engine ALSO slices the rendered sample buffer
      // at playback using these begin/end controls — that audio-buffer side
      // is axis-5 work in phase 22. Pattern-level event counts and per-event
      // begin/end values match Strudel exactly; runtime audio output will
      // diverge until phase 22 closes the buffer-slicing side.
      //
      // PV28: direct emission per source event, NOT a desugar through Fast.
      // Fast scales speed; it does not re-play the body. The same trap that
      // promoted Ply to a forced tag.
      if (ir.n <= 1) return withWrapperLoc(walk(ir.body, ctx), ir.loc)
      const baseEvents = walk(ir.body, ctx)
      const out: IREvent[] = []
      for (const e of baseEvents) {
        const dur = e.end - e.begin
        const slotLen = dur / ir.n
        // Source event's existing begin/end controls (sample-range
        // addresses). Default to the full buffer [0, 1) when absent.
        const b0 = (e.params?.begin as number | undefined) ?? 0
        const e0 = (e.params?.end as number | undefined) ?? 1
        const d = e0 - b0
        for (let i = 0; i < ir.n; i++) {
          const subBegin = b0 + (i / ir.n) * d
          const subEnd = b0 + ((i + 1) / ir.n) * d
          const newBegin = e.begin + i * slotLen
          out.push({
            ...e,
            begin: newBegin,
            end: newBegin + slotLen,
            endClipped: newBegin + slotLen,
            params: { ...e.params, begin: subBegin, end: subEnd },
          })
        }
      }
      // PV36 — .chop(n) call-site as wrapper. The n sub-events per
      // source event share child atom (loc[0]) + chop call-site (loc[1+]).
      return withWrapperLoc(out, ir.loc)
    }
  }
}

/**
 * Collect events across N consecutive cycles. The single-cycle `collect`
 * emits events in [0, 1); for the timeline (which displays
 * `WINDOW_CYCLES` cycles) we want events filling [0, WINDOW_CYCLES).
 * Loops `collect()` once per cycle with `time = begin = c, end = c + 1`
 * and concatenates results — events from cycle `c` carry begin/end ∈
 * [c, c+1).
 *
 * Promoted from `__tests__/helpers/collectCycles.ts` (extracted in
 * Phase 19-03-08, used by parity tests). Production caller:
 * `StrudelEditorClient` populates `IRSnapshot.events` so the timeline's
 * cycle-1 column isn't empty for static viz patterns. Cross-cycle
 * variation (`<a b c>` alternation, `degrade`, `shuffle`) renders
 * its full per-cycle shape inside the visible window.
 *
 * Phase 20-12 chrome-fidelity fix.
 */
export function collectCycles(
  ir: PatternIR,
  startCycle: number,
  endCycle: number,
): IREvent[] {
  const events: IREvent[] = []
  for (let c = startCycle; c < endCycle; c++) {
    events.push(
      ...collect(ir, {
        cycle: c,
        time: c,
        begin: c,
        end: c + 1,
        duration: 1,
      }),
    )
  }
  return events
}
