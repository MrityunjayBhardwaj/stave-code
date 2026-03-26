/**
 * NormalizedHap — backward-compatible alias for IREvent.
 *
 * All viz sketches import NormalizedHap. This re-exports from the IR module
 * so existing code keeps working. New code should import IREvent directly.
 */

import type { IREvent } from '../ir/IREvent'

/** @deprecated Use IREvent from '../ir' instead. */
export type NormalizedHap = IREvent

/**
 * Convert a raw Strudel hap into an IREvent (NormalizedHap).
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
