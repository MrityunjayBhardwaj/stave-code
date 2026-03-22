import { describe, it, expect, vi } from 'vitest'

// Mock p5 to prevent canvas instantiation
vi.mock('p5', () => ({ default: vi.fn() }))

import { DEFAULT_VIZ_DESCRIPTORS } from '../visualizers/defaultDescriptors'

describe('DEFAULT_VIZ_DESCRIPTORS', () => {
  it('has exactly 7 entries', () => {
    expect(DEFAULT_VIZ_DESCRIPTORS).toHaveLength(7)
  })

  it('each entry has id, label, and factory', () => {
    for (const d of DEFAULT_VIZ_DESCRIPTORS) {
      expect(typeof d.id).toBe('string')
      expect(d.id.length).toBeGreaterThan(0)
      expect(typeof d.label).toBe('string')
      expect(d.label.length).toBeGreaterThan(0)
      expect(typeof d.factory).toBe('function')
    }
  })

  it('contains the 7 expected ids', () => {
    const ids = DEFAULT_VIZ_DESCRIPTORS.map(d => d.id)
    expect(ids).toContain('pianoroll')
    expect(ids).toContain('wordfall')
    expect(ids).toContain('scope')
    expect(ids).toContain('fscope')
    expect(ids).toContain('spectrum')
    expect(ids).toContain('spiral')
    expect(ids).toContain('pitchwheel')
  })

  it('factory returns a VizRenderer with all 5 methods', () => {
    for (const d of DEFAULT_VIZ_DESCRIPTORS) {
      const renderer = d.factory()
      expect(typeof renderer.mount).toBe('function')
      expect(typeof renderer.resize).toBe('function')
      expect(typeof renderer.pause).toBe('function')
      expect(typeof renderer.resume).toBe('function')
      expect(typeof renderer.destroy).toBe('function')
    }
  })

  it('each factory call returns a new instance', () => {
    const d = DEFAULT_VIZ_DESCRIPTORS[0]
    const a = d.factory()
    const b = d.factory()
    expect(a).not.toBe(b)
  })
})
