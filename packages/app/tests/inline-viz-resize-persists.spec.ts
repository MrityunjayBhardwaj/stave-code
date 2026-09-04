/**
 * #1437 — a drag on the inline-viz resize bar survives the release.
 *
 * The zone follows the cursor for the whole gesture and then, on `pointerup`,
 * was torn down and remounted at the layout height — so the resize looked
 * cancelled. It wasn't: the override was stored, and it reappeared unannounced
 * at the next editor relayout.
 *
 * ─── WHY THIS CANNOT BE A UNIT TEST ────────────────────────────────────────────
 * The chain runs through four modules and two packages. `setZoneHeightOverride`
 * writes into the file's `Y.Map`; the files-map observer counted that as a
 * structural change and notified the file LIST; `StrudelEditorClient` answers a
 * file-list change by re-registering every viz file; each registration notifies
 * the named-viz registry; and `EditorView` answers that by remounting its inline
 * zones. One drag produced thirteen remounts — one per viz file. The unit arms in
 * `WorkspaceFile.test.ts` pin the first hop, which is where the fix lives. This
 * pins the thing the user actually sees, which no single hop can speak for.
 *
 * ─── THE IDENTITY CHECK IS THE LOAD-BEARING ONE ────────────────────────────────
 * Asserting the height alone would pass against a remount that happened to land
 * on the right number. So the spec holds a reference to the element it dragged
 * and asserts the element still on screen afterwards is that same element. A
 * remount replaces it, and no arithmetic can hide that.
 *
 * The GAP between the zone and its canvas is deliberately NOT asserted here —
 * a drag past the fit-to-width height opens one, and that is #1433's subject.
 * This spec is only about the drag being kept.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const DRAG_BY = 180

/** 1100×200 — much wider than the editor column, so the fit-to-width height is
 *  small and a 180px drag lands well clear of it and well under MAX_ZONE_HEIGHT. */
const WIDE_VIZ = `function setup(){ createCanvas(stave.width, stave.height) }
function draw(){ background(12,6,28); noStroke(); fill(255,40,200); rect(0,0,width,height) }`

async function boot(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 })
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
      id: 'persistviz', name: 'persistviz', renderer: 'p5', code,
      requires: ['streaming'], nativeSize: { w: 1100, h: 200 },
      createdAt: 1, updatedAt: 1,
    })
  }, WIDE_VIZ)
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    ;(window as unknown as {
      monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { setValue: (v: string) => void } | null }> } }
    }).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(
      `$: note("c2 e2 g2 c3").s("sawtooth").viz('persistviz')`,
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

/** Height of the zone on screen, and whether it is still the element we pinned. */
async function read(page: Page): Promise<{ zoneH: number; same: boolean }> {
  return page.evaluate(() => {
    const live = document.querySelector('[data-viz-zone]') as HTMLElement | null
    const pinned = (window as unknown as { __pinnedZone?: HTMLElement }).__pinnedZone
    return {
      zoneH: Math.round((live?.getBoundingClientRect().height ?? 0) * 10) / 10,
      same: !!live && live === pinned,
    }
  })
}

test.describe('#1437 — a resize survives its own release', () => {
  test('the dragged height is still on screen after pointerup, on the same element', async ({ page }) => {
    await boot(page)

    const start = await page.evaluate(() => {
      const z = document.querySelector('[data-viz-zone]') as HTMLElement
      ;(window as unknown as { __pinnedZone?: HTMLElement }).__pinnedZone = z
      const r = z.getBoundingClientRect()
      return { h: Math.round(r.height * 10) / 10, x: r.x + r.width / 2, y: r.bottom - 3 }
    })
    // Non-vacuous: the drag has to be big enough that "held" and "snapped back"
    // are far apart, and small enough to stay under MAX_ZONE_HEIGHT (600).
    expect(start.h).toBeGreaterThan(80)
    expect(start.h + DRAG_BY).toBeLessThan(600)

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(start.x, start.y + (DRAG_BY * i) / 8)
      await page.waitForTimeout(20)
    }
    await page.mouse.up()

    // Immediately: the remount used to land ~6ms after pointerup.
    await page.waitForTimeout(400)
    const justAfter = await read(page)
    expect(justAfter.same, 'the zone must not be torn down and rebuilt by the release').toBe(true)
    expect(justAfter.zoneH, 'the dragged height must still be on screen')
      .toBeCloseTo(start.h + DRAG_BY, -1)

    // And it must STAY — a value that decays a second later is not a resize.
    await page.waitForTimeout(2000)
    const settled = await read(page)
    expect(settled.same, 'and must still be the same element two seconds on').toBe(true)
    expect(settled.zoneH, 'and must still hold its height').toBeCloseTo(start.h + DRAG_BY, -1)
  })
})
