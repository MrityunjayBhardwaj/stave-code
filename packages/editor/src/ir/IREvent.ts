/**
 * IREvent — the universal music event.
 *
 * Every engine compiles to this. Every consumer (viz, synth, highlighting) reads from this.
 * The IR event is a flat value object — no methods, no prototype, no engine references.
 *
 * Time domain: matches the producing PatternScheduler's now().
 *   - Strudel: cycle positions (0.0, 0.25, 1.0...)
 *   - BufferedScheduler: audioContext seconds (134.5, 135.0...)
 *   - Future engines: whatever their scheduler uses
 * Consumers always compare event.begin against scheduler.now() — same time domain.
 */

/** Source code location — character offset ranges in the original code. */
export interface SourceLocation {
  start: number
  end: number
}

export interface IREvent {
  /** Time position start (in scheduler's time domain) */
  begin: number
  /** Time position end */
  end: number
  /** Clipped end for active detection */
  endClipped: number

  /** Note — MIDI number, note name string, or null */
  note: number | string | null
  /** Frequency in Hz (derivable from note, pre-computed for performance) */
  freq: number | null
  /** Instrument/sample name */
  s: string | null
  /** Event kind */
  type?: 'synth' | 'sample'

  /** Gain 0-1 (default 1) */
  gain: number
  /** Velocity 0-1 (default 1) */
  velocity: number

  /** Display color */
  color: string | null

  /** Source code ranges for highlighting */
  loc?: SourceLocation[]
  /** Stable content-addressed id of the IR node that produced this event.
   *  REQUIRED-by-convention for collect-produced events at the leaf arm
   *  (PV38 clause 1; assigned by collect.ts:assignNodeId at the Play leaf).
   *  Absent for hap-derived events with no IR-side match
   *  (PV37-aligned runtime-only path). */
  irNodeId?: string
  /** Which track/loop produced this event. For events from a `$:`-wrapped
   *  Track that also has a `.p("name")` inner wrap, this is the INNER
   *  (`.p()`) name per collect.ts inner-wins semantics — what the user
   *  sees as the row label. Use `dollarPos` (below) when you need the
   *  STABLE slot identity that doesn't change when the user renames
   *  via `.p()`. */
  trackId?: string
  /** Source-character offset of the OUTERMOST `$:`-wrapped Track that
   *  encloses this event. Anchored at the Track's `loc[0].start` per
   *  parseStrudel. Used as the timeline slot identity so `.p("name")`
   *  rename-in-place doesn't relocate the row (the OUTER Track's loc
   *  doesn't move when its body is restructured). Absent when no
   *  enclosing Track has a `loc` (hand-built IR fixtures, runtime-only
   *  events). Phase 20-12.1 follow-up. */
  dollarPos?: number
  /** Index of the leaf voice (within its enclosing Track) that produced
   *  this event. Set by collect.ts when walking a voice-defining Stack
   *  (`userMethod ∈ {undefined, 'stack'}`). Sequential across nested
   *  voice-defining Stacks — nested Stack arms continue the parent's
   *  leaf counter (mirrors flattenLeafVoices' source-order traversal in
   *  irProjection.ts). Absent when the Track body is a single voice
   *  (no voice-defining Stack), or for hand-built IR that doesn't go
   *  through Track/Stack collect arms — chrome treats absence as "all
   *  events on leaf 0". Phase 20-12 sub-row partition support. */
  leafIndex?: number
  /** Index of the time-sequence ARM (clip) that produced this event, within
   *  its enclosing `Arrange` node (`arrange`/`cat`/`slowcat` combinator). Set
   *  by collect.ts's Arrange arm — mirrors `leafIndex`, but partitions a
   *  track HORIZONTALLY (which clip along the timeline) rather than vertically
   *  (which voice). Absent for tracks with no arrangement combinator — the
   *  timeline treats a bare track as one implicit clip (design §5 option b).
   *  Together with the lane key it identifies a clip. Phase 5a (#386). */
  armIndex?: number
  /** Engine-specific extended parameters */
  params?: Record<string, unknown>
}
