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
 * Phase 0 (#972) DEFINES this seam. Phase 1 (#973) IMPLEMENTS it by carving the anchor
 * derivation out of `collect.ts`, and proves its anchors byte-identical to `collect`'s over the
 * 57-tune corpus. Nothing calls it yet — this file is inert until Phase 1.
 */
import type { PatternIR } from './PatternIR'

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
 * Walk the IR for lane STRUCTURE over `[0, nCycles)`. Anchors only — never computes onsets.
 * Per-node resilient: a bad sub-node degrades its own lane, never the whole walk.
 *
 * NOT YET IMPLEMENTED — Phase 1 (#973) carves the body out of `collect.ts` and gates its
 * output byte-identical to `collect`'s `{dollarPos, leafIndex, armIndex}` on the corpus.
 */
export function structuralWalk(_ir: PatternIR, _nCycles: number): LaneSkeleton[] {
  throw new Error(
    'structuralWalk is not implemented yet — Phase 1 (#973). ' +
      'It defines the collect.ts split seam (#945); see COLLECT-SPLIT-AUDIT.md.',
  )
}
