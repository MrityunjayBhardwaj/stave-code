import { test, expect, type Page } from '@playwright/test'

// #341 — the left-panel width is ONE concern, owned in one place
// (ResizableSidebar), so resize/collapse behave identically regardless of
// which activity-bar tab is active. Before the fix only Explorer was
// resizable and every other tab hardcoded its own width (240 / 360).

async function wipe(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
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
  })
}

const sidebar = (page: Page) => page.locator('[data-resizable-sidebar]')

async function sidebarWidth(page: Page): Promise<number> {
  const box = await sidebar(page).boundingBox()
  if (!box) throw new Error('sidebar not visible')
  return Math.round(box.width)
}

async function selectTab(page: Page, name: string): Promise<void> {
  await page.locator('[data-activity-bar]').getByRole('button', { name, exact: true }).click()
  await page.waitForTimeout(150)
}

test.beforeEach(async ({ page }) => {
  await wipe(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1500)
})

test('left-panel width is identical across every tab', async ({ page }) => {
  // Explorer is the default panel. Resize it by dragging the handle right.
  const handle = page.getByLabel('Resize sidebar')
  await expect(handle).toBeVisible()

  const start = await handle.boundingBox()
  if (!start) throw new Error('resize handle not visible')
  // Drag the edge to an absolute x of 360 (well clear of the 240 default and
  // the old hardcoded values) so the assertion can't pass by coincidence.
  await page.mouse.move(start.x + 2, start.y + 50)
  await page.mouse.down()
  await page.mouse.move(360, start.y + 50, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(150)

  const explorerWidth = await sidebarWidth(page)
  expect(explorerWidth).toBeGreaterThan(300) // actually moved

  // Every other tab must report the SAME width — width is tab-invariant.
  for (const tab of ['Search', 'Version History', 'Outline', 'Console', 'IR Inspector']) {
    await selectTab(page, tab)
    const w = await sidebarWidth(page)
    expect(Math.abs(w - explorerWidth), `${tab} width should match Explorer`).toBeLessThanOrEqual(2)
  }

  // Back to Explorer — still the same.
  await selectTab(page, 'Explorer')
  expect(Math.abs((await sidebarWidth(page)) - explorerWidth)).toBeLessThanOrEqual(2)
})

test('resize handle is present and works on a non-Explorer tab', async ({ page }) => {
  // Switch to Search first, THEN resize — proving the handle is no longer
  // Explorer-only.
  await selectTab(page, 'Search')
  const handle = page.getByLabel('Resize sidebar')
  await expect(handle).toBeVisible()

  const before = await sidebarWidth(page)
  const start = await handle.boundingBox()
  if (!start) throw new Error('resize handle not visible')
  await page.mouse.move(start.x + 2, start.y + 50)
  await page.mouse.down()
  await page.mouse.move(start.x + 120, start.y + 50, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(150)

  const after = await sidebarWidth(page)
  expect(after).toBeGreaterThan(before + 50)

  // The new width persists when switching to another tab.
  await selectTab(page, 'Explorer')
  expect(Math.abs((await sidebarWidth(page)) - after)).toBeLessThanOrEqual(2)
})
