import { describe, it, expect, vi } from 'vitest'

// Mock p5 to prevent canvas instantiation
vi.mock('p5', () => ({ default: vi.fn() }))

import { DEFAULT_VIZ_DESCRIPTORS } from '../visualizers/defaultDescriptors'

describe('DEFAULT_VIZ_DESCRIPTORS', () => {
  it('has exactly 11 entries', () => {
    expect(DEFAULT_VIZ_DESCRIPTORS).toHaveLength(11)
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

  it('contains the expected ids', () => {
    const ids = DEFAULT_VIZ_DESCRIPTORS.map(d => d.id)
    // p5 renderers
    expect(ids).toContain('pianoroll')
    expect(ids).toContain('wordfall')
    expect(ids).toContain('scope')
    expect(ids).toContain('fscope')
    expect(ids).toContain('spectrum')
    expect(ids).toContain('spiral')
    expect(ids).toContain('pitchwheel')
    // hydra renderers
    expect(ids).toContain('hydra')
    expect(ids).toContain('pianoroll:hydra')
    expect(ids).toContain('scope:hydra')
    expect(ids).toContain('kaleidoscope:hydra')
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

  it('every descriptor has a requires[] array', () => {
    for (const d of DEFAULT_VIZ_DESCRIPTORS) {
      expect(Array.isArray(d.requires), `${d.id} should have requires[]`).toBe(true)
      expect(d.requires!.length).toBeGreaterThan(0)
    }
  })

  it('requires[] contains only valid EngineComponents keys', () => {
    const validKeys = ['streaming', 'queryable', 'audio', 'inlineViz', 'ir']
    for (const d of DEFAULT_VIZ_DESCRIPTORS) {
      for (const req of d.requires ?? []) {
        expect(validKeys, `${d.id} has invalid requires key "${req}"`).toContain(req)
      }
    }
  })

  it('factory returns a VizRenderer with update() method', () => {
    for (const d of DEFAULT_VIZ_DESCRIPTORS) {
      const renderer = d.factory()
      expect(typeof renderer.update).toBe('function')
    }
  })

  it('every descriptor has a renderer field', () => {
    for (const d of DEFAULT_VIZ_DESCRIPTORS) {
      expect(typeof d.renderer, `${d.id} should have renderer string`).toBe('string')
    }
  })

  it('mode:renderer ids match their renderer field', () => {
    for (const d of DEFAULT_VIZ_DESCRIPTORS) {
      if (d.id.includes(':')) {
        const suffix = d.id.split(':')[1]
        expect(suffix, `${d.id} suffix should match renderer field`).toBe(d.renderer)
      }
    }
  })
})
