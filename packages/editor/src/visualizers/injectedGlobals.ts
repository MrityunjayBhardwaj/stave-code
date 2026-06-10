/**
 * injectedGlobals — the single, authoritative catalogue of the Stave-injected
 * globals a viz sketch may read, per renderer kind (#309).
 *
 * This is the SOURCE OF TRUTH for two surfaces:
 *   - the read-only "Stave Inputs" reference block shown above the viz editor
 *     (ShaderToy-style — see {@link formatStaveInputs}); and
 *   - the Monaco hover provider that shows a token's doc + live master value
 *     (see {@link injectedGlobalByToken} + the `live` field).
 *
 * Keeping ONE list means the docs surfaced to authors cannot drift from what is
 * actually injected by the compilers/builders (`buildStaveUniforms` for p5,
 * `buildHydraStaveBag` for hydra, the `UNIFORMS` + `STAVE_TRACK_API` strings for
 * glsl). When a new bus signal is added to those builders, add it here too — the
 * same PV54 additive-floor obligation, applied to the doc surface (PV94).
 *
 * SCOPE (deliberate, issue #309): Stave-exclusive globals ONLY. The full p5 /
 * hydra built-in API is NOT listed — authors know p5/hydra; what they can't
 * discover is what STAVE injects on top.
 *
 * WORKER-SAFE: pure data + string formatting, no DOM / no renderer imports.
 */

import type { VizRendererKind } from '../workspace/vizLanguages'

/**
 * How the hover provider reads a token's LIVE value from the GLOBAL MASTER bus
 * (issue #309 — master-only, no per-instance focus). `null`/absent ⇒ no live
 * value (structural handle like `stave.scheduler`, or a per-instance/non-numeric
 * token) → hover shows the doc only.
 */
export type LiveSpec =
  | { kind: 'scalar'; read: MasterScalar } // a 0..1 number from the master bus
  | { kind: 'array'; read: MasterArray } // a number[] (fft / wave) → sparkline
  | { kind: 'time' } // glsl iTime — seconds since the probe started

/** Master-mix scalar signals readable live (all 0..1). */
export type MasterScalar =
  | 'rms'
  | 'bass'
  | 'mid'
  | 'treble'
  | 'keyVelocity'
  | 'env:uKick'
  | 'env:uSnare'
  | 'env:uHat'
  | 'env:uOpenHat'
  | 'env:uClap'
  | 'env:uRim'
  | 'env:uTom'

/** Master-mix array signals readable live. */
export type MasterArray = 'fft' | 'wave'

/**
 * One catalogued entry. `decl` is the human declaration line shown in the block
 * (kind-specific syntax); `comment` is the trailing `// ...`; `tokens` are the
 * individual identifiers the hover provider matches a hovered word against.
 */
export interface InjectedGlobal {
  /** Declaration as it reads in the block, e.g. `uniform float iTime;`. */
  readonly decl: string
  /** Trailing comment (no leading `//`). */
  readonly comment: string
  /** Identifiers under this entry, for hover word-match. */
  readonly tokens: readonly string[]
  /** Live-value source on the master bus, when the token carries one. */
  readonly live?: Partial<Record<string, LiveSpec>>
}

// ── per-kind catalogues ─────────────────────────────────────────────────────
// Each `decl // comment` line mirrors the grounded injected surface. The `live`
// map keys are the individual tokens (so `uKick` and `uSnare` on one decl line
// can each carry their own master reading).

const ENV_LIVE = (env: MasterScalar): LiveSpec => ({ kind: 'scalar', read: env })

const GLSL_GLOBALS: readonly InjectedGlobal[] = [
  { decl: 'uniform vec3      iResolution;', comment: 'viewport resolution (in pixels)', tokens: ['iResolution'] },
  { decl: 'uniform float     iTime;', comment: 'playback time (in seconds)', tokens: ['iTime'], live: { iTime: { kind: 'time' } } },
  { decl: 'uniform vec4      iMouse;', comment: 'mouse pixel coords (zero in worker)', tokens: ['iMouse'] },
  { decl: 'uniform sampler2D iChannel0;', comment: 'analyser — row 0 = FFT, row 1 = waveform', tokens: ['iChannel0'] },
  {
    decl: 'uniform float     uKick, uSnare, uHat, uOpenHat, uClap, uRim, uTom;',
    comment: 'per-drum envelope 0..1',
    tokens: ['uKick', 'uSnare', 'uHat', 'uOpenHat', 'uClap', 'uRim', 'uTom'],
    live: {
      uKick: ENV_LIVE('env:uKick'), uSnare: ENV_LIVE('env:uSnare'), uHat: ENV_LIVE('env:uHat'),
      uOpenHat: ENV_LIVE('env:uOpenHat'), uClap: ENV_LIVE('env:uClap'), uRim: ENV_LIVE('env:uRim'), uTom: ENV_LIVE('env:uTom'),
    },
  },
  { decl: 'uniform float     uVelocity;', comment: 'loudest active hit 0..1', tokens: ['uVelocity'], live: { uVelocity: { kind: 'scalar', read: 'keyVelocity' } } },
  {
    decl: 'uniform float     uRms, uBass, uMid, uTreble;',
    comment: 'master-mix DSP 0..1',
    tokens: ['uRms', 'uBass', 'uMid', 'uTreble'],
    live: { uRms: { kind: 'scalar', read: 'rms' }, uBass: { kind: 'scalar', read: 'bass' }, uMid: { kind: 'scalar', read: 'mid' }, uTreble: { kind: 'scalar', read: 'treble' } },
  },
  { decl: 'uniform int       uTrackCount;', comment: 'live track count', tokens: ['uTrackCount'] },
  { decl: 'StaveTrack        staveTrack(int i);', comment: '{ env, velocity, rms, bass, mid, treble } — per track i', tokens: ['staveTrack', 'StaveTrack'] },
]

const P5_GLOBALS: readonly InjectedGlobal[] = [
  { decl: 'PatternScheduler  stave.scheduler;', comment: '.now(), .query(begin, end)', tokens: ['scheduler'] },
  { decl: 'AnalyserNode      stave.analyser;', comment: 'raw getFloat{Time,Frequency}Data', tokens: ['analyser'] },
  { decl: 'HapStream         stave.hapStream;', comment: 'active note events', tokens: ['hapStream'] },
  { decl: 'object            stave.options;', comment: 'the .viz({ ... }) argument', tokens: ['options'] },
  {
    decl: 'number            uKick, uSnare, uHat, uOpenHat, uClap, uRim, uTom;',
    comment: 'per-drum envelope 0..1',
    tokens: ['uKick', 'uSnare', 'uHat', 'uOpenHat', 'uClap', 'uRim', 'uTom'],
    live: {
      uKick: ENV_LIVE('env:uKick'), uSnare: ENV_LIVE('env:uSnare'), uHat: ENV_LIVE('env:uHat'),
      uOpenHat: ENV_LIVE('env:uOpenHat'), uClap: ENV_LIVE('env:uClap'), uRim: ENV_LIVE('env:uRim'), uTom: ENV_LIVE('env:uTom'),
    },
  },
  { decl: 'number            uKeyVelocity;', comment: 'loudest active hit 0..1', tokens: ['uKeyVelocity'], live: { uKeyVelocity: { kind: 'scalar', read: 'keyVelocity' } } },
  {
    decl: 'number            uRms, uBass, uMid, uTreble;',
    comment: 'master-mix DSP 0..1',
    tokens: ['uRms', 'uBass', 'uMid', 'uTreble'],
    live: { uRms: { kind: 'scalar', read: 'rms' }, uBass: { kind: 'scalar', read: 'bass' }, uMid: { kind: 'scalar', read: 'mid' }, uTreble: { kind: 'scalar', read: 'treble' } },
  },
  { decl: 'number[]          u.fft, u.wave;', comment: 'master spectrum / waveform', tokens: ['fft', 'wave'], live: { fft: { kind: 'array', read: 'fft' }, wave: { kind: 'array', read: 'wave' } } },
  { decl: 'number            u.density;', comment: 'quality LOD multiplier (1 = full)', tokens: ['density'] },
  { decl: "Reading           u('bd'), u.track('$0');", comment: '{ env, velocity, note, color, rms, bass, mid, treble, fft[], wave[] }', tokens: ['u', 'track'] },
  { decl: 'string[]          u.tracks, u.sounds;', comment: 'live published track / sound keys', tokens: ['tracks', 'sounds'] },
]

const HYDRA_GLOBALS: readonly InjectedGlobal[] = [
  {
    decl: '() => number      stave.uKick, stave.uSnare, stave.uHat, stave.uOpenHat,\n                  stave.uClap, stave.uRim, stave.uTom, stave.uKeyVelocity;',
    comment: 'per-drum envelope thunks → call them',
    tokens: ['uKick', 'uSnare', 'uHat', 'uOpenHat', 'uClap', 'uRim', 'uTom', 'uKeyVelocity'],
    live: {
      uKick: ENV_LIVE('env:uKick'), uSnare: ENV_LIVE('env:uSnare'), uHat: ENV_LIVE('env:uHat'),
      uOpenHat: ENV_LIVE('env:uOpenHat'), uClap: ENV_LIVE('env:uClap'), uRim: ENV_LIVE('env:uRim'), uTom: ENV_LIVE('env:uTom'),
      uKeyVelocity: { kind: 'scalar', read: 'keyVelocity' },
    },
  },
  {
    decl: '() => number      stave.uRms, stave.uBass, stave.uMid, stave.uTreble;',
    comment: 'master-mix DSP thunks',
    tokens: ['uRms', 'uBass', 'uMid', 'uTreble'],
    live: { uRms: { kind: 'scalar', read: 'rms' }, uBass: { kind: 'scalar', read: 'bass' }, uMid: { kind: 'scalar', read: 'mid' }, uTreble: { kind: 'scalar', read: 'treble' } },
  },
  { decl: "Thunks            stave.u('bd'), stave.u.track('$0');", comment: '.env() .rms() .fft[i] … per sound / track', tokens: ['u', 'track'] },
  { decl: "() => number      stave.H(trackId, field = 'gain');", comment: 'raw event field reader', tokens: ['H'] },
  { decl: 'PatternScheduler  stave.scheduler;', comment: '.now(), .query(begin, end)', tokens: ['scheduler'] },
  { decl: 'string[]          stave.u.tracks, stave.u.sounds;', comment: 'live published track / sound keys', tokens: ['tracks', 'sounds'] },
]

const CATALOGUE: Record<VizRendererKind, readonly InjectedGlobal[]> = {
  p5: P5_GLOBALS,
  hydra: HYDRA_GLOBALS,
  glsl: GLSL_GLOBALS,
}

/** The catalogue of Stave-injected globals for a renderer kind (issue #309). */
export function injectedGlobals(kind: VizRendererKind): readonly InjectedGlobal[] {
  return CATALOGUE[kind]
}

/**
 * Render the read-only "Stave Inputs" reference block — a ShaderToy-style aligned
 * `decl // comment` list. Comments are padded to a common column so the block
 * reads like ShaderToy's "Shader Inputs". Multi-line decls (hydra) align each
 * continuation line's comment too.
 */
export function formatStaveInputs(kind: VizRendererKind): string {
  const rows = injectedGlobals(kind)
  // Longest single decl line (for comment alignment); multi-line decls only
  // attach the comment to their LAST physical line.
  const lastLineLen = (decl: string): number => {
    const lines = decl.split('\n')
    return lines[lines.length - 1].length
  }
  const width = Math.min(64, Math.max(...rows.map((r) => lastLineLen(r.decl)))) + 2
  const lines = rows.map((r) => {
    const declLines = r.decl.split('\n')
    const last = declLines[declLines.length - 1]
    const pad = ' '.repeat(Math.max(1, width - last.length))
    declLines[declLines.length - 1] = `${last}${pad}// ${r.comment}`
    return declLines.join('\n')
  })
  return ['// Stave Inputs', ...lines].join('\n')
}

/**
 * Look up the catalogue entry + the specific token a hovered WORD matches, for a
 * renderer kind. Returns `null` when the word is not a Stave-injected token.
 * (A bare word like `uKick` / `iTime` / `rms` is matched against every entry's
 * `tokens`; the first match wins — token sets are disjoint within a kind.)
 */
export function injectedGlobalByToken(
  kind: VizRendererKind,
  word: string,
): { entry: InjectedGlobal; token: string; live: LiveSpec | null } | null {
  for (const entry of injectedGlobals(kind)) {
    if (entry.tokens.includes(word)) {
      const live = entry.live?.[word] ?? null
      return { entry, token: word, live }
    }
  }
  return null
}
