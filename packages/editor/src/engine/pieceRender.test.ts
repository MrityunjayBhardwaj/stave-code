// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { piecesOf, renderInPieces, canPauseOfflineRender } from './pieceRender'

/**
 * #1771 — the display render split into pieces where a render cannot pause.
 * The fake render writes each sample's SONG frame index into it, so a join that
 * lands one frame off, leaves a gap or keeps a lead-in shows as a wrong value.
 */
const RATE = 10

function songRamp(asked: Array<[number, number]>) {
  return async (from: number, seconds: number) => {
    asked.push([from, seconds])
    const first = Math.round(from * RATE)
    const n = Math.ceil(seconds * RATE)
    const ch = Float32Array.from({ length: n }, (_, i) => first + i)
    return [ch, Float32Array.from(ch, (v) => -v)]
  }
}

describe('piecesOf (#1771)', () => {
  it('covers the song in pieces, each started a lead-in early, the first at 0 and the last shorter', () => {
    expect(piecesOf(20, 8, 3)).toEqual([
      { from: 0, keepFrom: 0, to: 8 },
      { from: 5, keepFrom: 8, to: 16 },
      { from: 13, keepFrom: 16, to: 20 },
    ])
  })

  it('no song, no pieces', () => {
    expect(piecesOf(0, 8, 4)).toEqual([])
  })
})

describe('renderInPieces (#1771)', () => {
  it('joins the kept parts into exactly what one render of the whole song would hold', async () => {
    const asked: Array<[number, number]> = []
    const out = await renderInPieces(20.05, RATE, piecesOf(20.05, 8, 3), songRamp(asked))
    const frames = Math.ceil(20.05 * RATE)
    expect(out).toHaveLength(2)
    expect(Array.from(out[0])).toEqual(Array.from({ length: frames }, (_, i) => i))
    expect(Array.from(out[1])).toEqual(Array.from({ length: frames }, (_, i) => -i))
    expect(asked).toEqual([[0, 8], [5, 11], [13, 7.050000000000001]])
  })

  it('renders pieces one after another, never two at once', async () => {
    let open = 0
    let most = 0
    await renderInPieces(24, RATE, piecesOf(24, 8, 4), async (from, seconds) => {
      most = Math.max(most, ++open)
      await new Promise((r) => setTimeout(r, 0))
      open--
      return [new Float32Array(Math.ceil(seconds * RATE))]
    })
    expect(most).toBe(1)
  })

  it('stops before the next piece once the signal aborts, with the given error', async () => {
    const controller = new AbortController()
    const asked: Array<[number, number]> = []
    const ramp = songRamp(asked)
    const run = renderInPieces(24, RATE, piecesOf(24, 8, 4), async (from, s) => {
      const ch = await ramp(from, s)
      controller.abort()
      return ch
    }, controller.signal, () => new Error('cancelled'))
    await expect(run).rejects.toThrow('cancelled')
    expect(asked).toHaveLength(1)
  })
})

describe('canPauseOfflineRender (#1771)', () => {
  it('is true only where the offline context has suspend', () => {
    class WithSuspend { suspend() {} }
    class WithoutSuspend {}
    expect(canPauseOfflineRender({ OfflineAudioContext: WithSuspend })).toBe(true)
    expect(canPauseOfflineRender({ OfflineAudioContext: WithoutSuspend })).toBe(false)
    expect(canPauseOfflineRender({})).toBe(false)
  })
})
