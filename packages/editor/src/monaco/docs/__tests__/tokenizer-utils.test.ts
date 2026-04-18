import { describe, it, expect } from 'vitest'
import type { DocsIndex } from '../types'
import { buildIdentifierAlternation } from '../tokenizer-utils'

const INDEX: DocsIndex = {
  runtime: 'demo',
  docs: {
    background: { signature: 'background()', description: '', kind: 'function' },
    back: { signature: 'back()', description: '', kind: 'function' },
    MOUSE_X: { signature: 'MOUSE_X', description: '', kind: 'variable' },
    PI: { signature: 'PI', description: '', kind: 'constant' },
    'not-an-id': { signature: '', description: '', kind: 'function' },
    kick: { signature: ':kick', description: '', kind: 'sample' },
  },
}

describe('buildIdentifierAlternation', () => {
  it('returns an alternation string with longer names first', () => {
    const alt = buildIdentifierAlternation(INDEX)
    expect(alt).toContain('background')
    expect(alt).toContain('back')
    const idxBackground = alt.split('|').indexOf('background')
    const idxBack = alt.split('|').indexOf('back')
    expect(idxBackground).toBeLessThan(idxBack)
  })

  it('skips non-identifier characters', () => {
    const alt = buildIdentifierAlternation(INDEX)
    expect(alt.split('|')).not.toContain('not-an-id')
  })

  it('filters by includeKinds', () => {
    const alt = buildIdentifierAlternation(INDEX, {
      includeKinds: ['constant'],
    })
    expect(alt.split('|')).toEqual(['PI'])
  })

  it('filters by excludeKinds', () => {
    const alt = buildIdentifierAlternation(INDEX, {
      excludeKinds: ['sample'],
    })
    expect(alt.split('|')).not.toContain('kick')
  })

  it('merges extras', () => {
    const alt = buildIdentifierAlternation(INDEX, {
      includeKinds: ['constant'],
      extra: ['TAU', 'TWO_PI'],
    })
    const members = alt.split('|')
    expect(members).toContain('TAU')
    expect(members).toContain('TWO_PI')
    expect(members).toContain('PI')
  })

  it('produces a regex that matches the identifiers', () => {
    const alt = buildIdentifierAlternation(INDEX, {
      includeKinds: ['function'],
    })
    const re = new RegExp(`\\b(${alt})\\b`)
    expect(re.test('call background() inside setup')).toBe(true)
    // 'back' is a valid match too but we assert the ordering so longer wins
    expect('backgrounds'.match(re)?.[0]).toBeUndefined() // no trailing-s word boundary hit
  })

  it('handles an empty docs index', () => {
    expect(
      buildIdentifierAlternation({ runtime: 'x', docs: {} }),
    ).toBe('')
  })
})
