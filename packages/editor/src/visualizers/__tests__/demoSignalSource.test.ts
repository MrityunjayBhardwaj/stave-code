import { describe, it, expect } from 'vitest'
import { createDrumDemoSignalSource, DRUM_DEMO_VOICES } from '../demoSignalSource'
import { MASTER_KEY, type SignalFrame } from '../worker/signalFrame'

/** Drive the source across `[0, cycleSeconds]` at `stepMs` and collect frames.
 *  The first call establishes the onset baseline (no back-fired history). */
function driveOneCycle(stepMs = 1, cycleSeconds = 1): SignalFrame[] {
  const src = createDrumDemoSignalSource({ cycleSeconds })
  const frames: SignalFrame[] = []
  const totalMs = cycleSeconds * 1000
  for (let t = 0; t <= totalMs + 1e-6; t += stepMs) {
    frames.push(src.next(t))
  }
  return frames
}

function countBumps(frames: SignalFrame[], s: string): number {
  return frames.reduce((n, f) => n + f.bumps.filter((b) => b.s === s).length, 0)
}

describe('#838 demoSignalSource — drum-pattern preview feed', () => {
  it('fires the s("bd*4, ~ sd, hh*8") rhythm exactly once per onset over a cycle', () => {
    const frames = driveOneCycle(1)
    // bd*4 (0,¼,½,¾), ~ sd (½), hh*8 (0,⅛,…,⅞) — each onset crossed once.
    expect(countBumps(frames, 'bd')).toBe(4)
    expect(countBumps(frames, 'sd')).toBe(1)
    expect(countBumps(frames, 'hh')).toBe(8)
  })

  it('never back-fires bumps on the first frame (no history)', () => {
    const src = createDrumDemoSignalSource()
    expect(src.next(0).bumps).toEqual([])
  })

  it('emits a monotonic seq and a single master analyser per frame', () => {
    const frames = driveOneCycle(4)
    frames.forEach((f, i) => {
      expect(f.seq).toBe(i)
      expect(f.analysers).toHaveLength(1)
      expect(f.analysers[0].key).toBe(MASTER_KEY)
      expect(f.analysers[0].freq.length).toBe(f.analysers[0].frequencyBinCount)
    })
  })

  it('renders a lit, time-varying spectrum (Prism iChannel0 is never black)', () => {
    const frames = driveOneCycle(4)
    const energy = (f: SignalFrame) => f.analysers[0].freq.reduce((a, b) => a + b, 0)
    const energies = frames.map(energy)
    // Every frame has some energy (noise floor guarantees > 0)...
    expect(Math.min(...energies)).toBeGreaterThan(0)
    // ...and the spectrum genuinely varies across the loop (kick/snare/hat pulses).
    expect(Math.max(...energies) - Math.min(...energies)).toBeGreaterThan(1000)
  })

  it('bass tracks the kick: low-band energy peaks near a kick onset, dips between', () => {
    const src = createDrumDemoSignalSource({ cycleSeconds: 1 })
    const lowBandAt = (ms: number) => {
      const f = src.next(ms)
      const bins = f.analysers[0].freq
      let sum = 0
      for (let i = 0; i < 8; i++) sum += bins[i]
      return sum
    }
    const onKick = lowBandAt(0) // pos 0 = kick onset
    const offKick = lowBandAt(125) // pos ⅛ = between kick (¼) and start — decayed
    expect(onKick).toBeGreaterThan(offKick)
  })

  it('exposes the three canonical drum voices with the aliasMap sound names', () => {
    expect(DRUM_DEMO_VOICES.map((v) => v.s)).toEqual(['bd', 'sd', 'hh'])
  })
})
