import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import { StorageFullError, committed, isQuotaError, transactionDone } from '../idb'
import { __resetStorageStatusForTests, getStorageStatus } from '../storageStatus'

/**
 * #1777 — a write is saved when its TRANSACTION commits, not when its request
 * succeeds. The two refusal shapes below are the ones measured in real browsers
 * with a filled quota (2026-09-25); jsdom has no IndexedDB, so the request and
 * transaction are small EventTargets driven in the order each browser uses.
 */

class FakeTx extends EventTarget {
  error: unknown = null
  complete() {
    this.dispatchEvent(new Event('complete'))
  }
  abort(error: unknown) {
    this.error = error
    this.dispatchEvent(new Event('abort'))
  }
}

interface FakeReq {
  onsuccess: (() => void) | null
  onerror: (() => void) | null
  result: unknown
  error: unknown
  transaction: FakeTx
}

function fakeWrite(): { req: FakeReq; tx: FakeTx } {
  const tx = new FakeTx()
  const req: FakeReq = { onsuccess: null, onerror: null, result: 'key', error: null, transaction: tx }
  return { req, tx }
}

const quota = () => Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
const asReq = (r: FakeReq) => r as unknown as IDBRequest<string>

describe('committed', () => {
  it('resolves with the result once the transaction completes', async () => {
    const { req, tx } = fakeWrite()
    const p = committed(asReq(req))
    req.onsuccess?.()
    tx.complete()
    await expect(p).resolves.toBe('key')
  })

  it('does NOT resolve on request success alone', async () => {
    const { req } = fakeWrite()
    let settled = false
    void committed(asReq(req)).then(
      () => (settled = true),
      () => (settled = true),
    )
    req.onsuccess?.()
    await new Promise((r) => setTimeout(r, 0))
    expect(settled).toBe(false)
  })

  it('Chromium shape: request succeeds, transaction aborts for space → StorageFullError', async () => {
    const { req, tx } = fakeWrite()
    const p = committed(asReq(req))
    req.onsuccess?.()
    tx.abort(quota())
    await expect(p).rejects.toBeInstanceOf(StorageFullError)
  })

  it('Firefox shape: the request itself fails for space → StorageFullError', async () => {
    const { req, tx } = fakeWrite()
    const p = committed(asReq(req))
    req.error = quota()
    req.onerror?.()
    tx.abort(quota())
    await expect(p).rejects.toBeInstanceOf(StorageFullError)
  })

  it('a refusal for space is reported to the storage status (#1779)', async () => {
    __resetStorageStatusForTests()
    const { req, tx } = fakeWrite()
    const p = committed(asReq(req))
    req.onsuccess?.()
    tx.abort(quota())
    await p.catch(() => {})
    expect(getStorageStatus().fullSince).not.toBeNull()
  })

  it('an abort for any other reason is not called "full"', async () => {
    const { req, tx } = fakeWrite()
    const p = committed(asReq(req))
    req.onsuccess?.()
    const other = Object.assign(new Error('x'), { name: 'AbortError' })
    tx.abort(other)
    await expect(p).rejects.toBe(other)
  })
})

describe('transactionDone', () => {
  it('lets several waiters share one transaction', async () => {
    const tx = new FakeTx()
    const a = transactionDone(tx as unknown as IDBTransaction)
    const b = transactionDone(tx as unknown as IDBTransaction)
    tx.complete()
    await expect(Promise.all([a, b])).resolves.toEqual([undefined, undefined])
  })
})

describe('isQuotaError', () => {
  it('names both the raw DOMException name and the wrapped error', () => {
    expect(isQuotaError(quota())).toBe(true)
    expect(isQuotaError(new StorageFullError(quota()))).toBe(true)
    expect(isQuotaError(new Error('nope'))).toBe(false)
    expect(isQuotaError(null)).toBe(false)
  })
})

/**
 * The door set, derived rather than listed: every source file that opens a
 * `readwrite` transaction must wait for it through `committed` or
 * `transactionDone`. A new store that awaits a bare request would report saved
 * when the browser refused it — the bug this file exists for.
 */
describe('every readwrite door waits for commit', () => {
  const src = join(__dirname, '..')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        if (name !== '__tests__' && name !== 'node_modules') walk(p)
      } else if (/\.tsx?$/.test(name)) files.push(p)
    }
  }
  walk(src)
  const writers = files.filter((f) => readFileSync(f, 'utf8').includes("'readwrite'"))

  it('finds the known writers (the scan is not empty)', () => {
    const names = writers.map((f) => relative(src, f)).sort()
    expect(names).toEqual(
      expect.arrayContaining([
        'visualizers/vizPreset.ts',
        'workspace/assetStore.ts',
        'workspace/history/historyStore.ts',
        'workspace/projectRegistry.ts',
        'workspace/snapshotStore.ts',
      ]),
    )
  })

  it.each(writers.map((f) => [relative(src, f), f]))('%s waits for commit', (_n, f) => {
    const text = readFileSync(f as string, 'utf8')
    expect(/\bcommitted\(|\btransactionDone\(/.test(text)).toBe(true)
  })
})
