import { describe, it, expect, afterEach } from 'vitest'
import { buildStaveUniforms } from '../signals/staveUniforms'
import { SignalBus } from '../signals/SignalBus'
import {
  DEFAULT_VIZ_CONFIG,
  setVizConfig,
  updateVizConfig,
} from '../vizConfig'

afterEach(() => {
  setVizConfig(DEFAULT_VIZ_CONFIG)
})

describe('staveUniforms — u.density (#269)', () => {
  it('exposes the current vizConfig density (default 1)', () => {
    const u = buildStaveUniforms(new SignalBus()).u
    expect(u.density).toBe(1)
  })

  it('reads density LIVE per access (not captured at build)', () => {
    // The getter must re-read vizConfig each access so a live "performance mode"
    // change (worker: a marshalled config patch) takes effect WITHOUT rebuilding
    // the uniforms — the whole point of the live config channel.
    const u = buildStaveUniforms(new SignalBus()).u
    expect(u.density).toBe(1)
    updateVizConfig({ density: 0.5 })
    expect(u.density).toBe(0.5)
    updateVizConfig({ density: 0.25 })
    expect(u.density).toBe(0.25)
  })

  it('is enumerable on u (so it is discoverable like u.rms)', () => {
    const u = buildStaveUniforms(new SignalBus()).u
    expect(Object.prototype.hasOwnProperty.call(u, 'density')).toBe(true)
    expect(Object.keys(u)).toContain('density')
  })
})
