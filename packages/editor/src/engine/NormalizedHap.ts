/**
 * Engine-agnostic hap representation for the queryable path.
 * Sketches consume this type from PatternScheduler.query() — never raw engine haps.
 */
export interface NormalizedHap {
  /** Cycle position start (from hap.whole.begin) */
  begin: number
  /** Cycle position end (from hap.whole.end) */
  end: number
  /** Clipped end for active detection (from hap.endClipped ?? end) */
  endClipped: number
  /** Note name or MIDI number (from hap.value.note ?? hap.value.n) */
  note: number | string | null
  /** Frequency in Hz (from hap.value.freq) */
  freq: number | null
  /** Instrument/sample name (from hap.value.s) */
  s: string | null
  /** Gain 0-1 (from hap.value.gain, default 1) */
  gain: number
  /** Velocity 0-1 (from hap.value.velocity, default 1) */
  velocity: number
  /** Display color (from hap.value.color) */
  color: string | null
}

/**
 * Convert a raw Strudel hap into a NormalizedHap.
 * Handles Fraction objects (Number() coercion), missing fields, and optional value bag.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeStrudelHap(hap: any): NormalizedHap {
  const begin = Number(hap.whole?.begin ?? 0)
  const end = Number(hap.whole?.end ?? begin + 0.25)
  const endClipped = Number(hap.endClipped ?? end)
  const value = hap.value
  return {
    begin,
    end,
    endClipped,
    note: value?.note ?? value?.n ?? null,
    freq: typeof value?.freq === 'number' ? value.freq : null,
    s: value?.s ?? null,
    gain: value?.gain ?? 1,
    velocity: value?.velocity ?? 1,
    color: value?.color ?? null,
  }
}
