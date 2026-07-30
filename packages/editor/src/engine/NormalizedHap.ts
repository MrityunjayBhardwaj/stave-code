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
 *  specific extras (cutoff, delay, pan, room, …) survive into the IR.
 *
 *  EXPORTED so `eventValueKey` can be pinned against it: that key claims to
 *  read the WHOLE value partition, and the only thing making the claim true is
 *  that these two lists cannot drift apart unnoticed. Adding a slot here
 *  without adding it there silently narrows every consumer that asks "are
 *  these the same sound" — which is the defect the key was written to end. */
export const KNOWN_VALUE_FIELDS = new Set([
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
 * Resolve a hap's leaf-loc to the matching IREvent by structural lookup
 * against the published snapshot's loc map (PV38 clause 2). Single-strategy:
 *
 *   key = `${loc[0].start}:${loc[0].end}`   (innermost leaf range)
 *   tie-break = closest event by `whole.begin`
 *
 * Returns the full IREvent (richer than just `irNodeId`) so callers needing
 * both the identity and the IR-side begin (e.g. fast(N)/ply disambig at the
 * MusicalTimeline subscriber) get them in one shot — the IR-side begin is
 * the value rows are keyed on, not the hap-side begin (which is what's
 * already passed in).
 *
 * On miss: returns undefined. The runtime-only-hap path (PV37-aligned) —
 * NO fallback ladder (P50 awareness). If user patterns produce haps that
 * don't structurally match, that's the runtime-only path; the corpus
 * test catches genuine regressions, not the resolver.
 *
 * Phase 20-06 — widened from `findMatch` (string | undefined) → exported
 * `findMatchedEvent` (IREvent | undefined). Body unchanged except the final
 * return; existing internal call site reads `.irNodeId` from the result.
 */
export function findMatchedEvent(
  loc: SourceLocation[] | undefined,
  begin: number,
  locLookup: ReadonlyMap<string, IREvent[]> | undefined,
): IREvent | undefined {
  if (!locLookup || !loc || loc.length === 0) return undefined
  const key = `${loc[0].start}:${loc[0].end}`
  const candidates = locLookup.get(key)
  if (!candidates || candidates.length === 0) return undefined
  let best = candidates[0]
  let bestDist = Math.abs(best.begin - begin)
  for (let i = 1; i < candidates.length; i++) {
    const d = Math.abs(candidates[i].begin - begin)
    if (d < bestDist) { best = candidates[i]; bestDist = d }
  }
  return best
}

/**
 * Convert a raw Strudel hap into an IREvent (NormalizedHap).
 * Handles Fraction objects (Number() coercion), missing fields, and optional value bag.
 *
 * `trackId` is caller-supplied — Strudel haps don't carry it natively,
 * but per-track schedulers (`$:` blocks) know their id and pass it
 * through so downstream consumers (DAW view, transform debugger) can
 * attribute every event to a producer.
 *
 * `irNodeLocLookup` is caller-supplied — engine threads the published
 * snapshot's loc map so each hap can be enriched with its `irNodeId`
 * by structural match (PV38 clause 2). Both optional — additive widening.
 */
export function normalizeStrudelHap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hap: any,
  trackId?: string,
  irNodeLocLookup?: ReadonlyMap<string, IREvent[]>,
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
  // PV38 clause 2 — single-strategy structural match. Miss → undefined
  // (PV37-aligned runtime-only path; no fallback ladder per P50).
  const matched = findMatchedEvent(loc, begin, irNodeLocLookup)
  const id = matched?.irNodeId
  // IMPORTANT: only set when truthy — preserves "absent" vs "present:undefined"
  // distinction (PV37 alignment). Unconditional `event.irNodeId = id` would
  // serialize an `undefined`-valued key, breaking any future shape-deep probe.
  if (id) event.irNodeId = id
  const params = extractParams(value)
  if (params) event.params = params
  return event
}
