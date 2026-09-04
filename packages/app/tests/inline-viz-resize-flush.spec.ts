/**
 * #1433 Part 2 — the resize bar stays flush against the bottom of its canvas.
 *
 * A `.viz()` canvas is width-bound: the cropped region fills the editor column,
 * so it cannot draw taller than the fit-to-width height. Seven sites used to
 * assign a stored or dragged height straight to the zone while scaling the
 * canvas to fit INSIDE it — so past the fit height the canvas stopped growing
 * and the zone didn't, and the resize bar pinned to the zone's bottom edge
 * floated off into empty space.
 *
 * Both routes here were observed before the fix, in this app, at these sizes:
 *   A — drag past the fit height:            180.4px of gap
 *   B — narrow the editor after a resize:    123.7px of gap
 * (Route C — switching to a viz with another aspect ratio, 410.4px — is Part 1's
 * `inline-viz-switch-height.spec.ts`, since it is fixed by the vizId stamp.)
 *
 * ─── WHAT THE ARMS MEASURE ─────────────────────────────────────────────────────
 * The GAP: the zone's height minus the canvas wrapper's height. That is the
 * empty strip the resize bar sits at the bottom of, and it is the defect stated
 * directly rather than through a proxy. Asserting a height instead would need a
 * predicted number, and a prediction that drifts with the layout would pass
 * while the bar floated.
 *
 * ⚠ The tolerance is 2px, not 0: the canvas wrapper's rect is fractional
 * (189.63px against a 190px zone at mount), so exact equality would fail on
 * rounding alone and teach the next person to widen it until it passed.
 *
 * ⚠ ROUTE B IS STATED AS A COMPARISON, AND STAYS THAT WAY. When these arms were
 * written, narrowing left ~52px of gap even with NO override stored — a second,
 * independent defect (#1439: a container-filling canvas has no intrinsic size,
 * so `readCanvasNative` returned the container's size and the scale was applied
 * twice). #1439 is now fixed and that floor is down to the deliberate
 * `MIN_ZONE_HEIGHT` remainder, asserted by its own arm below. The comparison
 * form is kept anyway: it says what this change actually claims — a stored
 * height contributes NOTHING of its own — and it would have gone on holding if
 * #1439 had never been fixed.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const WIDE_COL = 1400
const NARROW_COL = 760

/** 1100×200 — much wider than the column, so the fit height is small and there
 *  is room both to drag past it and to watch it move when the column does. */
const WIDE_VIZ = `function setup(){ createCanvas(stave.width, stave.height) }
function draw(){ background(12,6,28); noStroke(); fill(255,40,200); rect(0,0,width,height) }`

interface Shot { zoneH: number; canvasH: number; gap: number }

async function measure(page: Page): Promise<Shot> {
  return page.evaluate(() => {
    const zone = document.querySelector('[data-viz-zone]') as HTMLElement | null
    const wrap = zone?.querySelector('[data-viz-canvas-wrap]') as HTMLElement | null
    const zh = zone?.getBoundingClientRect().height ?? 0
    const ch = wrap?.getBoundingClientRect().height ?? 0
    return {
      zoneH: Math.round(zh * 10) / 10,
      canvasH: Math.round(ch * 10) / 10,
      gap: Math.round((zh - ch) * 10) / 10,
    }
  })
}

async function atWidth(page: Page, width: number): Promise<Shot> {
  await page.setViewportSize({ width, height: 900 })
  await page.waitForTimeout(1200)
  return measure(page)
}

async function boot(page: Page): Promise<void> {
  await page.setViewportSize({ width: WIDE_COL, height: 900 })
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
      id: 'flushviz', name: 'flushviz', renderer: 'p5', code,
      requires: ['streaming'], nativeSize: { w: 1100, h: 200 },
      createdAt: 1, updatedAt: 1,
    })
  }, WIDE_VIZ)
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    ;(window as unknown as {
      monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { setValue: (v: string) => void } | null }> } }
    }).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(
      `$: note("c2 e2 g2 c3").s("sawtooth").viz('flushviz')`,
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

/** Drag the zone's bottom resize strip by `dy` px, sampling the gap throughout. */
async function dragSampling(page: Page, dy: number): Promise<{ maxGap: number; final: Shot }> {
  const at = await page.evaluate(() => {
    const r = document.querySelector('[data-viz-zone]')?.getBoundingClientRect()
    return r ? { x: r.x + r.width / 2, y: r.bottom - 3 } : null
  })
  expect(at, 'the zone must be on screen to drag it').not.toBeNull()
  await page.mouse.move(at!.x, at!.y)
  await page.mouse.down()
  let maxGap = 0
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(at!.x, at!.y + (dy * i) / 8)
    await page.waitForTimeout(30)
    maxGap = Math.max(maxGap, (await measure(page)).gap)
  }
  await page.mouse.up()
  await page.waitForTimeout(400)
  return { maxGap, final: await measure(page) }
}

test.describe('#1433 — the resize bar stays flush against its canvas', () => {
  test('route A — dragging past the fit height opens no gap, during OR after', async ({ page }) => {
    await boot(page)
    const base = await measure(page)
    expect(base.gap, 'flush before anything happens').toBeLessThanOrEqual(2)
    expect(base.zoneH, 'and non-vacuous — there is a real zone here').toBeGreaterThan(80)

    // Far past the fit height: the drag that used to open 180px of gap.
    const dragged = await dragSampling(page, 180)

    // Sampled THROUGHOUT, not just at the end. The gap used to grow with the
    // cursor for the whole gesture, so an end-state-only check could be passed
    // by anything that tidied up on release.
    expect(dragged.maxGap, 'no gap opens at any point during the drag').toBeLessThanOrEqual(2)
    expect(dragged.final.gap, 'and none after it').toBeLessThanOrEqual(2)
    // The zone stops where the canvas stops rather than following the cursor.
    expect(dragged.final.zoneH, 'the zone must not have run away with the pointer')
      .toBeCloseTo(base.zoneH, -1)
  })

  test('route B — a stored height stops contributing a gap when the editor narrows', async ({ page }) => {
    await boot(page)
    const base = await measure(page)

    // The floor this arm compares against: what the narrow width does with NO
    // override at all. Two readings in one run on one layout, so the claim holds
    // whatever the floor happens to be — after the fix a stored height
    // contributes NOTHING of its own. Before it, the same narrowing measured
    // 123.7px against a ~52px floor; the difference was the override, and it is
    // gone. (That ~52px floor was #1439 and is itself fixed now — see the arm
    // below — but this arm never depended on the number.)
    const noOverrideNarrow = await atWidth(page, NARROW_COL)
    await atWidth(page, WIDE_COL)

    // SHORTER than the fit height, so the intent is expressible and stored.
    const target = Math.round(base.zoneH * 0.8)
    expect(target, 'the target must clear MIN_ZONE_HEIGHT').toBeGreaterThan(80)
    const dragged = await dragSampling(page, target - base.zoneH)
    expect(dragged.final.zoneH, 'the resize must have taken').toBeCloseTo(target, -1)
    expect(dragged.final.gap).toBeLessThanOrEqual(2)

    // Narrow. No further gesture — this is the pure recompute path.
    const narrow = await atWidth(page, NARROW_COL)

    // Non-vacuous: the narrowing really did force the issue — the fit height at
    // this width is genuinely below what the user asked for, so the stored
    // number had every chance to leak through.
    expect(narrow.zoneH, 'the width must actually have bound the height here')
      .toBeLessThan(dragged.final.zoneH - 20)

    expect(narrow.gap, 'a stored height must add no gap of its own')
      .toBeCloseTo(noOverrideNarrow.gap, 0)
    expect(narrow.zoneH, 'and the zone is sized exactly as if nothing were stored')
      .toBeCloseTo(noOverrideNarrow.zoneH, 0)

    // Widen back: the stored INTENT returns. This is what storing the DERIVED
    // height cannot do — it would have baked the narrow height in for good.
    const back = await atWidth(page, WIDE_COL)
    expect(back.gap, 'flush again at the original width').toBeLessThanOrEqual(2)
    expect(back.zoneH, "the user's height comes back on widening").toBeCloseTo(target, -1)
  })

  /**
   * #1439 — narrowing the editor with NO override stored leaves only the
   * deliberate `MIN_ZONE_HEIGHT` remainder.
   *
   * `WorkerVizRenderer`, `GLSLVizRenderer` and `HydraVizRenderer` style their
   * canvas `width:100%`, so it has no size of its own — it fills its container.
   * `readCanvasNative` then reported the CONTAINER's size as the canvas's
   * "native" size, i.e. the layout it was being used to compute. At the width
   * where it was measured that made `scale` exactly 1 — the error cancelled by
   * the measurement that caused it, not a healthy identity — and at every other
   * width the canvas was shrunk twice. Measured at a 760px column: a canvas
   * already down to 403px, scaled by a further 0.386 to 156px, 51.7px of gap.
   *
   * ⚠ THE ASSERTION IS THE GAP AT THE NARROW WIDTH, NOT A HEIGHT. A height would
   * need a predicted number that drifts with the layout. And it must be checked
   * at the NARROW width specifically: at the mount width the old code read
   * scale 1 and looked perfectly flush, which is exactly why this survived so
   * long. The scroll re-check matters for the same reason — `recomputeAllZones`
   * runs on scroll as well as layout, and used to reach the same wrong answer.
   *
   * ⚠ THE FLOOR IS NOT ZERO AND MUST NOT BE. `MIN_ZONE_HEIGHT` (80) lifts a very
   * short crop so it stays visible and clickable; at this width the canvas fits
   * in ~73px, so ~7px of deliberate remainder is correct. The bound is set well
   * under the 51.7px defect and well over the floor, so it can be passed only by
   * a real fix and not by the floor moving a little.
   */
  test('#1439 — narrowing with no override leaves only the MIN floor, not a double-shrink', async ({ page }) => {
    await boot(page)
    const wide = await measure(page)
    expect(wide.gap, 'flush at the mount width — the defect hid here').toBeLessThanOrEqual(2)

    const narrow = await atWidth(page, NARROW_COL)
    // Non-vacuous: the narrowing really did bind the height.
    expect(narrow.zoneH, 'the narrow width must actually have bound the zone')
      .toBeLessThan(wide.zoneH - 50)
    expect(narrow.gap, 'a no-override zone must not be scaled twice when narrowed')
      .toBeLessThan(20)

    // The scroll path reaches the same recompute and used to re-open it.
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(700)
    expect((await measure(page)).gap, 'and a scroll must not re-open it')
      .toBeLessThan(20)

    // Widening back was always correct — it must stay so.
    expect((await atWidth(page, WIDE_COL)).gap, 'still flush on the way back')
      .toBeLessThanOrEqual(2)
  })

  test('CONTROL — the fit-to-width path is flush, so "flush" is a reachable result', async ({ page }) => {
    // Without this, every arm above could be satisfied by a measurement that can
    // never read low. A zone with no override at its mount width is flush, and
    // stays flush after a width change and back.
    await boot(page)
    expect((await measure(page)).gap, 'flush at the mount width').toBeLessThanOrEqual(2)
    await atWidth(page, NARROW_COL)
    expect((await atWidth(page, WIDE_COL)).gap, 'and flush again after a round trip')
      .toBeLessThanOrEqual(2)
  })
})
