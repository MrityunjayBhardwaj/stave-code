/**
 * extractVizName — pure unit tests for the viz-name reconstruction
 * helper used by `Pattern.prototype.viz` (the wrapped version Stave
 * installs over @strudel/draw's).
 *
 * Strudel's transpiler runs every string argument through `reify()`,
 * which parses the literal as mini-notation. Mini-notation's tokenizer
 * mangles `:` into an array (the sample-index operator) and ` ` into
 * a sequence (multiple haps). The wrapper's job is to detect both
 * shapes and reconstruct the user's original literal so the named-viz
 * registry lookup gets the right key.
 *
 * These tests use a tiny fake Pattern object — `{ _Pattern: true,
 * queryArc: (a, b) => [...] }` — so they exercise the helper without
 * needing a real Strudel runtime.
 */

import { describe, it, expect } from 'vitest'
import { extractVizName } from '../StrudelEngine'

interface FakeHap {
  value: unknown
}

function fakePattern(haps: FakeHap[]) {
  return {
    _Pattern: true,
    queryArc: () => haps,
  }
}

describe('extractVizName', () => {
  it('returns plain string args unchanged', () => {
    expect(extractVizName('pianoroll')).toBe('pianoroll')
  })

  it('returns undefined for empty strings', () => {
    expect(extractVizName('')).toBeUndefined()
  })

  it('returns undefined for non-Pattern non-string args', () => {
    expect(extractVizName(undefined)).toBeUndefined()
    expect(extractVizName(null)).toBeUndefined()
    expect(extractVizName(42)).toBeUndefined()
    expect(extractVizName({})).toBeUndefined()
  })

  it('extracts a single-hap string-valued Pattern', () => {
    // What `.viz("pianoroll")` looks like after reify: one hap with
    // value "pianoroll".
    const pat = fakePattern([{ value: 'pianoroll' }])
    expect(extractVizName(pat)).toBe('pianoroll')
  })

  it('rejoins a single-hap array-valued Pattern with `:`', () => {
    // What `.viz("pianoroll:hydra")` looks like after reify: mini-
    // notation interprets `:` as the sample-index operator, so the
    // colon becomes an array boundary inside one hap.value.
    const pat = fakePattern([{ value: ['pianoroll', 'hydra'] }])
    expect(extractVizName(pat)).toBe('pianoroll:hydra')
  })

  it('rejoins a multi-hap string-valued Pattern with spaces (regression — issue #5)', () => {
    // What `.viz("Piano Roll")` looks like after reify: mini-notation
    // tokenizes the space into two sequence steps, so the Pattern
    // returns two haps. Without this rejoin, the wrapper would take
    // only `haps[0].value === "Piano"` and the named-viz registry
    // lookup would fail to find "Piano Roll".
    const pat = fakePattern([{ value: 'Piano' }, { value: 'Roll' }])
    expect(extractVizName(pat)).toBe('Piano Roll')
  })

  it('rejoins a 3-token name', () => {
    const pat = fakePattern([
      { value: 'My' },
      { value: 'Custom' },
      { value: 'Viz' },
    ])
    expect(extractVizName(pat)).toBe('My Custom Viz')
  })

  it('handles a mixed multi-hap pattern (token with `:` followed by token with space)', () => {
    // Hypothetical: `.viz("pianoroll:hydra alt")` would tokenize as
    // 2 haps, the first with array value (from the colon), the second
    // with a string value. Joining with space recovers the literal.
    const pat = fakePattern([
      { value: ['pianoroll', 'hydra'] },
      { value: 'alt' },
    ])
    expect(extractVizName(pat)).toBe('pianoroll:hydra alt')
  })

  it('returns undefined for an empty queryArc result', () => {
    const pat = fakePattern([])
    expect(extractVizName(pat)).toBeUndefined()
  })

  it('returns undefined when queryArc throws', () => {
    const broken = {
      _Pattern: true,
      queryArc: () => {
        throw new Error('boom')
      },
    }
    expect(extractVizName(broken)).toBeUndefined()
  })

  it('coerces non-string non-array hap values via String()', () => {
    const pat = fakePattern([{ value: 42 }])
    expect(extractVizName(pat)).toBe('42')
  })
})
