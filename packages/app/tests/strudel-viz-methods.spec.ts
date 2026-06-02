import { test, expect, type Page } from '@playwright/test'

// Strudel-official viz methods (#174). Pasted Strudel viz code must work
// out of the gate, mirroring Strudel's inline-vs-fullscreen semantic:
//   - `._name()` (underscore) → inline viz zone
//   - `.name()`  (non-underscore) → Stave backdrop ("set bg") + UI update
// and NEVER strudel's own fullscreen `#test-canvas` (which Stave doesn't load).

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function runCode(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1000)
})

test('non-underscore .scope() pins the backdrop and updates the "set bg" indicator', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))

  await setCode(page, `$: note("c e g").s("sawtooth").scope()`)
  await runCode(page)

  const bgIndicator = page.locator('[data-pinned]')
  await expect(bgIndicator).toHaveAttribute('data-pinned', 'true', { timeout: 6000 })
  await expect(bgIndicator).toContainText(/bg:.*scope/i)
  await expect(page.locator('[data-workspace-background]')).toHaveCount(1)
  // strudel's own fullscreen canvas must NOT be injected
  expect(await page.locator('canvas#test-canvas').count()).toBe(0)
  expect(errors).toEqual([])
})

test('non-underscore .pianoroll() resolves to "Piano Roll.p5" via normalized basename', async ({ page }) => {
  await setCode(page, `$: note("c e g").s("sawtooth").pianoroll()`)
  await runCode(page)
  const bgIndicator = page.locator('[data-pinned]')
  await expect(bgIndicator).toHaveAttribute('data-pinned', 'true', { timeout: 6000 })
  await expect(bgIndicator).toContainText(/bg:.*piano/i)
})

test('backdrop .pianoroll({ opts }) threads options to the backdrop sketch (#214)', async ({ page }) => {
  // Non-underscore .pianoroll(opts) pins a backdrop that renders through
  // compiledVizProvider (not viewZones). Its options live in
  // inlineViz.backdropRequest.options and must reach the renderer's component
  // bag → stave.options. A custom `background` only paints if they do —
  // frame-independent, like the inline #215 check.
  const redFrac = async () =>
    page.locator('[data-workspace-background] canvas').first().evaluate((el) => {
      const c = el as HTMLCanvasElement
      const ctx = c.getContext('2d'); if (!ctx) return -1
      const d = ctx.getImageData(0, 0, c.width, c.height).data
      let red = 0, total = 0
      for (let i = 0; i < d.length; i += 4) { total++; if (d[i] > 120 && d[i + 1] < 80 && d[i + 2] < 90) red++ }
      return total ? red / total : -1
    })

  await setCode(page, `$: note("c4 e4 g4 c5").s("sawtooth").pianoroll({ background: '#cc1133' })`)
  await runCode(page)
  await page.locator('[data-workspace-background] canvas').first().waitFor({ timeout: 8000 })
  await expect.poll(redFrac, { timeout: 6000 }).toBeGreaterThan(0.4)

  // Control: no option → the (transparent) default backdrop is not red.
  await setCode(page, `$: note("c4 e4 g4 c5").s("sawtooth").pianoroll()`)
  await page.keyboard.press(`${MOD}+.`)
  await page.waitForTimeout(500)
  await runCode(page)
  await expect.poll(redFrac, { timeout: 6000 }).toBeLessThan(0.05)
})

test('removing the non-underscore method clears the backdrop (code is source of truth)', async ({ page }) => {
  await setCode(page, `$: note("c e g").s("sawtooth").scope()`)
  await runCode(page)
  await expect(page.locator('[data-pinned]')).toHaveAttribute('data-pinned', 'true', { timeout: 6000 })

  // Remove the .scope() call. Manual Ctrl+Enter while playing is a no-op
  // in this codebase (re-eval comes from live mode or stop+play), so force
  // a fresh evaluate via stop+play to verify the clear semantic.
  await setCode(page, `$: note("c e g").s("sawtooth")`)
  await page.keyboard.press(`${MOD}+.`) // stop
  await page.waitForTimeout(500)
  await runCode(page) // play → fresh eval
  await expect(page.locator('[data-pinned]')).toHaveAttribute('data-pinned', 'false', { timeout: 6000 })
})

test('underscore ._punchcard() and ._tscope() render inline with no error and no fullscreen canvas', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))

  await setCode(page, `$: note("c e g").s("sawtooth")._punchcard()\n$: s("hh*8")._tscope()`)
  await runCode(page)

  expect(await page.locator('canvas#test-canvas').count()).toBe(0)
  // underscore forms are inline only — they must NOT pin the backdrop
  await expect(page.locator('[data-pinned]')).toHaveAttribute('data-pinned', 'false')
  expect(errors).toEqual([])
})

test('inline pianoroll mounts at a wide/short 6:1 native to match @strudel/draw (de-stretch, #214)', async ({ page }) => {
  // The bundled Piano Roll declares nativeSize 1200×200 (6:1). Block aspect =
  // (dur·lanes/CYCLES)·(W/H), so a SHORT value axis keeps fold lanes thin and
  // notes render as landscape bars (the strudel.cc look) rather than tall
  // blocks. Guards against regressing to the earlier (mis-diagnosed) 1.6:1,
  // and against the flushToPreset race that stripped nativeSize → fell to 2:1.
  await setCode(page, `$: note("c3 e3 g3 c4").s("sawtooth")._pianoroll()`)
  await runCode(page)
  const zone = page.locator('[data-viz-zone-track]').first()
  await expect(zone).toBeVisible({ timeout: 6000 })
  const aspect = await zone.evaluate((z) => {
    const r = z.getBoundingClientRect()
    return r.width / r.height
  })
  // 6:1 ≈ 6.0; the old (taller) values were 1.6 and 2.0. Assert clearly > 5.
  expect(aspect).toBeGreaterThan(5)
  expect(aspect).toBeLessThan(7)
})

test('preset p5 viz draw on a transparent background (clear(), not opaque fill)', async ({ page }) => {
  // Each bundled p5 sketch uses clear() instead of background(9,9,18) so the
  // inline viz blends into the editor (and any backdrop) rather than sitting in
  // a dark box. Empty canvas areas must therefore have alpha 0.
  await setCode(page, `$: note("c4 e4 g4").s("sawtooth")._pianoroll()`)
  await runCode(page)
  const canvas = page.locator('[data-viz-zone-track] canvas').first()
  await expect(canvas).toBeVisible({ timeout: 6000 })
  const fracTransparent = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement
    const ctx = c.getContext('2d')
    if (!ctx) return 0
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    let clearPx = 0, total = 0
    for (let i = 3; i < data.length; i += 4) { total++; if (data[i] === 0) clearPx++ }
    return total ? clearPx / total : 0
  })
  // sparse notes on a transparent surface → most pixels fully transparent.
  expect(fracTransparent).toBeGreaterThan(0.4)
})

test('pitchwheel tracks pitch (reactive) — note-name haps decode, not freeze on c4 (#216)', async ({ page }) => {
  // Haps carry note as a NAME string with freq=null; pitchwheel must parse the
  // name (hapFreq) or the active-note indicator stays pinned to the root every
  // frame. Reactive ⇒ the bright-blue indicator centroid x must vary over time.
  await setCode(page, `setcps(0.7)\n$: note("c4 e4 g4 b4 c5 e5 g5 b5").s("sawtooth").viz("pitchwheel")`)
  await runCode(page)
  const canvas = page.locator('[data-viz-zone-track] canvas').first()
  await expect(canvas).toBeVisible({ timeout: 6000 })
  const sampleX = () => canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let sx = 0, n = 0
    for (let i = 0; i < d.length; i += 4) {
      // bright, fully-opaque blue = the active line/dot (static dots are alpha 64)
      if (d[i + 2] > 180 && d[i + 3] > 200) { sx += (i / 4) % c.width; n++ }
    }
    return n ? sx / n : -1
  })
  const xs: number[] = []
  for (let k = 0; k < 7; k++) { xs.push(await sampleX()); await page.waitForTimeout(380) }
  const valid = xs.filter(x => x >= 0)
  expect(valid.length).toBeGreaterThan(2)
  // a frozen pitchwheel has range ~0; reactive sweeps tens of px.
  expect(Math.max(...valid) - Math.min(...valid)).toBeGreaterThan(15)
})

test('inline crop resolves the preset by name AND renderer — scope.p5 not scope.hydra (#217)', async ({ page }) => {
  // `scope` exists for both renderers; a name-only preset lookup pointed the
  // crop popup at the hydra preset. The action bar's data-preset-id (what the
  // crop popup loads) must be the p5 preset for an inline (p5) `.viz("scope")`.
  await setCode(page, `$: note("c4 e3 g4").s("sawtooth").viz("scope")`)
  await runCode(page)
  const zone = page.locator('[data-viz-zone-track]').first()
  await expect(zone).toBeVisible({ timeout: 6000 })
  // hover to populate the floating action bar, then poll until the async
  // preset lookup has set data-preset-id.
  const box = await zone.boundingBox()
  if (box) {
    await page.mouse.move(box.x + 20, box.y + 10)
    await page.mouse.move(box.x + box.width - 40, box.y + 12)
  }
  await expect
    .poll(() => page.locator('[data-viz-actions]').getAttribute('data-preset-id'), { timeout: 6000 })
    .toMatch(/scope_p5__$/)
})

test('.viz("name", { opts }) threads options to the sketch — not just ._pianoroll (#215)', async ({ page }) => {
  // The `.viz()` wrapper used to capture only the name and drop a 2nd options
  // arg. A custom `background` only paints if the options object actually
  // reaches the sketch (stave.options.background → parseHex → background()).
  // Frame-independent: the bg fill is constant, unlike the animated notes.
  await setCode(page, `$: note("c3 e3 g3 c4").s("sawtooth").viz("pianoroll", { background: '#cc1133' })`)
  await runCode(page)
  const canvas = page.locator('[data-viz-zone-track] canvas').first()
  await expect(canvas).toBeVisible({ timeout: 6000 })
  const reddish = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement
    const ctx = c.getContext('2d')
    if (!ctx) return false
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    let red = 0, total = 0
    for (let i = 0; i < data.length; i += 4) {
      total++
      // background #cc1133 → strongly red-dominant, low green/blue
      if (data[i] > 120 && data[i + 1] < 80 && data[i + 2] < 90) red++
    }
    return total > 0 && red / total > 0.3 // ≥30% of pixels are the red bg
  })
  expect(reddish).toBe(true)
})

test('pianoroll folds drum patterns so sounds spread across lanes, not one (#214)', async ({ page }) => {
  // fold defaults ON (contiguous lanes, no gaps), so each distinct drum sound
  // gets its own lane → painted pixels must span the canvas vertically, not
  // cluster in a thin band. (Guards against a fold:0 default, which would dump
  // non-numeric sound names onto a single absolute-MIDI lane.)
  await setCode(page, `$: s("bd hh sd hh, ~ cp").bank("RolandTR909").viz("pianoroll")`)
  await runCode(page)
  const canvas = page.locator('[data-viz-zone-track] canvas').first()
  await expect(canvas).toBeVisible({ timeout: 6000 })
  const span = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement
    const ctx = c.getContext('2d')
    if (!ctx) return 0
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    let minY = c.height, maxY = 0
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4
        // any non-background pixel (bg is ~#09090f) that's clearly painted
        if (data[i] > 60 || data[i + 1] > 60 || data[i + 2] > 60) {
          if (y < minY) minY = y
          if (y > maxY) maxY = y
          break
        }
      }
    }
    return (maxY - minY) / c.height // fraction of height the notes occupy
  })
  // collapsed-to-one-lane would be a sliver (<0.2); multiple lanes span ≥0.4.
  expect(span).toBeGreaterThan(0.4)
})

test('inline ._pianoroll(options) — the options object reaches the sketch and renders (no error) (#214)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))

  // labels / vertical / absolute-axis options all evaluate cleanly and produce
  // an inline viz-zone canvas. Asserts the engine→bag→stave.options plumbing,
  // not the pixels (those are observed manually).
  for (const opts of ['{ labels: 1 }', '{ vertical: 1 }', '{ fold: 0, minMidi: 36, maxMidi: 84 }']) {
    await setCode(page, `$: note("c3 e3 g3 c4").s("sawtooth")._pianoroll(${opts})`)
    await runCode(page)
    await expect(page.locator('[data-viz-zone-track] canvas').first()).toBeVisible({ timeout: 6000 })
    // options on the inline form must not pin a backdrop
    await expect(page.locator('[data-pinned]')).toHaveAttribute('data-pinned', 'false')
    await page.keyboard.press(`${MOD}+.`)
    await page.waitForTimeout(300)
  }
  expect(errors).toEqual([])
})
