/**
 * Mixer: the currently-selected channel strip shows a thin accent border (#639).
 *
 * Clicking a strip selects it; the selected strip swaps its 1px border to the
 * `--accent` token (the same purple the Song-timeline clip-selection uses), and
 * selection is exclusive (clicking another moves it). Playwright observation —
 * the border colour is read from the live computed style, not inferred.
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 15_000 },
  )
}

async function openMixer(page: Page) {
  const root = page.locator('[data-bottom-panel="root"]')
  await root.locator('[data-bottom-panel="toggle"]').click()
  await root.locator('role=tab[name="Mixer"]').click()
  return root.locator('[data-bottom-panel-tab="mixer-console"]')
}

const rgb = (page: Page, el: ReturnType<Page['locator']>) =>
  el.evaluate((n) => getComputedStyle(n as HTMLElement).borderTopColor)

test('the selected strip shows a thin accent border; selection is exclusive (#639)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await boot(page)
  const panel = await openMixer(page)
  const strips = panel.locator('[data-mixer-strip-id]')
  await strips.first().waitFor({ timeout: 10_000 })
  expect(await strips.count()).toBeGreaterThanOrEqual(2)

  // The accent token the timeline-select uses; the selected strip must match it.
  const accentRgb = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--accent, #6ea8fe)'
    document.body.appendChild(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })

  // Nothing selected on first open.
  await expect(panel.locator('[data-mixer-strip-selected]')).toHaveCount(0)
  const idleBorder = await rgb(page, strips.first())

  // Click the first strip → it selects and its border becomes the accent.
  await strips.first().click()
  await expect(strips.first()).toHaveAttribute('data-mixer-strip-selected', '')
  expect(await rgb(page, strips.first())).toBe(accentRgb)
  expect(await rgb(page, strips.first())).not.toBe(idleBorder)

  // Click the second strip → selection moves (exclusive).
  await strips.nth(1).click()
  await expect(strips.nth(1)).toHaveAttribute('data-mixer-strip-selected', '')
  await expect(panel.locator('[data-mixer-strip-selected]')).toHaveCount(1)
  expect(await rgb(page, strips.nth(1))).toBe(accentRgb)

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
