/**
 * Bottom drawer infrastructure — Phase 20-01 PR-A T-10.
 *
 * Asserts the BottomPanel surface mounted by WorkspaceShell:
 *   1. Drawer renders with one Timeline tab.
 *   2. Default state is closed; toggle opens; body shows the placeholder.
 *   3. Open + height + activeTabId persist across reload (Trap 7 — assert
 *      on `domcontentloaded`, not `load`, to catch first-paint flicker).
 *   4. Drag handle clamps to [80, 600] (Trap 6).
 *   5. Single-tab keyboard nav is a stable no-op.
 *   6. Closed-state pixel cost is exactly 29px (Trap 2 proxy — combined
 *      with the unit test that empty-registry returns null this covers
 *      "no editor-grid theft for users who haven't interacted").
 *   7. Vocabulary regression — drawer DOM contains none of the
 *      forbidden IR-jargon nouns (Trap 1).
 */

import { test, expect, type Page } from '@playwright/test'

const STORAGE_KEYS = {
  height: 'stave:bottomPanel.height',
  open: 'stave:bottomPanel.open',
  activeTabId: 'stave:bottomPanel.activeTabId',
} as const

const FORBIDDEN_NOUN_SOURCES = [
  'snapshot',
  'publishirsnapshot',
  'irevent',
  'publishir',
  'capturesnapshot',
] as const
const FORBIDDEN_NOUNS = new RegExp(FORBIDDEN_NOUN_SOURCES.join('|'), 'i')

async function clearDrawerStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('stave:bottomPanel.height')
      window.localStorage.removeItem('stave:bottomPanel.open')
      window.localStorage.removeItem('stave:bottomPanel.activeTabId')
    } catch {
      /* ignore */
    }
  })
}

async function bootShell(page: Page): Promise<void> {
  await page.goto('/')
  await page
    .locator('[data-bottom-panel="root"]')
    .waitFor({ timeout: 15_000 })
}

test.describe('Bottom drawer — infra (Phase 20-01 PR-A)', () => {
  test('drawer renders with the seeded Timeline tab', async ({ page }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const drawer = page.locator('[data-bottom-panel="root"]')
    await expect(drawer).toBeVisible()
    const tab = drawer.locator('role=tab[name="Timeline"]')
    await expect(tab).toHaveCount(1)
  })

  test('default state is closed; toggling opens and reveals the Timeline body', async ({
    page,
  }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const drawer = page.locator('[data-bottom-panel="root"]')
    // closed: no body
    await expect(drawer.locator('[data-bottom-panel="body"]')).toHaveCount(0)
    // open
    await drawer.locator('[data-bottom-panel="toggle"]').click()
    await expect(drawer.locator('[data-bottom-panel="body"]')).toHaveCount(1)
    // Body now hosts the real MusicalTimeline content (PR-B replaced
    // PR-A's "(empty — wired in PR-B)" placeholder via the registry's
    // idempotent re-register in StaveApp). Assert the Timeline subtree
    // is mounted; specific copy is asserted in
    // tests/musical-timeline.spec.ts.
    await expect(
      drawer.locator('[data-bottom-panel-tab="musical-timeline"]'),
    ).toHaveCount(1)
  })

  test('persisted open + height survive reload at first paint (Trap 7)', async ({
    page,
  }) => {
    // Pre-set localStorage BEFORE first navigation so the FIRST paint
    // hydrates from these values. addInitScript runs before page scripts.
    await page.addInitScript(
      ([heightKey, openKey, activeKey]: readonly string[]) => {
        try {
          window.localStorage.setItem(heightKey, '320')
          window.localStorage.setItem(openKey, 'true')
          window.localStorage.setItem(activeKey, 'musical-timeline')
        } catch {
          /* ignore */
        }
      },
      [STORAGE_KEYS.height, STORAGE_KEYS.open, STORAGE_KEYS.activeTabId],
    )
    // Navigate and wait for domcontentloaded — earlier than 'load' so a
    // post-effect resize would be visible as a regression.
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const drawer = page.locator('[data-bottom-panel="root"]')
    await drawer.waitFor({ timeout: 15_000 })
    // Body present immediately (open=true persisted).
    await expect(drawer.locator('[data-bottom-panel="body"]')).toHaveCount(1)
    // flexBasis is 320px from the persisted height.
    const flexBasis = await drawer.evaluate(
      (el) => (el as HTMLElement).style.flexBasis,
    )
    expect(flexBasis).toBe('320px')
  })

  test('closed-state height is exactly 29px (Trap 2 budget)', async ({
    page,
  }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const drawer = page.locator('[data-bottom-panel="root"]')
    const flexBasis = await drawer.evaluate(
      (el) => (el as HTMLElement).style.flexBasis,
    )
    expect(flexBasis).toBe('29px')
  })

  test('drag handle clamps below MIN to 80px (Trap 6)', async ({ page }) => {
    await page.addInitScript(
      ([heightKey, openKey]: readonly string[]) => {
        window.localStorage.setItem(heightKey, '240')
        window.localStorage.setItem(openKey, 'true')
      },
      [STORAGE_KEYS.height, STORAGE_KEYS.open],
    )
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const drawer = page.locator('[data-bottom-panel="root"]')
    await drawer.waitFor({ timeout: 15_000 })
    const handle = drawer.locator('[data-bottom-panel="resize-handle"]')
    await expect(handle).toHaveCount(1)
    const handleBox = await handle.boundingBox()
    expect(handleBox).not.toBeNull()
    if (!handleBox) throw new Error('handleBox null')
    const startX = handleBox.x + handleBox.width / 2
    const startY = handleBox.y + handleBox.height / 2
    // Drag DOWN by 1000px — should clamp drawer height to MIN (80).
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX, startY + 1000, { steps: 10 })
    await page.mouse.up()
    // height committed on pointerup -> read flexBasis or persisted value
    await page.waitForTimeout(50)
    const stored = await page.evaluate(
      (k) => window.localStorage.getItem(k),
      STORAGE_KEYS.height,
    )
    expect(Number(stored)).toBe(80)
  })

  test('drag handle clamps above MAX to 600px (Trap 6)', async ({ page }) => {
    await page.addInitScript(
      ([heightKey, openKey]: readonly string[]) => {
        window.localStorage.setItem(heightKey, '500')
        window.localStorage.setItem(openKey, 'true')
      },
      [STORAGE_KEYS.height, STORAGE_KEYS.open],
    )
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const drawer = page.locator('[data-bottom-panel="root"]')
    await drawer.waitFor({ timeout: 15_000 })
    const handle = drawer.locator('[data-bottom-panel="resize-handle"]')
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('handleBox null')
    const startX = handleBox.x + handleBox.width / 2
    const startY = handleBox.y + handleBox.height / 2
    // Drag UP by 2000px — should clamp drawer height to MAX (600).
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX, startY - 2000, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(50)
    const stored = await page.evaluate(
      (k) => window.localStorage.getItem(k),
      STORAGE_KEYS.height,
    )
    expect(Number(stored)).toBe(600)
  })

  test('single-tab keyboard nav is a stable no-op', async ({ page }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const tablist = page.locator('[role="tablist"][aria-label="Bottom panel tabs"]')
    await expect(tablist).toHaveCount(1)
    const tab = tablist.locator('role=tab[name="Timeline"]')
    await tab.focus()
    // Press ArrowRight; with a single tab this is a no-op (still selected).
    await page.keyboard.press('ArrowRight')
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(tab).toHaveAttribute('aria-selected', 'true')
  })

  test('vocabulary regression — drawer DOM contains no IR-jargon (Trap 1)', async ({
    page,
  }) => {
    await clearDrawerStorage(page)
    await bootShell(page)
    const drawer = page.locator('[data-bottom-panel="root"]')
    // Closed
    {
      const text = (await drawer.textContent()) ?? ''
      expect(text.toLowerCase()).not.toMatch(FORBIDDEN_NOUNS)
    }
    // Open
    await drawer.locator('[data-bottom-panel="toggle"]').click()
    {
      const text = (await drawer.textContent()) ?? ''
      expect(text.toLowerCase()).not.toMatch(FORBIDDEN_NOUNS)
    }
    // Aria-labels too
    const ariaLabels = await drawer.locator('[aria-label]').evaluateAll(
      (els) => els.map((el) => el.getAttribute('aria-label') ?? ''),
    )
    for (const label of ariaLabels) {
      expect(label.toLowerCase()).not.toMatch(FORBIDDEN_NOUNS)
    }
  })
})
