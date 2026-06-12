/**
 * Signal-bus hover + completion docs (Phase 21) — Monaco discoverability for
 * the merged `sig()` / `sig.kick…` / `.rms` / `.fft` named-signal bus.
 *
 * The bus is renderer-agnostic but exposes two SHAPES (D-01, see
 * `SignalBus.ts` + the two renderers):
 *   - p5   — scalar fields are LIVE NUMBERS (`sig('bd').env`, bare `sig.kick`).
 *   - hydra — scalar fields are `() => number` THUNKS (`sig('bd').env()`,
 *             bare `sig.kick()`), so hydra can call them per-frame natively.
 *   - `fft` / `wave` are LIVE `number[]` ARRAYS in BOTH (indexed natively).
 *
 * The doc text is grounded in the shipped API — `SignalBus.ts`
 * (`SignalReading`/`AudioReading`), `HydraVizRenderer.ts` (thunk bag +
 * `sig`/`sig.track`/`sig.tracks`/`sig.sounds`), `P5VizRenderer.ts`/`p5Compiler.ts`
 * (number getters + the `stave.sig` mirror). Do NOT invent fields.
 *
 * p5 registers with `dotCompletion:false` by design, so field suggestions
 * after `sig('bd').` need a TARGETED dot provider (below) rather than turning
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
 *            NUMBERS (`sig.kick`, `sig('bd').rms`); arrays index natively
 *            (`sig('bd').fft[i]`). The synth verbs are p5's (`circle`/`fill`/…).
 *   - hydra — NO bare globals. The sketch is `(s, stave) => …`, so EVERYTHING
 *            is `stave.`-prefixed and scalars are `() => number` THUNKS
 *            (`stave.sig.kick()`, `() => stave.sig('bd').rms()`); arrays are
 *            `() => stave.sig('bd').fft[i]`. The synth is `s.` (`s.osc(...)`).
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
 * identifiers (no `sig.` prefix) so the same map drives hover (word-under-cursor),
 * identifier completion (the symbols), and the targeted dot completion (the
 * fields). Each entry carries BOTH a p5 and a hydra example (the access form
 * differs) and the description states the per-runtime form once.
 */
export const SIGNAL_BUS_DOCS: Record<string, BusDoc> = {
  // ── accessors / namespaces ────────────────────────────────────────────────
  sig: {
    signature: "sig(sound: string): SignalReading",
    description:
      'Named-signal accessor. `sig(\'bd\')` reads a sound\'s live signals (`.env`/`.velocity`/`.note`/`.color` + DSP `.rms`/`.fft`/…). Also callable as `sig.track(id)`, with `sig.tracks` / `sig.sounds` enumerators and the master-mix DSP `sig.rms`/`sig.bass`/`sig.mid`/`sig.treble`/`sig.fft`/`sig.wave`. Access form: **p5** uses bare `sig` and the scalar fields are live NUMBERS (`sig(\'bd\').rms`); **hydra** uses `stave.sig` and the scalar fields are `() => number` THUNKS (`stave.sig(\'bd\').rms()`).',
    example: {
      p5: "sig('bd').env",
      hydra: "stave.sig('bd').env()",
    },
    kind: 'function',
    returns: 'SignalReading (sound/track) — env, velocity, note, color, rms, bass, mid, treble, fft[], wave[]',
  },
  stave: {
    signature: 'stave: { sig, width, height, options, H }',
    description:
      'The live namespace passed to every sketch — the SECOND arg of a hydra sketch `(s, stave) => …`. Carries `stave.sig` (the signal accessor), `stave.width` / `stave.height` (live preview-pane size), `stave.options` (per-render `.viz(opts)`), and `stave.H(track)` (per-track gain thunk). In **hydra** everything is `stave.`-prefixed (no bare globals); in **p5** the same signals are exposed bare (`sig`, `sig.kick`) via `with`, so `stave.sig` is just the mirror.',
    example: {
      p5: "stave.sig('bd').env",
      hydra: "stave.sig('bd').env()",
    },
    kind: 'variable',
  },

  // ── drum/percussion scalars on `sig` (envelope level 0..1) ────────────────
  kick: {
    signature: 'sig.kick',
    description:
      'Kick (`bd`) envelope level, 0..1, decaying each frame. Access form: **p5** `sig.kick` (live NUMBER); **hydra** `stave.sig.kick()` (`() => number` THUNK).',
    example: {
      p5: 'circle(width / 2, height / 2, 100 * sig.kick)',
      hydra: 's.osc(() => stave.sig.kick() * 90 + 1, 0.1, () => stave.sig.kick() * 3).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  snare: {
    signature: 'sig.snare',
    description:
      'Snare (`sd`) envelope level, 0..1. **p5**: `sig.snare` (NUMBER); **hydra**: `stave.sig.snare()` (thunk).',
    example: {
      p5: 'rect(0, 0, width, height * sig.snare)',
      hydra: 's.osc(() => stave.sig.snare() * 20 + 5).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  hat: {
    signature: 'sig.hat',
    description:
      'Closed hat (`hh`) envelope level, 0..1. **p5**: `sig.hat` (NUMBER); **hydra**: `stave.sig.hat()` (thunk).',
    example: {
      p5: 'fill(255 * sig.hat)',
      hydra: 's.osc(40, 0.1).brightness(() => stave.sig.hat()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  openHat: {
    signature: 'sig.openHat',
    description:
      'Open hat (`oh`) envelope level, 0..1. **p5**: `sig.openHat` (NUMBER); **hydra**: `stave.sig.openHat()` (thunk).',
    example: {
      p5: 'strokeWeight(1 + 8 * sig.openHat)',
      hydra: 's.shape(4).scale(() => 1 + stave.sig.openHat()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  clap: {
    signature: 'sig.clap',
    description:
      'Clap (`cp`) envelope level, 0..1. **p5**: `sig.clap` (NUMBER); **hydra**: `stave.sig.clap()` (thunk).',
    example: {
      p5: 'rotate(sig.clap * PI)',
      hydra: 's.osc(20).rotate(() => stave.sig.clap() * 3.14).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  rim: {
    signature: 'sig.rim',
    description:
      'Rim (`rim`) envelope level, 0..1. **p5**: `sig.rim` (NUMBER); **hydra**: `stave.sig.rim()` (thunk).',
    example: {
      p5: 'square(x, y, 20 + 40 * sig.rim)',
      hydra: 's.osc(() => 20 + 40 * stave.sig.rim()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  tom: {
    signature: 'sig.tom',
    description:
      'Tom envelope level — MAX over `lt`/`mt`/`ht`, 0..1 (any tom lights it). **p5**: `sig.tom` (NUMBER); **hydra**: `stave.sig.tom()` (thunk).',
    example: {
      p5: 'translate(0, 50 * sig.tom)',
      hydra: 's.osc(10).modulateScale(s.noise(2), () => stave.sig.tom()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },
  keyVelocity: {
    signature: 'sig.keyVelocity',
    description:
      'Velocity of the currently active event (global), 0..1. NOT a sound alias — reads the active scheduler event\'s velocity. **p5**: `sig.keyVelocity` (NUMBER); **hydra**: `stave.sig.keyVelocity()` (thunk).',
    example: {
      p5: 'scale(0.5 + sig.keyVelocity)',
      hydra: 's.osc(() => 10 + 30 * stave.sig.keyVelocity()).out()',
    },
    kind: 'variable',
    returns: 'number 0..1',
  },

  // ── fields on a SignalReading (sig('bd').<field>) ─────────────────────────
  // The master-mix DSP scalars (`sig.rms`/`sig.bass`/`sig.mid`/`sig.treble`/
  // `sig.fft`/`sig.wave`) share the SAME field tokens as the per-sound reads
  // (`sig('bd').rms`, …) under the merged `sig` namespace, so one entry per
  // token documents both forms.
  env: {
    signature: ".env (on sig('bd'))",
    description:
      'Decayed envelope level for the sound/track, 0..1 (bumps on a hit, decays 0.92/frame). **p5**: `sig(\'bd\').env` (NUMBER); **hydra**: `stave.sig(\'bd\').env()` (thunk).',
    example: {
      p5: "sig('bd').env",
      hydra: "s.osc(() => stave.sig('bd').env() * 10).out()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  velocity: {
    signature: ".velocity (on sig('bd'))",
    description:
      'Velocity of the active event for this sound/track, 0..1 (scheduler feed, NOT the envelope). **p5**: `sig(\'bd\').velocity` (NUMBER); **hydra**: `stave.sig(\'bd\').velocity()` (thunk).',
    example: {
      p5: "sig('bd').velocity",
      hydra: "stave.sig('bd').velocity()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  note: {
    signature: ".note (on sig('arp'))",
    description:
      'Active event note in the user\'s form (name|number|null) — scheduler feed. **p5**: `sig(\'arp\').note` (value); **hydra**: `stave.sig(\'arp\').note()` (`() => number | string | null` thunk).',
    example: {
      p5: "sig('arp').note",
      hydra: "stave.sig('arp').note()",
    },
    kind: 'method',
    returns: 'number | string | null',
  },
  color: {
    signature: ".color (on sig('bd'))",
    description:
      'Display color of the active event (or last-bumped hap fallback), or null. **p5**: `sig(\'bd\').color` (value); **hydra**: `stave.sig(\'bd\').color()` (thunk).',
    example: {
      p5: "sig('bd').color",
      hydra: "stave.sig('bd').color()",
    },
    kind: 'method',
    returns: 'string | null',
  },
  rms: {
    signature: 'sig.rms (master) · .rms (on sig(\'bd\'))',
    description:
      'Time-domain RMS (loudness), 0..1. 0 if no analyser bound. As `sig.rms` it is the MASTER mix; as `sig(\'bd\').rms` it is that sound/track. **p5**: `sig.rms` / `sig(\'bd\').rms` (NUMBER); **hydra**: `stave.sig.rms()` / `stave.sig(\'bd\').rms()` (thunk).',
    example: {
      p5: "background(0, 0, 100 * sig.rms)",
      hydra: "s.osc(() => stave.sig('bd').rms() * 10).out()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  bass: {
    signature: 'sig.bass (master) · .bass (on sig(\'bd\'))',
    description:
      'Mean of the LOW third of the spectrum, 0..1. `sig.bass` is the MASTER mix; `sig(\'bd\').bass` is per sound/track. **p5**: `sig.bass` / `sig(\'bd\').bass` (NUMBER); **hydra**: `stave.sig.bass()` / `stave.sig(\'bd\').bass()` (thunk).',
    example: {
      p5: "circle(width / 2, height / 2, 200 * sig.bass)",
      hydra: "s.osc(() => stave.sig.bass() * 10).out()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  mid: {
    signature: 'sig.mid (master) · .mid (on sig(\'bd\'))',
    description:
      'Mean of the MID third of the spectrum, 0..1. `sig.mid` is the MASTER mix; `sig(\'bd\').mid` is per sound/track. **p5**: `sig.mid` / `sig(\'bd\').mid` (NUMBER); **hydra**: `stave.sig.mid()` / `stave.sig(\'bd\').mid()` (thunk).',
    example: {
      p5: "fill(255 * sig.mid)",
      hydra: "s.osc(20).color(() => stave.sig.mid(), 0.5, 1).out()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  treble: {
    signature: 'sig.treble (master) · .treble (on sig(\'bd\'))',
    description:
      'Mean of the HIGH third of the spectrum, 0..1. `sig.treble` is the MASTER mix; `sig(\'bd\').treble` is per sound/track. **p5**: `sig.treble` / `sig(\'bd\').treble` (NUMBER); **hydra**: `stave.sig.treble()` / `stave.sig(\'bd\').treble()` (thunk).',
    example: {
      p5: "strokeWeight(1 + 10 * sig.treble)",
      hydra: "s.osc(60, 0.1).pixelate(() => 4 + 40 * stave.sig.treble()).out()",
    },
    kind: 'method',
    returns: 'number 0..1',
  },
  fft: {
    signature: 'sig.fft (master) · .fft (on sig(\'bd\'))',
    description:
      'Normalized magnitude spectrum, a live `number[]` (32 buckets, each 0..1). `sig.fft` is the MASTER mix; `sig(\'bd\').fft` is per sound/track. An ARRAY in BOTH runtimes — index it natively. **p5**: `sig(\'bd\').fft[i]`; **hydra**: `() => stave.sig(\'bd\').fft[i]` (wrap the index read in a thunk). `[]` if no analyser bound.',
    example: {
      p5: "rect(i * bw, height, bw, -sig('bd').fft[i] * height)",
      hydra: "s.osc(() => 10 + stave.sig('bd').fft[0] * 50).out()",
    },
    kind: 'method',
    returns: 'number[] (each 0..1)',
  },
  wave: {
    signature: 'sig.wave (master) · .wave (on sig(\'bd\'))',
    description:
      'Time-domain waveform, a live `number[]` normalized -1..1. `sig.wave` is the MASTER mix; `sig(\'bd\').wave` is per sound/track. An ARRAY in BOTH runtimes — index it natively. **p5**: `sig(\'bd\').wave[i]`; **hydra**: `() => stave.sig(\'bd\').wave[i]`. `[]` if no analyser bound.',
    example: {
      p5: "vertex(i * bw, height / 2 + sig('bd').wave[i] * 50)",
      hydra: "s.osc(() => 20 + stave.sig('bd').wave[0] * 40).out()",
    },
    kind: 'method',
    returns: 'number[] (-1..1)',
  },
  track: {
    signature: 'sig.track(id: string): SignalReading',
    description:
      'Per-track reading, keyed on the SCHEDULER key space (`$0`/`$1` anonymous, `d1`/`drums` named) — NOT `IREvent.trackId`. Same fields as `sig(sound)`. **p5**: `sig.track(\'$0\').env`; **hydra**: `stave.sig.track(\'$0\').env()`.',
    example: {
      p5: "sig.track('$0').color",
      hydra: "stave.sig.track('$0').color()",
    },
    kind: 'method',
    returns: 'SignalReading',
  },
  tracks: {
    signature: 'sig.tracks: string[]',
    description:
      'Published track keys (scheduler key space, e.g. `[\'$0\',\'$1\']` or `[\'d1\',\'drums\']`). A live array. **p5**: `sig.tracks`; **hydra**: `stave.sig.tracks`.',
    example: {
      p5: "sig.tracks.forEach((id) => sig.track(id))",
      hydra: "stave.sig.tracks.forEach((id) => stave.sig.track(id))",
    },
    kind: 'method',
    returns: 'string[]',
  },
  sounds: {
    signature: 'sig.sounds: string[]',
    description:
      'Distinct sound names seen through the envelope feed this session. A live array. **p5**: `sig.sounds`; **hydra**: `stave.sig.sounds`.',
    example: {
      p5: "sig.sounds.map((s) => sig(s).env)",
      hydra: "stave.sig.sounds.map((name) => stave.sig(name).env())",
    },
    kind: 'method',
    returns: 'string[]',
  },
}

/** The symbol entries — surfaced by identifier completion (top-level names).
 *  Under the merged `sig` namespace only the accessor (`sig`) and the live
 *  namespace (`stave`) are bare top-level names; the drum/DSP scalars are now
 *  FIELDS on `sig` (`sig.kick`, `sig.rms`), so they live in `FIELD_NAMES`. */
const SYMBOL_NAMES = [
  'sig',
  'stave',
] as const

/** The field entries — surfaced by the targeted dot provider after a bus
 *  accessor (`sig('bd').`, `sig.`, `stave.sig.`, `.track('x').`). Includes the
 *  drum/percussion scalars (`kick`…`keyVelocity`) and the master-mix/per-sound
 *  DSP scalars (`rms`/`bass`/`mid`/`treble`), which collapse to one token each. */
const FIELD_NAMES = [
  'kick',
  'snare',
  'hat',
  'openHat',
  'clap',
  'rim',
  'tom',
  'keyVelocity',
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
 *   - `sig('bd').` / `sig("bd").` — sound accessor
 *   - `sig.`                       — master-mix DSP / drum scalars / enumerators
 *   - `stave.sig.`                 — the `stave.sig` mirror
 *   - `.track('x').`               — per-track accessor
 * It must NOT fire on an unrelated `someShape.` / `circle().`.
 */
const BUS_ACCESSOR_RE = /(?:sig\s*\([^)]*\)|\bsig|stave\.sig|\.track\s*\([^)]*\))\s*\.\w*$/

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
 *   `kick` / `rms` / `fft` resolves.
 * - IDENTIFIER completion: only the SYMBOLS (`sig`, `stave`), so typing `si`
 *   suggests `sig` without polluting the list with bare field names.
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
