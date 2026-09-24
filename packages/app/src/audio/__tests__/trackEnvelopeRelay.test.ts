/**
 * #1731 — the Timeline is registered once, so its one subscription must follow
 * the active runtime. Driven by fake handles.
 */
import { describe, it, expect } from 'vitest'
import type { TrackEnvelopeAccess } from '@stave/editor'
import { createTrackEnvelopeRelay } from '../trackEnvelopeRelay'

function fakeHandle(name: string) {
  const listeners = new Set<() => void>()
  const requests: Array<[readonly string[], number]> = []
  const handle: TrackEnvelopeAccess = {
    request: (ids, cycles) => {
      requests.push([ids, cycles])
    },
    get: (id) => ({ data: new Float32Array([0, 1]), columns: 1, cycles: 1, stale: id === name }),
    status: () => ({ rendering: name, overCap: [], waiting: [] }),
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
  return { handle, requests, fire: () => listeners.forEach((l) => l()), subscribers: () => listeners.size }
}

describe('createTrackEnvelopeRelay (#1731)', () => {
  it('answers from whichever runtime is attached, and nothing before one is', () => {
    const relay = createTrackEnvelopeRelay()
    expect(relay.access.get('x')).toBeNull()
    expect(relay.access.status()).toEqual({ rendering: null, overCap: [], waiting: [] })
    const a = fakeHandle('a')
    relay.attach('file-a', a.handle)
    relay.access.request(['$0'], 8)
    expect(a.requests).toEqual([[['$0'], 8]])
    expect(relay.access.status().rendering).toBe('a')
  })

  it('moves its one upstream subscription to the new runtime and tells the timeline', () => {
    const relay = createTrackEnvelopeRelay()
    let heard = 0
    relay.access.subscribe(() => heard++)
    const a = fakeHandle('a')
    const b = fakeHandle('b')
    relay.attach('file-a', a.handle)
    expect(heard).toBe(1) // a different file's envelopes
    a.fire()
    expect(heard).toBe(2)
    relay.attach('file-b', b.handle)
    expect(heard).toBe(3)
    expect(a.subscribers()).toBe(0)
    expect(b.subscribers()).toBe(1)
    a.fire()
    expect(heard).toBe(3) // the old runtime is no longer heard
    b.fire()
    expect(heard).toBe(4)
  })

  it('re-attaching the same file keeps one subscription and says nothing', () => {
    const relay = createTrackEnvelopeRelay()
    let heard = 0
    relay.access.subscribe(() => heard++)
    const a1 = fakeHandle('a')
    const a2 = fakeHandle('a')
    relay.attach('file-a', a1.handle)
    relay.attach('file-a', a2.handle)
    expect(heard).toBe(1)
    expect(a1.subscribers() + a2.subscribers()).toBe(1)
  })

  it('detaching drops the subscription', () => {
    const relay = createTrackEnvelopeRelay()
    const a = fakeHandle('a')
    relay.attach('file-a', a.handle)
    relay.attach(null, null)
    expect(a.subscribers()).toBe(0)
    expect(relay.access.get('a')).toBeNull()
  })
})
