/**
 * Full-song view: a declared-but-SILENT track's clip is visible as an outline
 * (#1100). #1099 gave a muted track its row; this proves the row has something
 * to act on rather than reading as inert.
 *
 * Reads the canvas backing store (getImageData) rather than a style or a draw
 * call, because the defect was one of VISIBILITY: the clip was already being
 * drawn for the silent lane — the fill and its two verticals — but the fill
 * composited to ~3/255 and the verticals sat at the song's extreme edges, so
 * every geometry-level check passed while nothing was on screen.
 *
 * The measurement is a per-ROW median across the band. Median, so a single
 * bright column (the clip's own verticals, a stray artefact) cannot carry it;
 * per row, because an outline EDGE is one row and a per-column mean would
 * dilute it by 1/bandHeight into the noise.
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch { /* ignore */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

/** Per-row median luminance down one lane's canvas band. */
async function rowMedians(page: Page, laneKey: string): Promise<number[]> {
  return page.evaluate((key) => {
    const row = document.querySelector(`[data-full-song-lane="${key}"]`) as HTMLElement | null
    const canvas = document.querySelector('[data-full-song-canvas]') as HTMLCanvasElement | null
    if (!row || !canvas) return []
    const rr = row.getBoundingClientRect()
    const cr = canvas.getBoundingClientRect()
    const dpr = canvas.width / cr.width
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return []
    const y0 = Math.max(0, Math.round((rr.top - cr.top) * dpr))
    const h = Math.max(1, Math.round(rr.height * dpr))
    if (y0 + h > canvas.height) return []
    const data = ctx.getImageData(0, y0, canvas.width, h).data
    const out: number[] = []
    for (let y = 0; y < h; y++) {
      const lumas: number[] = []
      for (let x = 0; x < canvas.width; x++) {
        const i = ((y * canvas.width) + x) * 4
        lumas.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])
      }
      lumas.sort((a, b) => a - b)
      out.push(lumas[Math.floor(lumas.length / 2)])
    }
    return out
  }, laneKey)
}

/** Rows standing clear of the band's own body — the outline's edges. */
function standoutRows(rows: number[], margin = 6): number[] {
  const sorted = [...rows].sort((a, b) => a - b)
  const baseline = sorted[Math.floor(sorted.length / 2)]
  return rows.map((v, i) => ({ v, i })).filter((r) => r.v > baseline + margin).map((r) => r.i)
}

test('a muted track draws its clip as an outline, and a sounding one is unchanged', async ({ page }) => {
  const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
  await boot(page)
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type('$: s("bd*4")\n_$: s("hh*8")', { delay: 6 })
  await page.waitForTimeout(300)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
  // Stop the transport: a moving playhead is a bright column that lands
  // somewhere different every run.
  const stop = page.locator('button', { hasText: 'Stop' }).first()
  if (await stop.count()) {
    await stop.click()
    await page.waitForTimeout(500)
  }

  const muted = await rowMedians(page, 'd2')
  const sounding = await rowMedians(page, 'd1')
  expect(muted.length).toBeGreaterThan(8)
  expect(sounding.length).toBeGreaterThan(8)

  const mutedEdges = standoutRows(muted)
  console.log(`d2 (muted)    rows=${JSON.stringify(muted.map((v) => +v.toFixed(1)))}`)
  console.log(`d2 standout rows: ${JSON.stringify(mutedEdges)}`)
  console.log(`d1 (sounding) standout rows: ${JSON.stringify(standoutRows(sounding))}`)

  // An OUTLINE is exactly two thin edges — one near the top of the band, one
  // near the bottom. A filled band (many contiguous rows) would not be an
  // outline, and zero rows is the pre-fix state.
  expect(mutedEdges).toHaveLength(2)
  const [top, bottom] = mutedEdges
  expect(top).toBeLessThan(muted.length / 3)
  expect(bottom).toBeGreaterThan((muted.length * 2) / 3)

  // The sounding lane keeps its content rendering: its standout rows are a
  // contiguous BLOCK in the middle (the density bar), not a two-edge outline.
  const soundingRows = standoutRows(sounding)
  expect(soundingRows.length).toBeGreaterThan(2)
  expect(Math.max(...soundingRows) - Math.min(...soundingRows) + 1).toBe(soundingRows.length)
})
