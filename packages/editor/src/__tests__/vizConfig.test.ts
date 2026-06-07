import { describe, it, expect, afterEach } from 'vitest'
import {
  DEFAULT_VIZ_CONFIG,
  DEFAULT_VIZ_QUALITY,
  createVizConfig,
  deriveVizQuality,
  getVizConfig,
  setVizConfig,
} from '../visualizers/vizConfig'

afterEach(() => {
  setVizConfig(DEFAULT_VIZ_CONFIG)
})

describe('VizConfig', () => {
  it('DEFAULT_VIZ_CONFIG has all expected fields', () => {
    expect(DEFAULT_VIZ_CONFIG.defaultRenderer).toBe('p5')
    expect(DEFAULT_VIZ_CONFIG.inlineZoneHeight).toBe(150)
    expect(DEFAULT_VIZ_CONFIG.fftSize).toBe(2048)
    expect(DEFAULT_VIZ_CONFIG.smoothingTimeConstant).toBe(0.8)
    expect(DEFAULT_VIZ_CONFIG.hydraAudioBins).toBe(4)
    expect(DEFAULT_VIZ_CONFIG.density).toBe(1)
    expect(DEFAULT_VIZ_CONFIG.hydraAutoLoop).toBe(true)
    expect(DEFAULT_VIZ_CONFIG.pianorollWindowSeconds).toBe(6)
    expect(DEFAULT_VIZ_CONFIG.backgroundColor).toBe('#090912')
    expect(DEFAULT_VIZ_CONFIG.accentColor).toBe('#75baff')
  })

  it('createVizConfig merges overrides onto defaults', () => {
    const config = createVizConfig({ defaultRenderer: 'hydra', hydraAudioBins: 8 })
    expect(config.defaultRenderer).toBe('hydra')
    expect(config.hydraAudioBins).toBe(8)
    // Non-overridden fields stay at defaults
    expect(config.fftSize).toBe(2048)
    expect(config.inlineZoneHeight).toBe(150)
  })

  it('createVizConfig with no overrides returns defaults', () => {
    const config = createVizConfig()
    expect(config).toEqual(DEFAULT_VIZ_CONFIG)
  })

  it('getVizConfig returns defaults initially', () => {
    const config = getVizConfig()
    expect(config.defaultRenderer).toBe('p5')
  })

  it('setVizConfig updates the active config', () => {
    setVizConfig({ defaultRenderer: 'hydra', pianorollCycles: 8 })
    const config = getVizConfig()
    expect(config.defaultRenderer).toBe('hydra')
    expect(config.pianorollCycles).toBe(8)
    // Non-overridden fields stay at defaults
    expect(config.fftSize).toBe(2048)
  })

  it('setVizConfig resets non-specified fields to defaults', () => {
    setVizConfig({ defaultRenderer: 'hydra' })
    setVizConfig({ pianorollCycles: 8 })
    // Second call resets defaultRenderer back to default
    expect(getVizConfig().defaultRenderer).toBe('p5')
    expect(getVizConfig().pianorollCycles).toBe(8)
  })
})

describe('deriveVizQuality (#269 — performance mode)', () => {
  it('balanced is the default and reproduces today\'s values', () => {
    expect(DEFAULT_VIZ_QUALITY).toBe('balanced')
    // density 1 + resolution 512 == DEFAULT_VIZ_CONFIG.density + the
    // editorRegistry inline-viz-resolution default → no regression at default.
    expect(deriveVizQuality('balanced')).toEqual({ resolution: 512, density: 1 })
    expect(deriveVizQuality('balanced').density).toBe(DEFAULT_VIZ_CONFIG.density)
  })

  it('scales BOTH resolution and density per level (#232)', () => {
    const high = deriveVizQuality('high')
    const balanced = deriveVizQuality('balanced')
    const perf = deriveVizQuality('performance')

    // Monotonic descent in BOTH knobs high → balanced → performance.
    expect(high.resolution).toBeGreaterThan(balanced.resolution)
    expect(balanced.resolution).toBeGreaterThan(perf.resolution)
    expect(high.density).toBeGreaterThanOrEqual(balanced.density)
    expect(balanced.density).toBeGreaterThan(perf.density)
  })

  it('density stays within (0, 1] at every level', () => {
    for (const level of ['high', 'balanced', 'performance'] as const) {
      const { density } = deriveVizQuality(level)
      expect(density).toBeGreaterThan(0)
      expect(density).toBeLessThanOrEqual(1)
    }
  })

  it('performance mode drops both knobs (the worst-case lever)', () => {
    expect(deriveVizQuality('performance')).toEqual({ resolution: 256, density: 0.5 })
  })
})
