import { test, type Page } from '@playwright/test'

/**
 * Reproduce the USER's EXISTING project: a pitchwheel viz FILE whose content
 * still hardcodes createCanvas(300,200) (the pre-fix sketch). Bundled files seed
 * "when missing" only (#189), so existing projects never get the createCanvas fix.
 * Observe what the WORKER canvas reports to readCanvasNative so we can size the
 * zone content-independently.
 *
 * Run: PWSTALE=1 pnpm --filter @stave/app exec playwright test viz-pitchwheel-stale.spec.ts --headed --timeout=120000 --workers=1 --retries=2
 */

test.use({ viewport: { width: 1400, height: 1300 } })
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// The OLD pitchwheel sketch — hardcoded createCanvas(300,200).
const OLD_PITCHWHEEL = `function setup() { createCanvas(300, 200); pixelDensity(window.devicePixelRatio||1) }
function draw() { clear(); const sz=min(width,height); noFill(); stroke(120,180,255); circle(width/2,height/2,sz-24) }`

async function setCode(page: Page, code: string) {
  await page.evaluate((c) => (window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c), code)
  await page.waitForTimeout(150)
}
async function run(page: Page) {
  await page.locator('.monaco-editor').first().click()
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}

test('worker pitchwheel (stale createCanvas 300,200) — measure', async ({ page }) => {
  test.skip(!process.env.PWSTALE, 'manual diagnostic — set PWSTALE=1')
  await page.addInitScript(() => {
    ;(window as any).__STAVE_E2E__ = true
    try { localStorage.setItem('stave:bottomPanel.open', 'false') } catch { /* ignore */ }
  })
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
  // Register a pitchwheel named viz with the STALE code (no nativeSize → like an
  // existing user file). This shadows the built-in (named-viz precedence).
  await page.evaluate((code) => {
    ;(window as any).__staveRegisterViz?.({ id: 'pitchwheel', name: 'pitchwheel', renderer: 'p5', code, requires: ['streaming'], createdAt: 1, updatedAt: 1 })
  }, OLD_PITCHWHEEL)

  await setCode(page, `$: note("c4 e4 g4").s("sawtooth").gain(0.3).viz("pitchwheel")`)
  await page.locator('.monaco-editor').first().click()
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)

  // Timeline from the moment of eval: when does the worker canvas resize to 300×200?
  const timeline = await page.evaluate(async () => {
    const out: string[] = []
    for (let t = 0; t <= 3500; t += 100) {
      const z = document.querySelector('[data-viz-zone]') as HTMLElement | null
      const c = z?.querySelector('canvas') as HTMLCanvasElement | null
      out.push(`${t}ms off=${c?.offsetWidth}x${c?.offsetHeight} buf=${c?.width}x${c?.height} zone=${z ? Math.round(z.getBoundingClientRect().height) : '-'}`)
      await new Promise((r) => setTimeout(r, 100))
    }
    return out
  })
  // eslint-disable-next-line no-console
  console.log('[TIMELINE]\n' + timeline.filter((_, i) => i % 3 === 0 || timeline[i] !== timeline[i - 1]).join('\n'))

  const m = await page.evaluate(() => {
    const z = document.querySelector('[data-viz-zone]') as HTMLElement | null
    if (!z) return null
    const c = z.querySelector('canvas') as HTMLCanvasElement | null
    const wrap = z.querySelector('[data-viz-canvas-wrap]') as HTMLElement | null
    const handle = Array.from(z.children).find((k) => (k as HTMLElement).style?.cursor === 'row-resize') as HTMLElement | null
    return {
      dpr: window.devicePixelRatio,
      zoneH: Math.round(z.getBoundingClientRect().height),
      zoneStyleH: z.style.height,
      // what readCanvasNative READS (offsetWidth/offsetHeight):
      canvasOffsetW: c?.offsetWidth ?? null,
      canvasOffsetH: c?.offsetHeight ?? null,
      // the BUFFER (what the worker set = createCanvas × dpr):
      canvasBufferW: c?.width ?? null,
      canvasBufferH: c?.height ?? null,
      // the DISPLAYED box:
      canvasRectH: c ? Math.round(c.getBoundingClientRect().height) : null,
      canvasRectW: c ? Math.round(c.getBoundingClientRect().width) : null,
      wrapTransform: wrap?.style.transform ?? null,
      barBelowCanvas: c && handle ? Math.round(handle.getBoundingClientRect().top - c.getBoundingClientRect().bottom) : null,
    }
  })
  // eslint-disable-next-line no-console
  console.log('[STALE PITCHWHEEL WORKER]', JSON.stringify(m, null, 2))
  await page.waitForTimeout(1000)
})
