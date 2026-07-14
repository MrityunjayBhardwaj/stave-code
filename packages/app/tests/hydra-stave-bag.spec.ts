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
import { vizPixelStats } from './_vizFrames'

// The probe PAINTS its answer instead of handing it back on a global.
//
// It used to set `globalThis.__stave_probe` for the spec to read off `window`.
// That channel does not exist: hydra renders in the viz WORKER (the default since
// #245), where `globalThis` is the worker scope — so the page waited on a global
// that could never appear, and timed out having proven nothing (#875). Same dead
// channel as the backdrop `sig.tracks` probe.
//
// So encode each check in a colour channel and read the pixels the only way a
// transferred canvas can be read — the compositor. All four checks holding paints
// WHITE; any failure drops a channel, which is directly falsifiable.
//   R = stave present AND stave.scheduler reachable
//   G = stave.H is callable
//   B = stave.H('nonexistent')() === 0  (no throw, no NaN — demo-mode default)
const HYDRA_STAVE_CODE = `// E2E probe — reach both stave.scheduler and stave.H, and PAINT the result.
const hasStave = typeof stave !== 'undefined'
const hasScheduler = hasStave && 'scheduler' in stave
const hasH = hasStave && typeof stave.H === 'function'
const hZero = hasH && stave.H('nonexistent')() === 0
s.solid(hasStave && hasScheduler ? 1 : 0, hasH ? 1 : 0, hZero ? 1 : 0).out()`

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
  // Issue #175 — the default workspace opens a SINGLE Strudel tab, not the old
  // 11-tab wall, so there is no pre-opened hydra tab to click: at boot the tabs
  // are exactly ["pattern.strudel"]. The hydra presets still ship (they sit in
  // the file tree), so open one the way a user would. Without this the spec
  // threw "no hydra tab found" and never exercised the stave-bag wiring it
  // guards — the product was fine, the spec's premise had rotted (#875).
  // Same fallback backdrop-viz-chrome.spec.ts already uses.
  const hydraItem = page.locator('[data-file-tree-item*="hydra"]').first()
  if ((await hydraItem.count()) === 0) {
    throw new Error('no hydra tab AND no hydra preset file in default project')
  }
  await hydraItem.dblclick()
  await page.waitForTimeout(500)
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
  // Write the model directly. The previous approach — click, Cmd+A, Delete, then
  // `keyboard.type` the whole sketch — MANGLED multi-line content: the select-all
  // raced the typing, so the first newline was swallowed and a stray "a" leaked
  // in, giving `…PAINT the result.aconst hasStave = …`. That folded the sketch's
  // first statement into its leading comment, so the sketch threw and painted
  // nothing. The single-line sibling test never noticed (no newline to lose).
  // setValue drives the same onDidChangeContent path the provider listens on.
  await page.evaluate((code) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eds = (window as any).monaco?.editor?.getEditors?.() ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = eds.find((e: any) => e.getModel()?.getLanguageId?.() === 'hydra') ?? eds[0]
    target?.getModel()?.setValue(code)
    target?.focus()
  }, newContent)
  await page.waitForTimeout(300)
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

    // Read the painted answer. The pattern fn runs once per mount (inside
    // initHydra, after the lazy `import('hydra-synth')`), so give it a beat.
    await page.waitForTimeout(1500)
    const white = await vizPixelStats(page, '[data-compiled-viz-mount="true"] canvas', {
      rMin: 200, gMin: 200, bMin: 200,
    })
    // WHITE ⇒ stave + stave.scheduler reachable (R), stave.H callable (G), and
    // H('nonexistent')() === 0 — no throw, no NaN (B). A missing channel would
    // paint red/yellow/etc, so this fails loudly on any one of the four.
    expect(white.frac, 'stave bag reachable inside the hydra sketch (white = all checks)')
      .toBeGreaterThan(0.9)
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
