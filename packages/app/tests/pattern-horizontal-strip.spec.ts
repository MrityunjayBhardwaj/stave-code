/**
 * Pattern tab — horizontal channel strip in the inspector (#600).
 *
 * The cursor track's local mixer strip moved from a vertical strip in a side
 * column to a compact HORIZONTAL bar atop the inspector, so the Pattern grid
 * reclaims the width the side strip took. These assert the horizontal strip is
 * present + headerless, that its fader writes `.gain` when dragged ALONG THE X
 * AXIS (the orientation swap — a vertical-axis drag would do nothing), and
 * capture a screenshot of the new layout for the visual gate (#557 lesson).
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 15_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.setPosition({ lineNumber: 1, column: 1 })
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(200)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue: () => string } | null }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

async function openPattern(page: Page) {
  const root = page.locator('[data-bottom-panel="root"]')
  await root.locator('[data-bottom-panel="toggle"]').click()
  await root.locator('role=tab[name="Pattern"]').click()
  return root.locator('[data-bottom-panel-tab="pattern"]')
}

async function enlargeDrawer(page: Page): Promise<void> {
  const handle = page.locator('[data-bottom-panel="resize-handle"]')
  const hb = await handle.boundingBox()
  if (!hb) return
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 320, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}

const MELODY = `note("c3 e3 g3 a3 g3 e3").s("sawtooth").gain(0.5)`

// A stack with a per-voice scalar gain, plus a master gain on the whole `$:`.
const STACK = `$: stack(
  note("c4 e4 g4").s('gm_choir_aahs').gain(0.5),
  note("e3 g3 b3 e4").s("sine").gain(0.95).release(0.3)
).viz("prism").gain(0.274)`

test('the Pattern-tab strip is a horizontal bar with the full control set, no name/dot', async ({ page }) => {
  await boot(page)
  await setStrudelCode(page, MELODY)
  const pattern = await openPattern(page)
  await enlargeDrawer(page)

  const strip = pattern.locator('[data-mixer-local-strip] [data-mixer-strip][data-mixer-strip-orientation="horizontal"]')
  await expect(strip).toBeVisible()
  // no name/dot — identity lives in the Pattern top-bar chip (#589)
  await expect(strip.locator('[data-mixer-strip-name]')).toHaveCount(0)
  await expect(strip.locator('[data-mixer-strip-dot]')).toHaveCount(0)
  // the full mixing control set IS there: mute, solo, pan, fader, meter, gain
  await expect(strip.locator('[data-mixer-strip-mute]')).toBeVisible()
  await expect(strip.locator('[data-mixer-strip-solo]')).toBeVisible()
  await expect(strip.locator('[data-mixer-strip-pan]')).toBeVisible()
  await expect(strip.locator('[data-mixer-strip-fader]')).toBeVisible()
  await expect(strip.locator('[data-mixer-strip-meter]')).toBeVisible()
  await expect(strip.locator('[data-mixer-strip-gain]')).toBeVisible()

  // the strip is WIDER than it is tall — it's a horizontal bar, not a column
  const box = await strip.boundingBox()
  expect(box).not.toBeNull()
  if (box) expect(box.width).toBeGreaterThan(box.height)

  await page.screenshot({ path: 'test-results/pattern-horizontal-strip.png' })
})

test('dragging the horizontal fader along X writes .gain', async ({ page }) => {
  await boot(page)
  await setStrudelCode(page, MELODY)
  const pattern = await openPattern(page)
  await enlargeDrawer(page)

  const fader = pattern.locator('[data-mixer-local-strip] [data-mixer-strip-fader]')
  await expect(fader).toBeVisible()
  const fb = await fader.boundingBox()
  expect(fb).not.toBeNull()
  if (!fb) return

  // grab mid-fader, drag LEFT (quieter) — a horizontal fader samples X, so this
  // must change .gain; if it still read the Y axis this drag would be a no-op.
  const cy = fb.y + fb.height / 2
  await page.mouse.move(fb.x + fb.width / 2, cy)
  await page.mouse.down()
  await page.mouse.move(fb.x + fb.width * 0.2, cy, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)

  const after = await strudelValue(page)
  const m = after.match(/\.gain\(([0-9.]+)\)/)
  expect(m).not.toBeNull()
  if (m) expect(Number(m[1])).toBeLessThan(0.5)
})

// Put the cursor on a given 1-based line/column in the Strudel editor.
async function cursorAt(page: Page, line: number, column: number): Promise<void> {
  await page.evaluate(
    ({ line, column }) => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; setPosition: (p: { lineNumber: number; column: number }) => void; focus: () => void }> } } }).monaco
      const eds = m?.editor?.getEditors?.() ?? []
      const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
      t?.setPosition({ lineNumber: line, column })
      t?.focus()
    },
    { line, column },
  )
  await page.waitForTimeout(250)
}

test('inside a stack voice the strip binds the containing TRACK with the full control set (#620)', async ({ page }) => {
  await boot(page)
  await setStrudelCode(page, STACK)
  const pattern = await openPattern(page)
  await enlargeDrawer(page)
  const strip = pattern.locator('[data-mixer-local-strip] [data-mixer-strip]')

  // The strip is present and complete BOTH outside the stack (line 4, the master
  // `.gain(0.274)` line) and INSIDE a voice (line 3) — it never vanishes, and
  // both times it binds the SAME top-level track, so it carries the full set:
  // mute, solo, pan, fader and a (track-level) meter.
  for (const [line, col, where] of [[4, 5, 'outside'], [3, 12, 'inside']] as const) {
    await cursorAt(page, line, col)
    await expect(strip, where).toHaveCount(1)
    await expect(pattern.locator('[data-mixer-local-strip] [data-mixer-strip-mute]'), where).toHaveCount(1)
    await expect(pattern.locator('[data-mixer-local-strip] [data-mixer-strip-solo]'), where).toHaveCount(1)
    await expect(pattern.locator('[data-mixer-local-strip] [data-mixer-strip-pan]'), where).toHaveCount(1)
    await expect(pattern.locator('[data-mixer-local-strip] [data-mixer-strip-fader]'), where).toHaveCount(1)
    await expect(pattern.locator('[data-mixer-local-strip] [data-mixer-strip-meter]'), where).toHaveCount(1)
  }

  // INSIDE the sine voice, the fader edits the TRACK's master gain (0.274) — the
  // channel strip mixes the track; the grid edits the voice's notes. The voice
  // gains stay intact.
  await cursorAt(page, 3, 12)
  const fader = pattern.locator('[data-mixer-local-strip] [data-mixer-strip-fader]')
  const fb = await fader.boundingBox()
  expect(fb).not.toBeNull()
  if (!fb) return
  const cy = fb.y + fb.height / 2
  await page.mouse.move(fb.x + fb.width / 2, cy)
  await page.mouse.down()
  await page.mouse.move(fb.x + fb.width * 0.15, cy, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  const after = await strudelValue(page)
  const master = after.match(/\.viz\("prism"\)\.gain\(([0-9.]+)\)/)
  expect(master, `master gain after drag: ${after}`).not.toBeNull()
  if (master) expect(Number(master[1])).toBeLessThan(0.274)
  expect(after).toContain(`.s('gm_choir_aahs').gain(0.5)`)
  expect(after).toContain(`.s("sine").gain(0.95)`)
})

test('mute from the local strip toggles the track _-prefix (#620)', async ({ page }) => {
  await boot(page)
  await setStrudelCode(page, `d1: s("bd*4")`)
  const pattern = await openPattern(page)
  await enlargeDrawer(page)
  await pattern.locator('[data-mixer-local-strip] [data-mixer-strip-mute]').click()
  await page.waitForTimeout(150)
  expect(await strudelValue(page)).toBe(`_d1: s("bd*4")`)
})
