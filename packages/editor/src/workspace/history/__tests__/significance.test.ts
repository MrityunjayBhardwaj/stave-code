import { describe, it, expect } from 'vitest'
import { diffMagnitude, isSignificant } from '../significance'

describe('diffMagnitude', () => {
  it('is zero for identical content', () => {
    expect(diffMagnitude('abc', 'abc')).toEqual({ lines: 0, chars: 0 })
  })
  it('measures the differing middle after trimming common ends', () => {
    expect(diffMagnitude('hello', 'hello world')).toEqual({ lines: 1, chars: 6 })
  })
  it('counts a large paste as many chars', () => {
    const d = diffMagnitude('', 'x'.repeat(250))
    expect(d.chars).toBe(250)
  })
  it('counts multi-line insert as many lines', () => {
    const d = diffMagnitude('', 'a\nb\nc\nd\ne\nf')
    expect(d.lines).toBe(6)
  })
})

describe('isSignificant', () => {
  it('false for a tiny edit', () => {
    expect(isSignificant([{ prev: 'hello', next: 'hello!' }])).toBe(false)
  })
  it('true when chars cross the floor (≥200)', () => {
    expect(isSignificant([{ prev: '', next: 'x'.repeat(200) }])).toBe(true)
  })
  it('true when lines cross the floor (≥5)', () => {
    expect(isSignificant([{ prev: '', next: '1\n2\n3\n4\n5' }])).toBe(true)
  })
  it('sums magnitude across multiple changed files', () => {
    const changes = [
      { prev: '', next: '1\n2\n3' }, // 3 lines
      { prev: '', next: '4\n5\n6' }, // 3 lines → 6 total ≥5
    ]
    expect(isSignificant(changes)).toBe(true)
  })
  it('respects custom floors', () => {
    expect(isSignificant([{ prev: '', next: 'ab' }], { minChars: 2 })).toBe(true)
  })
})
