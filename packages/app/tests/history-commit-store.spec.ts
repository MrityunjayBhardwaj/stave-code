import { test, expect, type Page } from '@playwright/test'

// Phase F (#196) observation — the project commit store wired into the app.
// Two load-bearing observations:
//   1. On first load the shared `stave-snapshots` DB upgrades to v2 WITHOUT an
//      IDB VersionError (snapshotStore + historyStore both bumped), and
//      `initHistory` seeds commit c0 from the live workspace (non-empty files).
//   2. A significant workspace edit, after the idle debounce, produces a new
//      auto-commit in the history store holding the changed file.

const SNAP_DB = 'stave-snapshots'
const HISTORY_STORE = 'history'
const VIZ_DB = 'stave-viz-presets'

interface CommitRow {
  id: string
  parent: string | null
  kind: string
  files: Record<string, string>
}
interface HistoryRow {
  projectId: string
  commits: Record<string, CommitRow>
  branches: Record<string, { head: string }>
  currentBranch: string
}

async function wipeAllAppDbs(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    async ({ vizDb, snapDb }) => {
      try {
        const keys: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && k.startsWith('stave:')) keys.push(k)
        }
        for (const k of keys) localStorage.removeItem(k)
      } catch {
        /* private mode */
      }
      for (const db of [vizDb, snapDb]) {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(db)
          req.onsuccess = () => resolve()
          req.onerror = () => resolve()
          req.onblocked = () => resolve()
        })
      }
    },
    { vizDb: VIZ_DB, snapDb: SNAP_DB },
  )
}

async function readHistory(page: Page): Promise<HistoryRow | undefined> {
  return page.evaluate(
    ({ db, store }) =>
      new Promise<HistoryRow | undefined>((resolve) => {
        const req = indexedDB.open(db)
        req.onsuccess = () => {
          const d = req.result
          if (!d.objectStoreNames.contains(store)) {
            d.close()
            resolve(undefined)
            return
          }
          const t = d.transaction(store, 'readonly').objectStore(store).getAll()
          t.onsuccess = () => {
            d.close()
            resolve((t.result as HistoryRow[])[0])
          }
          t.onerror = () => {
            d.close()
            resolve(undefined)
          }
        }
        req.onerror = () => resolve(undefined)
      }),
    { db: SNAP_DB, store: HISTORY_STORE },
  )
}

async function editPianoRoll(page: Page, block: string): Promise<void> {
  await page.evaluate(async (m) => {
    const w = window as unknown as {
      monaco?: { editor?: { getModels?: () => Array<{ getValue: () => string; setValue: (s: string) => void }> } }
    }
    const deadline = Date.now() + 5000
    while ((!w.monaco?.editor?.getModels || w.monaco.editor.getModels().length === 0) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100))
    }
    const models = w.monaco?.editor?.getModels?.() ?? []
    const target = models.find((x) => x.getValue().includes('Stave p5 viz — Piano Roll'))
    if (!target) throw new Error('Piano Roll model not loaded')
    target.setValue(m + '\n' + target.getValue())
  }, block)
}

test.beforeEach(async ({ page }) => {
  await wipeAllAppDbs(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(2000)
})

test('seeds commit c0 from the live workspace, no IDB version error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  const h = await readHistory(page)
  expect(h, 'history row should exist after init').toBeDefined()
  const head = h!.branches[h!.currentBranch].head
  const c0 = h!.commits[head]
  expect(c0.kind).toBe('seed')
  expect(c0.parent).toBeNull()
  // c0 must capture the seeded workspace — at least one file with content.
  expect(Object.keys(c0.files).length).toBeGreaterThan(0)

  const idbErrors = errors.filter(
    (e) => /version|indexeddb|history|objectstore/i.test(e),
  )
  expect(idbErrors, `unexpected IDB/history errors: ${idbErrors.join('; ')}`).toEqual([])
})

test('a significant edit produces an auto-commit holding the changed file', async ({ page }) => {
  // open Piano Roll.p5 so Monaco loads its model
  await page
    .locator('[data-file-tree-item]')
    .filter({ hasText: 'Piano Roll.p5' })
    .first()
    .dblclick()
  await page.waitForTimeout(800)

  const before = await readHistory(page)
  const beforeCount = before ? Object.keys(before.commits).length : 0

  // a clearly-significant edit (≥5 lines) so the idle path commits
  const MARKER = '// PHASE-F-OBS'
  await editPianoRoll(page, [MARKER, '// l2', '// l3', '// l4', '// l5', '// l6'].join('\n'))

  // idle driver default is 5s; wait past it
  await page.waitForTimeout(6500)

  const after = await readHistory(page)
  expect(after).toBeDefined()
  const afterCount = Object.keys(after!.commits).length
  expect(afterCount, 'a new commit should have been created on idle').toBeGreaterThan(beforeCount)

  // the newest commit's files should include the marker we typed
  const head = after!.branches[after!.currentBranch].head
  const latest = after!.commits[head]
  const hasMarker = Object.values(latest.files).some((c) => c.includes(MARKER))
  expect(hasMarker, 'latest commit should hold the edited content').toBe(true)
})
