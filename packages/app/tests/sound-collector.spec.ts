import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { waitForEditorLoaded } from './_appBoot'

/**
 * #1785 (part of #1780): the bytes of sounds no project uses are freed, and
 * nothing else is.
 *
 * Before: deleting a project left its sounds' bytes in `stave-assets` forever
 * (measured on main: a 1,500,000-byte blob stayed, usage did not drop).
 *
 * A persistent profile, as in `storage-full.spec.ts`: Playwright's default
 * context is incognito, where Chromium keeps blobs out of `usage`, and the
 * quota arm needs a real quota set before the page first opens IndexedDB.
 *
 * Every arm that asserts a sound was KEPT first waits for the collection to
 * have run (its console line, or its own result): a "kept" read before the
 * collector ran would pass against a collector that deletes everything.
 *
 * ONE assertion per test: a second `expect` never runs once the first fails.
 */

const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({}, use, info) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stave-sound-collector-'))
    const ctx = await chromium.launchPersistentContext(dir, {
      headless: true,
      baseURL: info.project.use.baseURL,
      args: ['--autoplay-policy=no-user-gesture-required'],
    })
    await use(ctx)
    await ctx.close()
    fs.rmSync(dir, { recursive: true, force: true })
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()))
  },
})

type CollectResult =
  | { kind: 'freed'; bytes: number; count: number }
  | { kind: 'nothing-unused' }
  | { kind: 'could-not-check'; reason: string; detail?: string }

interface AssetRecord {
  id: string
  name: string
  blobHash: string
  mime: string
}

interface Probe {
  reset(): Promise<void>
  put(base64: string, mime: string): Promise<{ hash: string; written: boolean }>
  list(): Promise<Array<{ hash: string; size: number }>>
  import(base64: string, mime: string, filename: string, existing: AssetRecord[]): Promise<{ record: AssetRecord }>
  docList(): Promise<AssetRecord[]>
  docAdd(record: AssetRecord): Promise<void>
  resolve(hash: string): Promise<string | null>
  decode(url: string): Promise<{ duration: number; sampleRate: number }>
  storageStatus(): Promise<{ fullSince: number | null; documentUnsaved: boolean }>
  collect(): Promise<CollectResult>
  storeAudioHeld(base64: string, mime: string, filename: string, holdMs: number): Promise<string>
}

type ProbeWindow = { __staveAssetProbe?: Probe }

/** A short stereo wav with noise in it, so it decodes and does not compress to nothing. */
function wav(seconds: number, seed = 0): string {
  const rate = 44100
  const n = Math.floor(seconds * rate)
  const data = Buffer.alloc(n * 4)
  let x = seed + 1
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    const v = Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 8000 + ((x % 2000) - 1000))
    data.writeInt16LE(v, i * 4)
    data.writeInt16LE(v, i * 4 + 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(2, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 4, 28)
  h.writeUInt16LE(4, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data]).toString('base64')
}

async function boot(page: Page, quotaBytes?: number): Promise<void> {
  if (quotaBytes) {
    const cdp = await page.context().newCDPSession(page)
    const origin = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000').origin
    await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: quotaBytes })
  }
  await page.addInitScript(() => {
    ;(window as unknown as { __STAVE_E2E__?: boolean }).__STAVE_E2E__ = true
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitForEditorLoaded(page)
  await page.waitForFunction(() => Boolean((window as unknown as ProbeWindow).__staveAssetProbe), { timeout: 30_000 })
  await page.evaluate(() => (window as unknown as ProbeWindow).__staveAssetProbe!.reset())
}

function probe<A, R>(page: Page, fn: (p: Probe, arg: A) => Promise<R>, arg: A): Promise<R> {
  return page.evaluate(
    ([src, a]) => {
      const p = (window as unknown as ProbeWindow).__staveAssetProbe!
      // eslint-disable-next-line no-new-func
      return (new Function('p', 'a', `return (${src})(p, a)`) as (p: Probe, a: unknown) => Promise<R>)(p, a)
    },
    [fn.toString(), arg] as const,
  )
}

/** Import a sound into the open project, and wait until its record is on disk. */
async function addSound(page: Page, b64: string, filename: string): Promise<AssetRecord> {
  const record = await probe(
    page,
    async (p, a: { b64: string; filename: string }) => {
      const r = await p.import(a.b64, 'audio/wav', a.filename, await p.docList())
      await p.docAdd(r.record)
      return r.record
    },
    { b64, filename },
  )
  // y-indexeddb writes the update without anyone awaiting it; the next arm
  // steps read the SAVED document, so give the write time to land.
  await page.waitForTimeout(1000)
  return record
}

async function blobHashes(page: Page): Promise<string[]> {
  return probe(page, async (p) => (await p.list()).map((b) => b.hash), null)
}

/** File ▸ New Project…, and wait until it is open. */
async function createProject(page: Page, name: string): Promise<void> {
  const before = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ''))
  await page.getByText('File', { exact: true }).first().click()
  await page.getByText('New Project...', { exact: true }).click()
  await page.getByPlaceholder('Untitled').fill(name)
  await page.getByPlaceholder('Untitled').press('Enter')
  await expect
    .poll(
      async () =>
        (await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ''))).some(
          (n) => /^stave-[0-9a-f]{8}-/.test(n) && !before.includes(n),
        ),
      { timeout: 15_000 },
    )
    .toBe(true)
}

/**
 * File ▸ Open Project… ▸ 🗑 on the one project that is not open, and resolve
 * with the collection's console line once it has run.
 */
async function deleteOtherProject(page: Page): Promise<string> {
  const ran = page.waitForEvent('console', {
    predicate: (m) => m.text().startsWith('[stave] after deleting a project:'),
    timeout: 20_000,
  })
  await page.getByText('File', { exact: true }).first().click()
  await page.getByText('Open Project...', { exact: true }).click()
  await page.locator('button[title="Delete"]').click()
  await page.getByRole('button', { name: 'Delete' }).last().click()
  return (await ran).text()
}

async function usage(page: Page): Promise<number> {
  return page.evaluate(async () => (await navigator.storage.estimate()).usage ?? 0)
}

test.describe('#1785 — unused sound bytes are freed, and only those', () => {
  test('deleting a project frees a sound no other project uses', async ({ page }) => {
    await boot(page)
    const record = await addSound(page, wav(4), 'big.wav')
    await createProject(page, 'Second')
    await page.getByText('File', { exact: true }).first().click()
    await page.getByText('Open Project...', { exact: true }).click()
    await page.locator('button[title="Delete"]').click()
    await page.getByRole('button', { name: 'Delete' }).last().click()
    // Polled rather than keyed on the collection's console line, so this arm
    // can be red on a build that has no collector at all.
    await expect.poll(() => blobHashes(page), { timeout: 20_000 }).not.toContain(record.blobHash)
  })

  test('the freed bytes stop counting toward storage', async ({ page }) => {
    // Chromium removes a deleted blob's file lazily: measured 17–37 s after
    // the delete, with the profile's IndexedDB size on disk falling at the same
    // moment as `estimate().usage` (probe `_1785-usage.spec.ts`, 2026-09-26).
    test.setTimeout(120_000)
    await boot(page)
    await addSound(page, wav(4), 'big.wav')
    await createProject(page, 'Second')
    await page.waitForTimeout(1000)
    const before = await usage(page)
    await deleteOtherProject(page)
    // The sound is 705,644 bytes; the deleted document and history are a few KB.
    await expect
      .poll(async () => before - (await usage(page)), { timeout: 75_000, intervals: [2_000] })
      .toBeGreaterThan(600_000)
  })

  test('a sound another project still uses is kept, and still plays after a reload', async ({ page }) => {
    await boot(page)
    const shared = wav(2, 7)
    const record = await addSound(page, shared, 'shared.wav')
    await createProject(page, 'Second')
    await addSound(page, shared, 'shared.wav')
    await deleteOtherProject(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForEditorLoaded(page)
    await page.waitForFunction(() => Boolean((window as unknown as ProbeWindow).__staveAssetProbe), { timeout: 30_000 })
    const decoded = await probe(
      page,
      async (p, hash: string) => {
        const url = await p.resolve(hash)
        return url ? (await p.decode(url)).duration > 1.9 : false
      },
      record.blobHash,
    )
    expect(decoded).toBe(true)
  })

  test('a sound only a closed project uses is kept', async ({ page }) => {
    await boot(page)
    const record = await addSound(page, wav(1, 10), 'closed.wav')
    // The first project is now closed: its sound is named only by its SAVED
    // document, which the collector must read without opening it.
    await createProject(page, 'Second')
    const outcome = await probe(
      page,
      async (p, h: string) => {
        const result = await p.collect()
        return { result: result.kind, kept: (await p.list()).some((b) => b.hash === h) }
      },
      record.blobHash,
    )
    expect(outcome).toEqual({ result: 'nothing-unused', kept: true })
  })

  test('a sound named only by the open document in memory is kept (disk refused the record)', async ({ page }) => {
    await boot(page, 4_000_000)
    const { hash } = await probe(page, (p, b64: string) => p.put(b64, 'audio/wav'), wav(1, 3))
    // Fill what room is left, so the record below is refused by the disk.
    await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const q = indexedDB.open('stave-e2e-filler', 1)
        q.onupgradeneeded = () => q.result.createObjectStore('rows')
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      for (let n = 0; n < 2000; n++) {
        const tx = db.transaction('rows', 'readwrite')
        tx.objectStore('rows').put(new Blob([new Uint8Array(16_000)]), n)
        const kept = await new Promise<boolean>((res) => {
          tx.oncomplete = () => res(true)
          tx.onabort = () => res(false)
        })
        if (!kept) break
      }
      db.close()
    })
    const outcome = await probe(
      page,
      async (p, h: string) => {
        await p.docAdd({ id: 'mem-1', name: 'held', blobHash: h, mime: 'audio/wav' })
        // Wait until the refusal of that write has been heard: the record is
        // then in memory only.
        for (let i = 0; i < 50 && !(await p.storageStatus()).documentUnsaved; i++) {
          await new Promise((r) => setTimeout(r, 100))
        }
        const unsaved = (await p.storageStatus()).documentUnsaved
        const result = await p.collect()
        const kept = (await p.list()).some((b) => b.hash === h)
        return { unsaved, result: result.kind, kept }
      },
      hash,
    )
    expect(outcome).toEqual({ unsaved: true, result: 'nothing-unused', kept: true })
  })

  test('another open tab stops the collection before it deletes anything', async ({ page, context }) => {
    await boot(page)
    const { hash } = await probe(page, (p, b64: string) => p.put(b64, 'audio/wav'), wav(1, 4))
    const second = await context.newPage()
    await second.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForEditorLoaded(second)
    const outcome = await probe(
      page,
      async (p, h: string) => {
        const result = await p.collect()
        return { result, kept: (await p.list()).some((b) => b.hash === h) }
      },
      hash,
    )
    expect(outcome).toEqual({ result: { kind: 'could-not-check', reason: 'other-tab' }, kept: true })
  })

  test('a project document that cannot be read stops the collection before it deletes anything', async ({ page }) => {
    await boot(page)
    const { hash } = await probe(page, (p, b64: string) => p.put(b64, 'audio/wav'), wav(1, 5))
    const broken = 'stave-00000000-0000-4000-8000-000000000000'
    // A document database without y-indexeddb's `updates` store.
    await page.evaluate(async (name) => {
      await new Promise<void>((res, rej) => {
        const q = indexedDB.open(name, 1)
        q.onupgradeneeded = () => q.result.createObjectStore('not-updates')
        q.onsuccess = () => {
          q.result.close()
          res()
        }
        q.onerror = () => rej(q.error)
      })
    }, broken)
    const outcome = await probe(
      page,
      async (p, h: string) => {
        const result = await p.collect()
        return { result, kept: (await p.list()).some((b) => b.hash === h) }
      },
      hash,
    )
    expect(outcome).toEqual({
      result: { kind: 'could-not-check', reason: 'unreadable-project', detail: broken },
      kept: true,
    })
  })

  test('a sound being added while a collection starts is kept', async ({ page }) => {
    await boot(page)
    const outcome = await probe(
      page,
      async (p, b64: string) => {
        // The real door, holding 1.5 s between storing the bytes and writing
        // the record.
        const door = p.storeAudioHeld(b64, 'audio/wav', 'held.wav', 1500)
        for (let i = 0; i < 100 && (await p.list()).length === 0; i++) {
          await new Promise((r) => setTimeout(r, 20))
        }
        const storedFirst = (await p.list()).length === 1
        const result = await p.collect()
        const hash = await door
        return { storedFirst, result: result.kind, kept: (await p.list()).some((b) => b.hash === hash) }
      },
      wav(1, 6),
    )
    expect(outcome).toEqual({ storedFirst: true, result: 'nothing-unused', kept: true })
  })

  test('a collection deletes the unused sound and keeps the used one', async ({ page }) => {
    await boot(page)
    const used = await addSound(page, wav(1, 8), 'used.wav')
    await probe(page, (p, b64: string) => p.put(b64, 'audio/wav'), wav(1, 9))
    const outcome = await probe(
      page,
      async (p) => {
        const result = await p.collect()
        return { result, left: (await p.list()).map((b) => b.hash) }
      },
      null,
    )
    expect({ kind: outcome.result.kind, count: (outcome.result as { count?: number }).count, left: outcome.left }).toEqual({
      kind: 'freed',
      count: 1,
      left: [used.blobHash],
    })
  })
})
