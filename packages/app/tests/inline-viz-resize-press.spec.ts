/**
 * #1438 — a press on the inline-viz resize bar is not a resize.
 *
 * `onUp` used to persist a height override unconditionally, so pressing the 6px
 * strip under a `.viz()` zone and letting go without moving pinned the zone at
 * whatever height it happened to have. An override is not a passive record: it
 * takes the zone OUT of the fit-to-width layout, so it stops tracking the editor
 * width and the viz's aspect. That is how a zone ends up with empty space under
 * its canvas (#1433) without anyone deliberately resizing anything.
 *
 * ─── THE ORACLE, AND WHY IT IS A *WIDENING* ────────────────────────────────────
 * The obvious check — read the zone height right after `pointerup` — cannot see
 * this. The gesture's release currently tears the zone down and remounts it at
 * the layout height (#1437), so the screen reads the same whether an override was
 * stored or not. The stored value only surfaces at the next relayout.
 *
 * So each arm WIDENS the editor and reads what comes back:
 *   · no override  → the zone tracks the width and lands on the wider fit height
 *   · an override SHORTER than that fit height → the override binds, and the zone
 *     stays at the height the drag chose
 * Each page measures its own wide fit height BEFORE the gesture, so the arms
 * compare two readings from one run on one layout rather than a hard-coded number.
 *
 * A shorter-than-fit drag is used deliberately for the control arm. A TALLER one
 * would be indistinguishable from "no override" once #1433 derives the displayed
 * height from the stored intent — this arm has to keep meaning the same thing
 * after that lands.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const NARROW = 1000
const WIDE = 1500

/** 1100×200 — much wider than the editor column, so the fit-to-width height is
 *  small and moves clearly when the column does. */
const WIDE_VIZ = `function setup(){ createCanvas(stave.width, stave.height) }
function draw(){ background(12,6,28); noStroke(); fill(255,40,200); rect(0,0,width,height) }`

interface Shot { zoneH: number; gap: number }

async function measure(page: Page): Promise<Shot> {
  return page.evaluate(() => {
    const zone = document.querySelector('[data-viz-zone]') as HTMLElement | null
    const wrap = zone?.querySelector('[data-viz-canvas-wrap]') as HTMLElement | null
    const zh = zone?.getBoundingClientRect().height ?? 0
    const wh = wrap?.getBoundingClientRect().height ?? 0
    return { zoneH: Math.round(zh * 10) / 10, gap: Math.round((zh - wh) * 10) / 10 }
  })
}

async function atWidth(page: Page, width: number): Promise<Shot> {
  await page.setViewportSize({ width, height: 900 })
  await page.waitForTimeout(1200)
  return measure(page)
}

async function boot(page: Page): Promise<void> {
  await page.setViewportSize({ width: NARROW, height: 900 })
  await page.addInitScript(() => {
    ;(window as unknown as { __STAVE_E2E__?: boolean }).__STAVE_E2E__ = true
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.evaluate((code) => {
    ;(window as unknown as {
      __staveRegisterViz?: (v: Record<string, unknown>) => void
    }).__staveRegisterViz?.({
      id: 'wideviz', name: 'wideviz', renderer: 'p5', code,
      requires: ['streaming'], nativeSize: { w: 1100, h: 200 },
      createdAt: 1, updatedAt: 1,
    })
  }, WIDE_VIZ)
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    ;(window as unknown as {
      monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { setValue: (v: string) => void } | null }> } }
    }).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(
      `$: note("c2 e2 g2 c3").s("sawtooth").viz('wideviz')`,
    )
  })
  await page.waitForTimeout(300)
  // Focus by real gesture — a programmatic focus carries no user gesture (#885).
  await page.locator('.monaco-editor').first().click({ position: { x: 40, y: 10 } })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForFunction(() => {
    const z = document.querySelector('[data-viz-zone]') as HTMLElement | null
    const w = z?.querySelector('[data-viz-canvas-wrap]') as HTMLElement | null
    return !!w && w.getBoundingClientRect().height > 0 && (z?.offsetHeight ?? 0) > 0
  }, { timeout: 20000 })
  await page.waitForTimeout(800)
}

/** Press the zone's bottom resize strip and release after moving by `dy`. */
async function pressHandle(page: Page, dy: number): Promise<void> {
  const at = await page.evaluate(() => {
    const r = document.querySelector('[data-viz-zone]')?.getBoundingClientRect()
    return r ? { x: r.x + r.width / 2, y: r.bottom - 3 } : null
  })
  expect(at, 'the zone must be on screen to press its handle').not.toBeNull()
  await page.mouse.move(at!.x, at!.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(at!.x, at!.y + (dy * i) / 8)
    await page.waitForTimeout(20)
  }
  await page.mouse.up()
  await page.waitForTimeout(400)
}

/** The wide fit height, read before any gesture, plus the narrow one. */
async function baselines(page: Page): Promise<{ wide: Shot; narrow: Shot }> {
  const wide = await atWidth(page, WIDE)
  const narrow = await atWidth(page, NARROW)
  // Non-vacuous: the column really does drive the height, so "it tracked the
  // width" is a claim with teeth rather than two equal numbers agreeing.
  expect(wide.zoneH).toBeGreaterThan(narrow.zoneH + 20)
  expect(wide.gap).toBeLessThanOrEqual(2)
  expect(narrow.gap).toBeLessThanOrEqual(2)
  return { wide, narrow }
}

test.describe('#1438 — pressing the resize bar is not a resize', () => {
  test('a press with no movement leaves the zone tracking the editor width', async ({ page }) => {
    await boot(page)
    const base = await baselines(page)

    await pressHandle(page, 0)

    const after = await atWidth(page, WIDE)
    expect(after.zoneH, 'no override — the zone should reach the wide fit height').toBeCloseTo(base.wide.zoneH, 0)
    expect(after.gap, 'the canvas should still fill the zone').toBeLessThanOrEqual(2)
  })

  test('a drag away and back to the starting height leaves nothing behind', async ({ page }) => {
    await boot(page)
    const base = await baselines(page)

    // Out and back: `onMove` fires many times, but the height ends where it began.
    const at = await page.evaluate(() => {
      const r = document.querySelector('[data-viz-zone]')?.getBoundingClientRect()
      return r ? { x: r.x + r.width / 2, y: r.bottom - 3 } : null
    })
    expect(at).not.toBeNull()
    await page.mouse.move(at!.x, at!.y)
    await page.mouse.down()
    for (const dy of [30, 60, 90, 60, 30, 0]) {
      await page.mouse.move(at!.x, at!.y + dy)
      await page.waitForTimeout(20)
    }
    await page.mouse.up()
    await page.waitForTimeout(400)

    const after = await atWidth(page, WIDE)
    expect(after.zoneH, 'ended where it started — no override').toBeCloseTo(base.wide.zoneH, 0)
    expect(after.gap).toBeLessThanOrEqual(2)
  })

  test('a real resize still persists — the guard does not disable drag-to-resize', async ({ page }) => {
    await boot(page)
    const base = await baselines(page)

    // Shorter than the WIDE fit height, so the override still binds after the
    // widening and this arm keeps its meaning once #1433 derives the display.
    const target = Math.round(base.narrow.zoneH * 0.8)
    expect(target, 'the target must stay above MIN_ZONE_HEIGHT').toBeGreaterThan(80)
    expect(target, 'and below the wide fit height, or the override would not bind')
      .toBeLessThan(base.wide.zoneH - 20)

    await pressHandle(page, target - base.narrow.zoneH)

    const after = await atWidth(page, WIDE)
    expect(after.zoneH, 'the dragged height should survive the widening').toBeCloseTo(target, 0)
    expect(after.zoneH, 'and it should NOT have snapped back to the fit height')
      .toBeLessThan(base.wide.zoneH - 20)
  })
})
