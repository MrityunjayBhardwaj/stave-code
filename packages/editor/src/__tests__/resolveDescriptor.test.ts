import { describe, it, expect } from 'vitest'
import { resolveDescriptor } from '../visualizers/resolveDescriptor'
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
})
