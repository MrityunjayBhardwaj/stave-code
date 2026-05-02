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
  }
}
