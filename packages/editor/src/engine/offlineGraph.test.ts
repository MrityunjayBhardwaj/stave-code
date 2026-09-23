// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  interruptBackgroundRenders,
  offlineGraphBusy,
  onLiveGraph,
  registerBackgroundRender,
  withOfflineGraph,
} from './offlineGraph'

/**
 * #1733 — superdough's globals are one per page, so the rules for borrowing them
 * are page-wide. Driven with plain promises; the renders are fakes.
 */

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('withOfflineGraph', () => {
  it('never lets two renders borrow the graph at once, from any engine', async () => {
    const log: string[] = []
    let releaseA!: () => void
    const a = withOfflineGraph(async () => {
      log.push('a start')
      await new Promise<void>((r) => (releaseA = r))
      log.push('a end')
      return 'a'
    })
    const b = withOfflineGraph(async () => {
      log.push('b start')
      return 'b'
    })
    await tick()
    expect(log).toEqual(['a start'])
    expect(offlineGraphBusy()).toBe(true)
    releaseA()
    expect(await a).toBe('a')
    expect(await b).toBe('b')
    expect(log).toEqual(['a start', 'a end', 'b start'])
    expect(offlineGraphBusy()).toBe(false)
  })

  it('a render that fails still hands the graph on', async () => {
    const failed = withOfflineGraph(async () => {
      throw new Error('boom')
    })
    const next = withOfflineGraph(async () => 'next')
    await expect(failed).rejects.toThrow('boom')
    expect(await next).toBe('next')
  })
})

describe('onLiveGraph', () => {
  it('plays at once, in the same call, when nothing is rendering', () => {
    let played = false
    onLiveGraph(() => {
      played = true
    })
    expect(played).toBe(true)
  })

  it('interrupts a background render and plays once it has let go', async () => {
    let letGo!: () => void
    let interrupted = 0
    const off = registerBackgroundRender(() => {
      interrupted++
      return new Promise<void>((r) => (letGo = r))
    })
    try {
      let played = false
      onLiveGraph(() => {
        played = true
      })
      expect(interrupted).toBe(1)
      await tick()
      expect(played).toBe(false) // the render still holds the graph
      letGo()
      await tick()
      expect(played).toBe(true)
    } finally {
      off()
    }
  })

  it('asks every registered renderer, and none after it is removed', () => {
    const asked: string[] = []
    const offA = registerBackgroundRender(() => (asked.push('a'), null))
    const offB = registerBackgroundRender(() => (asked.push('b'), null))
    expect(interruptBackgroundRenders()).toBeNull()
    offA()
    offB()
    expect(interruptBackgroundRenders()).toBeNull()
    expect(asked).toEqual(['a', 'b'])
  })
})
