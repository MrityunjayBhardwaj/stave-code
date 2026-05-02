import { describe, it, expect } from 'vitest'
import type { DocsIndex } from '../../monaco/docs/types'
import {
  levenshtein,
  fuzzyMatch,
  extractReferenceIdentifier,
  formatFriendlyError,
  parseStackLocation,
} from '../friendlyErrors'

const FAKE_INDEX: DocsIndex = {
  runtime: 'p5',
  docs: {
    save: {
      signature: 'save(filename?: string)',
      description: 'Save the current sketch canvas.',
      example: 'save("out.png")',
    },
    ellipse: {
      signature: 'ellipse(x, y, w, h)',
      description: 'Draws an ellipse.',
      example: 'ellipse(50, 50, 80, 80)',
    },
    background: {
      signature: 'background(color)',
      description: 'Sets the background color.',
      example: 'background(220)',
    },
    noise: {
      signature: 'noise(x, y?, z?)',
      description: 'Returns the Perlin noise value.',
      example: 'noise(0.1)',
    },
  },
}

describe('levenshtein', () => {
  it('zero for identical strings', () => {
    expect(levenshtein('cat', 'cat')).toBe(0)
  })
  it('length when one side is empty', () => {
    expect(levenshtein('', 'hello')).toBe(5)
    expect(levenshtein('world', '')).toBe(5)
  })
  it('one for a single substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1)
  })
  it('symmetric', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('sitting', 'kitten')).toBe(3)
  })
  it('handles unicode char-by-char', () => {
    expect(levenshtein('é', 'e')).toBe(1)
  })
})

describe('fuzzyMatch', () => {
  const corpus = Object.keys(FAKE_INDEX.docs)

  it('returns the exact match first', () => {
    const r = fuzzyMatch('ellipse', corpus)
    expect(r[0].name).toBe('ellipse')
    expect(r[0].distance).toBe(0)
  })

  it('returns close matches sorted by distance', () => {
    const r = fuzzyMatch('elipse', corpus)
    expect(r[0].name).toBe('ellipse')
    expect(r[0].distance).toBe(1)
  })

  it('respects the threshold default (tighter for long words)', () => {
    // word of length 3 → threshold = 2. "bkg" vs "background" is far.
    expect(fuzzyMatch('bkg', corpus)).toEqual([])
  })

  it('honors maxDistance override', () => {
    const r = fuzzyMatch('bkg', corpus, { maxDistance: 10 })
    expect(r.length).toBeGreaterThan(0)
  })

  it('caps by limit', () => {
    const r = fuzzyMatch('x', corpus, { maxDistance: 20, limit: 2 })
    expect(r.length).toBeLessThanOrEqual(2)
  })

  it('empty word → empty result', () => {
    expect(fuzzyMatch('', corpus)).toEqual([])
  })
})

describe('extractReferenceIdentifier', () => {
  it('Chrome format', () => {
    expect(
      extractReferenceIdentifier(new ReferenceError('stave is not defined')),
    ).toBe('stave')
  })
  it('Uncaught prefix stripped', () => {
    expect(
      extractReferenceIdentifier({ message: 'Uncaught foo is not defined' }),
    ).toBe('foo')
  })
  it('Safari format', () => {
    expect(
      extractReferenceIdentifier({ message: "Can't find variable: mystery" }),
    ).toBe('mystery')
  })
  it('string errors fall through', () => {
    expect(
      extractReferenceIdentifier('bar is not defined'),
    ).toBe('bar')
  })
  it('non-reference error returns null', () => {
    expect(
      extractReferenceIdentifier(new TypeError('x is not a function')),
    ).toBeNull()
  })
  it('empty input returns null', () => {
    expect(extractReferenceIdentifier(null)).toBeNull()
    expect(extractReferenceIdentifier('')).toBeNull()
  })
})

describe('formatFriendlyError', () => {
  it('produces a "Did you mean" message for a typo', () => {
    const err = new ReferenceError('stave is not defined')
    const r = formatFriendlyError(err, 'p5', { index: FAKE_INDEX })
    expect(r.message).toContain('`stave` is not defined')
    expect(r.message).toContain('Did you mean')
    expect(r.suggestion?.name).toBe('save')
    expect(r.suggestion?.docsUrl).toContain('/docs/reference/p5/')
    expect(r.suggestion?.example).toBe('save("out.png")')
  })

  it('handles ReferenceError without a close match', () => {
    const err = new ReferenceError('zzzqqqxxx is not defined')
    const r = formatFriendlyError(err, 'p5', { index: FAKE_INDEX })
    expect(r.message).toContain('`zzzqqqxxx` is not defined')
    expect(r.suggestion).toBeUndefined()
  })

  it('falls back to the raw message for non-reference errors', () => {
    const err = new TypeError('x is not a function')
    const r = formatFriendlyError(err, 'p5', { index: FAKE_INDEX })
    expect(r.message).toBe('x is not a function')
    expect(r.suggestion).toBeUndefined()
  })

  it('copies stack through when present', () => {
    const err = new ReferenceError('foo is not defined')
    const r = formatFriendlyError(err, 'p5', { index: FAKE_INDEX })
    expect(r.stack).toContain('ReferenceError')
  })

  it('honors docsUrlFor override', () => {
    const r = formatFriendlyError(
      new ReferenceError('stave is not defined'),
      'p5',
      {
        index: FAKE_INDEX,
        docsUrlFor: (runtime, name) => `https://example.test/${runtime}/${name}`,
      },
    )
    expect(r.suggestion?.docsUrl).toBe('https://example.test/p5/save')
  })

  it('works without an index — returns raw message', () => {
    const r = formatFriendlyError(
      new ReferenceError('foo is not defined'),
      'p5',
    )
    expect(r.message).toContain('foo is not defined')
    expect(r.suggestion).toBeUndefined()
  })

  it('handles thrown strings', () => {
    const r = formatFriendlyError('something blew up', 'p5')
    expect(r.message).toBe('something blew up')
  })

  it('extracts line + column from a V8 eval stack', () => {
    const err = new Error('nots is not defined')
    err.stack = `ReferenceError: nots is not defined
    at eval (<anonymous>:4:12)`
    const r = formatFriendlyError(err, 'strudel', { index: FAKE_INDEX })
    expect(r.line).toBe(4)
    expect(r.column).toBe(12)
  })
})

describe('parseStackLocation', () => {
  it('parses V8 at-eval frame pointing at <anonymous>', () => {
    expect(
      parseStackLocation({
        stack: 'Error\n    at eval (<anonymous>:7:3)',
      }),
    ).toEqual({ line: 7, column: 3 })
  })

  it('parses V8 bare <anonymous> frame (new Function body)', () => {
    expect(
      parseStackLocation({
        stack: 'SyntaxError: X\n    at <anonymous>:4:12\n    at Module.foo (file.js:1:1)',
      }),
    ).toEqual({ line: 4, column: 12 })
  })

  it('parses V8 named-function frame (`at setup (<anonymous>:14:3)`)', () => {
    // A user-declared `function setup` throws mid-execution. Every
    // ReferenceError inside setup/draw/preload or a user helper
    // produces this shape — without this pattern the stack-parser
    // returned null and no Monaco squiggle landed.
    expect(
      parseStackLocation({
        stack:
          'ReferenceError: zoom is not defined\n' +
          '    at setup (<anonymous>:14:3)\n' +
          '    at p5._setup (p5.js:123:45)',
      }),
    ).toEqual({ line: 14, column: 3 })
  })

  it('parses Firefox @<anonymous> frame', () => {
    expect(
      parseStackLocation({
        stack: 'Error\nsketch@<anonymous>:12:5',
      }),
    ).toEqual({ line: 12, column: 5 })
  })

  it('parses Firefox debugger-eval frame', () => {
    expect(
      parseStackLocation({
        stack: 'Error\n@debugger eval:3:1',
      }),
    ).toEqual({ line: 3, column: 1 })
  })

  it('returns null when no frame matches', () => {
    expect(parseStackLocation({ stack: 'nothing relevant' })).toBeNull()
    expect(parseStackLocation({})).toBeNull()
    expect(parseStackLocation(null)).toBeNull()
  })

  it('does NOT grab line numbers out of bundled @scope paths', () => {
    // Regression: the old permissive `@[^\n]*?:(\d+):(\d+)` pattern
    // matched the tail of `.../@stave/editor/dist/index.js:1234:56`
    // and returned line=1234 — which then painted the user's whole
    // file red when `setLineMarker` clamped out-of-range to full doc.
    const stack = `SyntaxError: Unexpected token '}'
    at new Function (<anonymous>)
    at compileP5Code (webpack://./@stave/editor/src/visualizers/p5Compiler.ts:113:3)
    at factory (webpack://./@stave/editor/dist/index.js:1234:56)`
    expect(parseStackLocation({ stack })).toBeNull()
  })

  it('does NOT match generic V8 frame file:line:col pairs', () => {
    const stack = `Error\n    at Object.fn (/app/src/foo.ts:42:10)`
    expect(parseStackLocation({ stack })).toBeNull()
  })
})

describe('formatFriendlyError — commonMistakes cascade', () => {
  // Index that exercises every detector kind plus a global catch-all.
  const HINTED_INDEX: DocsIndex = {
    runtime: 'strudel',
    docs: {
      chord: {
        signature: 'chord(name: string)',
        description: 'Build a chord.',
        example: 'chord("C")',
        commonMistakes: [
          {
            // User typed `chord(C)` — bare identifier where a string was
            // expected. Recognised structurally via the codeContext
            // window.
            detect: { kind: 'code', match: /chord\(\s*[A-G][^"'\s]*\)/ },
            hint: 'Pitch classes are strings — try `chord("C")`.',
            example: 'chord("Cmaj7")',
          },
        ],
      },
      hush: {
        signature: 'hush()',
        description: 'Silence everything.',
        example: 'hush()',
        commonMistakes: [
          {
            detect: { kind: 'identifier', alias: 'silence' },
            hint: 'In Strudel the silencer is `hush()`, not `silence()`.',
          },
        ],
      },
      every: {
        signature: '.every(n, fn)',
        description: 'Apply fn every n cycles.',
        example: '.every(4, rev)',
        commonMistakes: [
          {
            detect: { kind: 'message', match: /every is not a function/ },
            hint: '`.every()` is a method on a Pattern — chain it after `note(...)`.',
            weight: 2,
          },
        ],
      },
    },
    globalMistakes: [
      {
        detect: { kind: 'message', match: /scheduler is not ready/i },
        hint: 'Hit play first — the scheduler boots on the first eval.',
      },
    ],
  }

  it('per-symbol message detector wins over fuzzy fallback', () => {
    // `every is not a function` would otherwise fall through to the
    // raw-message branch since identifier extraction returns null for
    // TypeErrors. The curated hint should fire.
    const err = new TypeError('every is not a function')
    const r = formatFriendlyError(err, 'strudel', { index: HINTED_INDEX })
    expect(r.message).toContain('chain it after `note')
    expect(r.suggestion?.name).toBe('every')
    expect(r.suggestion?.docsUrl).toContain('strudel')
  })

  it('per-symbol code detector fires when codeContext matches', () => {
    const err = new Error('Unexpected identifier')
    const r = formatFriendlyError(err, 'strudel', {
      index: HINTED_INDEX,
      codeContext: 'chord(C).fast(2)',
    })
    expect(r.message).toContain('Pitch classes are strings')
    expect(r.suggestion?.example).toBe('chord("Cmaj7")')
  })

  it('code detector skipped when codeContext absent', () => {
    const err = new Error('Unexpected identifier')
    const r = formatFriendlyError(err, 'strudel', { index: HINTED_INDEX })
    // Falls through to raw message.
    expect(r.message).toBe('Unexpected identifier')
    expect(r.suggestion).toBeUndefined()
  })

  it('identifier alias beats Levenshtein fuzzy', () => {
    // `silence` would Levenshtein-match `every`/`hush`, but the curated
    // identifier alias on `hush` is higher signal — prefer it.
    const err = new ReferenceError('silence is not defined')
    const r = formatFriendlyError(err, 'strudel', { index: HINTED_INDEX })
    expect(r.message).toContain('hush()')
    expect(r.suggestion?.name).toBe('hush')
  })

  it('globalMistakes catch errors with no symbol context', () => {
    const err = new Error('Scheduler is not ready')
    const r = formatFriendlyError(err, 'strudel', { index: HINTED_INDEX })
    expect(r.message).toContain('Hit play first')
    // No symbol → no .name in suggestion.
    expect(r.suggestion?.name ?? '').toBe('')
  })

  it('higher weight wins on ranking ties', () => {
    const idx: DocsIndex = {
      runtime: 'strudel',
      docs: {
        a: {
          signature: 'a()',
          description: 'low-weight target',
          commonMistakes: [
            {
              detect: { kind: 'message', match: /boom/ },
              hint: 'low',
              weight: 1,
            },
          ],
        },
        b: {
          signature: 'b()',
          description: 'high-weight target',
          commonMistakes: [
            {
              detect: { kind: 'message', match: /boom/ },
              hint: 'high',
              weight: 5,
            },
          ],
        },
      },
    }
    const r = formatFriendlyError(new Error('boom'), 'strudel', { index: idx })
    expect(r.message).toBe('high')
  })

  it('preserves stack/line/column when curated hint fires', () => {
    const err = new Error('Scheduler is not ready')
    err.stack = 'Error: Scheduler is not ready\n    at eval (<anonymous>:9:1)'
    const r = formatFriendlyError(err, 'strudel', { index: HINTED_INDEX })
    expect(r.line).toBe(9)
    expect(r.column).toBe(1)
    expect(r.stack).toContain('Scheduler is not ready')
  })
})
