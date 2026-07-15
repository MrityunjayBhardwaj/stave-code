/**
 * buildHydraStaveBag — `stave.options` (#883).
 *
 * Hydra sketches are JS, so exposing the bag is just a property — but it has to
 * be a LIVE read. The renderer builds this bag ONCE per mount and mutates it in
 * place; the options slot is REPLACED on every re-publish. So a captured value
 * would pin the first evaluate's options forever, and the bug would look exactly
 * like the one this fixes: the sketch quietly drawing stale defaults.
 */

import { describe, it, expect } from 'vitest'
import { SignalBus } from '../signals/SignalBus'
import { buildHydraStaveBag } from '../renderers/hydraStaveBag'

describe('buildHydraStaveBag — stave.options', () => {
  it('exposes the options bag to the sketch', () => {
    const ref = { current: { intensity: 0.8 } as Record<string, unknown> }
    const bag = buildHydraStaveBag(new SignalBus(), ref)
    expect(bag.options).toEqual({ intensity: 0.8 })
  })

  it('reads THROUGH the slot — a re-publish is visible without rebuilding the bag', () => {
    // This is the assertion that would fail on a captured value. The renderer
    // never rebuilds the bag on update(), so if this reads stale, every option
    // edit is silently dead after the first evaluate.
    const ref = { current: { background: '#cc1133' } as Record<string, unknown> }
    const bag = buildHydraStaveBag(new SignalBus(), ref)
    expect(bag.options).toEqual({ background: '#cc1133' })

    ref.current = { background: '#11cc33' } // what update() does
    expect(bag.options).toEqual({ background: '#11cc33' })
  })

  it('reflects a REMOVED key after a re-publish', () => {
    const ref = { current: { labels: 1, vertical: 1 } as Record<string, unknown> }
    const bag = buildHydraStaveBag(new SignalBus(), ref)
    ref.current = { vertical: 1 }
    expect(bag.options.labels).toBeUndefined()
  })

  it('defaults to an empty bag when no slot is supplied', () => {
    // `stave.options.foo` must never throw in a sketch, even for a viz called
    // with no argument (and for the worker/test callers that pass no slot).
    const bag = buildHydraStaveBag(new SignalBus())
    expect(bag.options).toEqual({})
    expect(() => (bag.options as { foo?: unknown }).foo).not.toThrow()
  })
})
