import { test as base, expect, firefox, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { waitForEditorLoaded } from './_appBoot'

/**
 * #1792 (part of #1780): in Firefox, a full disk refuses deletes too.
 *
 * Firefox 148 refuses EVERY read-write transaction once the origin is at its
 * limit: a row delete, a `clear()`, a delete in another database. The one
 * removal it still allows is `indexedDB.deleteDatabase`. Chromium commits
 * deletes even over quota, so only Firefox can show this, and this spec
 * launches it itself from inside the gate's Chromium project.
 *
 * The limit is Firefox's own (`dom.quotaManager.temporaryStorage.fixedLimit`,
 * in KB), filled with rows until Firefox refuses one.
 *
 * ONE assertion per test: a second `expect` never runs once the first fails.
 */

const LIMIT_KB = 10_240

const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({}, use, info) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stave-ff-full-'))
    const ctx = await firefox.launchPersistentContext(dir, {
      headless: true,
      baseURL: info.project.use.baseURL,
      firefoxUserPrefs: {
        'dom.quotaManager.temporaryStorage.fixedLimit': LIMIT_KB,
        'media.autoplay.default': 0,
        'media.autoplay.block-webaudio': false,
      },
    })
    await use(ctx)
    await ctx.close()
    fs.rmSync(dir, { recursive: true, force: true })
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()))
  },
})

test.skip(() => !fs.existsSync(firefox.executablePath()), 'Firefox is not installed for Playwright')

type CollectResult =
  | { kind: 'freed'; bytes: number; count: number }
  | { kind: 'nothing-unused' }
  | { kind: 'refused'; bytes: number; count: number }
  | { kind: 'could-not-check'; reason: string }

interface Probe {
  reset(): Promise<void>
  put(base64: string, mime: string): Promise<{ hash: string }>
  list(): Promise<Array<{ hash: string }>>
  import(base64: string, mime: string, filename: string, existing: unknown[]): Promise<{ record: { blobHash: string } }>
  docList(): Promise<unknown[]>
  docAdd(record: unknown): Promise<void>
  collect(): Promise<CollectResult>
}
type ProbeWindow = { __staveAssetProbe?: Probe }

const noise = (bytes: number) =>
  Buffer.from(new Uint8Array(bytes).map(() => Math.floor(Math.random() * 256))).toString('base64')

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(window as unknown as { __STAVE_E2E__?: boolean }).__STAVE_E2E__ = true
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitForEditorLoaded(page)
  await page.waitForFunction(() => Boolean((window as unknown as ProbeWindow).__staveAssetProbe), { timeout: 30_000 })
  await page.evaluate(() => (window as unknown as ProbeWindow).__staveAssetProbe!.reset())
}

/**
 * Fill the rest of the limit until Firefox refuses a row. Resolves true only
 * when a row WAS refused: the origin is then at its limit, which is the
 * precondition every arm needs (a fill that ran out of rows proves nothing).
 */
async function fillToLimit(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const q = indexedDB.open('stave-e2e-filler', 1)
      q.onupgradeneeded = () => q.result.createObjectStore('rows')
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    let refused = false
    for (let n = 0; n < 5000 && !refused; n++) {
      const tx = db.transaction('rows', 'readwrite')
      tx.objectStore('rows').put(new Blob([new Uint8Array(16_000)]), n)
      refused = await new Promise<boolean>((res) => {
        tx.oncomplete = () => res(false)
        tx.onabort = () => res(tx.error?.name === 'QuotaExceededError')
      })
    }
    db.close()
    return refused
  })
}

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

test.describe('#1792 — Firefox at its storage limit', () => {
  test('deleting a project still works, and frees its database', async ({ page }) => {
    const failures: string[] = []
    page.on('pageerror', (e) => failures.push(e.message))
    await boot(page)
    const first = await page.evaluate(async () =>
      (await indexedDB.databases()).map((d) => d.name ?? '').find((n) => /^stave-[0-9a-f]{8}-/.test(n)),
    )
    await createProject(page, 'Second')
    const full = await fillToLimit(page)
    const ran = page.waitForEvent('console', {
      predicate: (m) => m.text().startsWith('[stave] after deleting a project:'),
      timeout: 20_000,
    })
    await page.getByText('File', { exact: true }).first().click()
    await page.getByText('Open Project...', { exact: true }).click()
    await page.locator('button[title="Delete"]').click()
    await page.getByRole('button', { name: 'Delete' }).last().click()
    await ran.catch(() => null)
    const gone = !(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ''))).includes(first!)
    expect({ full, gone, failures }).toEqual({ full: true, gone: true, failures: [] })
  })

  test('after a project delete, its sound is freed too', async ({ page }) => {
    await boot(page)
    const record = await page.evaluate(async (b64) => {
      const p = (window as unknown as ProbeWindow).__staveAssetProbe!
      const r = await p.import(b64, 'audio/wav', 'big.wav', await p.docList())
      await p.docAdd(r.record)
      return r.record
    }, noise(1_500_000))
    // y-indexeddb writes the record without anyone awaiting it.
    await page.waitForTimeout(1000)
    await createProject(page, 'Second')
    const full = await fillToLimit(page)
    const ran = page.waitForEvent('console', {
      predicate: (m) => m.text().startsWith('[stave] after deleting a project:'),
      timeout: 20_000,
    })
    await page.getByText('File', { exact: true }).first().click()
    await page.getByText('Open Project...', { exact: true }).click()
    await page.locator('button[title="Delete"]').click()
    await page.getByRole('button', { name: 'Delete' }).last().click()
    const said = (await ran).text()
    const kept = await page.evaluate(
      async (h) => (await (window as unknown as ProbeWindow).__staveAssetProbe!.list()).some((b) => b.hash === h),
      record.blobHash,
    )
    expect({ full, freed: /freed \d+ bytes/.test(said), kept }).toEqual({ full: true, freed: true, kept: false })
  })

  test('a collection the browser refuses says "refused", and does not throw', async ({ page }) => {
    await boot(page)
    const { hash } = await page.evaluate(
      (b64) => (window as unknown as ProbeWindow).__staveAssetProbe!.put(b64, 'audio/wav'),
      noise(1_500_000),
    )
    const full = await fillToLimit(page)
    const outcome = await page.evaluate(async (h) => {
      const p = (window as unknown as ProbeWindow).__staveAssetProbe!
      let result: unknown
      try {
        result = await p.collect()
      } catch (err) {
        result = `threw ${(err as Error).name}`
      }
      return { result, kept: (await p.list()).some((b) => b.hash === h) }
    }, hash)
    expect({ full, ...outcome }).toEqual({
      full: true,
      result: { kind: 'refused', bytes: 0, count: 0 },
      kept: true,
    })
  })
})
