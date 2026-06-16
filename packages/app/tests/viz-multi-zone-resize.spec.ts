import { test, type Page } from '@playwright/test'

/**
 * Multi-zone diagnostic — does resizing ONE inline viz ($1 pitchwheel) affect
 * ANOTHER ($0 pianoroll)? And does pitchwheel adhere to its zone height?
 * Mirrors the default pattern.strudel (pianoroll $0 + pitchwheel $1), synth-only
 * so it evaluates headless (P146 drum-sample fail).
 *
 * Run: MULTIZONE=1 pnpm --filter @stave/app exec playwright test viz-multi-zone-resize.spec.ts --headed --timeout=120000 --workers=1 --retries=1
 */

test.use({ viewport: { width: 1400, height: 1300 } })
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// Faithful to the default pattern.strudel structure (multi-line stack blocks),
// synth-only so it evaluates headless (P146 drum-sample fail). $0 pianoroll,
// $1 pitchwheel, $2 wordfall.
const CODE = `setcps(130/240)
$: stack(
  note("c4 e4 g4 b4 c5 b4 g4 e4").s("sawtooth").gain(0.3).lpf(2400).release(0.12),
  note("e3 g3 b3 e4").s("sine").gain(0.15).release(0.3)
).viz("pianoroll")

$: note("<c2 [g2 c2] f2 [g2 eb2]>").s("square").gain(0.4).lpf(500).release(0.2).viz("pitchwheel")

$: stack(
  note("c5*8").s("triangle").gain(0.2),
  note("c3 c3").s("sawtooth").gain(0.3)
).viz("wordfall")`

async function setCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c)
  }, code)
  await page.waitForTimeout(150)
}
async function run(page: Page): Promise<void> {
  await page.locator('.monaco-editor').first().click()
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}
async function zones(page: Page, label: string) {
  const cw = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    return e?.getLayoutInfo?.()?.contentWidth ?? null
  })
  const z = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-viz-zone]')).map((el) => {
      const e = el as HTMLElement
      const c = e.querySelector('canvas')
      const handle = Array.from(e.children).find((k) => (k as HTMLElement).style?.cursor === 'row-resize') as HTMLElement | null
      const zr = e.getBoundingClientRect()
      const cr = c?.getBoundingClientRect()
      const hr = handle?.getBoundingClientRect()
      return {
        id: e.getAttribute('data-viz-zone-id'),
        track: e.getAttribute('data-viz-zone-track'),
        zoneH: Math.round(zr.height),
        canvasH: cr ? Math.round(cr.height) : null,
        barBelowCanvas: cr && hr ? Math.round(hr.top - cr.bottom) : null,
      }
    }),
  )
  // eslint-disable-next-line no-console
  console.log(`[${label}] contentW=${cw}`, JSON.stringify(z))
  return z
}

test('resize pitchwheel ($1) must not change pianoroll ($0)', async ({ page }) => {
  test.skip(!process.env.MULTIZONE, 'manual diagnostic — set MULTIZONE=1')
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    try {
      localStorage.setItem('stave:bottomPanel.open', 'false')
      // worker viz ON (the user's default) — exercise the OffscreenCanvas path.
    } catch { /* ignore */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
  await setCode(page, CODE)
  await run(page)

  await zones(page, 'mounted')

  // First RESIZE pianoroll ($0) to plant a height override (the user likely
  // tuned it before touching pitchwheel).
  const p0 = await page.evaluate(() => {
    const z = document.querySelectorAll('[data-viz-zone]')[0] as HTMLElement
    const r = z.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.bottom - 3 }
  })
  await page.mouse.move(p0.x, p0.y); await page.mouse.down()
  for (let i = 1; i <= 14; i++) { await page.mouse.move(p0.x, p0.y + Math.round((80 * i) / 14), { steps: 1 }); await page.waitForTimeout(16) }
  await page.mouse.up(); await page.waitForTimeout(200)
  const before = await zones(page, 'after resizing pianoroll ($0) taller (override planted)')

  // Drag the pitchwheel ($1 = 2nd zone) handle shorter by 100px.
  const drag = await page.evaluate(() => {
    const zs = Array.from(document.querySelectorAll('[data-viz-zone]'))
    const pw = zs[1] as HTMLElement | undefined
    if (!pw) return null
    const r = pw.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.bottom - 3 }
  })
  if (!drag) throw new Error('no pitchwheel zone')
  await page.mouse.move(drag.x, drag.y)
  await page.mouse.down()
  for (let i = 1; i <= 14; i++) { await page.mouse.move(drag.x, drag.y - Math.round((100 * i) / 14), { steps: 1 }); await page.waitForTimeout(16) }
  await page.mouse.up()
  await page.waitForTimeout(300)

  const after = await zones(page, 'after dragging pitchwheel ($1) shorter')
  await page.waitForTimeout(600)
  const after2 = await zones(page, 'after +600ms')

  // Verdict
  const p0before = before.find((z) => z.id === 'pianoroll')?.zoneH
  const p0after = after2.find((z) => z.id === 'pianoroll')?.zoneH
  // eslint-disable-next-line no-console
  console.log(`\n>>> pianoroll zoneH ${p0before} -> ${p0after} (should be UNCHANGED). pitchwheel barBelowCanvas after = ${after2.find((z) => z.id === 'pitchwheel')?.barBelowCanvas}`)
  await page.screenshot({ path: '/tmp/multi-zone-resize.png' })
  await page.waitForTimeout(1200)
})
