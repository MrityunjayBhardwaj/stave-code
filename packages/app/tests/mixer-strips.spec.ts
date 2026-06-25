/**
 * Mixer channel-strip row — S0 (#540). Read-only projection: one strip per
 * top-level statement, cursor-independent, with name / source / pan / gain
 * readouts derived purely from the document.
 *
 * The strip band shares the Pattern ▸ Mixer column with the #381 param panel,
 * which keeps priority in a short drawer — so these assert the strips' presence
 * and content in the DOM (always rendered, scrollable) rather than fixed screen
 * coordinates.
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
  await page.waitForTimeout(150)
}

async function openMixer(page: Page) {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

/** drag the drawer taller so the full strip (incl. fader) is on screen */
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

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue: () => string } | null }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; trigger: (s: string, id: string, p: unknown) => void }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.trigger('test', 'undo', null)
  })
  await page.waitForTimeout(60)
}

/** vertical drag on a strip's fader by `dyUp` pixels (up = louder) */
async function dragFader(page: Page, drawer: ReturnType<Page['locator']>, stripId: string, dyUp: number): Promise<void> {
  const fader = drawer.locator(`[data-mixer-strip-id="${stripId}"] [data-mixer-strip-fader]`)
  const box = await fader.boundingBox()
  if (!box) throw new Error(`no fader box for ${stripId}`)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy - dyUp, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(80)
}

test.describe('Mixer strip row (#540 / S0)', () => {
  test('renders one strip per top-level statement, in source order', async ({ page }) => {
    await boot(page)
    await setStrudelCode(
      page,
      ['$: s("bd sn")', 'd1: note("c e g").sound("piano")', '$: s("hh*4")'].join('\n'),
    )
    const drawer = await openMixer(page)
    const strips = drawer.locator('[data-mixer-strip]')
    await expect(strips).toHaveCount(3)
    // names: anonymous $: fall back to head/source; the named track keeps its label
    await expect(strips.nth(1).locator('[data-mixer-strip-name]')).toHaveText('d1')
    await expect(strips.nth(1).locator('[data-mixer-strip-source]')).toContainText('note("c e g")')
    // kinds projected from the head fn
    await expect(strips.nth(0)).toHaveAttribute('data-mixer-strip-kind', 'step')
    await expect(strips.nth(1)).toHaveAttribute('data-mixer-strip-kind', 'roll')
  })

  test('reads gain as a dB fader readout, pan as L/C/R', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").gain(1).pan(0.8)')
    const drawer = await openMixer(page)
    const strip = drawer.locator('[data-mixer-strip]').first()
    await expect(strip.locator('[data-mixer-strip-db]')).toHaveText('0.0') // gain 1 = 0 dB
    await expect(strip.locator('[data-mixer-strip-pan]')).toHaveText('R60') // 0.8 → R60
  })

  test('hands off a signal gain (fader disabled, shown as "sig")', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").gain(sine)')
    const drawer = await openMixer(page)
    const strip = drawer.locator('[data-mixer-strip]').first()
    await expect(strip.locator('[data-mixer-strip-gain]')).toHaveText('sig')
  })

  test('re-derives the strip list when the document changes (pure projection)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd")')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-mixer-strip]')).toHaveCount(1)
    await setStrudelCode(page, '$: s("bd")\n$: s("hh")\nd1: note("c e")')
    await expect(drawer.locator('[data-mixer-strip]')).toHaveCount(3)
  })
})

test.describe('Mixer strip write-back (#540 / S1)', () => {
  test('dragging a fader sets that track gain; siblings byte-identical; one undo', async ({ page }) => {
    await boot(page)
    const original = '$: s("bd").gain(0.5)\nd1: note("c e").gain(0.8)\n$: s("hh*4").gain(0.5)'
    await setStrudelCode(page, original)
    const drawer = await openMixer(page)
    await enlargeDrawer(page)

    // drag the SECOND anonymous strip ($1 = the hh*4 line) up → louder
    await dragFader(page, drawer, '$1', 40)
    const after = await strudelValue(page)
    const lines = after.split('\n')
    // only the third line changed; lines 0 and 1 are byte-identical
    expect(lines[0]).toBe('$: s("bd").gain(0.5)')
    expect(lines[1]).toBe('d1: note("c e").gain(0.8)')
    const m = lines[2].match(/^\$: s\("hh\*4"\)\.gain\((\d*\.?\d+)\)$/)
    expect(m, `unexpected line: ${lines[2]}`).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(0.5)

    // one undo reverts the whole drag
    await undo(page)
    expect(await strudelValue(page)).toBe(original)
  })

  test('dragging a fader on a track with no .gain inserts one', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd")')
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    await dragFader(page, drawer, '$0', 30)
    expect(await strudelValue(page)).toMatch(/^\$: s\("bd"\)\.gain\(\d*\.?\d+\)$/)
  })

  test('a managed velocity gain rescales proportionally (ceiling-anchored)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd sn").gain("0.5 1")')
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    await dragFader(page, drawer, '$0', -30) // drag DOWN → quieter
    const after = await strudelValue(page)
    const m = after.match(/gain\("([\d.]+) ([\d.]+)"\)/)
    expect(m, `unexpected: ${after}`).not.toBeNull()
    const [a, b] = [Number(m![1]), Number(m![2])]
    expect(b).toBeLessThan(1) // ceiling came down
    expect(a / b).toBeCloseTo(0.5, 2) // shape (0.5 : 1) preserved
  })

  test('dragging pan writes .pan', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd")')
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    const pan = drawer.locator('[data-mixer-strip-id="$0"] [data-mixer-strip-pan-control]')
    const box = await pan.boundingBox()
    if (!box) throw new Error('no pan box')
    const cy = box.y + box.height / 2
    await page.mouse.move(box.x + box.width / 2, cy)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 40, cy, { steps: 8 }) // drag right → R
    await page.mouse.up()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toMatch(/^\$: s\("bd"\)\.pan\(0\.[5-9]\d*\)$/)
  })

  test('a signal .gain stays read-only (drag is a no-op)', async ({ page }) => {
    await boot(page)
    const original = '$: s("bd").gain(sine)'
    await setStrudelCode(page, original)
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    await dragFader(page, drawer, '$0', 40)
    expect(await strudelValue(page)).toBe(original)
  })
})
