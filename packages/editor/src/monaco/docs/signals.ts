/**
 * Signal-bus hover + completion docs (Phase 21) — Monaco discoverability for
 * the merged `u()` / `uKick…` / `.rms` / `.fft` named-signal bus.
 *
 * The bus is renderer-agnostic but exposes two SHAPES (D-01, see
 * `SignalBus.ts` + the two renderers):
 *   - p5   — scalar fields are LIVE NUMBERS (`u('bd').env`, bare `uKick`).
 *   - hydra — scalar fields are `() => number` THUNKS (`u('bd').env()`,
 *             bare `uKick()`), so hydra can call them per-frame natively.
 *   - `fft` / `wave` are LIVE `number[]` ARRAYS in BOTH (indexed natively).
 *
 * The doc text is grounded in the shipped API — `SignalBus.ts`
 * (`SignalReading`/`AudioReading`), `HydraVizRenderer.ts` (thunk bag +
 * `u`/`u.track`/`u.tracks`/`u.sounds`), `P5VizRenderer.ts`/`p5Compiler.ts`
 * (number getters + the `stave.u` mirror). Do NOT invent fields.
 *
 * p5 registers with `dotCompletion:false` by design, so field suggestions
 * after `u('bd').` need a TARGETED dot provider (below) rather than turning
 * the runtime's general dot-completion on (noise). The bus docs are
 * self-contained — they do NOT mutate `P5_DOCS_INDEX` / `HYDRA_DOCS_INDEX`.
 */

import type * as Monaco from 'monaco-editor'
import type { DocsIndex, RuntimeDoc } from './types'
import {
  createHoverProvider,
  createIdentifierCompletionProvider,
} from './providers'

/** Runtime ids the bus is registered for. */
export type SignalBusRuntime = 'p5js' | 'hydra'

/**
 * A bus doc entry. Same shape as `RuntimeDoc`, but the single `example: string`
 * is replaced by a `{ p5, hydra }` pair because the ACCESS FORM differs per
 * runtime (the bug this file fixes):
 *
 *   - p5   — bare globals via `with (staveUniforms)`. Scalars are live
 *            NUMBERS (`uKick`, `u('bd').rms`); arrays index natively
 *            (`u('bd').fft[i]`). The synth verbs are p5's (`circle`/`fill`/…).
 *   - hydra — NO bare globals. The sketch is `(s, stave) => …`, so EVERYTHING
 *            is `stave.`-prefixed and scalars are `() => number` THUNKS
 *            (`stave.uKick()`, `() => stave.u('bd').rms()`); arrays are
 *            `() => stave.u('bd').fft[i]`. The synth is `s.` (`s.osc(...)`).
 *
 * `registerSignalBusProviders(monaco, runtime)` picks the right string when it
 * builds the per-runtime `DocsIndex`, so each runtime's hover/completion shows
 * a copy-pasteable example for THAT renderer. `RuntimeDoc` itself stays
 * unchanged (single `example: string`).
 */
export interface BusDoc extends Omit<RuntimeDoc, 'example'> {
  /** Runtime-specific inline examples — p5 (bare numbers) vs hydra (`stave.`
   *  thunks / `s.` synth). The provider flattens this to `RuntimeDoc.example`
   *  for the registered runtime. */
  example: { p5: string; hydra: string }
}

/**
 * Documentation for every bus accessor / symbol / field. Names are the BARE
 * identifiers (no `.` prefix) so the same map drives hover (word-under-cursor),
 * identifier completion (the symbols), and the targeted dot completion (the
 * fields). Each entry carries BOTH a p5 and a hydra example (the access form
 * differs) and the description states the per-runtime form once.
 */
export const SIGNAL_BUS_DOCS: Record<string, BusDoc> = {
  // ── accessors / namespaces ────────────────────────────────────────────────
  u: {
    signature: "u(sound: string): SignalReading",
    description:
      'Named-signal accessor. `u(\'bd\')` reads a sound\'s live signals (`.env`/`.velocity`/`.note`/`.color` + DSP `.rms`/`.fft`/…). Also callable as `u.track(id)`, with `u.tracks` / `u.sounds` enumerators and the master-mix DSP `u.rms`/`u.bass`/`u.mid`/`u.treble`/`u.fft`/`u.wave`. Access form: **p5** uses bare `u` and the scalar fields are live NUMBERS (`u(\'bd\').rms`); **hydra** uses `stave.u` and the scalar fields are `() => number` THUNKS (`stave.u(\'bd\').rms()`).',
    example: {
      p5: "u('bd').env",
      hydra: "stave.u('bd').env()",
    },
    kind: 'function',
    returns: 'SignalReading (sound/track) — env, velocity, note, color, rms, bass, mid, treble, fft[], wave[]',
  },
  stave: {
    signature: 'stave: { u, width, height, options, H }',
    description:
      'The live namespace passed to every sketch — the SECOND arg of a hydra sketch `(s, stave) => …`. Carries `stave.u` (the signal accessor), `stave.width` / `stave.height` (live preview-pane size), `stave.options` (per-render `.viz(opts)`), and `stave.H(track)` (per-track gain thunk). In **hydra** everything is `stave.`-prefixed (no bare globals); in **p5** the same signals are exposed bare (`u`, `uKick`) via `with`, so `stave.u` is just the mirror.',
    example: {
      p5: "stave.u('bd').env",
      hydra: "stave.u('bd').env()",
    },
    kind: 'variable',
  },

  // ── bare drum/percussion aliases (envelope level 0..1) ────────────────────
  uKick: {
    signature: 'uKick',
    description:
      'Kick (`bd`) envelope level, 0..1, decaying each frame. Access form: **p5** bare `uKick` (live NUMBER); **hydra** `stave.uKick()` (`() => number` THUNK).',
    example: {
      p5: 'circle(width / 2, height / 2, 100 * uKick)',
      hydra: 's.osc(() => stave.uKick() * 90 + 1, 0.1, () => stave.uKick() * 3).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  uSnare: {
    signature: 'uSnare',
    description:
      'Snare (`sd`) envelope level, 0..1. **p5**: bare `uSnare` (NUMBER); **hydra**: `stave.uSnare()` (thunk).',
    example: {
      p5: 'rect(0, 0, width, height * uSnare)',
      hydra: 's.osc(() => stave.uSnare() * 20 + 5).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  uHat: {
    signature: 'uHat',
    description:
      'Closed hat (`hh`) envelope level, 0..1. **p5**: bare `uHat` (NUMBER); **hydra**: `stave.uHat()` (thunk).',
    example: {
      p5: 'fill(255 * uHat)',
      hydra: 's.osc(40, 0.1).brightness(() => stave.uHat()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  uOpenHat: {
    signature: 'uOpenHat',
    description:
      'Open hat (`oh`) envelope level, 0..1. **p5**: bare `uOpenHat` (NUMBER); **hydra**: `stave.uOpenHat()` (thunk).',
    example: {
      p5: 'strokeWeight(1 + 8 * uOpenHat)',
      hydra: 's.shape(4).scale(() => 1 + stave.uOpenHat()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  uClap: {
    signature: 'uClap',
    description:
      'Clap (`cp`) envelope level, 0..1. **p5**: bare `uClap` (NUMBER); **hydra**: `stave.uClap()` (thunk).',
    example: {
      p5: 'rotate(uClap * PI)',
      hydra: 's.osc(20).rotate(() => stave.uClap() * 3.14).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  uRim: {
    signature: 'uRim',
    description:
      'Rim (`rim`) envelope level, 0..1. **p5**: bare `uRim` (NUMBER); **hydra**: `stave.uRim()` (thunk).',
    example: {
      p5: 'square(x, y, 20 + 40 * uRim)',
      hydra: 's.osc(() => 20 + 40 * stave.uRim()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  uTom: {
    signature: 'uTom',
    description:
      'Tom envelope level — MAX over `lt`/`mt`/`ht`, 0..1 (any tom lights it). **p5**: bare `uTom` (NUMBER); **hydra**: `stave.uTom()` (thunk).',
    example: {
      p5: 'translate(0, 50 * uTom)',
      hydra: 's.osc(10).modulateScale(s.noise(2), () => stave.uTom()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  uKeyVelocity: {
    signature: 'uKeyVelocity',
    description:
      'Velocity of the currently active event (global), 0..1. NOT a sound alias — reads the active scheduler event\'s velocity. **p5**: bare `uKeyVelocity` (NUMBER); **hydra**: `stave.uKeyVelocity()` (thunk).',
    example: {
      p5: 'scale(0.5 + uKeyVelocity)',
      hydra: 's.osc(() => 10 + 30 * stave.uKeyVelocity()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },

  // ── bare master-mix DSP scalars (analyser, combined mix) ──────────────────
  uRms: {
    signature: 'uRms',
    description:
      'Master-mix time-domain RMS (loudness), 0..1, from the combined analyser. 0 when no analyser is bound. **p5**: bare `uRms` (NUMBER); **hydra**: `stave.uRms()` (thunk).',
    example: {
      p5: 'background(0, 0, 100 * uRms)',
      hydra: 's.osc(10).luma(() => stave.uRms()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  uBass: {
    signature: 'uBass',
    description:
      'Master-mix low-band magnitude (mean of the low third of the spectrum), 0..1. **p5**: bare `uBass` (NUMBER); **hydra**: `stave.uBass()` (thunk).',
    example: {
      p5: 'circle(width / 2, height / 2, 200 * uBass)',
      hydra: 's.osc(() => stave.uBass() * 10).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  uMid: {
    signature: 'uMid',
    description:
      'Master-mix mid-band magnitude (mean of the mid third of the spectrum), 0..1. **p5**: bare `uMid` (NUMBER); **hydra**: `stave.uMid()` (thunk).',
    example: {
      p5: 'fill(255 * uMid)',
      hydra: 's.osc(20).color(() => stave.uMid(), 0.5, 1).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  uTreble: {
    signature: 'uTreble',
    description:
      'Master-mix high-band magnitude (mean of the high third of the spectrum), 0..1. **p5**: bare `uTreble` (NUMBER); **hydra**: `stave.uTreble()` (thunk).',
    example: {
      p5: 'strokeWeight(1 + 10 * uTreble)',
      hydra: 's.osc(60, 0.1).pixelate(() => 4 + 40 * stave.uTreble()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },

  // ── fields on a SignalReading (u('bd').<field>) ───────────────────────────
  env: {
    signature: '.env',
    description:
      'Decayed envelope level for the sound/track, 0..1 (bumps on a hit, decays 0.92/frame). **p5**: `u(\'bd\').env` (NUMBER); **hydra**: `stave.u(\'bd\').env()` (thunk).',
    example: {
      p5: "u('bd').env",
      hydra: "s.osc(() => stave.u('bd').env() * 10).out()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  velocity: {
    signature: '.velocity',
    description:
      'Velocity of the active event for this sound/track, 0..1 (scheduler feed, NOT the envelope). **p5**: `u(\'bd\').velocity` (NUMBER); **hydra**: `stave.u(\'bd\').velocity()` (thunk).',
    example: {
      p5: "u('bd').velocity",
      hydra: "stave.u('bd').velocity()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  note: {
    signature: '.note',
    description:
      'Active event note in the user\'s form (name|number|null) — scheduler feed. **p5**: `u(\'arp\').note` (value); **hydra**: `stave.u(\'arp\').note()` (`() => number | string | null` thunk).',
    example: {
      p5: "u('arp').note",
      hydra: "stave.u('arp').note()",
    },
    kind: 'method',
    returns: 'number | string | null',
  },
  color: {
    signature: '.color',
    description:
      'Display color of the active event (or last-bumped hap fallback), or null. **p5**: `u(\'bd\').color` (value); **hydra**: `stave.u(\'bd\').color()` (thunk).',
    example: {
      p5: "u('bd').color",
      hydra: "stave.u('bd').color()",
    },
    kind: 'method',
    returns: 'string | null',
  },
  rms: {
    signature: '.rms',
    description:
      'Time-domain RMS (loudness) of the sound/track\'s analyser, 0..1. 0 if no analyser bound. **p5**: `u(\'bd\').rms` (NUMBER); **hydra**: `stave.u(\'bd\').rms()` (thunk).',
    example: {
      p5: "u('bd').rms",
      hydra: "s.osc(() => stave.u('bd').rms() * 10).out()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  bass: {
    signature: '.bass',
    description:
      'Mean of the LOW third of the spectrum, 0..1. **p5**: `u(\'bd\').bass` (NUMBER); **hydra**: `stave.u(\'bd\').bass()` (thunk).',
    example: {
      p5: "u('bd').bass",
      hydra: "stave.u('bd').bass()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  mid: {
    signature: '.mid',
    description:
      'Mean of the MID third of the spectrum, 0..1. **p5**: `u(\'bd\').mid` (NUMBER); **hydra**: `stave.u(\'bd\').mid()` (thunk).',
    example: {
      p5: "u('bd').mid",
      hydra: "stave.u('bd').mid()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  treble: {
    signature: '.treble',
    description:
      'Mean of the HIGH third of the spectrum, 0..1. **p5**: `u(\'bd\').treble` (NUMBER); **hydra**: `stave.u(\'bd\').treble()` (thunk).',
    example: {
      p5: "u('bd').treble",
      hydra: "stave.u('bd').treble()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  fft: {
    signature: '.fft',
    description:
      'Normalized magnitude spectrum, a live `number[]` (32 buckets, each 0..1). An ARRAY in BOTH runtimes — index it natively. **p5**: `u(\'bd\').fft[i]`; **hydra**: `() => stave.u(\'bd\').fft[i]` (wrap the index read in a thunk). `[]` if no analyser bound.',
    example: {
      p5: "rect(i * bw, height, bw, -u('bd').fft[i] * height)",
      hydra: "s.osc(() => 10 + stave.u('bd').fft[0] * 50).out()",
    },
    kind: 'method',
    returns: 'number[] (each 0..1)',
  },
  wave: {
    signature: '.wave',
    description:
      'Time-domain waveform, a live `number[]` normalized -1..1. An ARRAY in BOTH runtimes — index it natively. **p5**: `u(\'bd\').wave[i]`; **hydra**: `() => stave.u(\'bd\').wave[i]`. `[]` if no analyser bound.',
    example: {
      p5: "vertex(i * bw, height / 2 + u('bd').wave[i] * 50)",
      hydra: "s.osc(() => 20 + stave.u('bd').wave[0] * 40).out()",
    },
    kind: 'method',
    returns: 'number[] (-1..1)',
  },
  track: {
    signature: 'u.track(id: string): SignalReading',
    description:
      'Per-track reading, keyed on the SCHEDULER key space (`$0`/`$1` anonymous, `d1`/`drums` named) — NOT `IREvent.trackId`. Same fields as `u(sound)`. **p5**: `u.track(\'$0\').env`; **hydra**: `stave.u.track(\'$0\').env()`.',
    example: {
      p5: "u.track('$0').color",
      hydra: "stave.u.track('$0').color()",
    },
    kind: 'method',
    returns: 'SignalReading',
  },
  tracks: {
    signature: 'u.tracks: string[]',
    description:
      'Published track keys (scheduler key space, e.g. `[\'$0\',\'$1\']` or `[\'d1\',\'drums\']`). A live array. **p5**: `u.tracks`; **hydra**: `stave.u.tracks`.',
    example: {
      p5: "u.tracks.forEach((id) => u.track(id))",
      hydra: "stave.u.tracks.forEach((id) => stave.u.track(id))",
    },
    kind: 'method',
    returns: 'string[]',
  },
  sounds: {
    signature: 'u.sounds: string[]',
    description:
      'Distinct sound names seen through the envelope feed this session. A live array. **p5**: `u.sounds`; **hydra**: `stave.u.sounds`.',
    example: {
      p5: "u.sounds.map((s) => u(s).env)",
      hydra: "stave.u.sounds.map((name) => stave.u(name).env())",
    },
    kind: 'method',
    returns: 'string[]',
  },
}

/** The symbol entries — surfaced by identifier completion (top-level names). */
const SYMBOL_NAMES = [
  'u',
  'stave',
  'uKick',
  'uSnare',
  'uHat',
  'uOpenHat',
  'uClap',
  'uRim',
  'uTom',
  'uKeyVelocity',
  'uRms',
  'uBass',
  'uMid',
  'uTreble',
] as const

/** The field entries — surfaced by the targeted dot provider after a bus
 *  accessor (`u('bd').`, `u.`, `stave.u.`, `.track('x').`). */
const FIELD_NAMES = [
  'env',
  'velocity',
  'note',
  'color',
  'rms',
  'fft',
  'bass',
  'mid',
  'treble',
  'wave',
  'track',
  'tracks',
  'sounds',
] as const

/**
 * Flatten a `BusDoc` to a plain `RuntimeDoc` for a given runtime, picking the
 * runtime-correct example string. This is THE fix: the per-entry `example` is a
 * `{ p5, hydra }` pair, and here we collapse it to the single `example` field
 * `RuntimeDoc` (and the hover/completion factories) expect — so each runtime's
 * docs show only its own access form.
 */
function flattenForRuntime(
  doc: BusDoc,
  runtime: SignalBusRuntime,
): RuntimeDoc {
  const { example, ...rest } = doc
  return { ...rest, example: runtime === 'hydra' ? example.hydra : example.p5 }
}

/** Build a `{ name → RuntimeDoc }` index for `runtime` from a name subset. */
function buildRuntimeDocs(
  names: readonly string[],
  runtime: SignalBusRuntime,
): Record<string, RuntimeDoc> {
  return Object.fromEntries(
    names.map((n) => [n, flattenForRuntime(SIGNAL_BUS_DOCS[n], runtime)]),
  )
}

/**
 * Line-before-cursor pattern that fires the targeted field completion ONLY
 * after a bus accessor:
 *   - `u('bd').`   / `u("bd").`  — sound accessor
 *   - `u.`                        — master-mix DSP / enumerators
 *   - `stave.u.`                  — the `stave.u` mirror
 *   - `.track('x').`              — per-track accessor
 * It must NOT fire on an unrelated `someShape.` / `circle().`.
 */
const BUS_ACCESSOR_RE = /(?:u\s*\([^)]*\)|\bu|stave\.u|\.track\s*\([^)]*\))\s*\.\w*$/

/** Build the Monaco completion-item kind for a field doc (mirrors the
 *  factory's mapping; fields are `method` kind). */
function fieldKind(
  monaco: typeof Monaco,
): Monaco.languages.CompletionItemKind {
  return monaco.languages.CompletionItemKind.Method
}

/**
 * Targeted dot-completion provider for the FIELDS — fires only when the line
 * before the cursor matches a bus accessor (`BUS_ACCESSOR_RE`). Adapted from
 * `createDotCompletionProvider`'s body with the bus-accessor regex and the
 * field-only subset, so p5's general dot-completion can stay OFF.
 */
function createBusFieldCompletionProvider(
  monaco: typeof Monaco,
  runtime: string,
  fieldDocs: Record<string, RuntimeDoc>,
): Monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider(runtime, {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const lineBefore = model
        .getLineContent(position.lineNumber)
        .substring(0, position.column - 1)
      if (!BUS_ACCESSOR_RE.test(lineBefore)) {
        return { suggestions: [] }
      }
      const word = model.getWordUntilPosition(position)
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      return {
        suggestions: Object.entries(fieldDocs).map(([name, doc]) => {
          const documentation: Monaco.IMarkdownString = {
            value:
              (doc.description ?? '') +
              (doc.example ? '\n\n**Example:** `' + doc.example + '`' : ''),
            isTrusted: true,
          }
          return {
            label: name,
            kind: fieldKind(monaco),
            insertText: name,
            detail: doc.signature,
            documentation,
            range,
          }
        }),
      }
    },
  })
}

/**
 * Register the signal-bus hover + identifier + targeted-dot providers for one
 * runtime. Returns the disposables (the caller — `ensureProviders` — owns the
 * idempotency guard; these are append-only per call).
 *
 * - HOVER: over the full `SIGNAL_BUS_DOCS` (symbols AND fields), so hovering
 *   `uKick` / `rms` / `fft` resolves.
 * - IDENTIFIER completion: only the SYMBOLS (`u`, `uKick`, …), so typing `uK`
 *   suggests `uKick` without polluting the list with bare field names.
 * - TARGETED dot completion: only the FIELDS, fired only after a bus accessor.
 */
export function registerSignalBusProviders(
  monaco: typeof Monaco,
  runtime: SignalBusRuntime,
): Monaco.IDisposable[] {
  // Build runtime-correct indexes: each `RuntimeDoc.example` is the p5 OR hydra
  // string for THIS runtime, so hover/completion never show the other
  // renderer's access form (the bug). Names + wiring are unchanged.
  const allDocs = buildRuntimeDocs(
    [...SYMBOL_NAMES, ...FIELD_NAMES],
    runtime,
  )
  const symbolDocs = buildRuntimeDocs(SYMBOL_NAMES, runtime)
  const fieldDocs = buildRuntimeDocs(FIELD_NAMES, runtime)
  const hoverIndex: DocsIndex = { runtime, docs: allDocs }
  const identifierIndex: DocsIndex = { runtime, docs: symbolDocs }
  return [
    createHoverProvider(monaco, hoverIndex),
    createIdentifierCompletionProvider(monaco, identifierIndex),
    createBusFieldCompletionProvider(monaco, runtime, fieldDocs),
  ]
}

/** Exposed for tests — the targeted-dot regex and the runtime-aware doc
 *  builders (so a test can assert the p5-vs-hydra example pick). */
export const __test = {
  BUS_ACCESSOR_RE,
  SYMBOL_NAMES,
  FIELD_NAMES,
  buildRuntimeDocs,
  flattenForRuntime,
}
