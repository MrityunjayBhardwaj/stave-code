import type * as Monaco from 'monaco-editor'
import type { DocsIndex, RuntimeDoc } from './docs/types'
import { createHoverProvider } from './docs/providers'

// ---------------------------------------------------------------------------
// Strudel function documentation
// ---------------------------------------------------------------------------
//
// Hand-curated until upstream publishes a structured JSDoc dump. The
// Strudel repo generates `doc.json` at build time via
// `npm run jsdoc-json`, but doesn't commit or host it as a static asset —
// see `packages/editor/scripts/fetch-docs/strudel.mjs` for the path we'd
// need to automate. Until then these entries are maintained manually.
//
// Each entry is a RuntimeDoc with `example` required — the pattern for
// Strudel's hand-curated style. Each also carries a verified per-function
// `sourceUrl` permalink (strudel.cc/learn/<topic>/#<anchor>) for the Reference→
// link; only `every` lacks one (no anchor on the site) and falls back to
// STRUDEL_DOCS_INDEX.meta.docsBaseUrl.

export const STRUDEL_DOCS: Record<string, RuntimeDoc> = {
  note: {
    signature: 'note(pattern: string)',
    description: 'Play notes from a mini-notation pattern. Accepts note names (c4, eb3) or MIDI numbers.',
    example: 'note("c4 e4 g4 b4")',
    sourceUrl: 'https://strudel.cc/learn/notes/#notes',
  },
  s: {
    signature: 's(pattern: string)',
    description: 'Select a sound or synth. Accepts sample names or synth identifiers.',
    example: 's("bd sd hh sd")',
    sourceUrl: 'https://strudel.cc/learn/sounds/#sounds',
  },
  setcps: {
    signature: 'setcps(cps)',
    // Keep to one terse sentence like the other entries — Monaco content-sizes
    // the hover box, so a longer description makes setcps's box wider/taller
    // than its peers (the setcpm equivalence lives on the linked doc).
    description: 'Set the global tempo in cycles per second. Default is 1; higher is faster.',
    example: 'setcps(0.5)',
    // No dedicated #setcps anchor — the tempo section that documents it.
    sourceUrl: 'https://strudel.cc/understand/cycles/#setting-cpm',
  },
  stack: {
    signature: 'stack(...patterns)',
    description: 'Play multiple patterns simultaneously (vertical stack).',
    example: 'stack(note("c3 e3"), s("bd sd"))',
    sourceUrl: 'https://strudel.cc/learn/factories/#stack',
  },
  cat: {
    signature: 'cat(...patterns)',
    description: 'Concatenate patterns sequentially — each plays for one cycle then moves to the next.',
    example: 'cat(note("c4 e4"), note("g4 b4"))',
    sourceUrl: 'https://strudel.cc/learn/factories/#cat',
  },
  fast: {
    signature: '.fast(n)',
    description: 'Speed up the pattern by factor n.',
    example: 'note("c4 e4").fast(2)',
    sourceUrl: 'https://strudel.cc/learn/time-modifiers/#fast',
  },
  slow: {
    signature: '.slow(n)',
    description: 'Slow down the pattern by factor n.',
    example: 'note("c4 e4 g4").slow(2)',
    sourceUrl: 'https://strudel.cc/learn/time-modifiers/#slow',
  },
  rev: {
    signature: '.rev()',
    description: 'Reverse the pattern.',
    example: 'note("c4 d4 e4 f4").rev()',
    sourceUrl: 'https://strudel.cc/learn/time-modifiers/#rev',
  },
  every: {
    signature: '.every(n, fn)',
    description: 'Apply fn to the pattern every n cycles.',
    example: 'note("c4 e4 g4").every(4, x => x.rev())',
    // No per-function permalink on strudel.cc (no `#every` anchor on any
    // /learn/ page as of this writing), so `every` intentionally has no
    // sourceUrl — it falls back to meta.docsBaseUrl (the function browser).
    commonMistakes: [
      {
        // Calling `every(n, fn)` as a free function instead of chaining
        // it on a Pattern. The Strudel autoplay path then dereferences
        // `.p` on the partial application to get a Pattern, surfacing
        // as `every(...).p is not a function`. The plainer
        // `every is not a function` shape fires when `every` is
        // shadowed; both are caught by the same loose-matched word.
        detect: { kind: 'message', match: /\bevery\b[^\n]*\bis not a function\b/ },
        hint: '`.every(n, fn)` is a method on a Pattern — chain it after `note(...)` or `s(...)`.',
        weight: 2,
      },
    ],
  },
  sometimes: {
    signature: '.sometimes(fn)',
    description: 'Apply fn to events 50% of the time at random.',
    example: 'note("c4 e4 g4").sometimes(x => x.fast(2))',
    sourceUrl: 'https://strudel.cc/learn/random-modifiers/#sometimes',
  },
  degradeBy: {
    signature: '.degradeBy(amount)',
    description: 'Randomly remove events. amount is 0–1 (0 = keep all, 1 = remove all).',
    example: 'note("c4 d4 e4 f4").degradeBy(0.3)',
    sourceUrl: 'https://strudel.cc/learn/random-modifiers/#degradeby',
  },
  gain: {
    signature: '.gain(amount)',
    description: 'Set the volume. 1 is unity gain; values above 1 amplify.',
    example: 'note("c4 e4").gain(0.7)',
    sourceUrl: 'https://strudel.cc/learn/effects/#gain',
  },
  pan: {
    signature: '.pan(value)',
    description: 'Set stereo panning. -1 is hard left, 0 is center, 1 is hard right.',
    example: 'note("c4 e4 g4").pan(sine)',
    sourceUrl: 'https://strudel.cc/learn/effects/#pan',
  },
  room: {
    signature: '.room(amount)',
    description: 'Add reverb. 0 is dry, 1 is fully wet.',
    example: 'note("c4 e4").room(0.4)',
    sourceUrl: 'https://strudel.cc/learn/effects/#room',
  },
  delay: {
    signature: '.delay(amount)',
    description: 'Add delay/echo effect.',
    example: 'note("c4 e4").delay(0.3)',
    // #delay-1 is the delay FUNCTION (h3 w/ the JsDoc island); #delay is the
    // parent "Delay" section heading. Point at the function.
    sourceUrl: 'https://strudel.cc/learn/effects/#delay-1',
  },
  jux: {
    signature: '.jux(fn)',
    description: 'Apply fn to a copy of the pattern playing in the right channel, original in left.',
    example: 'note("c4 e4 g4").jux(rev)',
    sourceUrl: 'https://strudel.cc/learn/effects/#jux',
  },
  off: {
    signature: '.off(timeOffset, fn)',
    description: 'Play an offset copy of the pattern with fn applied, layered over the original.',
    example: 'note("c4 e4 g4").off(0.25, x => x.gain(0.5))',
    sourceUrl: 'https://strudel.cc/learn/accumulation/#off',
  },
  layer: {
    signature: '.layer(...fns)',
    description: 'Apply multiple functions to copies of the pattern and stack all results.',
    example: 'note("c4 e4 g4").layer(x => x.fast(2), rev)',
    sourceUrl: 'https://strudel.cc/learn/accumulation/#layer',
  },
  struct: {
    signature: '.struct(pattern)',
    description: 'Impose a rhythmic structure on the pattern from a boolean/euclid pattern.',
    example: 'note("c4").struct("t f t t f t t f")',
    sourceUrl: 'https://strudel.cc/learn/conditional-modifiers/#struct',
  },
  mask: {
    signature: '.mask(pattern)',
    description: 'Filter events by a boolean pattern — only play where the mask is true.',
    example: 'note("c4 d4 e4 f4").mask("t t f t")',
    sourceUrl: 'https://strudel.cc/learn/conditional-modifiers/#mask',
  },
  euclid: {
    signature: '.euclid(steps, total)',
    description: 'Euclidean rhythm: distribute steps evenly across total slots.',
    example: 's("bd").euclid(3, 8)',
    sourceUrl: 'https://strudel.cc/learn/time-modifiers/#euclid',
  },
  iter: {
    signature: '.iter(n)',
    description: 'Iterate through n rotations of the pattern over n cycles.',
    example: 'note("c4 d4 e4 f4").iter(4)',
    sourceUrl: 'https://strudel.cc/learn/time-modifiers/#iter',
  },
  chunk: {
    signature: '.chunk(n, fn)',
    description: 'Divide pattern into n chunks, applying fn to one chunk per cycle in rotation.',
    example: 'note("c4 d4 e4 f4").chunk(4, x => x.fast(2))',
    sourceUrl: 'https://strudel.cc/learn/conditional-modifiers/#chunk',
  },
  cutoff: {
    signature: '.cutoff(freq)',
    description: 'Low-pass filter cutoff frequency in Hz.',
    example: 'note("c4 e4").s("sawtooth").cutoff(800)',
    // `cutoff` is documented as a synonym of `lpf` (no own anchor).
    sourceUrl: 'https://strudel.cc/learn/effects/#lpf',
  },
  resonance: {
    signature: '.resonance(amount)',
    description: 'Filter resonance (Q). Higher values create a more pronounced peak.',
    example: 'note("c4 e4").s("sawtooth").cutoff(sine.range(200,2000)).resonance(8)',
    // `resonance` is documented as a synonym of `lpq` (no own anchor).
    sourceUrl: 'https://strudel.cc/learn/effects/#lpq',
  },
  hpf: {
    signature: '.hpf(freq)',
    description: 'High-pass filter — removes frequencies below the cutoff.',
    example: 's("amen").hpf(400)',
    sourceUrl: 'https://strudel.cc/learn/effects/#hpf',
  },
  lpf: {
    signature: '.lpf(freq)',
    description: 'Low-pass filter — alias for cutoff.',
    example: 'note("c4 e4").lpf(1200)',
    sourceUrl: 'https://strudel.cc/learn/effects/#lpf',
  },
  release: {
    signature: '.release(seconds)',
    description: 'Envelope release time in seconds.',
    example: 'note("c4 e4 g4").release(0.5)',
    sourceUrl: 'https://strudel.cc/learn/effects/#release',
  },
  sustain: {
    signature: '.sustain(seconds)',
    description: 'Envelope sustain duration in seconds.',
    example: 'note("c4").sustain(0.1).release(0.3)',
    sourceUrl: 'https://strudel.cc/learn/effects/#sustain',
  },
  speed: {
    signature: '.speed(rate)',
    description: 'Sample playback rate. 1 is normal, 2 is double speed (up one octave), -1 is reversed.',
    example: 's("amen").speed(0.5)',
    // `speed` is a sampler control — documented on the samples page, not effects.
    sourceUrl: 'https://strudel.cc/learn/samples/#speed',
  },
  vowel: {
    signature: '.vowel(v)',
    description: 'Vowel formant filter. Accepts "a", "e", "i", "o", "u".',
    example: 'note("c4 d4 e4").vowel("<a e i o>")',
    sourceUrl: 'https://strudel.cc/learn/effects/#vowel',
  },
  orbit: {
    signature: '.orbit(n)',
    description: 'Route to audio effect bus n. Patterns on the same orbit share effects.',
    example: 'note("c4 e4").room(0.5).orbit(1)',
    sourceUrl: 'https://strudel.cc/learn/effects/#orbit',
  },
  // Stave extension — NOT a Strudel function. An empty `sourceUrl` suppresses
  // the Reference→ link (providers.ts renders it only when the href is truthy;
  // `'' ?? docsBaseUrl` stays `''`), so we never send the user to a strudel.cc
  // page that doesn't document it.
  viz: {
    signature: '.viz(name)',
    description: 'Stave feature (not Strudel): render a named inline visualizer below this pattern.',
    example: 's("bd*4").viz("pianoroll")',
    sourceUrl: '',
  },
}

// ---------------------------------------------------------------------------
// Index + hover provider — uses the shared factory so the markdown layout
// matches p5js / hydra / sonicpi hovers exactly.
// ---------------------------------------------------------------------------

export const STRUDEL_DOCS_INDEX: DocsIndex = {
  runtime: 'strudel',
  docs: STRUDEL_DOCS,
  // camelCase spelling of setcps resolves to the same doc.
  aliases: { setCps: 'setcps' },
  // Catch-all friendly-error hints that aren't tied to a single symbol.
  // The two cases below are the highest-frequency Strudel papercut:
  // bare note / drum names outside a string. JS evaluates them as
  // identifiers and throws ReferenceError — without these hints the
  // user sees "c4 is not defined" with a Levenshtein neighbour
  // ("cat"?) that doesn't help.
  globalMistakes: [
    {
      detect: {
        kind: 'message',
        // Note names: c, d, e, f, g, a, b — optional sharp/flat,
        // optional octave digit. Anchored to start so we don't match
        // mid-message references.
        match: /^[a-g][s#b]?\d? is not defined$/i,
      },
      hint: 'Looks like a note name — wrap it in a string: `note("c4")`.',
      example: 'note("c4 e4 g4")',
    },
    {
      detect: {
        kind: 'message',
        // Drum / sample shorthands. Curated list; expand as we
        // observe new ones in the wild.
        match:
          /^(bd|sd|hh|oh|cp|cb|rim|tom|cy|kick|snare|hat|clap|crash|ride) is not defined$/i,
      },
      hint: 'Looks like a drum name — wrap it in a string: `s("bd")`.',
      example: 's("bd sd hh sd")',
    },
  ],
  meta: {
    source: 'hand-curated',
    // Each entry carries its own `sourceUrl` — a verified per-function
    // permalink on strudel.cc/learn (e.g. `#gain` on /learn/effects/). This
    // `docsBaseUrl` is only the FALLBACK for the rare entry with no permalink
    // (currently just `every`): it lands the user in the searchable function
    // browser. See providers.ts: `href = doc.sourceUrl ?? docsBaseUrl`.
    docsBaseUrl: 'https://strudel.cc/functions/',
  },
}

export function registerStrudelHover(
  monaco: typeof Monaco,
): Monaco.IDisposable {
  return createHoverProvider(monaco, STRUDEL_DOCS_INDEX)
}
