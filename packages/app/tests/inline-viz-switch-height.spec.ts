/**
 * #1433 Part 1 — a zone height sized for one viz does not survive a switch to another.
 *
 * Height overrides were stored without a `vizId`, so `pruneZoneOverrides` — which
 * drops an override whose viz has changed, and has always done so for crops —
 * had nothing to match on. A height chosen for a square viz survived the switch
 * to a wide one and the zone stayed at the square's size, leaving empty space
 * under the canvas with the resize bar floating at the bottom of it.
 *
 * ─── WHY THE FIXTURE PADS THE BLOCK ────────────────────────────────────────────
 * `ZoneOverride` also carries a `contentHash` — the block's first ~120 characters
 * — and prune drops an override when that changes. Switching `.viz("a")` to
 * `.viz("b")` normally changes the hash too, so a spec that put the call early in
 * the block would pass on the hash arm and prove nothing about the stamp. The
 * fixture pushes the `.viz()` call PAST the 120-char window with a comment line,
 * so the hash is byte-identical either side of the switch and the vizId stamp is
 * the only thing that can prune. The spec asserts that identity rather than
 * trusting it.
 *
 * ─── DIRECTION MATTERS ─────────────────────────────────────────────────────────
 * square → wide is the direction that SHOWS: a square is height-bound and fills
 * whatever it is given, so a stale height looks fine going the other way. The
 * defect is the surviving override; the gap is only how it happens to surface.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

/** Long enough that the `.viz()` call below it lands past the hash window. */
const PAD = '// ' + 'x'.repeat(130)

const SQUARE = `function setup(){ createCanvas(stave.width, stave.height) }
function draw(){ background(6,28,12); noStroke(); fill(40,255,200); rect(0,0,width,height) }`
const WIDE = `function setup(){ createCanvas(stave.width, stave.height) }
function draw(){ background(12,6,28); noStroke(); fill(255,40,200); rect(0,0,width,height) }`

const docFor = (viz: string): string =>
  `$: note("c2 e2 g2 c3").s("sawtooth")\n${PAD}\n  .viz('${viz}')`

async function boot(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.addInitScript(() => {
    ;(window as unknown as { __STAVE_E2E__?: boolean }).__STAVE_E2E__ = true
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(2000)
  await page.evaluate(({ sq, wd }) => {
    const reg = (window as unknown as {
      __staveRegisterViz?: (v: Record<string, unknown>) => void
    }).__staveRegisterViz
    reg?.({ id: 'sqviz', name: 'sqviz', renderer: 'p5', code: sq, requires: ['streaming'], nativeSize: { w: 400, h: 400 }, createdAt: 1, updatedAt: 1 })
    reg?.({ id: 'wdviz', name: 'wdviz', renderer: 'p5', code: wd, requires: ['streaming'], nativeSize: { w: 1100, h: 200 }, createdAt: 1, updatedAt: 1 })
  }, { sq: SQUARE, wd: WIDE })
  await page.waitForTimeout(500)
}

async function evaluateDoc(page: Page, doc: string): Promise<void> {
  await page.evaluate((code) => {
    ;(window as unknown as {
      monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { setValue: (v: string) => void } | null }> } }
    }).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(code)
  }, doc)
  await page.waitForTimeout(300)
  // Focus by real gesture — a programmatic focus carries no user gesture (#885).
  await page.locator('.monaco-editor').first().click({ position: { x: 40, y: 10 } })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForFunction(() => {
    const z = document.querySelector('[data-viz-zone]') as HTMLElement | null
    const w = z?.querySelector('[data-viz-canvas-wrap]') as HTMLElement | null
    return !!w && w.getBoundingClientRect().height > 0
  }, { timeout: 20000 })
  await page.waitForTimeout(800)
}

async function measure(page: Page): Promise<{ zoneH: number; gap: number; vizId: string }> {
  return page.evaluate(() => {
    const zone = document.querySelector('[data-viz-zone]') as HTMLElement | null
    const wrap = zone?.querySelector('[data-viz-canvas-wrap]') as HTMLElement | null
    const zh = zone?.getBoundingClientRect().height ?? 0
    const wh = wrap?.getBoundingClientRect().height ?? 0
    return {
      zoneH: Math.round(zh * 10) / 10,
      gap: Math.round((zh - wh) * 10) / 10,
      vizId: zone?.getAttribute('data-viz-zone-id') ?? '',
    }
  })
}

/** Drag the zone's bottom resize strip by `dy` px. */
async function drag(page: Page, dy: number): Promise<void> {
  const at = await page.evaluate(() => {
    const r = document.querySelector('[data-viz-zone]')?.getBoundingClientRect()
    return r ? { x: r.x + r.width / 2, y: r.bottom - 3 } : null
  })
  expect(at).not.toBeNull()
  await page.mouse.move(at!.x, at!.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(at!.x, at!.y + (dy * i) / 8)
    await page.waitForTimeout(20)
  }
  await page.mouse.up()
  await page.waitForTimeout(500)
}

test.describe('#1433 — a height sized for one viz does not survive a switch', () => {
  test('switching square → wide drops the stale height and the canvas fills the zone', async ({ page }) => {
    await boot(page)

    // The fixture's premise, asserted rather than assumed: both blocks hash the
    // same, so only the vizId stamp can prune. If this ever stops holding, the
    // arm below would pass for the wrong reason and this line says so first.
    const hash = await page.evaluate(({ a, b }) => {
      const norm = (s: string) => s.split('\n').join(' ').replace(/\s+/g, ' ').trim().slice(0, 120)
      return { same: norm(a) === norm(b), a: norm(a) }
    }, { a: docFor('sqviz'), b: docFor('wdviz') })
    expect(hash.same, 'the fixture must hash identically either side of the switch').toBe(true)
    expect(hash.a, 'and the .viz() call must sit PAST the hash window').not.toContain('.viz(')

    await evaluateDoc(page, docFor('sqviz'))
    const square = await measure(page)
    expect(square.vizId).toBe('sqviz')
    expect(square.gap, 'the square should fill its zone to begin with').toBeLessThanOrEqual(2)

    // Give the square a height the wide viz could not possibly want. SHORTER,
    // not taller: a 400x400 native in a ~1043px column computes past
    // MAX_ZONE_HEIGHT and is already clamped to it, so there is no room to drag
    // down. Shrinking still leaves a height far above the wide viz's ~190px fit,
    // which is what has to be pruned.
    await drag(page, -150)
    const dragged = await measure(page)
    expect(dragged.zoneH, 'the drag must actually have taken').toBeLessThan(square.zoneH - 20)
    expect(dragged.zoneH, 'and must stay well clear of the wide fit height, or there is nothing to see')
      .toBeGreaterThan(300)

    await evaluateDoc(page, docFor('wdviz'))
    const wide = await measure(page)

    expect(wide.vizId, 'the zone must now be the wide viz').toBe('wdviz')
    expect(wide.gap, 'no empty space between the canvas and the resize bar').toBeLessThanOrEqual(2)
    expect(wide.zoneH, 'and the stale height must be gone').toBeLessThan(dragged.zoneH - 20)
  })

  test('CONTROL — re-evaluating the SAME viz keeps the height the user chose', async ({ page }) => {
    // Prune runs on every evaluate. A stamp that dropped the height each time
    // would pass the arm above by deleting drag-to-resize altogether.
    await boot(page)
    await evaluateDoc(page, docFor('wdviz'))
    const base = await measure(page)

    // SHORTER, not taller. A `.viz()` canvas is width-bound, so dragging past
    // the fit-to-width height is a no-op by design (#1433 Part 2) — a taller
    // drag here would assert the old behaviour and go red on the fix.
    await drag(page, -60)
    const dragged = await measure(page)
    expect(dragged.zoneH, 'the drag must have taken').toBeLessThan(base.zoneH - 20)
    expect(dragged.zoneH, 'and must clear MIN_ZONE_HEIGHT, or the clamp is what we would be pinning')
      .toBeGreaterThan(80)

    await evaluateDoc(page, docFor('wdviz'))
    const again = await measure(page)
    expect(again.zoneH, 'a re-evaluate must not undo the resize').toBeCloseTo(dragged.zoneH, -1)
  })
})
