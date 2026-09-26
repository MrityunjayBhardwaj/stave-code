import { expect, test, type Page } from '@playwright/test'

import { bootApp } from './_appBoot'

/**
 * #1784 (part of #1780): deleting a project deletes everything it left on disk.
 *
 * Before the fix a deleted project's registry row and document went, and its
 * history row in `stave-snapshots` stayed: nothing could open it again and it
 * still counted toward the quota (measured on main: ~31.8 KB for a project a
 * few seconds old).
 *
 * The project is deleted through the real gesture, File ▸ Open Project ▸ 🗑,
 * the only way the app deletes one. The history row is the app's own (the
 * boot seeds one per project). The older snapshot store has no writer left in
 * the app, so its row is planted the way a profile from before the commit
 * store holds it.
 *
 * ONE assertion per test: a second `expect` never runs once the first fails.
 */

const HISTORY_DB = 'stave-snapshots'

/** The open project's id, from its y-indexeddb database name. */
async function openProjectId(page: Page): Promise<string> {
  const id = await page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((d) => d.name ?? '')
    const doc = names.filter((n) => /^stave-[0-9a-f]{8}-[0-9a-f]{4}-/.test(n))
    return doc.length === 1 ? doc[0]!.slice('stave-'.length) : null
  })
  if (!id) throw new Error('expected exactly one project document database at boot')
  return id
}

/** Rows in one store of the history database that belong to a project. */
async function rowsFor(page: Page, store: 'history' | 'snapshots', projectId: string): Promise<number> {
  return page.evaluate(
    async ([dbName, storeName, id]) => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const q = indexedDB.open(dbName)
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      try {
        const rows: Array<{ projectId?: string }> = await new Promise((res, rej) => {
          const r = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
          r.onsuccess = () => res(r.result)
          r.onerror = () => rej(r.error)
        })
        return rows.filter((row) => row.projectId === id).length
      } finally {
        db.close()
      }
    },
    [HISTORY_DB, store, projectId] as const,
  )
}

/** Wait until the boot's history seed for this project is on disk. */
async function waitForHistoryRow(page: Page, projectId: string): Promise<void> {
  await expect.poll(() => rowsFor(page, 'history', projectId), { timeout: 15_000 }).toBe(1)
}

/** A snapshot row as the older store wrote them (`saveSnapshot`). */
async function plantLegacySnapshot(page: Page, projectId: string): Promise<void> {
  await page.evaluate(
    async ([dbName, id]) => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const q = indexedDB.open(dbName)
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      await new Promise<void>((res, rej) => {
        const tx = db.transaction('snapshots', 'readwrite')
        tx.objectStore('snapshots').put({
          id: crypto.randomUUID(),
          projectId: id,
          label: 'Before the bridge',
          createdAt: Date.now(),
          kind: 'manual',
          bytes: new Uint8Array(4096),
        })
        tx.oncomplete = () => res()
        tx.onabort = () => rej(tx.error)
      })
      db.close()
    },
    [HISTORY_DB, projectId] as const,
  )
}

/** File ▸ New Project…, named, and wait until it is the open project. */
async function createProject(page: Page, name: string): Promise<string> {
  const before = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ''))
  await page.getByText('File', { exact: true }).first().click()
  await page.getByText('New Project...', { exact: true }).click()
  await page.getByPlaceholder('Untitled').fill(name)
  await page.getByPlaceholder('Untitled').press('Enter')
  // Polled from the test side: `waitForFunction` with an async predicate takes
  // the returned Promise itself as truthy and resolves at once.
  let added: string | undefined
  await expect
    .poll(
      async () => {
        const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ''))
        added = names.find((n) => /^stave-[0-9a-f]{8}-/.test(n) && !before.includes(n))
        return added
      },
      { timeout: 15_000 },
    )
    .toBeTruthy()
  return added!.slice('stave-'.length)
}

/** File ▸ Open Project… ▸ 🗑 on the (only) other project ▸ Delete. */
async function deleteOtherProject(page: Page, id: string): Promise<void> {
  await page.getByText('File', { exact: true }).first().click()
  await page.getByText('Open Project...', { exact: true }).click()
  await page.locator('button[title="Delete"]').click()
  await page.getByRole('button', { name: 'Delete' }).last().click()
  await expect
    .poll(
      () =>
        page.evaluate(
          async (doc: string) => (await indexedDB.databases()).some((d) => d.name === doc),
          `stave-${id}`,
        ),
      { timeout: 15_000 },
    )
    .toBe(false)
}

/**
 * A deleted project, and the one left open. The history row of each exists
 * before the delete: the absence asserted afterwards is then the delete's
 * doing, not a seed that never landed.
 */
async function deleteFirstProject(
  page: Page,
  plant?: (page: Page, id: string) => Promise<void>,
): Promise<{ deleted: string; kept: string }> {
  await bootApp(page)
  const deleted = await openProjectId(page)
  await waitForHistoryRow(page, deleted)
  if (plant) await plant(page, deleted)
  const kept = await createProject(page, 'Second')
  await waitForHistoryRow(page, kept)
  await deleteOtherProject(page, deleted)
  return { deleted, kept }
}

test.describe('#1784 — deleting a project deletes its history', () => {
  test('the deleted project has no history row left', async ({ page }) => {
    const { deleted } = await deleteFirstProject(page)
    expect(await rowsFor(page, 'history', deleted)).toBe(0)
  })

  test('the deleted project has no snapshots left', async ({ page }) => {
    const { deleted } = await deleteFirstProject(page, plantLegacySnapshot)
    expect(await rowsFor(page, 'snapshots', deleted)).toBe(0)
  })

  test('the project still open keeps its history', async ({ page }) => {
    const { kept } = await deleteFirstProject(page)
    expect(await rowsFor(page, 'history', kept)).toBe(1)
  })
})
