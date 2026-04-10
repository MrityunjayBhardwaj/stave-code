/**
 * groupLayout — pure function unit tests.
 *
 * These functions are small and pure, so the tests exercise every
 * transition directly without React. The goal is to prove that every
 * insert + remove path preserves the single-occurrence invariant and
 * collapses empty columns correctly.
 */

import { describe, it, expect } from 'vitest'
import {
  findGroupCoords,
  countOccurrences,
  allGroupIds,
  insertGroup,
  insertEdgeGroup,
  removeGroup,
  groupCount,
  hasVerticalSplits,
  type GroupLayout,
} from '../groupLayout'

describe('findGroupCoords', () => {
  it('returns null for an empty layout', () => {
    expect(findGroupCoords([], 'a')).toBeNull()
  })

  it('finds a group in the first column', () => {
    expect(findGroupCoords([['a']], 'a')).toEqual([0, 0])
  })

  it('finds a group in a later column', () => {
    expect(findGroupCoords([['a'], ['b'], ['c']], 'c')).toEqual([2, 0])
  })

  it('finds a group in a later row', () => {
    expect(findGroupCoords([['a', 'b', 'c']], 'c')).toEqual([0, 2])
  })

  it('returns null for a missing group', () => {
    expect(findGroupCoords([['a'], ['b']], 'z')).toBeNull()
  })
})

describe('insertGroup — horizontal directions', () => {
  it('inserts west of the target column', () => {
    const layout: GroupLayout = [['a'], ['b']]
    expect(insertGroup(layout, 'b', 'west', 'x')).toEqual([['a'], ['x'], ['b']])
  })

  it('inserts east of the target column', () => {
    const layout: GroupLayout = [['a'], ['b']]
    expect(insertGroup(layout, 'a', 'east', 'x')).toEqual([['a'], ['x'], ['b']])
  })

  it('inserts west at the leftmost position', () => {
    const layout: GroupLayout = [['a']]
    expect(insertGroup(layout, 'a', 'west', 'x')).toEqual([['x'], ['a']])
  })

  it('inserts east at the rightmost position', () => {
    const layout: GroupLayout = [['a']]
    expect(insertGroup(layout, 'a', 'east', 'x')).toEqual([['a'], ['x']])
  })

  it('preserves vertical cells in untouched columns', () => {
    const layout: GroupLayout = [['a', 'b'], ['c']]
    expect(insertGroup(layout, 'c', 'west', 'x')).toEqual([
      ['a', 'b'],
      ['x'],
      ['c'],
    ])
  })
})

describe('insertGroup — vertical directions', () => {
  it('inserts north of the target within its column', () => {
    const layout: GroupLayout = [['a']]
    expect(insertGroup(layout, 'a', 'north', 'x')).toEqual([['x', 'a']])
  })

  it('inserts south of the target within its column', () => {
    const layout: GroupLayout = [['a']]
    expect(insertGroup(layout, 'a', 'south', 'x')).toEqual([['a', 'x']])
  })

  it('inserts between existing cells (north of middle)', () => {
    const layout: GroupLayout = [['a', 'b', 'c']]
    expect(insertGroup(layout, 'b', 'north', 'x')).toEqual([['a', 'x', 'b', 'c']])
  })

  it('inserts between existing cells (south of middle)', () => {
    const layout: GroupLayout = [['a', 'b', 'c']]
    expect(insertGroup(layout, 'b', 'south', 'x')).toEqual([['a', 'b', 'x', 'c']])
  })

  it('does not affect other columns', () => {
    const layout: GroupLayout = [['a'], ['b']]
    expect(insertGroup(layout, 'a', 'south', 'x')).toEqual([['a', 'x'], ['b']])
  })
})

describe('insertGroup — no-ops and invariants', () => {
  it('center direction is a no-op (caller handles add-to-group)', () => {
    const layout: GroupLayout = [['a'], ['b']]
    expect(insertGroup(layout, 'a', 'center', 'x')).toBe(layout)
  })

  it('missing target is a no-op', () => {
    const layout: GroupLayout = [['a']]
    expect(insertGroup(layout, 'missing', 'east', 'x')).toBe(layout)
  })

  it('preserves single-occurrence invariant', () => {
    const layout: GroupLayout = [['a'], ['b']]
    const next = insertGroup(layout, 'a', 'east', 'x')
    expect(countOccurrences(next, 'x')).toBe(1)
    expect(countOccurrences(next, 'a')).toBe(1)
    expect(countOccurrences(next, 'b')).toBe(1)
  })
})

describe('insertEdgeGroup', () => {
  it('prepends a new column at start', () => {
    expect(insertEdgeGroup([['a']], 'start', 'x')).toEqual([['x'], ['a']])
  })

  it('appends a new column at end', () => {
    expect(insertEdgeGroup([['a']], 'end', 'x')).toEqual([['a'], ['x']])
  })

  it('handles empty layout', () => {
    expect(insertEdgeGroup([], 'start', 'x')).toEqual([['x']])
    expect(insertEdgeGroup([], 'end', 'x')).toEqual([['x']])
  })

  it('preserves vertical cells', () => {
    expect(insertEdgeGroup([['a', 'b']], 'end', 'x')).toEqual([['a', 'b'], ['x']])
  })
})

describe('removeGroup', () => {
  it('removes a single-cell column and collapses it', () => {
    expect(removeGroup([['a'], ['b']], 'a')).toEqual([['b']])
  })

  it('removes from a multi-cell column without collapsing the column', () => {
    expect(removeGroup([['a', 'b', 'c']], 'b')).toEqual([['a', 'c']])
  })

  it('removes the top cell of a column', () => {
    expect(removeGroup([['a', 'b']], 'a')).toEqual([['b']])
  })

  it('removes the bottom cell of a column', () => {
    expect(removeGroup([['a', 'b']], 'b')).toEqual([['a']])
  })

  it('no-op when the group is missing', () => {
    const layout: GroupLayout = [['a']]
    expect(removeGroup(layout, 'z')).toBe(layout)
  })

  it('removing the last group yields an empty layout', () => {
    expect(removeGroup([['a']], 'a')).toEqual([])
  })

  it('preserves other columns', () => {
    expect(removeGroup([['a'], ['b', 'c'], ['d']], 'c')).toEqual([
      ['a'],
      ['b'],
      ['d'],
    ])
  })
})

describe('allGroupIds', () => {
  it('flattens in reading order', () => {
    expect(allGroupIds([['a', 'b'], ['c'], ['d', 'e']])).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ])
  })

  it('returns empty for empty layout', () => {
    expect(allGroupIds([])).toEqual([])
  })
})

describe('groupCount + hasVerticalSplits', () => {
  it('counts groups across columns', () => {
    expect(groupCount([['a'], ['b', 'c']])).toBe(3)
    expect(groupCount([])).toBe(0)
  })

  it('detects vertical splits', () => {
    expect(hasVerticalSplits([['a']])).toBe(false)
    expect(hasVerticalSplits([['a'], ['b']])).toBe(false)
    expect(hasVerticalSplits([['a', 'b']])).toBe(true)
    expect(hasVerticalSplits([['a'], ['b', 'c']])).toBe(true)
  })
})

describe('layout round-trips', () => {
  it('insert then remove returns to the original', () => {
    const layout: GroupLayout = [['a'], ['b']]
    const withX = insertGroup(layout, 'a', 'south', 'x')
    expect(withX).toEqual([['a', 'x'], ['b']])
    expect(removeGroup(withX, 'x')).toEqual([['a'], ['b']])
  })

  it('insert-then-remove across directions', () => {
    const base: GroupLayout = [['a']]
    for (const dir of ['west', 'east', 'north', 'south'] as const) {
      const withX = insertGroup(base, 'a', dir, 'x')
      const restored = removeGroup(withX, 'x')
      expect(restored).toEqual(base)
    }
  })
})
