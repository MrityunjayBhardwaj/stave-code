/**
 * Hydra stave-bag E2E (issues #32 + #36).
 *
 * Verifies on real Chromium that a `.hydra` file referencing
 * `stave.scheduler` and `stave.H(...)` compiles + mounts without
 * producing a compile-error panel. These are the observations the
 * unit tests can't make: that the full app→editor→compiler→
 * renderer path wires up under Next.js, not just under vitest.
 */

import { test, expect } from '@playwright/test'

const HYDRA_STAVE_CODE = `// E2E probe — reach both stave.scheduler and stave.H.
globalThis.__stave_probe = {
  hasStave: typeof stave !== 'undefined',
  hasScheduler: stave && 'scheduler' in stave,
  hasH: stave && typeof stave.H === 'function',
  hSampleZero: stave && stave.H('nonexistent')(),
}
s.osc(30, 0.1, 0.5).out()`

async function openHydraTab(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })
  const allTabs = page.locator('[data-workspace-tab]')
  const count = await allTabs.count()
  for (let i = 0; i < count; i++) {
    const text = await allTabs.nth(i).textContent()
    if (text && /hydra/i.test(text)) {
      await allTabs.nth(i).click()
      await page.waitForTimeout(500)
      return
    }
  }
  throw new Error('no hydra tab found in default project')
}

async function openPreviewToSide(page: import('@playwright/test').Page) {
  // Dispatch the keydown events directly to window. Playwright's
  // `page.keyboard.press` routes through the focused element — and
  // Monaco's internal bindings swallow Cmd+K before the hook's
  // window-level listener sees it. The hook (editor/commands/
  // useKeyboardCommands.ts:66) reads `metaKey` + `key` off the event,
  // which a raw `dispatchEvent` sets identically.
  await page.evaluate(() => {
    const fire = (key: string, meta: boolean) => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
          metaKey: meta,
          ctrlKey: meta,
        }),
      )
    }
    fire('k', true)
    // Second event must fire on the next tick — the hook's timer is
    // set in the first handler; a same-tick second event races the
    // `chordPending` assignment. 16ms is one rAF; comfortably clears
    // the same-tick window without sleeping the test.
    return new Promise((r) => setTimeout(() => { fire('v', false); r(null) }, 16))
  })
  await page.waitForTimeout(700)
}

async function replaceMonacoContent(
  page: import('@playwright/test').Page,
  newContent: string,
) {
  // Focus the active editor, select all, type. Monaco's Cmd+A then
  // typing is the most portable path — avoids coupling to any
  // Monaco-specific globals.
  const editor = page.locator('.monaco-editor').first()
  await editor.click()
  // Use Meta on Mac, Control elsewhere. Playwright's Mac detection is
  // accurate since the test is running on the dev's machine.
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${mod}+A`)
  await page.keyboard.press('Delete')
  await page.keyboard.type(newContent, { delay: 0 })
}

test.describe('Hydra .hydra file — stave bag wiring', () => {
  test('stave.H() + stave.scheduler are reachable inside hydra sketch', async ({
    page,
  }) => {
    await openHydraTab(page)
    await replaceMonacoContent(page, HYDRA_STAVE_CODE)
    await openPreviewToSide(page)

    // Wait past the 300ms debounced reload in compiledVizProvider.
    await page.waitForTimeout(700)

    // Mount should succeed — no compile error panel.
    const errorPanel = page.locator('[data-compiled-viz-error="true"]')
    await expect(errorPanel).toHaveCount(0)

    // Viz mount container should be present.
    const mount = page.locator('[data-compiled-viz-mount="true"]').first()
    await expect(mount).toBeVisible({ timeout: 5000 })
    await expect(mount).toHaveAttribute('data-renderer', 'hydra')

    // Inspect the probe — proves stave is in scope with the right shape.
    // The pattern fn runs once per mount (inside initHydra, after lazy
    // `import('hydra-synth')`); give it a beat to resolve.
    await page.waitForFunction(
      () => (window as unknown as { __stave_probe?: unknown }).__stave_probe,
      { timeout: 10000 },
    )
    const probe = await page.evaluate(
      () =>
        (window as unknown as {
          __stave_probe: {
            hasStave: boolean
            hasScheduler: boolean
            hasH: boolean
            hSampleZero: number
          }
        }).__stave_probe,
    )
    expect(probe.hasStave).toBe(true)
    expect(probe.hasScheduler).toBe(true)
    expect(probe.hasH).toBe(true)
    // H('nonexistent')() returns 0 in demo mode — no throw, no NaN.
    expect(probe.hSampleZero).toBe(0)
  })

  test('legacy hydra (no stave reference) still compiles', async ({ page }) => {
    await openHydraTab(page)
    await replaceMonacoContent(
      page,
      `s.osc(40, 0.1, () => s.a.fft[0] * 4).color(1, 0.5, () => s.a.fft[1]).out()`,
    )
    await openPreviewToSide(page)
    await page.waitForTimeout(700)

    const errorPanel = page.locator('[data-compiled-viz-error="true"]')
    await expect(errorPanel).toHaveCount(0)
    const mount = page.locator('[data-compiled-viz-mount="true"]').first()
    await expect(mount).toBeVisible({ timeout: 5000 })
  })
})
