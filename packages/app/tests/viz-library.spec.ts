/**
 * Asset Library — Viz preset provider (#832) + default-to-type coexistence.
 *
 * End-to-end proof that saved viz presets browse alongside Sounds in one panel:
 * the panel defaults to a type (not the mixed "All" union), the Viz filter lists
 * presets grouped by renderer, inserting one writes `.viz("name")` onto the
 * pattern under the cursor, and attempting it with the cursor off any pattern
 * guides the user instead of failing silently.
 *
 * Presets are seeded straight into IndexedDB (`stave-viz-presets`) — the same
 * store the app reads — with an `E2E ` name prefix so assertions don't depend on
 * the app's own bundled preset set (which shares the DB).
 */
import { test, expect, type Page } from '@playwright/test'

const VIZ_DB = 'stave-viz-presets'
const VIZ_STORE = 'presets'

type SeedPreset = { id: string; name: string; renderer: 'p5' | 'hydra' | 'glsl' }

const SEEDS: SeedPreset[] = [
  { id: 'e2e_aurora_p5', name: 'E2E Aurora', renderer: 'p5' },
  { id: 'e2e_kaleido_hydra', name: 'E2E Kaleido', renderer: 'hydra' },
]

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 30_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 30_000 },
  )
}

async function seedPresets(page: Page, presets: SeedPreset[]): Promise<void> {
  await page.evaluate(
    async ({ db, store, presets }) => {
      const open = () =>
        new Promise<IDBDatabase>((res, rej) => {
          const req = indexedDB.open(db, 1)
          req.onupgradeneeded = () => {
            const d = req.result
            if (!d.objectStoreNames.contains(store)) d.createObjectStore(store, { keyPath: 'id' })
          }
          req.onsuccess = () => res(req.result)
          req.onerror = () => rej(req.error)
        })
      const d = await open()
      for (const p of presets) {
        await new Promise<void>((res, rej) => {
          const r = d
            .transaction(store, 'readwrite')
            .objectStore(store)
            .put({ ...p, code: '// e2e', requires: [], createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000 })
          r.onsuccess = () => res()
          r.onerror = () => rej(r.error)
        })
      }
      d.close()
    },
    { db: VIZ_DB, store: VIZ_STORE, presets },
  )
}

async function setStrudelCode(page: Page, code: string, column: number): Promise<void> {
  const ok = await page.evaluate(
    ({ c, col }) => {
      const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
        getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void; getValue: () => string } | null
        focus: () => void
        setPosition: (p: { lineNumber: number; column: number }) => void
      }>
      const t = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
      if (!t) return false
      t.getModel()?.setValue(c)
      t.setPosition({ lineNumber: 1, column: col })
      t.focus()
      return true
    },
    { c: code, col: column },
  )
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; getValue: () => string } | null
    }>
    const t = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

async function openLibrary(page: Page) {
  await page.locator('[data-activity-bar] button[aria-label="Library"]').click()
  const panel = page.locator('[data-asset-library]')
  await panel.waitFor({ timeout: 10_000 })
  // Let the async preset refetch (on library open) + notify land.
  await page.waitForTimeout(500)
  return panel
}

/** Select the Viz type, then narrow to a single seeded preset via search so the
 *  windowed list renders exactly that row (no scroll-into-window needed). */
async function showVizPreset(page: Page, panel: ReturnType<Page['locator']>, name: string) {
  await panel.locator('[data-filter="asset-type-filter"] button[data-chip="viz"]').click()
  await panel.locator('[data-asset-search]').fill(name)
  await page.waitForTimeout(150)
}

test.describe('Asset Library — Viz presets (#832)', () => {
  test('defaults to Sounds (not All) and shows the Viz filter chip', async ({ page }) => {
    await boot(page)
    const panel = await openLibrary(page)
    const typeRow = panel.locator('[data-filter="asset-type-filter"]')
    // Default-to-type: lands on the first type (Sounds), not the "All" union.
    await expect(typeRow.locator('button[data-chip="sound"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(typeRow.locator('button[data-chip="all"]')).toHaveAttribute('aria-pressed', 'false')
    // Viz is a first-class type — its chip is present.
    await expect(typeRow.locator('button[data-chip="viz"]')).toBeVisible()
  })

  test('lists seeded viz presets grouped by renderer under the Viz filter', async ({ page }) => {
    await boot(page)
    await seedPresets(page, SEEDS)
    const panel = await openLibrary(page)
    await panel.locator('[data-filter="asset-type-filter"] button[data-chip="viz"]').click()

    // Narrow to each seed and assert its row + renderer group.
    await panel.locator('[data-asset-search]').fill('E2E Aurora')
    const aurora = panel.locator('[data-asset-row="viz:e2e_aurora_p5"]')
    await expect(aurora).toBeVisible()
    await expect(aurora).toContainText('E2E Aurora')
    await expect(aurora).toContainText('P5')

    await panel.locator('[data-asset-search]').fill('E2E Kaleido')
    const kaleido = panel.locator('[data-asset-row="viz:e2e_kaleido_hydra"]')
    await expect(kaleido).toBeVisible()
    await expect(kaleido).toContainText('Hydra')
  })

  test('inserting a viz preset writes .viz("name") on the pattern under the cursor', async ({ page }) => {
    await boot(page)
    await seedPresets(page, SEEDS)
    await setStrudelCode(page, 'note("c4 e4 g4")', 8)
    const panel = await openLibrary(page)
    await showVizPreset(page, panel, 'E2E Aurora')

    const row = panel.locator('[data-asset-row="viz:e2e_aurora_p5"]')
    await row.hover()
    await row.locator('[data-asset-insert]').click()
    await page.waitForTimeout(200)

    expect(await strudelValue(page)).toBe('note("c4 e4 g4").viz("E2E Aurora")')
  })

  test('guides the user when the cursor is not on a pattern (no silent no-op)', async ({ page }) => {
    await boot(page)
    await seedPresets(page, SEEDS)
    // Cursor on a comment line — no pattern chunk to attach to.
    await setStrudelCode(page, '// scratch', 3)
    const panel = await openLibrary(page)
    await showVizPreset(page, panel, 'E2E Aurora')

    const row = panel.locator('[data-asset-row="viz:e2e_aurora_p5"]')
    await row.hover()
    await row.locator('[data-asset-insert]').click()

    // A guiding toast appears, and the document is untouched.
    await expect(page.getByText('Place the cursor on a pattern to attach this viz.')).toBeVisible()
    expect(await strudelValue(page)).toBe('// scratch')
  })
})
