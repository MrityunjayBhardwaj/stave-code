/**
 * eventValueKey — "are these two events the same sound", answered from the
 * adapter's whole value partition rather than from a list curated at a consumer.
 *
 * ── WHY IT LIVES BESIDE THE CONTRACT ─────────────────────────────────────────
 * `IREvent` is the universal music event: every engine compiles to it, every
 * consumer reads from it. Its value partition is TOTAL by construction —
 * `extractParams` (`../engine/NormalizedHap.ts`) is a COMPLEMENT over
 * `KNOWN_VALUE_FIELDS`, so `{note, freq, s, gain, velocity, color} ∪ params` is
 * exactly the hap's whole value object, losslessly. Any consumer that instead
 * hand-picks three fields is keeping a second, smaller idea of what an event IS,
 * and it will be wrong on whichever axis it left out.
 *
 * That is not hypothetical: `cycleFingerprints` summarised a cycle as
 * `lane@offset:note`, so an arrangement whose sections differ only by WHICH
 * SAMPLE plays fingerprinted as identical cycles and the Song view's display
 * span collapsed to one cycle (#1102). The sample only ever reached that token
 * by ACCIDENT, through `laneKeyOf`'s `trackId ?? s` fallback, so any event
 * carrying a real `trackId` — which is every event in production — lost it.
 *
 * ── WHY A FIELD-BY-FIELD PATCH IS THE WRONG SHAPE ────────────────────────────
 * Measured, not argued: adding `s` alone fixes the one fixture and leaves the
 * class open. Arms differing only by a param (`.speed`) or only by `gain` still
 * fingerprint identically, while a value-generic token answers 4 for all three.
 * ~250 off-list controls route into `params` (#928), so the param axis is a
 * large real population rather than a hypothetical.
 *
 * ── WHAT IS DELIBERATELY NOT IN THE KEY ──────────────────────────────────────
 * Written down rather than implied by omission, because an exclusion nobody
 * stated is indistinguishable from a field somebody forgot:
 *
 *   TIME (`begin`, `end`, `endClipped`) — identity is about WHAT sounded, not
 *   when. A caller comparing cycles supplies its own quantised phase; folding
 *   raw time in here would make every event unique and no period would ever be
 *   detected.
 *
 *   PROVENANCE (`loc`, `irNodeId`, `trackId`, `dollarPos`, `leafIndex`,
 *   `armIndex`) — where an event CAME FROM, not what it is. Two identical
 *   sounds written at two source positions are the same sound; including these
 *   would make every arrangement arm differ from every other by construction,
 *   which is a different bug in the same place.
 */
import type { IREvent } from './IREvent'

/**
 * The IREvent slots that carry VALUE — the dedicated half of the partition,
 * mirroring the fields `normalizeStrudelHap` lifts out of `hap.value`.
 *
 * Kept in step with `KNOWN_VALUE_FIELDS` by `eventValueKey.test.ts`, which
 * fails if the two drift. The one deliberate difference is `n`: it is an ALIAS
 * the normaliser folds into `note` (`note: value?.note ?? value?.n`), not a
 * slot of its own, so a key that also read `n` would be reading nothing.
 *
 * `type` has a declared slot on `IREvent` that no producer currently writes.
 * It is read anyway — an absent field contributes a constant and costs nothing,
 * and the alternative is a value field that silently stops counting the day
 * something starts setting it.
 */
export const VALUE_SLOTS = [
  'note',
  'freq',
  's',
  'type',
  'gain',
  'velocity',
  'color',
] as const

/** Excluded because it is WHEN, not WHAT. See the header. */
export const TIME_FIELDS = ['begin', 'end', 'endClipped'] as const

/** Excluded because it is WHERE FROM, not WHAT. See the header. */
export const PROVENANCE_FIELDS = [
  'loc',
  'irNodeId',
  'trackId',
  'dollarPos',
  'leafIndex',
  'armIndex',
] as const

/**
 * Serialise one value unambiguously and without ever throwing.
 *
 * `JSON.stringify` is the right primitive because it separates the shapes that
 * would otherwise collide — `null` from the string `"null"`, the number `3`
 * from the string `"3"`, and the N-element arrays a `:`-variant lowers to
 * (`bd:3` → `["bd", 3]`) from either. A param can hold anything a control was
 * handed, so the two escape hatches are stated rather than assumed unreachable:
 * a function serialises to a constant (functions are not values that sounded),
 * and a structure `JSON` refuses — a cycle, a BigInt — degrades to one token.
 *
 * ⚠ THE DEGRADED TOKEN IS A KNOWN FALSE-SAME: two different unserialisable
 * params read as equal. That direction is the safe one here (it can only
 * SHORTEN a detected period, back toward today's behaviour) and no corpus
 * document reaches it, but it is a bound, not an absence.
 */
function stableValue(v: unknown): string {
  if (v === undefined) return '~'
  try {
    return JSON.stringify(v, (_k, x) => (typeof x === 'function' ? '[fn]' : x)) ?? '~'
  } catch {
    return '[unserializable]'
  }
}

/**
 * A total, order-stable token for everything this event SOUNDS AS.
 *
 * Param keys are sorted, so two events built by different code paths in a
 * different order still compare equal. Nested param objects keep their own key
 * order, which is stable for events produced by the same pipeline — the case
 * every caller has.
 */
export function eventValueKey(ev: IREvent): string {
  const parts: string[] = []
  const rec = ev as unknown as Record<string, unknown>
  for (const slot of VALUE_SLOTS) parts.push(`${slot}=${stableValue(rec[slot])}`)
  const params = ev.params
  if (params) {
    for (const k of Object.keys(params).sort()) parts.push(`${k}=${stableValue(params[k])}`)
  }
  return parts.join(',')
}
