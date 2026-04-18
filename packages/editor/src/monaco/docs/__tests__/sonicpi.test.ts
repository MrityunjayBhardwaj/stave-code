import { describe, it, expect } from 'vitest'
import { SONICPI_DOCS_INDEX } from '../sonicpi'

describe('SONICPI_DOCS_INDEX', () => {
  it('declares runtime id', () => {
    expect(SONICPI_DOCS_INDEX.runtime).toBe('sonicpi')
  })

  it('has core sound + timing functions', () => {
    for (const name of [
      'play',
      'sleep',
      'live_loop',
      'sample',
      'synth',
      'with_fx',
      'use_bpm',
      'use_synth',
    ]) {
      expect(SONICPI_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('has random helpers', () => {
    for (const name of ['rrand', 'choose', 'rand']) {
      expect(SONICPI_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('has synth keys from the cheatsheet', () => {
    for (const name of ['dull_bell', 'pretty_bell', 'prophet', 'tb303']) {
      expect(SONICPI_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('has fx keys from the cheatsheet', () => {
    for (const name of ['reverb', 'echo', 'distortion', 'slicer']) {
      expect(SONICPI_DOCS_INDEX.docs).toHaveProperty(name)
    }
  })

  it('records provenance', () => {
    expect(SONICPI_DOCS_INDEX.meta?.source).toContain('sonic-pi')
  })

  it('has more than 200 entries', () => {
    expect(Object.keys(SONICPI_DOCS_INDEX.docs).length).toBeGreaterThan(200)
  })

  it('play signature shows args', () => {
    expect(SONICPI_DOCS_INDEX.docs.play.signature).toMatch(/note/)
  })

  it('synth entries use :symbol signature', () => {
    expect(SONICPI_DOCS_INDEX.docs.dull_bell.signature).toBe(':dull_bell')
    expect(SONICPI_DOCS_INDEX.docs.dull_bell.kind).toBe('synth')
  })
})
