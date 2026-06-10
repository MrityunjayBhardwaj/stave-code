import { describe, it, expect } from 'vitest'
import { SignalBus, type BusAnalyser } from '../../visualizers/signals/SignalBus'
import { ALIAS_MAP } from '../../visualizers/signals/aliasMap'
import { readMasterSignal } from '../vizSignalProbe'

/** A fake analyser that fills both byte buffers with a constant level. */
function fakeAnalyser(level: number): BusAnalyser {
  return {
    frequencyBinCount: 64,
    getByteFrequencyData: (a: Uint8Array) => a.fill(level),
    // 128 = silence; offset to make a non-flat waveform reading
    getByteTimeDomainData: (a: Uint8Array) => a.fill(128 + level),
  }
}

function fedBus(level = 200): SignalBus {
  const bus = new SignalBus()
  bus.setAliases(ALIAS_MAP)
  bus.bindAnalysers(fakeAnalyser(level), null)
  return bus
}

describe('readMasterSignal (#309 live hover mapper)', () => {
  it('returns master DSP scalars from the bound analyser', () => {
    const bus = fedBus(200)
    for (const read of ['rms', 'bass', 'mid', 'treble'] as const) {
      const v = readMasterSignal(bus, { kind: 'scalar', read })
      expect(typeof v).toBe('number')
      expect(v as number).toBeGreaterThan(0)
      expect(v as number).toBeLessThanOrEqual(1)
    }
  })

  it('returns the master fft / wave arrays', () => {
    const bus = fedBus(200)
    const fft = readMasterSignal(bus, { kind: 'array', read: 'fft' })
    const wave = readMasterSignal(bus, { kind: 'array', read: 'wave' })
    expect(Array.isArray(fft)).toBe(true)
    expect(Array.isArray(wave)).toBe(true)
    expect((fft as number[]).length).toBeGreaterThan(0)
  })

  it('reads a drum envelope (uKick → bd) from the bump feed, decaying on tick', () => {
    const bus = fedBus()
    expect(readMasterSignal(bus, { kind: 'scalar', read: 'env:uKick' })).toBe(0) // idle
    bus.bump({ s: 'bd', hap: { value: { gain: 1 } } } as never)
    const lit = readMasterSignal(bus, { kind: 'scalar', read: 'env:uKick' }) as number
    expect(lit).toBeGreaterThan(0)
    bus.tick()
    const decayed = readMasterSignal(bus, { kind: 'scalar', read: 'env:uKick' }) as number
    expect(decayed).toBeLessThan(lit)
  })

  it('returns null for v1-unsupported specs (time, keyVelocity)', () => {
    const bus = fedBus()
    expect(readMasterSignal(bus, { kind: 'time' })).toBeNull()
    expect(readMasterSignal(bus, { kind: 'scalar', read: 'keyVelocity' })).toBeNull()
  })

  it('a silent analyser reads ~0 (no false signal)', () => {
    const bus = fedBus(0)
    expect(readMasterSignal(bus, { kind: 'scalar', read: 'rms' })).toBe(0)
  })
})
