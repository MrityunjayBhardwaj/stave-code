/**
 * structuralWalk — the "keep" half of the collect.ts split (#945).
 *
 * `collect.ts` conflates two jobs: deriving lane STRUCTURE from source spans, and computing
 * BEHAVIOUR (onsets) by re-implementing Strudel's RNG / euclid / weighting. The split moves
 * behaviour to Strudel's own `queryArc` and keeps structure here — because the lane anchors
 * (`dollarPos` / `leafIndex` / `armIndex`) are sourced from source-span structure, which haps
 * do not carry, so haps must JOIN to a structural walk rather than replace it. See
 * `COLLECT-SPLIT-AUDIT.md` for the consumer map and `collect.ts:486/651/745` for where the
 * anchors are set today.
 *
 * This walk owns two properties the hap stream cannot give:
 *   1. the anchors above (lane / voice-row / clip identity from source position); and
 *   2. per-node resilience — a syntactically-valid but semantically-invalid sub-node (an
 *      unresolved binding, a mid-edit) degrades only its own lane, where `evaluate` throws and
 *      blanks everything. The timeline's lane skeleton must survive mid-edit code.
 *
 * Phase 1 (#973) IMPLEMENTS the seam by mirroring collect's ANCHOR threading (Track → dollarPos
 * outer-wins + leafIndex reset; voice-Stack → sequential leafIndex; Arrange/Cycle → per-cycle
 * arm selection) and its `withWrapperLoc` loc-layering, while DROPPING the behaviour (timing,
 * window-clip, RNG, euclid). It emits one structural item per leaf reached, then aggregates to
 * per-lane skeletons with the SAME first-wins rules `timelineMarks.ts` applies to collect's
 * events — so `aggregateLaneItems` is shared with the gate's oracle and the two cannot drift.
 *
 * A structural walk reaches leaves collect's onset/window logic would drop, so structuralWalk
 * may report ADDITIONAL lanes (the resilience it adds). For every lane collect DOES produce,
 * the anchors match byte-for-byte — proven over the corpus by `structuralWalk.test.ts`.
 */
import type { PatternIR } from './PatternIR'
import type { SourceLocation } from './IREvent'

/**
 * One lane of the timeline, described purely by SOURCE STRUCTURE — no onsets, no timing.
 * Marks (which notes play, and when) are joined on later from `queryArc` haps by source-span
 * containment (Phase 2, #974). Every offset is a char position into the evaluated source.
 *
 * Mirrors the per-lane maps `timelineMarks.ts` builds today from the event stream
 * (`labelOffsetByLane` / `sourceByLane` / `arrangeByLane` / `armByCycleByLane` /
 * `armLabelByLane`) — but produced directly from the IR, not reduced from onsets.
 */
export interface LaneSkeleton {
  /** Lane identity — the same key `laneKeyOf` derives, so hap attribution and the structural
   *  walk agree on which lane is which. */
  laneKey: string
  /** `$:`/`bass:` statement offset — the label anchor (`dollarPos`; `collect.ts:486`). Absent
   *  for a hand-built or single-expression IR with no statement. */
  dollarPos?: number
  /** Innermost content anchor — the leaf/mini offset used for expand→bind (the first-event
   *  `loc[0].start` `sourceByLane` keeps today). */
  sourceOffset?: number
  /** Outermost combinator offset — the `arrange`/`cat` call start used for clip gestures
   *  (`arrangeByLane`; excludes the `$:` wrapper loc per #456). */
  arrangeOffset?: number
  /** Voice-row index within a `stack(...)` (`leafIndex`; `collect.ts:651`). Absent for a
   *  single-voice lane. */
  leafIndex?: number
  /** Active arrange arm (clip) per integer cycle, index by cycle (`armByCycleByLane`). Absent
   *  for a lane with no arrangement combinator. Length == `nCycles`. */
  armByCycle?: Array<number | undefined>
  /** Arm index → its display label (first arm event's sample/note; `armLabelByLane`). */
  armLabels?: Map<number, string>
}

/**
 * A single structural leaf hit — the raw input to `aggregateLaneItems`. Both structuralWalk
 * (from the IR) and the gate's oracle (from collect's `IREvent[]`) produce these, so the
 * per-lane reduction is byte-identical by construction.
 */
export interface LaneItem {
  laneKey: string
  /** Integer cycle this leaf was reached in (`floor(begin)` for a collect event). */
  cycle: number
  dollarPos?: number
  leafIndex?: number
  armIndex?: number
  loc?: readonly SourceLocation[]
  /** `s ?? String(note)` — the arm-label source (`armLabelByLane`). */
  labelValue?: string
}

/**
 * Reduce raw leaf items to per-lane skeletons, first-seen lane order, FIRST-WINS on every
 * anchor — the exact reduction `timelineMarks.ts:133-200` runs over collect's events. Shared
 * between structuralWalk and the corpus gate's oracle so neither can drift from the other.
 */
export function aggregateLaneItems(items: readonly LaneItem[], nCycles: number): LaneSkeleton[] {
  const order: string[] = []
  const byKey = new Map<string, LaneSkeleton>()
  const armByCycle = new Map<string, Array<number | undefined>>()
  const armLabels = new Map<string, Map<number, string>>()

  for (const it of items) {
    let lane = byKey.get(it.laneKey)
    if (!lane) {
      lane = { laneKey: it.laneKey }
      byKey.set(it.laneKey, lane)
      order.push(it.laneKey)
    }
    // FIRST-WINS anchors (mirrors sourceByLane / labelOffsetByLane / arrangeByLane / leafIndex).
    if (lane.dollarPos === undefined && it.dollarPos !== undefined) lane.dollarPos = it.dollarPos
    if (lane.sourceOffset === undefined && it.loc && it.loc.length > 0) {
      const s = it.loc[0]?.start
      if (typeof s === 'number' && Number.isFinite(s)) lane.sourceOffset = s
    }
    if (lane.arrangeOffset === undefined && it.loc && it.loc.length > 0) {
      let outer: number | undefined
      for (const l of it.loc) {
        const s = l?.start
        if (typeof s !== 'number' || !Number.isFinite(s)) continue
        // Skip the `$:` Track-wrapper loc (#456): it starts before every combinator.
        if (it.dollarPos !== undefined && s === it.dollarPos) continue
        if (outer === undefined || s < outer) outer = s
      }
      if (outer !== undefined) lane.arrangeOffset = outer
    }
    if (lane.leafIndex === undefined && it.leafIndex !== undefined) lane.leafIndex = it.leafIndex
    // Arrange clips: per-cycle arm index + per-arm label. Only lanes carrying an armIndex.
    if (typeof it.armIndex === 'number') {
      let byCycle = armByCycle.get(it.laneKey)
      if (!byCycle) {
        byCycle = new Array<number | undefined>(nCycles)
        armByCycle.set(it.laneKey, byCycle)
      }
      if (it.cycle >= 0 && it.cycle < nCycles) byCycle[it.cycle] = it.armIndex
      let labels = armLabels.get(it.laneKey)
      if (!labels) {
        labels = new Map()
        armLabels.set(it.laneKey, labels)
      }
      if (!labels.has(it.armIndex) && it.labelValue != null) labels.set(it.armIndex, it.labelValue)
    }
  }

  return order.map((key) => {
    const lane = byKey.get(key) as LaneSkeleton
    const byCycle = armByCycle.get(key)
    if (byCycle) lane.armByCycle = byCycle
    const labels = armLabels.get(key)
    if (labels) lane.armLabels = labels
    return lane
  })
}

/** Structural context — the anchor-carrying subset of collect's `CollectContext` (no
 *  time/duration/speed/window).
 *
 *  Two distinct cycle notions, which MUST NOT be conflated (the multitrack-arrange bug #974):
 *  - `cycle` is the SELECTION cycle — it descends into nested Arrange/Cycle arms (localCycle) so
 *    an inner combinator picks its own arm, mirroring Strudel's slowcat-local time.
 *  - `outputCycle` is the OUTER SONG cycle — constant for one top-level walk, and the cycle a
 *    reached leaf is BUCKETED under (collect's `floor(begin)`). `armByCycle` indexes by this, so
 *    an arrange arm spanning cycles 4–7 lands on 4–7, not on its arm-local 0–3.
 */
interface StructCtx {
  cycle: number
  outputCycle: number
  trackId?: string
  dollarPos?: number
  leafIndex?: number
  armIndex?: number
  params: Record<string, number | string>
}

/** Append a wrapper node's loc[0] to each item's loc array, innermost-first — the structural
 *  mirror of collect's `withWrapperLoc` (collect.ts:106). */
function withWrapperLoc(items: LaneItem[], wrapper?: PatternIR['loc']): LaneItem[] {
  if (!wrapper || wrapper.length === 0) return items
  const range = wrapper[0]
  return items.map((it) => ({ ...it, loc: it.loc ? [...it.loc, range] : [range] }))
}

/** Count voice-leaves a subtree contributes to its Track, tolerating a malformed sub-node — a
 *  best-effort 1 keeps the leafIndex counter advancing so a bad arm degrades only itself (PV212)
 *  instead of throwing out of the Stack loop (which runs OUTSIDE `recurse`'s per-node guard). */
function safeCountLeaves(node: PatternIR): number {
  try {
    return countLeavesInIR(node)
  } catch {
    return 1
  }
}

/** Count voice-leaves a subtree contributes to its Track — mirror of collect.ts:246 so the
 *  Stack leafIndex counter advances identically. */
function countLeavesInIR(node: PatternIR): number {
  if (node.tag === 'Stack') {
    if (node.userMethod === undefined || node.userMethod === 'stack') {
      let n = 0
      for (const t of node.tracks) n += countLeavesInIR(t)
      return n
    }
    return 1
  }
  if (node.tag === 'Code' && node.via && !('literal' in node.via) && node.via.inner) {
    return countLeavesInIR(node.via.inner)
  }
  switch (node.tag) {
    case 'Param':
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
    default:
      return 1
  }
}

/**
 * Walk the IR for one cycle, emitting a structural item per leaf reached. Anchor threading
 * mirrors collect's `walk` (collect.ts:440); timing / window-clip / RNG are dropped. Every
 * child recursion is wrapped so a throwing sub-node degrades only its branch, never the walk.
 */
function walkCycle(ir: PatternIR, ctx: StructCtx): LaneItem[] {
  const recurse = (node: PatternIR, childCtx: StructCtx): LaneItem[] => {
    try {
      return walkCycle(node, childCtx)
    } catch {
      // Per-node resilience (#945 §4): a bad sub-node blanks only itself.
      return []
    }
  }

  switch (ir.tag) {
    case 'Pure':
    case 'Signal':
    case 'Builder':
    case 'Sleep':
      return []

    case 'Track': {
      const childCtx: StructCtx = {
        ...ctx,
        trackId: ir.trackId,
        dollarPos: ctx.dollarPos !== undefined ? ctx.dollarPos : ir.loc?.[0]?.start,
        leafIndex: undefined,
      }
      return withWrapperLoc(recurse(ir.body, childCtx), ir.loc)
    }

    case 'Code': {
      if (ir.via && !('literal' in ir.via)) {
        return withWrapperLoc(recurse(ir.via.inner, ctx), ir.loc)
      }
      return []
    }

    case 'Param': {
      // Branch (a) — literal: inject the key so a leaf's laneKey/label sees it (last-wins:
      // ir.params first, ctx.params second). Branch (b) — pattern-arg: the sub-IR is a VALUE
      // provider collect never emits, and it patches non-lane fields on existing body events;
      // walk only the body for structure (the rare chained `.s("<a b>")` per-event relabel is
      // a behaviour concern the gate flags if the corpus hits it).
      if (typeof ir.value === 'string' || typeof ir.value === 'number') {
        const childCtx: StructCtx = { ...ctx, params: { [ir.key]: ir.value, ...ctx.params } }
        return withWrapperLoc(recurse(ir.body, childCtx), ir.loc)
      }
      return withWrapperLoc(recurse(ir.body, ctx), ir.loc)
    }

    case 'Play': {
      const merged = { ...ir.params, ...ctx.params }
      const s = (merged.s as string | undefined) ?? undefined
      const laneKey = ctx.trackId ?? s ?? '$default'
      const labelValue = s ?? (ir.note != null ? String(ir.note) : undefined)
      const item: LaneItem = {
        laneKey,
        // Bucket by the OUTER song cycle, not the arm-local selection cycle (#974) — armByCycle
        // must index an arrange arm at the song cycle it plays, mirroring collect's floor(begin).
        cycle: ctx.outputCycle,
        ...(ctx.dollarPos !== undefined ? { dollarPos: ctx.dollarPos } : {}),
        ...(ctx.leafIndex !== undefined ? { leafIndex: ctx.leafIndex } : {}),
        ...(ctx.armIndex !== undefined ? { armIndex: ctx.armIndex } : {}),
        ...(ir.loc && ir.loc.length > 0 ? { loc: ir.loc } : {}),
        ...(labelValue !== undefined ? { labelValue } : {}),
      }
      return [item]
    }

    case 'Seq': {
      if (ir.children.length === 0) return []
      const out: LaneItem[] = []
      for (const child of ir.children) {
        const target = child.tag === 'Elongate' ? child.body : child
        out.push(...recurse(target, ctx))
      }
      return withWrapperLoc(out, ir.loc)
    }

    case 'Stack': {
      const isVoiceDefining = ir.userMethod === undefined || ir.userMethod === 'stack'
      const out: LaneItem[] = []
      if (isVoiceDefining) {
        let leafIdx = ctx.leafIndex ?? 0
        for (const track of ir.tracks) {
          out.push(...recurse(track, { ...ctx, leafIndex: leafIdx }))
          leafIdx += safeCountLeaves(track)
        }
      } else {
        for (const track of ir.tracks) out.push(...recurse(track, ctx))
      }
      return withWrapperLoc(out, ir.loc)
    }

    case 'Choice': {
      // Structural completeness (#974): at runtime a Choice fires `then` OR `else_`, but the
      // LANE skeleton must carry both — so a mid-edit break in one branch still surfaces the
      // other's lane, and no branch's voice is invisible. Both branches usually share the body's
      // leaves (`.sometimes(x=>f(x))` ⇒ then=f(body), else_=body), so first-wins aggregation
      // dedups them to one lane with identical anchors; a genuinely divergent alternation
      // contributes both lanes (allowed resilience). collect fires one branch deterministically
      // (the gate stubs Math.random so it agrees byte-for-byte on the fired one); `then` is
      // walked first here, so first-wins keeps its anchors and the shared lane stays identical.
      const out: LaneItem[] = []
      out.push(...recurse(ir.then, ctx))
      out.push(...recurse(ir.else_, ctx))
      return withWrapperLoc(out, ir.loc)
    }

    case 'Every': {
      const fires = ctx.cycle % ir.n === 0
      if (fires) return withWrapperLoc(recurse(ir.body, ctx), ir.loc)
      if (ir.default_) return withWrapperLoc(recurse(ir.default_, ctx), ir.loc)
      return []
    }

    case 'Cycle': {
      if (ir.items.length === 0) return []
      const weights = ir.items.map((it) => (it.tag === 'Elongate' && it.factor > 0 ? it.factor : 1))
      const period = weights.reduce((s, w) => s + w, 0)
      if (period <= 0) return []
      const pos = ((ctx.cycle % period) + period) % period
      const innerCycle = Math.floor(ctx.cycle / period)
      let acc = 0
      let selected = 0
      for (let k = 0; k < ir.items.length; k++) {
        if (pos < acc + weights[k]) {
          selected = k
          break
        }
        acc += weights[k]
      }
      const item = ir.items[selected]
      const target = item.tag === 'Elongate' ? item.body : item
      return withWrapperLoc(recurse(target, { ...ctx, cycle: innerCycle }), ir.loc)
    }

    case 'Arrange': {
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
      const childCtx: StructCtx = {
        ...ctx,
        cycle: localCycle,
        armIndex: ctx.armIndex ?? armIndex,
      }
      return withWrapperLoc(recurse(ir.arms[armIndex].pattern, childCtx), ir.loc)
    }

    case 'When': {
      // Gate is behaviour; for structure walk the body (superset of gated leaves).
      return withWrapperLoc(recurse(ir.body, ctx), ir.loc)
    }

    case 'Ramp': {
      return withWrapperLoc(recurse(ir.body, { ...ctx, params: { ...ctx.params, [ir.param]: 0 } }), ir.loc)
    }

    // Single-body uniform-modifier wrappers: behaviour (timing/RNG/rearrange) drops, one
    // walk of the body suffices for lanes + loc-layering. Duplication/rearrange nodes
    // (Fast/Ply/Chop/Shuffle/Scramble) share the body's leaf loc[0], so first-wins is stable.
    case 'Fast':
    case 'Slow':
    case 'Loop':
    case 'Elongate':
    case 'Late':
    case 'Degrade':
    case 'Swing':
    case 'Ply':
    case 'Shuffle':
    case 'Scramble':
    case 'Chop':
    case 'Struct':
      return withWrapperLoc(recurse(ir.body, ctx), ir.loc)

    case 'Chunk': {
      // Base body carries the lanes; transform is body-derived. Walk the body for structure.
      return withWrapperLoc(recurse(ir.body, ctx), ir.loc)
    }

    case 'Pick': {
      // Every lookup arm is a potential voice; discover all for the lane skeleton. The
      // selector loc + call-site layer onto each (mirrors collect's Pick loc layering).
      if (ir.lookup.length === 0) return []
      const out: LaneItem[] = []
      const selectorLoc = ir.selector.loc?.[0]
      for (const sub of ir.lookup) {
        for (const it of recurse(sub, ctx)) {
          const childLoc = it.loc ?? []
          const newLoc = [...childLoc, ...(selectorLoc ? [selectorLoc] : [])]
          out.push(newLoc.length > 0 ? { ...it, loc: newLoc } : it)
        }
      }
      return withWrapperLoc(out, ir.loc)
    }

    case 'NamedPick': {
      if (ir.entries.length === 0) return []
      // Per-cycle active arm from the weighted `<…@w>` selector (a Cycle), mirroring collect.
      let selectedArm: number | undefined
      if (ir.selector.tag === 'Cycle' && ir.selector.items.length > 0) {
        const weights = ir.selector.items.map((it) => (it.tag === 'Elongate' && it.factor > 0 ? it.factor : 1))
        const period = weights.reduce((s, w) => s + w, 0)
        if (period > 0) {
          const pos = ((ctx.cycle % period) + period) % period
          let acc = 0
          for (let k = 0; k < weights.length; k++) {
            if (pos < acc + weights[k]) {
              selectedArm = k
              break
            }
            acc += weights[k]
          }
        }
      }
      const armIndex = ctx.armIndex ?? selectedArm
      const out: LaneItem[] = []
      const selectorLoc = ir.selector.loc?.[0]
      for (const entry of ir.entries) {
        const childCtx: StructCtx = { ...ctx, ...(armIndex !== undefined ? { armIndex } : {}) }
        for (const it of recurse(entry.pattern, childCtx)) {
          const childLoc = it.loc ?? []
          const newLoc = [...childLoc, ...(selectorLoc ? [selectorLoc] : [])]
          out.push(newLoc.length > 0 ? { ...it, loc: newLoc } : it)
        }
      }
      return withWrapperLoc(out, ir.loc)
    }
  }
}

/**
 * Walk the IR over `[0, nCycles)` and return the RAW per-leaf items — one per
 * Play leaf reached, pre-aggregation. Anchors only, never onsets; per-node
 * resilient (a bad sub-node degrades its own branch, never the whole walk).
 *
 * The pre-aggregation items carry each leaf's OWN `loc` (aggregation collapses a
 * lane to first-wins anchors and loses per-leaf spans), so this is the shared
 * substrate for consumers that need node-level identity — `structuralWalk`
 * aggregates it into lane skeletons; `nodeIdentity.buildNodeLocIndex` indexes it
 * by leaf loc → irNodeId. Sharing one traversal means the two cannot drift.
 */
export function walkLeafItems(ir: PatternIR, nCycles: number): LaneItem[] {
  const items: LaneItem[] = []
  for (let c = 0; c < nCycles; c++) {
    try {
      items.push(...walkCycle(ir, { cycle: c, outputCycle: c, params: {} }))
    } catch {
      // A whole-cycle failure degrades that cycle only.
    }
  }
  return items
}

/**
 * Walk the IR for lane STRUCTURE over `[0, nCycles)`. Anchors only — never computes onsets.
 * Per-node resilient: a bad sub-node degrades its own lane, never the whole walk.
 */
export function structuralWalk(ir: PatternIR, nCycles: number): LaneSkeleton[] {
  return aggregateLaneItems(walkLeafItems(ir, nCycles), nCycles)
}
