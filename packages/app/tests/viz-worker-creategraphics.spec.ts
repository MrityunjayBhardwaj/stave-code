/**
 * #308 RED REPRO + GENERALIZED GATE — user p5 `createGraphics()` in the worker.
 *
 * #306/PR#307 fixed the BUILT-IN spectrum by hand (own a raw OffscreenCanvas).
 * But the idiomatic p5 way to own a cross-frame buffer is `createGraphics()`, and
 * it THROWS in the worker: p5's `createGraphics` does `args[0] instanceof
 * HTMLCanvasElement` (rendering-CC8JNTwG.js:21561), and the worker DOM shim never
 * defines `HTMLCanvasElement` — so `x instanceof undefined` raises a TypeError at
 * the call site. A correct-on-main sketch renders BLANK in the worker with no
 * author signal (P126/PV94; the `viz.worker:1` gauge still lights).
 *
 * Verdict = COMPOSITOR pixel coverage over a musical cycle (PV90/PV94 — never the
 * worker canvas buffer, never the gauge). The sketch is identical on both paths,
 * so worker-vs-main is the controlled comparison. The HTMLCanvasElement worker
 * shim (dom-shim.ts) makes both light identically; this gate guards that fix —
 * before it, the worker was blank (peakLit 0.0098 + "HTMLCanvasElement is not
 * defined"), after it both read ~0.79.
 *
 * Run: E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test \
 *        viz-worker-creategraphics.spec.ts --timeout=300000 --workers=1
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const AUDIO = `$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`

// Idiomatic p5 feedback: own a persistent p5.Graphics buffer, paint it, blit it to
// the main canvas. Fills the WHOLE canvas with bright bars when it works → lit≈1;
// if `createGraphics()` throws (worker, no shim) `pg` is undefined → only the
// `background(0)` survives → lit≈0. A wide, unambiguous painted-vs-blank split.
// `createGraphics()` is the ONLY worker-hostile call — everything else is plain p5.
const CG_SKETCH = `let pg
function setup(){ createCanvas(stave.width, stave.height); pixelDensity(1); pg = createGraphics(width, height) }
function draw(){
  background(0)
  pg.background(20, 0, 40)
  pg.noStroke()
  for(let i=0;i<24;i++){ pg.fill(80 + i*6, 200, 255 - i*4); pg.rect((i/24)*width, 0, width/24 + 1, height) }
  image(pg, 0, 0)
}`

async function boot(page: Page, worker: boolean): Promise<string[]> {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.addInitScript((w) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_PERF__ = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    try {
      localStorage.setItem('stave.viz.worker', w ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, worker)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  return errors
}

async function registerSketch(page: Page): Promise<void> {
  await page.evaluate((code) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__staveRegisterViz?.({
      id: 'cgtest',
      name: 'cgtest',
      renderer: 'p5',
      code,
      requires: ['streaming'],
      nativeSize: { w: 600, h: 300 },
      createdAt: 1,
      updatedAt: 1,
    })
  }, CG_SKETCH)
}

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok, 'monaco editor present').toBe(true)
  await page.waitForTimeout(200)
}

async function run(page: Page): Promise<void> {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}

async function gauges(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (window as any).__stavePerf?.snapshot?.()
    return s?.gauges ?? {}
  })
}

/**
 * Worker viz errors are swallowed by p5's lifecycle wrap and forwarded via
 * `vizlog` into the MAIN engineLog (hostP5Worker.ts:142-159) — never console.
 * `__staveGetLog` (StaveApp.tsx:444) is the main-thread history.
 */
async function vizErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const log = (window as any).__staveGetLog?.() ?? []
    return log
      .filter((e: { level?: string }) => e?.level === 'error')
      .map((e: { message?: string }) => String(e?.message ?? ''))
  })
}

/** Fraction (0..1) of clip pixels differing from the top-left corner background. */
async function litFraction(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
  thresh = 48,
): Promise<number> {
  const png = await page.screenshot({ clip }).catch(() => Buffer.from([]))
  if (png.length === 0) return 0
  const b64 = png.toString('base64')
  return page.evaluate(
    async ({ data, threshold }) => {
      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('decode failed'))
        img.src = `data:image/png;base64,${data}`
      })
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const px = ctx.getImageData(0, 0, c.width, c.height).data
      const br = px[0]
      const bg = px[1]
      const bb = px[2]
      let lit = 0
      const total = c.width * c.height
      for (let i = 0; i < px.length; i += 4) {
        const d = Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg) + Math.abs(px[i + 2] - bb)
        if (d > threshold) lit++
      }
      return total === 0 ? 0 : lit / total
    },
    { data: b64, threshold: thresh },
  )
}

async function canvasClip(page: Page) {
  const box = await page.locator('[data-viz-zone] canvas').first().boundingBox()
  if (!box) return null
  return {
    x: box.x + 4,
    y: box.y + 4,
    width: Math.max(20, box.width - 8),
    height: Math.max(20, box.height - 8),
  }
}

/** Peak lit fraction over `n` compositor frames spanning > one musical cycle. */
async function peakLit(page: Page, n: number, gapMs: number): Promise<number> {
  const clip = await canvasClip(page)
  if (!clip) return 0
  let peak = 0
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, await litFraction(page, clip))
    if (i < n - 1) await page.waitForTimeout(gapMs)
  }
  return peak
}

test.describe('#308 — user createGraphics() in the worker', () => {
  test.skip(!process.env.E2E_VERIFY, 'set E2E_VERIFY=1 to run (drives the live worker path)')

  // CONTROL: identical sketch on the main thread MUST render — proves the sketch
  // is valid and isolates any worker blank to the shim, not the sketch.
  test('main thread — createGraphics feedback sketch paints (control)', async ({ page }) => {
    await boot(page, false)
    await registerSketch(page)
    await setCode(page, `${AUDIO}.viz('cgtest')`)
    await run(page)
    await page.waitForTimeout(2000)

    const g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[cg main] gauges=${JSON.stringify(g)}`)
    const peak = await peakLit(page, 10, 220)
    // eslint-disable-next-line no-console
    console.log(`[cg main] peakLitFraction=${peak.toFixed(4)}`)
    // The bright bars fill the whole canvas — a working buffer lights most of it.
    expect(peak, 'createGraphics sketch paints on the main thread').toBeGreaterThan(0.15)
  })

  // THE FIX (#308): same sketch in the worker. The HTMLCanvasElement shim makes
  // createGraphics() resolve; without it this is blank (ReferenceError in setup()).
  test('worker — createGraphics feedback sketch paints (the shim works)', async ({ page }) => {
    await boot(page, true)
    await registerSketch(page)
    await setCode(page, `${AUDIO}.viz('cgtest')`)
    await run(page)
    await page.waitForTimeout(2500)

    const g = await gauges(page)
    // eslint-disable-next-line no-console
    console.log(`[cg worker] gauges=${JSON.stringify(g)}`)
    const peak = await peakLit(page, 12, 220)
    const errs = await vizErrors(page)
    const hce = errs.filter((e) => /HTMLCanvasElement|createGraphics|is not defined/i.test(e))
    // eslint-disable-next-line no-console
    console.log(`[cg worker] peakLitFraction=${peak.toFixed(4)} viz-errors=${JSON.stringify(hce.slice(0, 3))}`)

    expect(peak, 'createGraphics sketch paints in the worker (needs the shim)').toBeGreaterThan(0.15)
  })
})
