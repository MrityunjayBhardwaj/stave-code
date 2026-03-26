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
  /** Which track/loop produced this event */
  trackId?: string
  /** Engine-specific extended parameters */
  params?: Record<string, unknown>
}
