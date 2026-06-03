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
 * Documentation for every bus accessor / symbol / field. Names are the BARE
 * identifiers (no `.` prefix) so the same map drives hover (word-under-cursor),
 * identifier completion (the symbols), and the targeted dot completion (the
 * fields). Where the p5-vs-hydra shape differs, the description states it.
 */
export const SIGNAL_BUS_DOCS: Record<string, RuntimeDoc> = {
  // ── accessors / namespaces ────────────────────────────────────────────────
  u: {
    signature: "u(sound: string): SignalReading",
    description:
      'Named-signal accessor. `u(\'bd\')` reads a sound\'s live signals (`.env`/`.velocity`/`.note`/`.color` + DSP `.rms`/`.fft`/…). Also callable as `u.track(id)`, with `u.tracks` / `u.sounds` enumerators and the master-mix DSP `u.rms`/`u.bass`/`u.mid`/`u.treble`/`u.fft`/`u.wave`. In p5 the scalar fields are live NUMBERS; in hydra they are `() => number` THUNKS.',
    example: "u('bd').env",
    kind: 'function',
    returns: 'SignalReading (sound/track) — env, velocity, note, color, rms, bass, mid, treble, fft[], wave[]',
  },
  stave: {
    signature: 'stave: { u, width, height, options, H }',
    description:
      'The live namespace passed to every sketch. Carries `stave.u` (the signal accessor, same as the bare `u`), `stave.width` / `stave.height` (live preview-pane size), `stave.options` (per-render `.viz(opts)`), and `stave.H(track)` (per-track gain thunk).',
    example: 'stave.u(\'bd\').env',
    kind: 'variable',
  },

  // ── bare drum/percussion aliases (envelope level 0..1) ────────────────────
  uKick: {
    signature: 'uKick',
    description:
      'Kick (`bd`) envelope level, 0..1, decaying each frame. In p5 a live NUMBER; in hydra a `() => number` THUNK — call it: `uKick()`.',
    example: 'circle(width / 2, height / 2, 100 * uKick)',
    kind: 'variable',
    returns: 'number 0..1',
  },
  uSnare: {
    signature: 'uSnare',
    description:
      'Snare (`sd`) envelope level, 0..1. p5: live NUMBER; hydra: `() => number` THUNK (`uSnare()`).',
    example: 'osc(() => uSnare() * 10)',
    kind: 'variable',
    returns: 'number 0..1',
  },
  uHat: {
    signature: 'uHat',
    description:
      'Closed hat (`hh`) envelope level, 0..1. p5: live NUMBER; hydra: `() => number` THUNK (`uHat()`).',
    example: 'fill(255 * uHat)',
    kind: 'variable',
    returns: 'number 0..1',
  },
  uOpenHat: {
    signature: 'uOpenHat',
    description:
      'Open hat (`oh`) envelope level, 0..1. p5: live NUMBER; hydra: `() => number` THUNK (`uOpenHat()`).',
    example: 'strokeWeight(1 + 8 * uOpenHat)',
    kind: 'variable',
    returns: 'number 0..1',
  },
  uClap: {
    signature: 'uClap',
    description:
      'Clap (`cp`) envelope level, 0..1. p5: live NUMBER; hydra: `() => number` THUNK (`uClap()`).',
    example: 'rotate(uClap * PI)',
    kind: 'variable',
    returns: 'number 0..1',
  },
  uRim: {
    signature: 'uRim',
    description:
      'Rim (`rim`) envelope level, 0..1. p5: live NUMBER; hydra: `() => number` THUNK (`uRim()`).',
    example: 'square(x, y, 20 + 40 * uRim)',
    kind: 'variable',
    returns: 'number 0..1',
  },
  uTom: {
    signature: 'uTom',
    description:
      'Tom envelope level — MAX over `lt`/`mt`/`ht`, 0..1 (any tom lights it). p5: live NUMBER; hydra: `() => number` THUNK (`uTom()`).',
    example: 'translate(0, 50 * uTom)',
    kind: 'variable',
    returns: 'number 0..1',
  },
  uKeyVelocity: {
    signature: 'uKeyVelocity',
    description:
      'Velocity of the currently active event (global), 0..1. NOT a sound alias — reads the active scheduler event\'s velocity. p5: live NUMBER; hydra: `() => number` THUNK (`uKeyVelocity()`).',
    example: 'scale(0.5 + uKeyVelocity)',
    kind: 'variable',
    returns: 'number 0..1',
  },

  // ── bare master-mix DSP scalars (analyser, combined mix) ──────────────────
  uRms: {
    signature: 'uRms',
    description:
      'Master-mix time-domain RMS (loudness), 0..1, from the combined analyser. 0 when no analyser is bound. p5: live NUMBER; hydra: `() => number` THUNK (`uRms()`).',
    example: 'background(0, 0, 100 * uRms)',
    kind: 'variable',
    returns: 'number 0..1',
  },
  uBass: {
    signature: 'uBass',
    description:
      'Master-mix low-band magnitude (mean of the low third of the spectrum), 0..1. p5: live NUMBER; hydra: `() => number` THUNK (`uBass()`).',
    example: 'osc(() => uBass() * 10)',
    kind: 'variable',
    returns: 'number 0..1',
  },
  uMid: {
    signature: 'uMid',
    description:
      'Master-mix mid-band magnitude (mean of the mid third of the spectrum), 0..1. p5: live NUMBER; hydra: `() => number` THUNK (`uMid()`).',
    example: 'fill(255 * uMid)',
    kind: 'variable',
    returns: 'number 0..1',
  },
  uTreble: {
    signature: 'uTreble',
    description:
      'Master-mix high-band magnitude (mean of the high third of the spectrum), 0..1. p5: live NUMBER; hydra: `() => number` THUNK (`uTreble()`).',
    example: 'strokeWeight(1 + 10 * uTreble)',
    kind: 'variable',
    returns: 'number 0..1',
  },

  // ── fields on a SignalReading (u('bd').<field>) ───────────────────────────
  env: {
    signature: '.env',
    description:
      'Decayed envelope level for the sound/track, 0..1 (bumps on a hit, decays 0.92/frame). p5: live NUMBER; hydra: `() => number` THUNK.',
    example: "u('bd').env",
    kind: 'method',
    returns: 'number 0..1',
  },
  velocity: {
    signature: '.velocity',
    description:
      'Velocity of the active event for this sound/track, 0..1 (scheduler feed, NOT the envelope). p5: live NUMBER; hydra: `() => number` THUNK.',
    example: "u('bd').velocity",
    kind: 'method',
    returns: 'number 0..1',
  },
  note: {
    signature: '.note',
    description:
      'Active event note in the user\'s form (name|number|null) — scheduler feed. p5: live value; hydra: `() => number | string | null` THUNK.',
    example: "u('arp').note",
    kind: 'method',
    returns: 'number | string | null',
  },
  color: {
    signature: '.color',
    description:
      'Display color of the active event (or last-bumped hap fallback), or null. p5: live value; hydra: `() => string | null` THUNK.',
    example: "u('bd').color",
    kind: 'method',
    returns: 'string | null',
  },
  rms: {
    signature: '.rms',
    description:
      'Time-domain RMS (loudness) of the sound/track\'s analyser, 0..1. 0 if no analyser bound. p5: live NUMBER; hydra: `() => number` THUNK.',
    example: "u('bd').rms",
    kind: 'method',
    returns: 'number 0..1',
  },
  bass: {
    signature: '.bass',
    description:
      'Mean of the LOW third of the spectrum, 0..1. p5: live NUMBER; hydra: `() => number` THUNK.',
    example: "u('bd').bass",
    kind: 'method',
    returns: 'number 0..1',
  },
  mid: {
    signature: '.mid',
    description:
      'Mean of the MID third of the spectrum, 0..1. p5: live NUMBER; hydra: `() => number` THUNK.',
    example: "u('bd').mid",
    kind: 'method',
    returns: 'number 0..1',
  },
  treble: {
    signature: '.treble',
    description:
      'Mean of the HIGH third of the spectrum, 0..1. p5: live NUMBER; hydra: `() => number` THUNK.',
    example: "u('bd').treble",
    kind: 'method',
    returns: 'number 0..1',
  },
  fft: {
    signature: '.fft',
    description:
      'Normalized magnitude spectrum, a live `number[]` (32 buckets, each 0..1). An ARRAY in BOTH p5 and hydra — index it natively (`u(\'bd\').fft[0]`). `[]` if no analyser bound.',
    example: "u('bd').fft[0]",
    kind: 'method',
    returns: 'number[] (each 0..1)',
  },
  wave: {
    signature: '.wave',
    description:
      'Time-domain waveform, a live `number[]` normalized -1..1. An ARRAY in BOTH p5 and hydra — index it natively. `[]` if no analyser bound.',
    example: "u('bd').wave[0]",
    kind: 'method',
    returns: 'number[] (-1..1)',
  },
  track: {
    signature: 'u.track(id: string): SignalReading',
    description:
      'Per-track reading, keyed on the SCHEDULER key space (`$0`/`$1` anonymous, `d1`/`drums` named) — NOT `IREvent.trackId`. Same fields as `u(sound)`, plus a `.sound(s)` sub-accessor for a specific sound within the track.',
    example: "u.track('$0').color",
    kind: 'method',
    returns: 'SignalReading',
  },
  tracks: {
    signature: 'u.tracks: string[]',
    description:
      'Published track keys (scheduler key space, e.g. `[\'$0\',\'$1\']` or `[\'d1\',\'drums\']`). A live array.',
    example: "u.tracks.forEach((id) => u.track(id))",
    kind: 'method',
    returns: 'string[]',
  },
  sounds: {
    signature: 'u.sounds: string[]',
    description:
      'Distinct sound names seen through the envelope feed this session. A live array.',
    example: "u.sounds.map((s) => u(s).env)",
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

/** Subset of `SIGNAL_BUS_DOCS` containing only the symbol entries. */
const SYMBOL_DOCS: Record<string, RuntimeDoc> = Object.fromEntries(
  SYMBOL_NAMES.map((n) => [n, SIGNAL_BUS_DOCS[n]]),
)

/** Subset of `SIGNAL_BUS_DOCS` containing only the field entries. */
const FIELD_DOCS: Record<string, RuntimeDoc> = Object.fromEntries(
  FIELD_NAMES.map((n) => [n, SIGNAL_BUS_DOCS[n]]),
)

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
        suggestions: Object.entries(FIELD_DOCS).map(([name, doc]) => {
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
  const hoverIndex: DocsIndex = { runtime, docs: SIGNAL_BUS_DOCS }
  const identifierIndex: DocsIndex = { runtime, docs: SYMBOL_DOCS }
  return [
    createHoverProvider(monaco, hoverIndex),
    createIdentifierCompletionProvider(monaco, identifierIndex),
    createBusFieldCompletionProvider(monaco, runtime),
  ]
}

/** Exposed for tests — the targeted-dot regex and the doc subsets. */
export const __test = {
  BUS_ACCESSOR_RE,
  SYMBOL_DOCS,
  FIELD_DOCS,
}
