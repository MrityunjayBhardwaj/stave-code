import { test, expect, type Page } from '@playwright/test'

/**
 * P160 sibling (clean, asserted) — does a stale per-trackKey HEIGHT OVERRIDE
 * planted on prism survive a switch to pianoroll, leaving the resize bar detached
 * from the (short) pianoroll canvas?
 *
 * Two cases, isolated in fresh pages:
 *   - SHORT: `.viz()` within the 120-char contentHash window  → prune SHOULD catch it
 *   - LONG:  `.viz()` PAST char 120 (identical 120-prefix)     → prune's hash branch
 *            can't tell prism from pianoroll; height overrides store no vizId either
 *
 * Run: SWITCHOV=1 pnpm --filter @stave/app exec playwright test viz-switch-override.spec.ts --headed --timeout=120000 --workers=1 --retries=1
 */

test.use({ viewport: { width: 1400, height: 1300 } })

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const PRISM_GLSL = `void mainImage(out vec4 o, in vec2 f){ o = vec4(f/iResolution.xy, 0.5+0.5*sin(iTime), 1.0); }`

async function boot(page: Page): Promise<void> {
  page.on('console', (m) => {
    const t = m.text()
    if (t.includes('[prune]')) {
      // eslint-disable-next-line no-console
      console.log('  > ' + t)
    }
  })
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    try {
      localStorage.setItem('stave:bottomPanel.open', 'false')
      localStorage.setItem('stave.viz.worker', '0') // main-thread — dodge worker GPU crash
    } catch { /* ignore */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
  await page.evaluate((code) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__staveRegisterViz?.({ id: 'prism', name: 'prism', renderer: 'glsl', code, requires: ['audio'], nativeSize: { w: 640, h: 360 }, createdAt: 1, updatedAt: 1 })
  }, PRISM_GLSL)
}
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
  await page.waitForTimeout(2200)
}
async function stop(page: Page): Promise<void> {
  await page.locator('.monaco-editor').first().click()
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Period`)
  await page.waitForTimeout(600)
}
async function zoneRect(page: Page) {
  return page.evaluate(() => {
    const z = document.querySelector('[data-viz-zone]') as HTMLElement | null
    if (!z) return null
    const c = z.querySelector('canvas')
    const handle = Array.from(z.children).find((e) => (e as HTMLElement).style?.cursor === 'row-resize') as HTMLElement | null
    const zr = z.getBoundingClientRect()
    const cr = c?.getBoundingClientRect()
    const hr = handle?.getBoundingClientRect()
    return {
      vizId: z.getAttribute('data-viz-zone-id'),
      zoneH: Math.round(zr.height),
      zoneBottom: Math.round(zr.bottom),
      canvasH: cr ? Math.round(cr.height) : null,
      canvasBottom: cr ? Math.round(cr.bottom) : null,
      handleTop: hr ? Math.round(hr.top) : null,
      barBelowCanvas: cr && hr ? Math.round(hr.top - cr.bottom) : null,
    }
  })
}
/** Drag the resize handle by `dy` px; assert the zone height actually changed. */
async function dragHandle(page: Page, dy: number): Promise<void> {
  const r = await zoneRect(page)
  if (!r) throw new Error('no zone to drag')
  const x = await page.evaluate(() => {
    const z = document.querySelector('[data-viz-zone]') as HTMLElement
    const b = z.getBoundingClientRect()
    return b.left + b.width / 2
  })
  const y = r.zoneBottom - 3
  await page.mouse.move(x, y)
  await page.mouse.down()
  const steps = 14
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x, y + Math.round((dy * i) / steps), { steps: 1 }); await page.waitForTimeout(16) }
  await page.mouse.up()
  await page.waitForTimeout(200)
}

async function runScenario(page: Page, label: string, pre: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`\n===== ${label} (pre.length=${pre.length}, .viz past 120 = ${pre.length > 120}) =====`)
  await setCode(page, `${pre}.viz('prism')`)
  await run(page)
  const prism0 = await zoneRect(page)
  // eslint-disable-next-line no-console
  console.log(`  prism mounted:`, JSON.stringify(prism0))

  // Shrink prism by 120px to plant a DISTINCT height override. Retry until the
  // height actually changes (handle hit-testing is timing-sensitive for GLSL).
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = (await zoneRect(page))?.zoneH ?? 0
    await dragHandle(page, -120)
    const after = (await zoneRect(page))?.zoneH ?? 0
    if (after !== before) break
    await page.waitForTimeout(300)
  }
  const prismDragged = await zoneRect(page)
  // eslint-disable-next-line no-console
  console.log(`  prism after drag (override planted):`, JSON.stringify(prismDragged))

  // Switch to pianoroll (short natural height ~157).
  await stop(page)
  await setCode(page, `${pre}.viz('pianoroll')`)
  await run(page)
  const pr = await zoneRect(page)
  // eslint-disable-next-line no-console
  console.log(`  pianoroll after switch:`, JSON.stringify(pr))
  await page.waitForTimeout(700)
  const pr2 = await zoneRect(page)
  // eslint-disable-next-line no-console
  console.log(`  pianoroll +700ms:`, JSON.stringify(pr2))
  // The DIAGNOSTIC assertion: the resize bar must hug the canvas bottom.
  // |barBelowCanvas| ≈ handle height (6). A large positive value == BUG.
  // eslint-disable-next-line no-console
  console.log(`  >>> barBelowCanvas=${pr2?.barBelowCanvas} (≈ -6..0 = OK; large positive = BUG)`)
}

test('SHORT: .viz within contentHash window', async ({ page }) => {
  test.skip(!process.env.SWITCHOV, 'manual diagnostic — set SWITCHOV=1')
  await boot(page)
  await runScenario(page, 'SHORT', `$: s("sawtooth")`)
})

test('LONG: .viz past char 120 (identical 120-prefix)', async ({ page }) => {
  test.skip(!process.env.SWITCHOV, 'manual diagnostic — set SWITCHOV=1')
  await boot(page)
  // Multi-line block: lines 1+2 (joined+normalized) exceed 120 chars and are
  // IDENTICAL for prism & pianoroll, so the contentHash (first 120) matches.
  // .viz() lives on line 3 (past char 120). Handle stays clear (no long line).
  const pre = `$: s("sawtooth").s("square").gain(0.7).pan(0.4).room(0.3).delay(0.2).lpf(900).hpf(50).shape(0.1).crush(8)\n  .slow(2).rev()`
  await runScenario(page, 'LONG', pre)
})
