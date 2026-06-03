/**
 * ALIAS_MAP — built-in bare-alias → Strudel sound-name mapping for the
 * SignalBus. Data, NOT code paths (RESEARCH §4 — "the only genuinely new
 * datum is the alias map").
 *
 * `uKick` → `bd`, `uSnare` → `sd`, … An alias may map to a SINGLE sound
 * (`uKick → 'bd'`) or an ARRAY of sounds (`uTom → ['lt','mt','ht']`); for
 * array aliases the bus resolves the envelope value as the MAX over members
 * (any tom firing lights the alias).
 *
 * NOTE: `uKeyVelocity` is NOT a sound alias — it resolves to the active
 * event's `.velocity` (global, or per-track via `u.track`). It is handled
 * in the per-renderer bare-alias preamble (T2/T3), not here.
 *
 * Custom alias-override maps are DEFERRED (D-04). The bus constructor accepts
 * an `aliasMap` arg so a future override is purely additive.
 */
export const ALIAS_MAP: Record<string, string | string[]> = {
  uKick: 'bd',
  uSnare: 'sd',
  uHat: 'hh',
  uOpenHat: 'oh',
  uClap: 'cp',
  uRim: 'rim',
  uTom: ['lt', 'mt', 'ht'],
}
