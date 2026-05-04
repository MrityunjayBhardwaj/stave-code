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
import type { IREvent } from './IREvent'

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
  }
}

/**
 * Walk a PatternIR tree and return a flat array of IREvents.
 *
 * @param ir - the pattern tree to evaluate
 * @param partialCtx - optional context override (begin, end, cycle, etc.)
 */
export function collect(ir: PatternIR, partialCtx?: Partial<CollectContext>): IREvent[] {
  const ctx: CollectContext = { ...DEFAULT_CONTEXT, ...partialCtx }
  return walk(ir, ctx)
}

function walk(ir: PatternIR, ctx: CollectContext): IREvent[] {
  switch (ir.tag) {
    case 'Pure':
      return []

    case 'Code':
      // Opaque fallback — cannot be evaluated without Strudel runtime
      return []

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
      return events
    }

    case 'Stack': {
      // Parallel: all tracks at same time
      const events: IREvent[] = []
      for (const track of ir.tracks) {
        events.push(...walk(track, ctx))
      }
      return events
    }

    case 'Choice': {
      // Probabilistic: pick one branch (seeded determinism deferred to Phase 19)
      const chosen = Math.random() < ir.p ? ir.then : ir.else_
      return walk(chosen, ctx)
    }

    case 'Every': {
      // Periodic: body fires on matching cycles, default otherwise
      const fires = ctx.cycle % ir.n === 0
      if (fires) return walk(ir.body, ctx)
      if (ir.default_) return walk(ir.default_, ctx)
      return []
    }

    case 'Cycle': {
      // Alternation: pick item based on current cycle
      if (ir.items.length === 0) return []
      const item = ir.items[ctx.cycle % ir.items.length]
      return walk(item, ctx)
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
      if (active) return walk(ir.body, ctx)
      return []
    }

    case 'FX': {
      // FX adds params metadata — does not affect timing
      const childCtx: CollectContext = {
        ...ctx,
        params: { ...ctx.params, ...ir.params },
      }
      return walk(ir.body, childCtx)
    }

    case 'Ramp': {
      // Ramp interpolates a param value over cycles
      const progress = ir.cycles > 0 ? Math.min(ctx.cycle / ir.cycles, 1) : 1
      const value = ir.from + (ir.to - ir.from) * progress
      const childCtx: CollectContext = {
        ...ctx,
        params: { ...ctx.params, [ir.param]: value },
      }
      return walk(ir.body, childCtx)
    }

    case 'Fast': {
      // Time compression: events happen faster (more events per cycle)
      const childCtx: CollectContext = {
        ...ctx,
        speed: ctx.speed * ir.factor,
        duration: ctx.duration,
      }
      return walk(ir.body, childCtx)
    }

    case 'Slow': {
      // Time dilation: events happen slower (fewer events per cycle)
      const childCtx: CollectContext = {
        ...ctx,
        speed: ctx.speed / ir.factor,
        duration: ctx.duration,
      }
      return walk(ir.body, childCtx)
    }

    case 'Loop': {
      // Loop is structural — the scheduler handles repetition.
      // collect() evaluates body once (for the current cycle window).
      return walk(ir.body, ctx)
    }

    case 'Elongate': {
      // Inside a Seq parent the weight is consumed there. Standalone
      // (e.g. `Elongate(2, Play(c4))` at the top level) is degenerate
      // — there is no sibling to take time from, so we just walk the
      // body unchanged. The factor is recoverable from the tree if a
      // future consumer needs structural intent.
      return walk(ir.body, ctx)
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
      return events.map((e) => {
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
      return events.filter((e) => seededRand(e.begin, RAND_SEED) > dropAmount)
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
      return baseEvents.map((e) => {
        if (inSlot(e)) {
          const replaced = findTransformed(e)
          return replaced ?? e
        }
        return e
      })
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
        // Propagate the selector event's loc onto sub-events when the
        // sub-event lacks its own loc (PV24 — every IREvent must carry
        // loc; the selector's loc is the closest source range).
        for (const e of subEvents) {
          if (!e.loc && sel.loc) e.loc = sel.loc
          out.push(e)
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
      return out
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
      if (ir.n <= 1) return baseEvents
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
      return out
    }
  }
}
