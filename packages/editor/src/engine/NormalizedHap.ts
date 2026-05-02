/**
 * NormalizedHap — backward-compatible alias for IREvent.
 *
 * All viz sketches import NormalizedHap. This re-exports from the IR module
 * so existing code keeps working. New code should import IREvent directly.
 */

import type { IREvent, SourceLocation } from '../ir/IREvent'

/** @deprecated Use IREvent from '../ir' instead. */
export type NormalizedHap = IREvent

/** Fields the Strudel hap maps to dedicated IREvent slots. Anything in
 *  `hap.value` outside this set flows through as `params` so engine-
 *  specific extras (cutoff, delay, pan, room, …) survive into the IR. */
const KNOWN_VALUE_FIELDS = new Set([
  'note',
  'n',
  'freq',
  's',
  'gain',
  'velocity',
  'color',
])

function extractParams(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined
  let extras: Record<string, unknown> | undefined
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (KNOWN_VALUE_FIELDS.has(k)) continue
    if (v === undefined) continue
    if (!extras) extras = {}
    extras[k] = v
  }
  return extras
}

function extractLoc(hap: unknown): SourceLocation[] | undefined {
  if (!hap || typeof hap !== 'object') return undefined
  const ctx = (hap as { context?: { locations?: unknown; loc?: unknown } }).context
  const raw = ctx?.locations ?? ctx?.loc
  if (!Array.isArray(raw)) return undefined
  const out: SourceLocation[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const start = (r as { start?: unknown }).start
    const end = (r as { end?: unknown }).end
    if (typeof start === 'number' && typeof end === 'number') {
      out.push({ start, end })
    }
  }
  return out.length > 0 ? out : undefined
}

/**
 * Convert a raw Strudel hap into an IREvent (NormalizedHap).
 * Handles Fraction objects (Number() coercion), missing fields, and optional value bag.
 *
 * `trackId` is caller-supplied — Strudel haps don't carry it natively,
 * but per-track schedulers (`$:` blocks) know their id and pass it
 * through so downstream consumers (DAW view, transform debugger) can
 * attribute every event to a producer.
 */
export function normalizeStrudelHap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hap: any,
  trackId?: string,
): NormalizedHap {
  const begin = Number(hap.whole?.begin ?? 0)
  const end = Number(hap.whole?.end ?? begin + 0.25)
  const endClipped = Number(hap.endClipped ?? end)
  const value = hap.value
  const event: NormalizedHap = {
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
  const loc = extractLoc(hap)
  if (loc) event.loc = loc
  if (trackId) event.trackId = trackId
  const params = extractParams(value)
  if (params) event.params = params
  return event
}
