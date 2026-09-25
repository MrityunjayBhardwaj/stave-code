import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { editorValue, seedCode, waitForEditorLoaded } from './_appBoot'

/**
 * The instrument for E2E-6 (#1704): what the user is told when storage is FULL.
 *
 * The quota is the browser's own, not a stub. Two things about filling it were
 * learned the hard way (2026-09-25) and are why this spec does not use the
 * shared fixtures:
 *
 * - **A persistent profile.** Playwright's default context is incognito, and
 *   there Chromium keeps blobs in memory without counting them toward usage —
 *   1.7 MB stored moved usage by 2 KB, so the quota never bites.
 * - **The quota is set BEFORE the page first opens IndexedDB.** An override
 *   applied afterwards was not enforced on already-open databases.
 *
 * Then the remaining room is filled with 16 KB rows in a side database until
 * the browser refuses one, so every write the app makes afterwards is refused.
 *
 * ONE assertion per test: a second `expect` never runs once the first fails.
 */

const QUOTA_BYTES = 4_000_000

const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({}, use, info) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stave-storage-full-'))
    const ctx = await chromium.launchPersistentContext(dir, {
      headless: true,
      baseURL: info.project.use.baseURL,
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
      permissions: ['microphone'],
    })
    await use(ctx)
    await ctx.close()
    fs.rmSync(dir, { recursive: true, force: true })
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()))
  },
})

interface Probe {
  reset(): Promise<void>
  put(base64: string, mime: string): Promise<{ hash: string; written: boolean }>
  list(): Promise<Array<{ hash: string }>>
  docList(): Promise<Array<{ name: string }>>
  storageStatus(): Promise<{ fullSince: number | null; documentUnsaved: boolean }>
  retryDocSave(): Promise<boolean>
}

/** The page's asset probe. Cast locally: several specs declare it globally with
 *  different shapes, and a second global declaration is a type error. */
type ProbeWindow = { __staveAssetProbe?: Probe }

/** A short stereo wav with noise in it, so it is not compressible to nothing. */
function wav(seconds: number): Buffer {
  const rate = 44100
  const ch = 2
  const n = Math.floor(seconds * rate)
  const data = Buffer.alloc(n * ch * 2)
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 8000 + (Math.random() - 0.5) * 2000)
    for (let c = 0; c < ch; c++) data.writeInt16LE(v, (i * ch + c) * 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(ch, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * ch * 2, 28)
  h.writeUInt16LE(ch * 2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

/** Boot with the quota already small, and the asset store empty. */
async function boot(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  const origin = new URL(test.info().project.use.baseURL ?? 'http://localhost:3000').origin
  await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: QUOTA_BYTES })
  await page.addInitScript(() => {
    ;(window as unknown as { __STAVE_E2E__?: boolean }).__STAVE_E2E__ = true
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitForEditorLoaded(page)
  await page.waitForFunction(() => Boolean((window as unknown as ProbeWindow).__staveAssetProbe), { timeout: 30_000 })
  await page.evaluate(() => (window as unknown as ProbeWindow).__staveAssetProbe!.reset())
}

/** Fill what room is left until the browser refuses a row. Returns the rows kept. */
async function fillStorage(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const q = indexedDB.open('stave-e2e-filler', 1)
      q.onupgradeneeded = () => q.result.createObjectStore('rows')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    let n = 0
    for (; n < 2000; n++) {
      const tx = db.transaction('rows', 'readwrite')
      tx.objectStore('rows').put(new Blob([new Uint8Array(16_000)]), n)
      const kept = await new Promise<boolean>((res) => {
        tx.oncomplete = () => res(true)
        tx.onabort = () => res(false)
      })
      if (!kept) break
    }
    db.close()
    return n
  })
}

async function openLibrary(page: Page): Promise<void> {
  if (await page.locator('[data-asset-library]').count()) return
  await page.getByRole('button', { name: /library/i }).first().click()
  await page.locator('[data-asset-library]').waitFor({ timeout: 15_000 })
}

async function addAudio(page: Page): Promise<string> {
  await openLibrary(page)
  await page
    .locator('[data-add-audio-input]')
    .setInputFiles({ name: 'big.wav', mimeType: 'audio/wav', buffer: wav(10) })
  const message = page.locator('[data-add-audio-message]')
  await message.waitFor({ timeout: 20_000 })
  return message.innerText()
}

const docNames = (page: Page) =>
  page.evaluate(async () => (await (window as unknown as ProbeWindow).__staveAssetProbe!.docList()).map((r) => r.name))

// ---------------------------------------------------------------------------
// Controls: the instrument can both succeed and fill
// ---------------------------------------------------------------------------

test('control: with room left, adding a sound works under the small quota', async ({ page }) => {
  await boot(page)
  expect(await addAudio(page)).toBe('Added big')
})

test('control: the fill reaches a refusal rather than the row cap', async ({ page }) => {
  await boot(page)
  const rows = await fillStorage(page)
  expect(rows).toBeLessThan(2000)
})

// ---------------------------------------------------------------------------
// #1777 — nothing reports saved that the browser refused
// ---------------------------------------------------------------------------

test('#1777 the store call rejects as storage-full instead of reporting written', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  const outcome = await page.evaluate(async (b64) => {
    try {
      const r = await (window as unknown as ProbeWindow).__staveAssetProbe!.put(b64, 'audio/wav')
      return `resolved written=${r.written}`
    } catch (e) {
      return `rejected ${(e as Error).name}`
    }
  }, wav(10).toString('base64'))
  expect(outcome).toBe('rejected StorageFullError')
})

test('#1777 adding a sound that does not fit does not say it was added', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  expect(await addAudio(page)).not.toMatch(/^Added/)
})

test('#1777 adding a sound that does not fit leaves no record in the project', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  await addAudio(page)
  expect(await docNames(page)).toEqual([])
})

test('#1777 a full disk still lets the app open — boot does not wait on a timestamp', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const opened = await waitForEditorLoaded(page).then(
    () => 'opened',
    () => 'did not open',
  )
  expect(opened).toBe('opened')
})

// ---------------------------------------------------------------------------
// #1778 — code edits when the disk is full
// ---------------------------------------------------------------------------

/** Free the room the fill took, the way deleting files would. */
async function freeStorage(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((res, rej) => {
        const q = indexedDB.deleteDatabase('stave-e2e-filler')
        q.onsuccess = () => res()
        q.onerror = () => rej(q.error)
      }),
  )
}

const status = (page: Page) =>
  page.evaluate(() => (window as unknown as ProbeWindow).__staveAssetProbe!.storageStatus())

/** Add a marker line to the code and give y-indexeddb time to try its write. */
async function editCode(page: Page): Promise<string> {
  const marker = `// storage-full ${Date.now()}`
  await seedCode(page, `${marker}\n${await editorValue(page)}`)
  await page.waitForTimeout(1500)
  return marker
}

async function reloadAndRead(page: Page): Promise<string> {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForEditorLoaded(page)
  return editorValue(page)
}

test('#1778 control: with room, an edit survives a reload', async ({ page }) => {
  await boot(page)
  const marker = await editCode(page)
  expect((await reloadAndRead(page)).startsWith(marker)).toBe(true)
})

test('#1778 an edit the disk refused marks the document as not saved', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  await editCode(page)
  expect((await status(page)).documentUnsaved).toBe(true)
})

test('#1778 with room left, an edit does not mark the document unsaved', async ({ page }) => {
  await boot(page)
  await editCode(page)
  expect(await status(page)).toEqual({ fullSince: null, documentUnsaved: false })
})

test('#1778 retrying while still full says so and leaves the document unsaved', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  await editCode(page)
  const saved = await page.evaluate(() =>
    (window as unknown as ProbeWindow).__staveAssetProbe!.retryDocSave(),
  )
  const s = await status(page)
  expect({ saved, unsaved: s.documentUnsaved }).toEqual({ saved: false, unsaved: true })
})

test('#1778 once room is freed, retrying saves the edits a full disk refused', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  const marker = await editCode(page)
  await freeStorage(page)
  await page.evaluate(() => (window as unknown as ProbeWindow).__staveAssetProbe!.retryDocSave())
  expect((await reloadAndRead(page)).startsWith(marker)).toBe(true)
})

// ---------------------------------------------------------------------------
// #1779 — what the user is told, and what they can do about it
// ---------------------------------------------------------------------------

const notice = (page: Page) => page.locator('[data-storage-full]')

test('#1779 with room left, no storage notice is shown', async ({ page }) => {
  await boot(page)
  await editCode(page)
  expect(await notice(page).count()).toBe(0)
})

test('#1779 an edit the disk refused shows the notice naming unsaved changes', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  await editCode(page)
  await expect(notice(page)).toContainText(/Storage is full — changes since \d{1,2}:\d\d( ?[AP]M)? are not saved/, {
    timeout: 10_000,
  })
})

test('#1779 adding a sound that does not fit says storage is full', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  expect(await addAudio(page)).toBe('Could not add “big.wav” — storage is full')
})

test('#1779 a sound the disk refused also raises the notice — any door, one state', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  await addAudio(page)
  await expect(notice(page)).toContainText('Storage is full', { timeout: 10_000 })
})

test('#1779 Try again while still full keeps the notice and says so', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  await editCode(page)
  await page.locator('[data-storage-full-retry]').click()
  await expect(page.locator('[data-storage-full-still]')).toBeVisible({ timeout: 10_000 })
})

test('#1779 Try again after freeing room clears the notice', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  await editCode(page)
  await notice(page).waitFor({ timeout: 10_000 })
  await freeStorage(page)
  await page.locator('[data-storage-full-retry]').click()
  await expect(notice(page)).toHaveCount(0, { timeout: 10_000 })
})

test('#1779 Export project downloads a zip even while storage is full', async ({ page }) => {
  await boot(page)
  await fillStorage(page)
  await editCode(page)
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.locator('[data-storage-full-export]').click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.zip$/)
})

test('#1779 a take the disk refused is kept and offered as a download', async ({ page }) => {
  await boot(page)
  await openLibrary(page)
  await fillStorage(page)
  const button = page.locator('[data-record-take]')
  await button.click()
  await expect(button).toHaveAttribute('data-recording', 'true', { timeout: 15_000 })
  await page.waitForTimeout(1500)
  await button.click()
  const link = page.locator('[data-record-kept-download]')
  await link.waitFor({ timeout: 20_000 })
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()])
  const file = await download.path()
  expect(fs.statSync(file).size).toBeGreaterThan(1000)
})
