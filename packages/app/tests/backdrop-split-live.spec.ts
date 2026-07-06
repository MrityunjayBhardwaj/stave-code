import { test, expect, type Page } from '@playwright/test'

/**
 * #767 — EVERY split pane's backdrop stays LIVE, focused or not.
 *
 * Previously (#366/#350d) only the focused pane rendered its backdrop live and
 * inactive panes FROZE to their last frame, to bound the shared-GPU cost
 * (#299/#122). But that made the first pattern's viz visibly STOP the moment a
 * second pane was opened. The shared-GPU concern is now owned by `vizGovernor`,
 * which gates every WorkerVizRenderer and throttles/round-robins/drops-resolution
 * ONLY under real GPU stress (and is a total no-op when smooth). So the crude
 * always-freeze is gone: a split of two patterns keeps BOTH backdrops animating.
 *
 * Observation discipline — measure the WORKER FRAME-PRODUCTION rate, not pixels:
 *   - The default p5 backdrop renders in an OffscreenCanvas worker; getContext on
 *     the transferred canvas throws (PV90), and a COMPOSITOR screenshot of the
 *     backdrop region is confounded by the code editor (with its live play-head
 *     highlight) compositing IN FRONT of the semi-transparent backdrop (P121-class
 *     artifact — the editor changes even when the backdrop is frozen).
 *   - `__stavePerf` records a per-worker frame counter (`worker#N`). Its delta over
 *     a fixed window is the DIRECT measure of GPU frame production: live ⇒ tens of
 *     frames/sec; frozen ⇒ ~0. This is exactly the "stop" #767 removes, and it is
 *     immune to the editor-compositing confound.
 *   - P146: SYNTH (`.s("sawtooth")`) drives the playing program (the produce loop);
 *     drum samples don't load headless and would gate the code backdrop.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// Any p5 sketch — the worker frame counter advances per draw regardless of what
// it paints, so content doesn't matter; a moving bar just makes it concrete.
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

// Total frames produced by all worker viz renderers (the backdrop is one).
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

// Frames the worker(s) produced over `ms` — the live-vs-frozen signal.
async function framesProducedOver(page: Page, ms: number): Promise<number> {
  const before = await workerFrameCount(page)
  await page.waitForTimeout(ms)
  return (await workerFrameCount(page)) - before
}

test('#767 — backdrop keeps producing frames when its pane is NOT the focused one', async ({ page }) => {
  await gotoApp(page)
  await page.evaluate(() => (window as any).__stavePerf?.setEnabled?.(true)) // eslint-disable-line @typescript-eslint/no-explicit-any

  // Drive the backdrop via a playing synth program's `.spectrum()` code-override.
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
  await expect(backdrop).toHaveAttribute('data-backdrop-live', 'true')
  await page.locator('[data-workspace-background] canvas').first().waitFor({ timeout: 8000 })
  await page.waitForTimeout(800)

  // 1) Single pane = active → the backdrop worker produces frames (live).
  const liveFrames = await framesProducedOver(page, 1200)
  expect(liveFrames, 'active backdrop worker should produce frames').toBeGreaterThan(10)

  // 2) Split right → a new EMPTY group. The backdrop's pane stays active for now.
  await page.locator('[data-testid^="group-split-"]').first().click()
  await page.waitForTimeout(500)
  expect(await page.locator('[data-workspace-group]').count()).toBe(2)

  // 3) Focus the OTHER (empty) group → the backdrop's pane is no longer focused.
  const emptyGroup = page.locator('[data-workspace-group]', {
    hasNot: page.locator('[data-workspace-background]'),
  }).first()
  await emptyGroup.click({ position: { x: 40, y: 200 } })
  await page.waitForTimeout(500)
  // #767: the backdrop stays LIVE even though its pane isn't the active group.
  await expect(backdrop).toHaveAttribute('data-backdrop-live', 'true', { timeout: 4000 })

  // 4) The key assertion — the unfocused pane's backdrop KEEPS producing frames
  //    (the old #350d froze it to ~0 here; #767 keeps it animating).
  const unfocusedFrames = await framesProducedOver(page, 1200)
  expect(unfocusedFrames, 'unfocused backdrop worker should keep producing frames').toBeGreaterThan(10)

  // 5) Refocusing the backdrop's pane changes nothing — it was already live.
  const bgGroup = page.locator('[data-workspace-group]', {
    has: page.locator('[data-workspace-background]'),
  }).first()
  await bgGroup.click({ position: { x: 40, y: 200 } })
  await page.waitForTimeout(500)
  await expect(backdrop).toHaveAttribute('data-backdrop-live', 'true', { timeout: 4000 })
  const refocusedFrames = await framesProducedOver(page, 1200)
  expect(refocusedFrames, 'refocused backdrop worker should still produce frames').toBeGreaterThan(10)
})
