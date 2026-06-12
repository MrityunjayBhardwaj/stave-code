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

describe('staveUniforms — sig.density (#269)', () => {
  it('exposes the current vizConfig density (default 1)', () => {
    const sig = buildStaveUniforms(new SignalBus()).sig
    expect(sig.density).toBe(1)
  })

  it('reads density LIVE per access (not captured at build)', () => {
    // The getter must re-read vizConfig each access so a live "performance mode"
    // change (worker: a marshalled config patch) takes effect WITHOUT rebuilding
    // the uniforms — the whole point of the live config channel.
    const sig = buildStaveUniforms(new SignalBus()).sig
    expect(sig.density).toBe(1)
    updateVizConfig({ density: 0.5 })
    expect(sig.density).toBe(0.5)
    updateVizConfig({ density: 0.25 })
    expect(sig.density).toBe(0.25)
  })

  it('is enumerable on sig (so it is discoverable like sig.rms)', () => {
    const sig = buildStaveUniforms(new SignalBus()).sig
    expect(Object.prototype.hasOwnProperty.call(sig, 'density')).toBe(true)
    expect(Object.keys(sig)).toContain('density')
  })
})
