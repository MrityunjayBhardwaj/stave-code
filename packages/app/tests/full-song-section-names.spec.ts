/**
 * Section names reach the canvas (#1391) — Playwright observation.
 *
 * The unit arms cover the resolver (`sectionLabel.test.ts`), the whole
 * walk→marks→scene path (`sectionName.endToEnd.test.ts`) and the drawing
 * (`drawTimeline.test.ts`, against a recording mock). None of them can see a
 * CAPTION: they assert on data structures and on a fake 2D context. The
 * deliverable here is text a musician reads off the screen, so it is observed.
 *
 * ── HOW A CAPTION IS OBSERVED WITHOUT READING TEXT ───────────────────────────
 * Canvas text cannot be queried from the DOM, and OCR is not a test. So the two
 * documents below are IDENTICAL IN EVERY WAY THAT DRAWS — same tempo, same
 * samples, same two arms, same clip boundaries, same note marks — and differ
 * only in HOW LONG THE SECTION NAMES ARE:
 *
 *   long:  const introduction = …  →  captions "introduction", "development"
 *   short: const a = …             →  captions "a", "b"
 *
 * Everything else being equal, the long-named document must put strictly more
 * ink in the lane band. That difference IS the caption, and nothing else in the
 * frame can account for it.
 *
 * ⚠ AND THE SIGNAL IS PROVEN BEFORE IT IS COMPARED. A brightness difference
 * between two blank canvases is 0 > 0, which fails in a way that reads as "the
 * captions are the same size" rather than "nothing rendered at all" — the trap
 * `full-song-arrange-clips.spec.ts` documents next door after a whole session
 * was spent on a coordinate that turned out to be an absent signal. So each run
 * prints and asserts its own preconditions first.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

/** Long names. Two arms, 2 cycles each. */
const LONG_NAMES = [
  'const introduction = s("bd")',
  'const development = s("hh")',
  'arrange([2, introduction], [2, development])',
].join('\n')

/** The SAME music, one-character names. */
const SHORT_NAMES = [
  'const a = s("bd")',
  'const b = s("hh")',
  'arrange([2, a], [2, b])',
].join('\n')

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '340')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () =>
      ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
        ?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

/** TYPE the song — a programmatic setValue does not update the file store the
 *  IR snapshot is parsed from (the note `full-song-arrange-clips` carries). */
async function typeSongAndEval(page: Page, code: string): Promise<void> {
  await page.evaluate(() => {
    const eds =
      (
        window as unknown as {
          monaco?: {
            editor?: {
              getEditors?: () => Array<{
                getModel: () => { getLanguageId?: () => string } | null
                focus: () => void
              }>
            }
          }
        }
      ).monaco?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
  })
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 8 })
  await page.waitForTimeout(400)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

interface Reading {
  /** Total sub-pixel energy in the lane band — captions included. */
  readonly ink: number
  /** How many distinct column sums the band has: 1 means a flat, empty canvas. */
  readonly distinctColumns: number
  readonly lanes: number
  readonly canvasW: number
  readonly canvasH: number
}

/** Render `code` and read the lane band. */
async function read(page: Page, code: string, label: string): Promise<Reading> {
  await typeSongAndEval(page, code)
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(500)

  const lanes = await page.locator('[data-full-song-lane]').count()
  const band = await page.locator('[data-full-song-canvas]').evaluate((el) => {
    const c = el as HTMLCanvasElement
    const ctx = c.getContext('2d')!
    const W = c.width
    // ⚠ THE WHOLE CANVAS, not a fraction of it. A 12% band was 3 pixels on this
    // 25px-tall single-lane canvas — above the caption's baseline, above most of
    // the content, and it read IDENTICALLY for sparse and dense music. The
    // control that varies the music is what exposed it; a precondition of
    // "something was drawn" passed the whole time on 4 distinct background rows.
    const yBand = c.height
    const img = ctx.getImageData(0, 0, W, yBand).data
    let ink = 0
    const cols = new Set<number>()
    for (let x = 0; x < W; x++) {
      let sum = 0
      for (let y = 0; y < yBand; y++) {
        const i = (y * W + x) * 4
        sum += img[i]! + img[i + 1]! + img[i + 2]!
      }
      cols.add(sum)
      ink += sum
    }
    return { ink, distinctColumns: cols.size, canvasW: W, canvasH: yBand }
  })

  const reading: Reading = { ...band, lanes }
  // eslint-disable-next-line no-console
  console.log(
    `[#1391 ${label}] PRECONDITION — lanes: ${reading.lanes}, canvas ${reading.canvasW}x${reading.canvasH}, ` +
      `distinct columns: ${reading.distinctColumns}, ink: ${reading.ink}`,
  )
  // The canvas must have real height. A zero/tiny-height canvas reads as a
  // uniform band and every ink comparison below becomes 0 vs 0.
  expect(reading.canvasH, `[${label}] canvas has no height — nothing can be observed`).toBeGreaterThan(8)
  expect(reading.lanes, `[${label}] no lane rendered — nothing to caption`).toBeGreaterThan(0)
  expect(
    reading.distinctColumns,
    `[${label}] flat column profile — the canvas drew nothing, so any ink comparison below is meaningless`,
  ).toBeGreaterThan(1)
  return reading
}

test('a named section puts its name on the canvas', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)

  // ── THE CONTROL COMES FIRST, AND IT IS NOT OPTIONAL ────────────────────────
  // Two documents whose MUSIC differs must not read the same. When this arm was
  // first written it scanned a 12%-of-height band, which on this 25px canvas was
  // three rows of background: sparse and dense music read IDENTICALLY (4176498
  // both), the subject comparison read 0 vs 0, and the failure said "captions are
  // not on the canvas" — a confident, wrong diagnosis of the product from a
  // broken instrument. The precondition of the day ("something was drawn")
  // passed throughout on four distinct background rows.
  //
  // So the harness proves it can see a change before it is trusted to report the
  // absence of one.
  const sparse = await read(page, 'arrange([2, s("bd")], [2, s("hh")])', 'CONTROL sparse')
  const dense = await read(page, 'arrange([2, s("bd*16")], [2, s("hh*16")])', 'CONTROL dense')
  // eslint-disable-next-line no-console
  console.log(`[#1391] CONTROL sparse=${sparse.ink} dense=${dense.ink} delta=${dense.ink - sparse.ink}`)
  expect(
    dense.ink,
    `the harness cannot see a change in the MUSIC (sparse=${sparse.ink}, dense=${dense.ink}) — it is not observing the canvas, so nothing it says about captions means anything`,
  ).not.toBe(sparse.ink)

  // Same music twice; only the names differ in length.
  const short = await read(page, SHORT_NAMES, 'short names')
  const long = await read(page, LONG_NAMES, 'long names')

  // eslint-disable-next-line no-console
  console.log(`[#1391] ink  short=${short.ink}  long=${long.ink}  delta=${long.ink - short.ink}`)

  // The two frames are identical except for the caption text, so any extra ink
  // in the long-named run is the extra glyphs. If captions were not drawn at
  // all, the two would be equal and this fails saying exactly that.
  expect(
    long.ink,
    `the long-named sections drew no more ink than the short-named ones — captions are not on the canvas (short=${short.ink}, long=${long.ink})`,
  ).toBeGreaterThan(short.ink)

  expect(errors, `page errors while drawing captions: ${errors.join(' | ')}`).toEqual([])
})
