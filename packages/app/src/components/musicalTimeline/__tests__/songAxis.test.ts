import { describe, it, expect } from 'vitest'
import { songCycleToX, xToSongCycle, wrapSongPosition } from '../songAxis'

describe('songCycleToX', () => {
  it('maps a cycle linearly across the width', () => {
    expect(songCycleToX(0, 8, 800)).toBe(0)
    expect(songCycleToX(4, 8, 800)).toBe(400)
    expect(songCycleToX(8, 8, 800)).toBe(800)
  })

  it('clamps out-of-range cycles to the edges', () => {
    expect(songCycleToX(-2, 8, 800)).toBe(0)
    expect(songCycleToX(20, 8, 800)).toBe(800)
  })

  it('returns 0 for degenerate inputs', () => {
    expect(songCycleToX(null, 8, 800)).toBe(0)
    expect(songCycleToX(4, 0, 800)).toBe(0)
    expect(songCycleToX(4, 8, 0)).toBe(0)
    expect(songCycleToX(Number.NaN, 8, 800)).toBe(0)
  })
})

describe('xToSongCycle', () => {
  it('inverts songCycleToX', () => {
    expect(xToSongCycle(0, 8, 800)).toBe(0)
    expect(xToSongCycle(400, 8, 800)).toBeCloseTo(4)
  })

  it('clamps x to the canvas and keeps the result below displayCycles', () => {
    expect(xToSongCycle(-50, 8, 800)).toBe(0)
    // far edge → just below 8 (so it seeks the last cycle, not a wrap to 0)
    const atEdge = xToSongCycle(800, 8, 800)
    expect(atEdge).toBeLessThan(8)
    expect(atEdge).toBeGreaterThan(7.9)
  })

  it('returns 0 for degenerate inputs', () => {
    expect(xToSongCycle(100, 0, 800)).toBe(0)
    expect(xToSongCycle(100, 8, 0)).toBe(0)
  })

  it('round-trips a mid cycle through both directions', () => {
    const x = songCycleToX(3, 8, 800)
    expect(xToSongCycle(x, 8, 800)).toBeCloseTo(3)
  })
})

describe('wrapSongPosition', () => {
  it('wraps a position past the loop length back into [0, displayCycles)', () => {
    expect(wrapSongPosition(2, 8)).toBe(2)
    expect(wrapSongPosition(10, 8)).toBe(2)
    expect(wrapSongPosition(8, 8)).toBe(0)
  })

  it('handles negative positions', () => {
    expect(wrapSongPosition(-1, 8)).toBe(7)
  })

  it('returns null for null / non-finite / degenerate', () => {
    expect(wrapSongPosition(null, 8)).toBeNull()
    expect(wrapSongPosition(Number.NaN, 8)).toBeNull()
    expect(wrapSongPosition(4, 0)).toBeNull()
  })
})
