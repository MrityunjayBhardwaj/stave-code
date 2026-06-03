/**
 * aliasMap — built-in named-signal aliases for the SignalBus, plus the
 * engine-keyed model that lets one alias NAME carry per-engine sound lists.
 *
 * ## Why engine-keyed
 * The bus is engine-agnostic at the IR level (it keys on `IREvent.s`), but the
 * `s` VALUES are the one place engine-specificity leaks through: Strudel writes
 * `bd`/`sd`/`hh`; Sonic Pi writes sample symbols (`drum_heavy_kick`,
 * `drum_snare_hard`) and synth names (`prophet`, `beep`) — verified against the
 * Sonic Pi source (`synthinfo.rb` `@@grouped_samples` :9304+, `@@synth_infos`
 * :9609; every trigger resolves to a single `scsynth_name` string,
 * `sound.rb:160-181`). The key fact: in BOTH engines a sound's identity is a
 * single STRING (or a list) — the alias VALUE type never needs to be richer,
 * only the values differ per engine. So an alias absorbs the leak: the NAME
 * (`kick`) stays unified across engines, only the sound list is per-engine.
 *
 *   kick → { strudel: ['bd','kick9'], sonicpi: ['drum_heavy_kick'] }
 *
 * The active engine is resolved at MOUNT (`resolveAliasesForEngine`) down to the
 * flat `Record<name, string|string[]>` the bus already consumes — so the bus and
 * its `setAliases` contract are UNCHANGED; the engine dimension lives entirely in
 * storage + this resolver (PV12: the bus stays pure, never sees an engine).
 *
 * ## Array aliases
 * An alias may map to a SINGLE sound (`uKick → 'bd'`) or an ARRAY
 * (`uTom → ['lt','mt','ht']`); for array aliases the bus resolves the envelope
 * value as the MAX over members (any tom firing lights the alias).
 *
 * NOTE: `uKeyVelocity` is NOT a sound alias — it resolves to the active event's
 * `.velocity` (handled in the per-renderer bare-alias preamble, not here).
 */

/** The live-coding engine a viz sketch is currently driven by. Strudel is the
 *  only engine wired today; `sonicpi` is reserved for Sonic Pi Web (a thesis,
 *  not yet built — see `project_sonic_pi_web`). The union is open by intent:
 *  storage/sanitize keep ANY engine key with a valid value, so a future engine
 *  survives a round-trip through an older build. */
export type VizEngine = 'strudel' | 'sonicpi'

/** A resolved alias value for one engine: a single sound name, or a list whose
 *  envelope reads as the MAX over members. */
export type EngineAliasValue = string | string[]

/** One alias' per-engine sound lists. Partial: an alias may define a value for
 *  some engines and not others (e.g. a Strudel-only clap with no Sonic Pi
 *  equivalent → silently inert under Sonic Pi, never a crash). */
export type EngineAliasMap = Partial<Record<VizEngine, EngineAliasValue>>

/** The persisted custom-alias shape: alias name → per-engine sound lists. This
 *  is what lives in localStorage (`editorRegistry`); the flat per-engine view
 *  the bus consumes is derived from it via `resolveAliasesForEngine`. */
export type StoredSignalAliases = Record<string, EngineAliasMap>

/** The active viz engine. Strudel is the only live engine today; this is the
 *  single wire-point — when Sonic Pi Web lands, source the active engine from
 *  the running `LiveCodingEngine` at the renderer mount and pass it to
 *  `resolveAliasesForEngine`. */
export const DEFAULT_VIZ_ENGINE: VizEngine = 'strudel'

/**
 * Built-in aliases, engine-keyed. Strudel values are the canonical Strudel
 * sound names; Sonic Pi values are sample symbols from the Sonic Pi source
 * (`synthinfo.rb` `@@grouped_samples`, the `:drum` group) so the built-in
 * signals work cross-engine the day Sonic Pi Web ships. Aliases with no
 * canonical Sonic Pi sample (`uClap`, `uRim`) intentionally omit the `sonicpi`
 * slot rather than guess — they stay Strudel-only until a user maps them.
 */
export const BUILTIN_ALIASES: Record<string, EngineAliasMap> = {
  uKick: { strudel: 'bd', sonicpi: 'drum_heavy_kick' },
  uSnare: { strudel: 'sd', sonicpi: 'drum_snare_hard' },
  uHat: { strudel: 'hh', sonicpi: 'drum_cymbal_closed' },
  uOpenHat: { strudel: 'oh', sonicpi: 'drum_cymbal_open' },
  uClap: { strudel: 'cp' },
  uRim: { strudel: 'rim' },
  uTom: {
    strudel: ['lt', 'mt', 'ht'],
    sonicpi: ['drum_tom_lo_hard', 'drum_tom_mid_hard', 'drum_tom_hi_hard'],
  },
}

/**
 * Resolve built-ins + custom aliases into the flat `Record<name, value>` the bus
 * consumes for a single engine. Built-ins first, custom LAST so a user override
 * WINS on collision (mirrors the old `{ ...ALIAS_MAP, ...custom }` merge). An
 * alias with no value for `engine` is omitted (its bare name stays unbound under
 * that engine — honest, never a silent zero-as-bug). Pure: takes the stored
 * custom map as an arg, imports nothing impure (PV12).
 */
export function resolveAliasesForEngine(
  custom: StoredSignalAliases,
  engine: VizEngine,
): Record<string, EngineAliasValue> {
  const out: Record<string, EngineAliasValue> = {}
  for (const [name, slots] of Object.entries(BUILTIN_ALIASES)) {
    const v = slots[engine]
    if (v != null) out[name] = v
  }
  for (const [name, slots] of Object.entries(custom)) {
    const v = slots[engine]
    if (v != null) out[name] = v
  }
  return out
}

/**
 * ALIAS_MAP — the built-in aliases flattened for the DEFAULT engine (Strudel).
 * Kept as a derived view for back-compat: the bus' default constructor and the
 * renderers' bare-name injection consume this flat shape. Equivalent to the
 * pre-engine-keyed constant (`uKick → 'bd'`, `uTom → ['lt','mt','ht']`).
 */
export const ALIAS_MAP: Record<string, EngineAliasValue> = resolveAliasesForEngine(
  {},
  DEFAULT_VIZ_ENGINE,
)
