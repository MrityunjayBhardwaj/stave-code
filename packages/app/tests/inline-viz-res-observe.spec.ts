/**
 * OBSERVE (#261 follow-up) — the inline-viz-resolution setting changes the canvas
 * RENDER backing store while leaving the DISPLAY zone height unchanged. Sets
 * localStorage 'stave:inlineVizResolution' (what getInlineVizResolution reads)
 * before load, mounts ONE inline viz, and reads: (a) canvas backing store
 * (canvas.width/height) — should scale with the resolution; (b) the zone/display
 * height — should be IDENTICAL across resolutions (layout uses native, not res).
 *
 * Run: REACT=1 pnpm --filter @stave/app exec playwright test inline-viz-res-observe.spec.ts --timeout=240000 --workers=1
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const SYNTHWAVE = `function setup(){ createCanvas(stave.width, stave.height, WEBGL) }
function draw(){
  background(12,6,28)
  stroke(255,40,200); strokeWeight(2); noFill()
  const ROWS=30, COLS=50
  for(let r=0;r<ROWS;r++){ beginShape()
    for(let c=0;c<=COLS;c++){ const fi=(c*3+r)%sig.fft.length; vertex(-width/2+(c/COLS)*width, -height/2+(sig.fft[fi]||0)*200) }
    endShape() }
}`

async function press(page: Page, key: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(key)
}

async function measure(page: Page, res: number): Promise<{ backing: { w: number; h: number }; display: { w: number; h: number }; zoneH: number }> {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.addInitScript((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_PERF__ = true; (window as any).__STAVE_E2E__ = true
    try { localStorage.setItem('stave.viz.worker', '1'); localStorage.setItem('stave:inlineVizResolution', String(r)) } catch { /* */ }
  }, res)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.evaluate((code) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__staveRegisterViz?.({ id: 'swr', name: 'swr', renderer: 'p5', code, requires: ['streaming'], nativeSize: { w: 1100, h: 200 }, createdAt: 1, updatedAt: 1 })
  }, SYNTHWAVE)
  await press(page, `${MOD}+Period`); await page.waitForTimeout(500)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(`$: note("c2 e2 g2 c3").s("sawtooth").viz('swr')`)
  })
  await page.waitForTimeout(300)
  await press(page, `${MOD}+Enter`)
  // Poll for the viz canvas to mount with a non-zero backing store (cold first
  // run can take several seconds to compile) — up to ~15s.
  await page.waitForFunction(() => {
    const z = document.querySelector('[data-viz-zone]') as HTMLElement | null
    const c = z?.querySelector('canvas') as HTMLCanvasElement | null
    return !!c && c.width > 0 && (z?.offsetHeight ?? 0) > 0
  }, { timeout: 15000 }).catch(() => { /* fall through; measurement will show zeros */ })
  await page.waitForTimeout(500)
  return await page.evaluate(() => {
    const zone = document.querySelector('[data-viz-zone]') as HTMLElement | null
    const canvas = zone?.querySelector('canvas') as HTMLCanvasElement | null
    return {
      backing: { w: canvas?.width ?? 0, h: canvas?.height ?? 0 },
      display: { w: canvas?.offsetWidth ?? 0, h: canvas?.offsetHeight ?? 0 },
      zoneH: zone?.offsetHeight ?? 0,
    }
  })
}

test.describe('inline viz resolution (#261)', () => {
  test.skip(!process.env.REACT, 'observation — set REACT=1')
  test('render backing scales with resolution; display zone height unchanged', async ({ browser }) => {
    const c1 = await browser.newContext(); const lo = await measure(await c1.newPage(), 256); await c1.close()
    const c2 = await browser.newContext(); const hi = await measure(await c2.newPage(), 1024); await c2.close()
    // eslint-disable-next-line no-console
    console.log(`[res 256]  backing=${JSON.stringify(lo.backing)} display=${JSON.stringify(lo.display)} zoneH=${lo.zoneH}`)
    // eslint-disable-next-line no-console
    console.log(`[res 1024] backing=${JSON.stringify(hi.backing)} display=${JSON.stringify(hi.display)} zoneH=${hi.zoneH}`)
    // Backing store HEIGHT must scale with the resolution (256 → 1024 = 4×).
    expect(hi.backing.h).toBeGreaterThan(lo.backing.h * 2)
    // Display zone height must be ~unchanged (driven by native aspect, not res).
    expect(Math.abs(hi.zoneH - lo.zoneH)).toBeLessThanOrEqual(8)
  })
})
