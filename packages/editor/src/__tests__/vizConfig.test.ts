import { describe, it, expect, afterEach } from 'vitest'
import {
  DEFAULT_VIZ_CONFIG,
  DEFAULT_VIZ_QUALITY,
  WORKER_VIZ_CONFIG_KEYS,
  createVizConfig,
  deriveVizQuality,
  getVizConfig,
  onVizConfigChange,
  pickWorkerVizConfig,
  setVizConfig,
  updateVizConfig,
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

describe('worker config-marshal (#269 — closes #253)', () => {
  it('updateVizConfig MERGES onto active (does NOT reset like setVizConfig)', () => {
    setVizConfig({ hydraAudioBins: 8 })
    updateVizConfig({ density: 0.5 })
    // The density patch must NOT wipe the prior hydraAudioBins (the #253 bug).
    expect(getVizConfig().hydraAudioBins).toBe(8)
    expect(getVizConfig().density).toBe(0.5)
    // ...and unrelated fields stay put.
    expect(getVizConfig().fftSize).toBe(2048)
  })

  it('pickWorkerVizConfig projects only the worker-read subset', () => {
    setVizConfig({ density: 0.4, hydraAudioBins: 6, maxFps: 30, maxDpr: 2 })
    const picked = pickWorkerVizConfig()
    expect(picked).toEqual({ density: 0.4, hydraAudioBins: 6 })
    // maxFps/maxDpr are main-side only — they must NOT cross the boundary.
    expect('maxFps' in picked).toBe(false)
    expect('maxDpr' in picked).toBe(false)
  })

  it('the marshalled subset is exactly the keys the worker reads', () => {
    expect([...WORKER_VIZ_CONFIG_KEYS].sort()).toEqual(['density', 'hydraAudioBins'])
  })

  it('onVizConfigChange fires for set AND update, and unsubscribes', () => {
    const seen: number[] = []
    const unsub = onVizConfigChange((c) => seen.push(c.density))
    updateVizConfig({ density: 0.7 })
    setVizConfig({ density: 0.3 })
    unsub()
    updateVizConfig({ density: 0.9 }) // after unsub → not observed
    expect(seen).toEqual([0.7, 0.3])
  })
})
