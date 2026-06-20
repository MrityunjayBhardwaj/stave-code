/**
 * arrange/serialize — structural ops on a detected combinator call.
 *
 * Each op is PURE: it takes an `ArrangeCall` (from `arrange/parse`) + the live
 * doc text and returns `OffsetEdit[]` addressed by pre-edit absolute offsets —
 * the exact shape `writeback.replaceRanges` consumes. We edit TEXT, not the IR:
 * `toStrudel` is a whole-statement canonical regenerator that would reformat
 * the leaf layer, so (like `notation/serialize`) we never call it. That is also
 * why #434 (toStrudel mislabels fastcat/Seq as `cat()`) does NOT block this —
 * no op here re-emits through `toStrudel`.
 *
 * Byte-fidelity: `setWeight` on an `arrange` arm changes ONLY the weight digits;
 * the structural ops (reorder/insert/remove/wrap) keep each arm's pattern text
 * verbatim and touch only the combinator scaffolding (callee name, brackets,
 * separators). Inter-arm separators normalise to `, ` on a reorder — that IS
 * the targeted region.
 *
 * No Monaco, no runtime IR import (P172).
 */
import type { OffsetEdit } from '../writeback'
import type { ArrangeCall } from './parse'

/** Weights are whole cycles (PV122 #4) — coerce to a positive integer. */
function asWeight(n: number): number {
  return Math.max(1, Math.round(n))
}

/** The verbatim source of an arm, sliced from the doc. */
function armText(doc: string, call: ArrangeCall, i: number): string {
  return doc.slice(call.arms[i].armRange[0], call.arms[i].armRange[1])
}

/** The verbatim pattern source of an arm (no `[n, …]` wrapper). */
function patternText(doc: string, call: ArrangeCall, i: number): string {
  return doc.slice(call.arms[i].patternRange[0], call.arms[i].patternRange[1])
}

/**
 * Set arm `i`'s cycle weight to `weight`.
 *
 *  - On an `arrange` node: replace ONLY the weight literal — byte-minimal.
 *  - On a `cat`/`slowcat` node: weight 1 is a no-op (their implicit weight).
 *    A weight ≠ 1 PROMOTES the node to `arrange` (PV122 #3 — `cat` can't
 *    express weights): rename the callee and wrap every arm `pat` → `[w, pat]`
 *    (the target arm gets `weight`, the rest get `1`), keeping each pattern's
 *    bytes verbatim.
 */
export function setWeight(doc: string, call: ArrangeCall, i: number, weight: number): OffsetEdit[] {
  const w = asWeight(weight)
  const arm = call.arms[i]
  if (!arm) return []

  if (call.mode === 'arrange') {
    if (!arm.weightRange) return []
    return [{ range: arm.weightRange, text: String(w) }]
  }

  // cat / slowcat
  if (w === 1) return [] // already the implicit weight — nothing to write
  const edits: OffsetEdit[] = [{ range: call.calleeRange, text: 'arrange' }]
  for (let j = 0; j < call.arms.length; j++) {
    const aw = j === i ? w : 1
    const pat = call.arms[j]
    edits.push({ range: [pat.armRange[0], pat.armRange[0]], text: `[${aw}, ` })
    edits.push({ range: [pat.armRange[1], pat.armRange[1]], text: `]` })
  }
  return edits
}

/**
 * Move arm `from` to index `to`. Rebuilds the argument list in the new order,
 * each arm's text verbatim, joined by `, `. (Clip order = arm order, PV122 #1.)
 */
export function reorderArm(doc: string, call: ArrangeCall, from: number, to: number): OffsetEdit[] {
  const n = call.arms.length
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return []
  const order = Array.from({ length: n }, (_, k) => k)
  order.splice(to, 0, order.splice(from, 1)[0])
  const text = order.map((k) => armText(doc, call, k)).join(', ')
  return [{ range: call.argsRange, text }]
}

/**
 * Insert `armSource` as a new arm at index `at` (clamped to `[0, arms.length]`).
 * The caller supplies a well-formed arm: a `[n, pat]` tuple for an `arrange`
 * node, a bare pattern for `cat`/`slowcat`.
 */
export function insertArm(doc: string, call: ArrangeCall, at: number, armSource: string): OffsetEdit[] {
  const n = call.arms.length
  const idx = Math.max(0, Math.min(at, n))
  if (n === 0) return [{ range: [call.argsRange[0], call.argsRange[1]], text: armSource }]
  if (idx === n) {
    const end = call.arms[n - 1].armRange[1]
    return [{ range: [end, end], text: `, ${armSource}` }]
  }
  const start = call.arms[idx].armRange[0]
  return [{ range: [start, start], text: `${armSource}, ` }]
}

/**
 * Remove arm `i`, taking one adjacent `, ` separator with it. Refuses to empty
 * the combinator — a lane must keep ≥ 1 clip (PV122 #5); removing a sole arm is
 * a delete-the-whole-track op handled elsewhere, so this returns no edits.
 */
export function removeArm(doc: string, call: ArrangeCall, i: number): OffsetEdit[] {
  const n = call.arms.length
  if (i < 0 || i >= n || n <= 1) return []
  if (i < n - 1) {
    // drop arm + the separator before the next arm
    return [{ range: [call.arms[i].armRange[0], call.arms[i + 1].armRange[0]], text: '' }]
  }
  // last arm: drop the separator after the previous arm + this arm
  return [{ range: [call.arms[i - 1].armRange[1], call.arms[i].armRange[1]], text: '' }]
}

/**
 * §2.1 "introduce the combinator". A bare steady pattern has no `arrange` to
 * edit; the first time it is placed in time it must be WRAPPED:
 *   `pattern`  →  `arrange([leadingWeight, silence], [patternWeight, pattern])`
 * `patternRange` is the bare pattern's absolute `[start, end)` (e.g. a chunk's
 * `exprRange`). The pattern's bytes are preserved verbatim between the inserts.
 */
export function wrapBare(
  patternRange: [number, number],
  leadingWeight: number,
  patternWeight: number,
): OffsetEdit[] {
  const lead = asWeight(leadingWeight)
  const pw = asWeight(patternWeight)
  return [
    { range: [patternRange[0], patternRange[0]], text: `arrange([${lead}, silence], [${pw}, ` },
    { range: [patternRange[1], patternRange[1]], text: `])` },
  ]
}

/**
 * #489 — MATERIALIZE a bare loop into an `arrange` by carving a one-cycle gap at
 * `barIndex` over an arrangement of `span` whole cycles. The bare pattern (one
 * implicit loop) becomes:
 *   `pat`  →  `arrange([barIndex, pat], [1, silence], [span−barIndex−1, pat])`
 * with zero-width arms dropped (gap at bar 0 → no leading `pat`; gap at the last
 * bar → no trailing `pat`). `pat`'s bytes are preserved verbatim in each surviving
 * arm. This is the EXPLICIT "introduce the combinator" entry-point for a uniform
 * loop — the deliberate counterpart of the removed drag-to-wrap (#488).
 *
 * Refuses to empty the track: deleting the SOLE bar (span 1, or every non-gap arm
 * gone) would leave `arrange([1, silence])` = all silence, so it returns no edits
 * (a lane keeps ≥1 sounding clip — PV122 #5). `span ≥ 1`, `barIndex` clamped to
 * `[0, span)`. Pure text surgery; never re-emits through `toStrudel` (PV123).
 */
export function materializeBareDelete(
  doc: string,
  patternRange: [number, number],
  barIndex: number,
  span: number,
): OffsetEdit[] {
  const total = asWeight(span)
  const i = Math.max(0, Math.min(Math.round(barIndex), total - 1))
  const lead = i
  const rest = total - i - 1
  if (lead === 0 && rest === 0) return [] // deleting the sole bar empties the track
  const pat = doc.slice(patternRange[0], patternRange[1])
  const arms: string[] = []
  if (lead > 0) arms.push(`[${lead}, ${pat}]`)
  arms.push(`[1, silence]`)
  if (rest > 0) arms.push(`[${rest}, ${pat}]`)
  return [{ range: patternRange, text: `arrange(${arms.join(', ')})` }]
}

/**
 * #489 — MATERIALIZE a bare loop into an `arrange` by SPLITTING it at a whole-cycle
 * boundary `barIndex` over an arrangement of `span` whole cycles. The bare pattern
 * (one implicit loop spanning the song) becomes two ADDRESSABLE arms with IDENTICAL
 * sound — a uniform loop tiled across `span` cycles plays the same whether expressed
 * as one bare loop or as `arrange([k, pat], [span−k, pat])` (grounded in haps):
 *   `pat`  →  `arrange([barIndex, pat], [span−barIndex, pat])`
 * with `pat`'s bytes preserved verbatim in BOTH arms. This is the split-first
 * materialization entry-point (D1, reframe): selecting the whole bare clip and
 * splitting it introduces the combinator with no audible change, after which the
 * resulting arms are individually selectable and the existing arrange ops
 * (`removeArm` → carve a gap, `reorderArm`, `splitArm`, `setWeight`) apply.
 *
 * Both halves must be ≥ 1 whole cycle, so `span ≥ 2` is required (a 1-cycle loop
 * has no interior boundary — extend it first, #487); `barIndex` is clamped to
 * `[1, span−1]`. `span < 2` returns no edits. Pure text surgery; never re-emits
 * through `toStrudel` (PV123).
 */
export function materializeBareSplit(
  doc: string,
  patternRange: [number, number],
  barIndex: number,
  span: number,
): OffsetEdit[] {
  const total = asWeight(span)
  if (total < 2) return [] // no interior whole-cycle boundary to split on
  const k = Math.max(1, Math.min(Math.round(barIndex), total - 1))
  const pat = doc.slice(patternRange[0], patternRange[1])
  return [{ range: patternRange, text: `arrange([${k}, ${pat}], [${total - k}, ${pat}])` }]
}

/**
 * Split arm `i` at a whole-cycle boundary: `[n, pat]` → `[n₁, pat], [n₂, pat]`
 * (same pattern verbatim in both halves), where `n₁ = firstWeight` and
 * `n₂ = n − firstWeight`. Both halves must be ≥ 1 whole cycle, so this only
 * applies to an `arrange` arm whose weight is ≥ 2; `firstWeight` is clamped to
 * `[1, n−1]`. Returns no edits for a `cat`/`slowcat` arm (implicit weight 1 —
 * a single cycle can't be sliced into two whole cycles) or a weight-1 arm.
 */
export function splitArm(doc: string, call: ArrangeCall, i: number, firstWeight: number): OffsetEdit[] {
  const arm = call.arms[i]
  if (!arm || !arm.weightRange) return [] // cat/slowcat arm: weight 1, indivisible
  const n = parseInt(doc.slice(arm.weightRange[0], arm.weightRange[1]), 10)
  if (!Number.isFinite(n) || n < 2) return []
  const n1 = Math.max(1, Math.min(Math.round(firstWeight), n - 1))
  const n2 = n - n1
  const pat = doc.slice(arm.patternRange[0], arm.patternRange[1])
  return [{ range: arm.armRange, text: `[${n1}, ${pat}], [${n2}, ${pat}]` }]
}

export { patternText }
