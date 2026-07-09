/**
 * Asset Library — Viz library (#834): curated viz *packages* you ADD to the
 * workspace.
 *
 * End-to-end proof that the Viz filter lists a small curated shelf of
 * non-default viz (Prism + Pulse Grid), and that a row's `+` = "Add to
 * workspace" materialises the package under `viz_lib/<Name>/` — a `.glsl` file
 * that registers as a named viz — idempotently.
 *
 * Nothing is seeded into IndexedDB: the library is a static in-app corpus, so
 * the Viz rows are present on boot. Registration/materialisation is observed
 * via the `__staveOverrideVizFile` hook (finds a viz-language workspace file by
 * basename — the exact predicate the named-viz bridge uses) and the file tree.
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  // Enable the `__stave*` E2E hooks (e.g. `__staveOverrideVizFile`) — they are
  // gated on this flag and must be set before the app mounts.
  await page.addInitScript(() => {
    ;(window as unknown as { __STAVE_E2E__?: boolean }).__STAVE_E2E__ = true
  })
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

async function openLibrary(page: Page) {
  await page.locator('[data-activity-bar] button[aria-label="Library"]').click()
  const panel = page.locator('[data-asset-library]')
  await panel.waitFor({ timeout: 10_000 })
  await page.waitForTimeout(200)
  return panel
}

async function showVizType(page: Page, panel: ReturnType<Page['locator']>) {
  await panel.locator('[data-filter="asset-type-filter"] button[data-chip="viz"]').click()
  await page.waitForTimeout(100)
}

/** Whether a viz-language workspace file with the given basename exists (the
 *  same predicate the named-viz bridge registers on). Returns the file id. */
async function vizFileId(page: Page, basename: string): Promise<string | null> {
  return page.evaluate(
    (name) =>
      (window as unknown as {
        __staveOverrideVizFile?: (b: string, c: string) => string | null
      }).__staveOverrideVizFile?.(name, `// probe ${Date.now()}`) ?? null,
    basename,
  )
}

test.describe('Asset Library — Viz library (#834)', () => {
  test('lists the curated viz packages (Prism + Pulse Grid) grouped under GLSL', async ({ page }) => {
    await boot(page)
    const panel = await openLibrary(page)

    // Viz is a first-class type — its chip is present without any seeding.
    const typeRow = panel.locator('[data-filter="asset-type-filter"]')
    await expect(typeRow.locator('button[data-chip="viz"]')).toBeVisible()
    await showVizType(page, panel)

    const prism = panel.locator('[data-asset-row="viz:prism"]')
    await expect(prism).toBeVisible()
    await expect(prism).toContainText('Prism')
    await expect(prism).toContainText('GLSL')

    const pulse = panel.locator('[data-asset-row="viz:pulse-grid"]')
    await expect(pulse).toBeVisible()
    await expect(pulse).toContainText('Pulse Grid')
  })

  test('each viz row shows a baked thumbnail (#836)', async ({ page }) => {
    await boot(page)
    const panel = await openLibrary(page)
    await showVizType(page, panel)

    // Every curated package renders a leading thumbnail whose src is a baked PNG
    // data-URI (not the SVG placeholder fallback, not an empty box).
    for (const id of ['prism', 'pulse-grid']) {
      const thumb = panel.locator(`img[data-asset-thumb="viz:${id}"]`)
      await expect(thumb, `${id} thumbnail is present`).toBeVisible()
      await expect(thumb).toHaveAttribute('src', /^data:image\/png/)
    }

    // The cards flow in a grid — the two sit side by side (same row top), not
    // stacked in a single column.
    const prismBox = await panel.locator('[data-asset-row="viz:prism"]').boundingBox()
    const pulseBox = await panel.locator('[data-asset-row="viz:pulse-grid"]').boundingBox()
    expect(prismBox && pulseBox).toBeTruthy()
    expect(Math.abs(prismBox!.y - pulseBox!.y)).toBeLessThan(8) // same row
    expect(pulseBox!.x).toBeGreaterThan(prismBox!.x + prismBox!.width - 8) // to the right

    // Visual observation of the whole shelf with thumbnails.
    await panel.screenshot({ path: 'test-results/viz-library-thumbs.png' })
  })

  test('the row action is "Add to workspace", not "Insert"', async ({ page }) => {
    await boot(page)
    const panel = await openLibrary(page)
    await showVizType(page, panel)
    const prism = panel.locator('[data-asset-row="viz:prism"]')
    await prism.hover()
    await expect(prism.locator('[data-asset-insert]')).toHaveAttribute('aria-label', /Add to workspace/)
  })

  test('adding Prism materialises viz_lib/Prism/Prism.glsl and registers it', async ({ page }) => {
    await boot(page)
    // Not present before the add.
    expect(await vizFileId(page, 'Prism')).toBeNull()

    const panel = await openLibrary(page)
    await showVizType(page, panel)
    const prism = panel.locator('[data-asset-row="viz:prism"]')
    await prism.hover()
    await prism.locator('[data-asset-insert]').click()

    // Guiding toast names the destination + how to use it.
    await expect(page.getByText('Added Prism → viz_lib/Prism/. Use .viz("Prism").')).toBeVisible()

    // The file now exists in the workspace as a viz-language file named "Prism"
    // (the predicate the named-viz bridge registers on, so `.viz("Prism")`
    // resolves). Its exact path (`viz_lib/Prism/Prism.glsl`) is proven by the
    // `planVizLibFiles` unit test + the toast above.
    expect(await vizFileId(page, 'Prism')).not.toBeNull()

    // The added file auto-opens as the active editor tab (desired UX — the user
    // lands on the shader they just added).
    await expect(
      page.locator('[data-workspace-tab][data-tab-active="true"]'),
    ).toContainText('Prism.glsl')

    // The add (which churns the provider list via `notifyAssetProvidersChanged`)
    // must NOT bounce the Type filter off Viz — the row stays put.
    await expect(panel.locator('[data-filter="asset-type-filter"] button[data-chip="viz"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(prism).toBeVisible()
  })

  test('adding Pulse Grid (a name with a space) materialises + is recognised', async ({ page }) => {
    await boot(page)
    expect(await vizFileId(page, 'Pulse Grid')).toBeNull()

    const panel = await openLibrary(page)
    await showVizType(page, panel)
    const pulse = panel.locator('[data-asset-row="viz:pulse-grid"]')
    await pulse.hover()
    await pulse.locator('[data-asset-insert]').click()

    await expect(
      page.getByText('Added Pulse Grid → viz_lib/Pulse Grid/. Use .viz("Pulse Grid").'),
    ).toBeVisible()
    // The spaced folder/file path resolves as a viz-language file named
    // "Pulse Grid" (so `.viz("Pulse Grid")` registers) — the one thing that
    // could differ from Prism.
    expect(await vizFileId(page, 'Pulse Grid')).not.toBeNull()
  })

  test('adding the same package twice is idempotent (no duplicate)', async ({ page }) => {
    await boot(page)
    const panel = await openLibrary(page)
    await showVizType(page, panel)
    const prism = panel.locator('[data-asset-row="viz:prism"]')

    await prism.hover()
    await prism.locator('[data-asset-insert]').click()
    await expect(page.getByText('Added Prism → viz_lib/Prism/. Use .viz("Prism").')).toBeVisible()

    // Second add — the stable workspace id means it's already there.
    await prism.hover()
    await prism.locator('[data-asset-insert]').click()
    await expect(page.getByText('Prism is already in your workspace.')).toBeVisible()
  })
})
