import { describe, it, expect, vi, afterEach } from 'vitest'
import { openIdbWithTimeout } from '../idb'
import {
  EPHEMERAL_ID_PREFIX,
  isEphemeralProjectId,
} from '../workspace/projectRegistry'

// jsdom has no IndexedDB. openIdbWithTimeout only touches `indexedDB.open` and
// the request's on* handlers, so a hand-rolled fake request lets us drive every
// settle path (success / error / blocked / timeout) deterministically.
type FakeReq = {
  onupgradeneeded: ((this: unknown) => void) | null
  onsuccess: ((this: unknown) => void) | null
  onerror: ((this: unknown) => void) | null
  onblocked: ((this: unknown) => void) | null
  result: unknown
  error: unknown
}

function installFakeIdb(): FakeReq {
  const req: FakeReq = {
    onupgradeneeded: null,
    onsuccess: null,
    onerror: null,
    onblocked: null,
    result: null,
    error: null,
  }
  ;(globalThis as unknown as { indexedDB: unknown }).indexedDB = {
    open: vi.fn(() => req),
  }
  return req
}

afterEach(() => {
  vi.useRealTimers()
  delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB
})

describe('openIdbWithTimeout', () => {
  it('resolves with the db when the open succeeds', async () => {
    const req = installFakeIdb()
    const db = { close: vi.fn() }
    const p = openIdbWithTimeout('db', 1, () => {})
    req.result = db
    req.onsuccess?.()
    await expect(p).resolves.toBe(db)
    expect(db.close).not.toHaveBeenCalled()
  })

  it('runs the upgrade callback on upgradeneeded', async () => {
    const req = installFakeIdb()
    const upgrade = vi.fn()
    const db = { close: vi.fn() }
    const p = openIdbWithTimeout('db', 1, upgrade)
    req.result = db
    req.onupgradeneeded?.()
    req.onsuccess?.()
    await p
    expect(upgrade).toHaveBeenCalledWith(db)
  })

  it('rejects when the open errors', async () => {
    const req = installFakeIdb()
    req.error = new Error('boom')
    const p = openIdbWithTimeout('db', 1, () => {})
    req.onerror?.()
    await expect(p).rejects.toThrow('boom')
  })

  it('rejects when the open is blocked (stale tab holds an upgrade)', async () => {
    const req = installFakeIdb()
    const p = openIdbWithTimeout('projects', 1, () => {})
    req.onblocked?.()
    await expect(p).rejects.toThrow('idb-open-blocked:projects')
  })

  it('rejects within the budget when the open never settles', async () => {
    vi.useFakeTimers()
    installFakeIdb() // open() returns a request that never fires anything
    const p = openIdbWithTimeout('stuck', 1, () => {}, { timeoutMs: 5000 })
    const assertion = expect(p).rejects.toThrow('idb-open-timeout:stuck')
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })

  it('closes a late success so a stuck-then-recovered open does not leak', async () => {
    vi.useFakeTimers()
    const req = installFakeIdb()
    const db = { close: vi.fn() }
    const p = openIdbWithTimeout('late', 1, () => {}, { timeoutMs: 5000 })
    const assertion = expect(p).rejects.toThrow('idb-open-timeout:late')
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    // Open resolves AFTER the timeout — must be closed, not leaked.
    req.result = db
    req.onsuccess?.()
    expect(db.close).toHaveBeenCalledTimes(1)
  })
})

describe('isEphemeralProjectId', () => {
  it('matches the ephemeral fallback id prefix', () => {
    expect(isEphemeralProjectId(`${EPHEMERAL_ID_PREFIX}abc-123`)).toBe(true)
  })
  it('does not match normal project ids', () => {
    expect(isEphemeralProjectId('p_abc123')).toBe(false)
    expect(isEphemeralProjectId('')).toBe(false)
  })
})
