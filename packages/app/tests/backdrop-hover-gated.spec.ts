import { test, expect, type Page } from '@playwright/test'

/**
 * #769 — the opt-in "Play viz on hover" setting.
 *
 * OFF (default) → every split pane's backdrop stays live (#768, covered by
 * backdrop-split-live.spec.ts). ON → only the focused pane renders live and
 * non-focused panes FREEZE to their last frame UNLESS the cursor hovers them,
 * then they resume. This spec enables the flag (localStorage, read at mount) and
 * verifies freeze-when-unfocused-and-unhovered → resume-on-hover via the worker
 * frame-production delta (same discipline as backdrop-split-live: measure frames
 * produced, not pixels — PV90/P121).
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const SKETCH = `
function setup() { createCanvas(stave.width, stave.height); colorMode(RGB) }
function draw() {
  background(10, 10, 20)
  noStroke(); fill(80, 200, 255)
  rect((frameCount * 7) % width, 0, Math.max(24, width * 0.12), height)
}`

async function gotoApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    // Enable "Play viz on hover" before the shell mounts (read at mount).
    try { localStorage.setItem('stave:playVizOnHover', '1') } catch { /* ignore */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1000)
}

async function setCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c)
  }, code)
  await page.waitForTimeout(150)
}

async function runCode(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}

async function workerFrameCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__stavePerf?.snapshot?.()
    if (!s?.frames) return 0
    let n = 0
    for (const k of Object.keys(s.frames)) if (k.startsWith('worker')) n += s.frames[k].count ?? 0
    return n
  })
}

async function framesProducedOver(page: Page, ms: number): Promise<number> {
  const before = await workerFrameCount(page)
  await page.waitForTimeout(ms)
  return (await workerFrameCount(page)) - before
}

test('#769 — with the setting ON, an unfocused backdrop freezes and resumes on hover', async ({ page }) => {
  await gotoApp(page)
  await page.evaluate(() => (window as any).__stavePerf?.setEnabled?.(true)) // eslint-disable-line @typescript-eslint/no-explicit-any

  const overrode = await page.evaluate(
    (code) => (window as any).__staveOverrideVizFile?.('spectrum', code) ?? null, // eslint-disable-line @typescript-eslint/no-explicit-any
    SKETCH,
  )
  expect(overrode, 'bundled spectrum viz file should exist to override').toBeTruthy()
  await page.waitForTimeout(300)
  await setCode(page, `$: note("c e g").s("sawtooth").spectrum()`)
  await runCode(page)

  const backdrop = page.locator('[data-workspace-background]').first()
  await expect(backdrop).toBeVisible({ timeout: 6000 })
  await page.locator('[data-workspace-background] canvas').first().waitFor({ timeout: 8000 })
  await page.waitForTimeout(800)

  // Split right → new empty group; then focus it so the backdrop's pane is
  // non-focused. With the setting ON and no hover, it must FREEZE.
  await page.locator('[data-testid^="group-split-"]').first().click()
  await page.waitForTimeout(500)
  const emptyGroup = page.locator('[data-workspace-group]', {
    hasNot: page.locator('[data-workspace-background]'),
  }).first()
  await emptyGroup.click({ position: { x: 40, y: 200 } })
  await page.waitForTimeout(500)
  await expect(backdrop).toHaveAttribute('data-backdrop-live', 'false', { timeout: 4000 })

  const frozenFrames = await framesProducedOver(page, 1200)
  expect(frozenFrames, 'unfocused + unhovered backdrop should freeze').toBeLessThanOrEqual(2)

  // Hover the backdrop's pane (without clicking → focus stays on the empty
  // group). It must RESUME while hovered.
  const bgGroup = page.locator('[data-workspace-group]', {
    has: page.locator('[data-workspace-background]'),
  }).first()
  await bgGroup.hover()
  await expect(backdrop).toHaveAttribute('data-backdrop-live', 'true', { timeout: 4000 })
  const hoveredFrames = await framesProducedOver(page, 1200)
  expect(hoveredFrames, 'hovered backdrop should resume producing frames').toBeGreaterThan(10)

  // Move the cursor away (onto the empty group) → it freezes again.
  await emptyGroup.hover({ position: { x: 40, y: 200 } })
  await expect(backdrop).toHaveAttribute('data-backdrop-live', 'false', { timeout: 4000 })
  const refrozenFrames = await framesProducedOver(page, 1200)
  expect(refrozenFrames, 'backdrop should re-freeze once the cursor leaves').toBeLessThanOrEqual(2)
})
