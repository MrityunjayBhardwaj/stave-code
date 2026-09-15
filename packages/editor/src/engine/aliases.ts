// Phase 20-14 β-1 — hand-curated bare-name aliases for strudel.cc parity.
//
// Why this exists
// ---------------
// After α loaded the Dirt-Samples manifest + Salamander piano + drum-machine
// banks + soundfonts, the most-typed shorthand sound names from other DAWs /
// trackers (`kick`, `snare`, `hat`, `clap`, …) still resolve to "sound X not
// found." Upstream strudel.cc users learn the canonical short names
// (`bd`, `sd`, `hh`, …) by reading other patterns; first-time Stave users
// shouldn't have to. This map is the last-resort lookup BEFORE the
// "not found" error fires.
//
// Precedence rule (per 20-14-RESEARCH.md §3 + §7 open-question #4)
// -----------------------------------------------------------------
//   1. User code passes `s("name")` → `wrappedOutput` receives a hap whose
//      `value.s` is the post-reify string.
//   2. If `soundMap.get()[name.toLowerCase()]` is already populated (because
//      upstream registered it, OR the user ran a `samples(...)` call that
//      registered it), the alias map is NEVER consulted. User-registered
//      names ALWAYS WIN.
//   3. Otherwise, `resolveAlias(name)` is consulted. A hit rewrites
//      `hap.value.s` to the canonical name and records the resolution on the
//      engine's `lastAliasResolutions` accumulator (β-5 reads this).
//   4. A miss falls through to superdough which throws "sound X not found",
//      and friendlyErrors β-5 appends "alias map: no entry for `xyz`".
//
// Curation rules
// --------------
//   - Every key MUST map to a name that exists in `soundMap` after α. Adding
//     a key that points at an unloaded sample is a worse UX than no entry at
//     all (the friendly error explicitly says "alias map: `xyz` →
//     `target` (but `target` is not loaded)").
//   - Avoid speculative thesaurus entries. ~20-30 well-chosen aliases beats
//     100 entries the alias author "thinks musicians might type." If a
//     real-world user hits a gap, that's a PR adding ONE entry with a
//     comment line citing the surface.
//   - Avoid keys that already exist in upstream-registered names. The guard
//     in `wrappedOutput` defends against shadowing, but a redundant entry
//     adds review noise.
//   - Keys are lowercased before lookup (mirrors `superdough.mjs:165`
//     `soundMap.get()[s.toLowerCase()]`). Source-side casing is for
//     readability only.
//
// New entries land via PR — NOT loaded from a JSON URL (locked decision D-02,
// 20-14-CONTEXT.md).

/**
 * Bare-name to canonical-name aliases. Frozen so callers can't mutate the
 * shared table — the alias surface is a contract reviewed via PR, not a
 * runtime knob.
 */
export const SOUND_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // ── Kick / bass drum ──────────────────────────────────────────────────
  kick: 'bd',
  bassdrum: 'bd',

  // ── Snare ─────────────────────────────────────────────────────────────
  snare: 'sd',
  snaredrum: 'sd',

  // ── Hi-hats ───────────────────────────────────────────────────────────
  hat: 'hh',
  hihat: 'hh',
  closedhat: 'hh',
  openhat: 'oh',
  openhihat: 'oh',

  // ── Claps / rims ──────────────────────────────────────────────────────
  clap: 'cp',
  handclap: 'cp',
  rim: 'rs',
  rimshot: 'rs',
  sidestick: 'rs',

  // ── Cymbals ───────────────────────────────────────────────────────────
  crash: 'cr',
  crashcymbal: 'cr',
  ride: 'rd',
  ridecymbal: 'rd',
  // Generic "cymbal" → crash; ride is the deliberate one users spell out.
  cymbal: 'cr',

  // ── Toms ──────────────────────────────────────────────────────────────
  // Dirt-Samples uses lt/mt/ht for low/mid/high toms. A bare "tom" is
  // ambiguous in tracker land; mapping to mid-tom is the least-wrong default.
  tom: 'mt',
  lowtom: 'lt',
  midtom: 'mt',
  hightom: 'ht',
  floortom: 'lt',

  // ── Misc percussion ───────────────────────────────────────────────────
  cowbell: 'cb',
  bell: 'cb', // Dirt-Samples has no separate 'bell' sample; cb is the
              // sleighbell-adjacent cowbell from analog kits.
  tambourine: 'tb',
  shaker: 'sh',
  clave: 'cl',
  // Conga/bongo bare names already exist in Dirt-Samples; no alias needed.
})

/**
 * Look up a bare name against `SOUND_ALIASES`. Returns the canonical name
 * if there is a curated alias, otherwise `undefined`. Lowercases the input
 * to match superdough's own lookup (`soundMap.get()[s.toLowerCase()]`).
 *
 * The caller (`wrappedOutput` in StrudelEngine) must ALSO verify the name
 * is not in the live `soundMap` before substituting — see header.
 */
export function resolveAlias(rawS: string): string | undefined {
  return SOUND_ALIASES[rawS.toLowerCase()]
}

/**
 * #1635 — the alias step, applied to a hap's value before superdough sees it.
 *
 * Live playback (`wrappedOutput`) and the offline render (`renderPatternReport`)
 * both call this, so a name like `kick` sounds the same in a bounce as it does
 * live. Only the live path used to rewrite it, and a bounce of `s("kick*4")`
 * came out silent.
 *
 * Returns `value` untouched when nothing applies: `s` is not a string, the
 * loaded sound map already has the name (user-registered names always win,
 * looked up lowercased like superdough does), or there is no curated alias.
 * Otherwise returns a shallow COPY with `s` rewritten, so the caller's hap value
 * is never mutated, plus the resolution for the engine's accumulator.
 */
export function aliasSoundValue<T>(
  value: T,
  soundMap: Record<string, unknown> | undefined
): { value: T; resolution?: { from: string; to: string } } {
  if (value === null || typeof value !== 'object') return { value }
  const rawS = (value as { s?: unknown }).s
  if (typeof rawS !== 'string') return { value }
  if (soundMap && soundMap[rawS.toLowerCase()] !== undefined) return { value }
  const aliased = resolveAlias(rawS)
  if (!aliased || aliased === rawS) return { value }
  return { value: { ...value, s: aliased } as T, resolution: { from: rawS, to: aliased } }
}
