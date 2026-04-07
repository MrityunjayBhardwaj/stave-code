import { describe, it, expect, afterEach } from 'vitest'
import { resolveDescriptor } from '../visualizers/resolveDescriptor'
import { setVizConfig, DEFAULT_VIZ_CONFIG } from '../visualizers/vizConfig'
import type { VizDescriptor } from '../visualizers/types'

const makeDesc = (id: string): VizDescriptor => ({
  id,
  label: id,
  factory: () => ({} as any),
})

const descriptors: VizDescriptor[] = [
  makeDesc('pianoroll'),
  makeDesc('scope'),
  makeDesc('hydra'),
  makeDesc('pianoroll:hydra'),
  makeDesc('scope:hydra'),
  makeDesc('kaleidoscope:hydra'),
]

afterEach(() => {
  // Reset config after each test
  setVizConfig(DEFAULT_VIZ_CONFIG)
})

describe('resolveDescriptor', () => {
  it('resolves exact match', () => {
    expect(resolveDescriptor('pianoroll', descriptors)?.id).toBe('pianoroll')
    expect(resolveDescriptor('hydra', descriptors)?.id).toBe('hydra')
    expect(resolveDescriptor('pianoroll:hydra', descriptors)?.id).toBe('pianoroll:hydra')
  })

  it('falls back to prefix match when no exact match', () => {
    // "kaleidoscope" has no bare id — falls back to "kaleidoscope:hydra"
    expect(resolveDescriptor('kaleidoscope', descriptors)?.id).toBe('kaleidoscope:hydra')
  })

  it('prefers exact match over prefix match', () => {
    // "pianoroll" matches exactly — does NOT fall through to "pianoroll:hydra"
    expect(resolveDescriptor('pianoroll', descriptors)?.id).toBe('pianoroll')
  })

  it('returns undefined for unknown viz id', () => {
    expect(resolveDescriptor('nonexistent', descriptors)).toBeUndefined()
  })

  it('returns undefined for empty descriptor list', () => {
    expect(resolveDescriptor('pianoroll', [])).toBeUndefined()
  })

  it('handles renderer suffix correctly', () => {
    // "scope:hydra" is an exact match
    expect(resolveDescriptor('scope:hydra', descriptors)?.id).toBe('scope:hydra')
  })

  describe('defaultRenderer config', () => {
    // Descriptors where "pianoroll" bare id does NOT exist — only variants
    const variantsOnly: VizDescriptor[] = [
      makeDesc('pianoroll:p5'),
      makeDesc('pianoroll:hydra'),
      makeDesc('scope:p5'),
      makeDesc('scope:hydra'),
    ]

    it('uses defaultRenderer to resolve bare mode when no exact match', () => {
      setVizConfig({ defaultRenderer: 'p5' })
      expect(resolveDescriptor('pianoroll', variantsOnly)?.id).toBe('pianoroll:p5')

      setVizConfig({ defaultRenderer: 'hydra' })
      expect(resolveDescriptor('pianoroll', variantsOnly)?.id).toBe('pianoroll:hydra')
    })

    it('defaultRenderer step is skipped when exact match exists', () => {
      const withBare = [...variantsOnly, makeDesc('pianoroll')]
      setVizConfig({ defaultRenderer: 'hydra' })
      // Exact "pianoroll" wins over "pianoroll:hydra"
      expect(resolveDescriptor('pianoroll', withBare)?.id).toBe('pianoroll')
    })

    it('falls back to prefix match when defaultRenderer variant missing', () => {
      setVizConfig({ defaultRenderer: 'canvas2d' })
      // No "pianoroll:canvas2d" — falls back to first prefix match "pianoroll:p5"
      expect(resolveDescriptor('pianoroll', variantsOnly)?.id).toBe('pianoroll:p5')
    })
  })
})
