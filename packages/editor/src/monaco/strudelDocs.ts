import type * as Monaco from 'monaco-editor'

// ---------------------------------------------------------------------------
// Strudel function documentation
// ---------------------------------------------------------------------------

export interface StrudelDoc {
  signature: string
  description: string
  example: string
}

export const STRUDEL_DOCS: Record<string, StrudelDoc> = {
  note: {
    signature: 'note(pattern: string)',
    description: 'Play notes from a mini-notation pattern. Accepts note names (c4, eb3) or MIDI numbers.',
    example: 'note("c4 e4 g4 b4")',
  },
  s: {
    signature: 's(pattern: string)',
    description: 'Select a sound or synth. Accepts sample names or synth identifiers.',
    example: 's("bd sd hh sd")',
  },
  stack: {
    signature: 'stack(...patterns)',
    description: 'Play multiple patterns simultaneously (vertical stack).',
    example: 'stack(note("c3 e3"), s("bd sd"))',
  },
  cat: {
    signature: 'cat(...patterns)',
    description: 'Concatenate patterns sequentially — each plays for one cycle then moves to the next.',
    example: 'cat(note("c4 e4"), note("g4 b4"))',
  },
  fast: {
    signature: '.fast(n)',
    description: 'Speed up the pattern by factor n.',
    example: 'note("c4 e4").fast(2)',
  },
  slow: {
    signature: '.slow(n)',
    description: 'Slow down the pattern by factor n.',
    example: 'note("c4 e4 g4").slow(2)',
  },
  rev: {
    signature: '.rev()',
    description: 'Reverse the pattern.',
    example: 'note("c4 d4 e4 f4").rev()',
  },
  every: {
    signature: '.every(n, fn)',
    description: 'Apply fn to the pattern every n cycles.',
    example: 'note("c4 e4 g4").every(4, x => x.rev())',
  },
  sometimes: {
    signature: '.sometimes(fn)',
    description: 'Apply fn to events 50% of the time at random.',
    example: 'note("c4 e4 g4").sometimes(x => x.fast(2))',
  },
  degradeBy: {
    signature: '.degradeBy(amount)',
    description: 'Randomly remove events. amount is 0–1 (0 = keep all, 1 = remove all).',
    example: 'note("c4 d4 e4 f4").degradeBy(0.3)',
  },
  gain: {
    signature: '.gain(amount)',
    description: 'Set the volume. 1 is unity gain; values above 1 amplify.',
    example: 'note("c4 e4").gain(0.7)',
  },
  pan: {
    signature: '.pan(value)',
    description: 'Set stereo panning. -1 is hard left, 0 is center, 1 is hard right.',
    example: 'note("c4 e4 g4").pan(sine)',
  },
  room: {
    signature: '.room(amount)',
    description: 'Add reverb. 0 is dry, 1 is fully wet.',
    example: 'note("c4 e4").room(0.4)',
  },
  delay: {
    signature: '.delay(amount)',
    description: 'Add delay/echo effect.',
    example: 'note("c4 e4").delay(0.3)',
  },
  jux: {
    signature: '.jux(fn)',
    description: 'Apply fn to a copy of the pattern playing in the right channel, original in left.',
    example: 'note("c4 e4 g4").jux(rev)',
  },
  off: {
    signature: '.off(timeOffset, fn)',
    description: 'Play an offset copy of the pattern with fn applied, layered over the original.',
    example: 'note("c4 e4 g4").off(0.25, x => x.gain(0.5))',
  },
  layer: {
    signature: '.layer(...fns)',
    description: 'Apply multiple functions to copies of the pattern and stack all results.',
    example: 'note("c4 e4 g4").layer(x => x.fast(2), rev)',
  },
  struct: {
    signature: '.struct(pattern)',
    description: 'Impose a rhythmic structure on the pattern from a boolean/euclid pattern.',
    example: 'note("c4").struct("t f t t f t t f")',
  },
  mask: {
    signature: '.mask(pattern)',
    description: 'Filter events by a boolean pattern — only play where the mask is true.',
    example: 'note("c4 d4 e4 f4").mask("t t f t")',
  },
  euclid: {
    signature: '.euclid(steps, total)',
    description: 'Euclidean rhythm: distribute steps evenly across total slots.',
    example: 's("bd").euclid(3, 8)',
  },
  iter: {
    signature: '.iter(n)',
    description: 'Iterate through n rotations of the pattern over n cycles.',
    example: 'note("c4 d4 e4 f4").iter(4)',
  },
  chunk: {
    signature: '.chunk(n, fn)',
    description: 'Divide pattern into n chunks, applying fn to one chunk per cycle in rotation.',
    example: 'note("c4 d4 e4 f4").chunk(4, x => x.fast(2))',
  },
  cutoff: {
    signature: '.cutoff(freq)',
    description: 'Low-pass filter cutoff frequency in Hz.',
    example: 'note("c4 e4").s("sawtooth").cutoff(800)',
  },
  resonance: {
    signature: '.resonance(amount)',
    description: 'Filter resonance (Q). Higher values create a more pronounced peak.',
    example: 'note("c4 e4").s("sawtooth").cutoff(sine.range(200,2000)).resonance(8)',
  },
  hpf: {
    signature: '.hpf(freq)',
    description: 'High-pass filter — removes frequencies below the cutoff.',
    example: 's("amen").hpf(400)',
  },
  lpf: {
    signature: '.lpf(freq)',
    description: 'Low-pass filter — alias for cutoff.',
    example: 'note("c4 e4").lpf(1200)',
  },
  release: {
    signature: '.release(seconds)',
    description: 'Envelope release time in seconds.',
    example: 'note("c4 e4 g4").release(0.5)',
  },
  sustain: {
    signature: '.sustain(seconds)',
    description: 'Envelope sustain duration in seconds.',
    example: 'note("c4").sustain(0.1).release(0.3)',
  },
  speed: {
    signature: '.speed(rate)',
    description: 'Sample playback rate. 1 is normal, 2 is double speed (up one octave), -1 is reversed.',
    example: 's("amen").speed(0.5)',
  },
  vowel: {
    signature: '.vowel(v)',
    description: 'Vowel formant filter. Accepts "a", "e", "i", "o", "u".',
    example: 'note("c4 d4 e4").vowel("<a e i o>")',
  },
  orbit: {
    signature: '.orbit(n)',
    description: 'Route to audio effect bus n. Patterns on the same orbit share effects.',
    example: 'note("c4 e4").room(0.5).orbit(1)',
  },
}

// ---------------------------------------------------------------------------
// Hover provider
// ---------------------------------------------------------------------------

export function registerStrudelHover(monaco: typeof Monaco): Monaco.IDisposable {
  return monaco.languages.registerHoverProvider('strudel', {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position)
      if (!word) return null

      const doc = STRUDEL_DOCS[word.word]
      if (!doc) return null

      const contents: Monaco.IMarkdownString[] = [
        { value: `\`\`\`typescript\n${doc.signature}\n\`\`\`` },
        { value: doc.description },
        { value: `**Example:** \`${doc.example}\`` },
      ]

      return {
        range: new monaco.Range(
          position.lineNumber, word.startColumn,
          position.lineNumber, word.endColumn
        ),
        contents,
      }
    },
  })
}
