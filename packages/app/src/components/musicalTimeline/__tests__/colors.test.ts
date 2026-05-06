/**
 * colors — track-color hash fallback. Stable per id; different ids
 * produce visually-distinct hues.
 */
import { describe, it, expect } from 'vitest'
import { trackColorFromHash } from '../colors'

describe('trackColorFromHash', () => {
  it('returns the same color for the same id', () => {
    expect(trackColorFromHash('bd')).toBe(trackColorFromHash('bd'))
  })

  it('returns hsl format', () => {
    expect(trackColorFromHash('bd')).toMatch(/^hsl\(\d+, 60%, 55%\)$/)
  })

  it('produces different hues for different ids in the typical drumkit set', () => {
    const ids = ['bd', 'hh', 'cp', 'sn', 'oh', 'mt', 'lt']
    const hues = new Set(ids.map((id) => trackColorFromHash(id)))
    // At minimum: not every id collapses to the same color. Realistically
    // 7 ids collapsing to fewer than 4 hues would indicate a hash bug.
    expect(hues.size).toBeGreaterThanOrEqual(4)
  })

  it('handles the $default sentinel without throwing', () => {
    expect(() => trackColorFromHash('$default')).not.toThrow()
    expect(trackColorFromHash('$default')).toMatch(/^hsl\(\d+, 60%, 55%\)$/)
  })

  it('handles long ids without overflow', () => {
    expect(trackColorFromHash('this-is-a-very-long-track-id-asdfghjkl-12345')).toMatch(
      /^hsl\(\d+, 60%, 55%\)$/,
    )
  })
})
