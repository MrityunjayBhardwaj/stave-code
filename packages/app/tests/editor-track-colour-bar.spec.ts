/**
 * #608 — per-track colour bar down the editor's left edge (over the glyph margin,
 * before the line numbers). Each track's statement gets a colour stripe whose
 * colour is the track's resolved identity colour — the SAME colour the Mixer
 * strip dot, the Song Timeline lane, and the Pattern-tab chip show (one
 * `buildStripModels` + override resolver, V-track-1/2).
 *
 * The bar is a scroll-synced DOM overlay (not a glyph-margin decoration) so it
 * stays continuous across WORD-WRAPPED rows — a long line that wraps must not
 * break the stripe.
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

async function setCode(page: Page, code: string): Promise<void> {
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
  await page.waitForTimeout(300)
}

/** Normalize a CSS colour → "r,g,b" via a 1×1 canvas (solid bg vs solid dot). */
const NORM_SRC = `(raw) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1
  const ctx = cv.getContext('2d')
  ctx.fillStyle = '#000'; ctx.fillStyle = raw; ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return d[0] + ',' + d[1] + ',' + d[2]
}`

function readSegments(page: Page) {
  return page.evaluate(() => {
    const segs = Array.from(document.querySelectorAll('[data-track-colour-bar]')) as HTMLElement[]
    const editor = document.querySelector('.monaco-editor') as HTMLElement
    const edLeft = editor?.getBoundingClientRect().left ?? 0
    return segs
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          bg: getComputedStyle(el).backgroundColor,
          left: Math.round(r.left - edLeft),
          top: Math.round(r.top),
          height: Math.round(r.height),
        }
      })
      .sort((a, b) => a.top - b.top)
  })
}

test('track colour bars render at the left edge and match the mixer strip colour', async ({ page }) => {
  await boot(page)
  await setCode(page, `bass: s("bd*4")\nlead: note("c e g")\n  .gain(0.7)\n$: s("hh*8")`)

  const segs = await readSegments(page)
  // 3 tracks: bass (1 line), lead (2-line chain), anonymous $ → d4.
  expect(segs.length).toBe(3)
  for (const s of segs) {
    expect(s.left).toBeLessThanOrEqual(6) // before the line numbers
    expect(s.height).toBeGreaterThan(0)
  }
  // lead's segment spans 2 lines → taller than the single-line bass segment.
  expect(segs[1].height).toBeGreaterThan(segs[0].height)
  expect(segs[0].bg).not.toBe(segs[1].bg)

  // Cross-view: the bass bar colour equals the bass Mixer strip dot colour.
  await page.locator('[data-bottom-panel="root"] [data-bottom-panel="toggle"]').click()
  await page.locator('[data-bottom-panel="root"]').getByRole('tab', { name: 'Mixer' }).click()
  await page.waitForTimeout(400)
  const match = await page.evaluate((normSrc) => {
    // eslint-disable-next-line no-new-func
    const norm = new Function('return ' + normSrc)() as (s: string) => string
    const segEls = Array.from(document.querySelectorAll('[data-track-colour-bar]')) as HTMLElement[]
    segEls.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    const barRgb = norm(getComputedStyle(segEls[0]).backgroundColor)
    const dot = document.querySelector(
      '[data-bottom-panel-tab="mixer-console"] [data-mixer-strip-dot]',
    ) as HTMLElement | null
    return { barRgb, dotRgb: dot ? norm(getComputedStyle(dot).backgroundColor) : null }
  }, NORM_SRC)
  expect(match.dotRgb).not.toBeNull()
  expect(match.barRgb).toBe(match.dotRgb)
})

test('the colour bar stays continuous across a word-wrapped track', async ({ page }) => {
  await boot(page)
  // A single track whose first line is long enough to wrap to several visual
  // rows (the user's repro). One statement → one continuous segment.
  await setCode(
    page,
    `$: note("b3 [g#3,g#4,f5,d#5,c6,b6,f#6,e6] [db4,d#4,e4,g3,g#6] [c4,f#4,a#4,b6,c#7,d#7,d6,b5,e6] [f#5,d6,g6,d#2] [ab3,f#4,c5,e7,c7,g#6,b5] [c#4,a#4,d5,f5,e6] g5 [f3,a3,g4] [e4,f5] ab3 [c4,f4,a#4,g5] [g#4,g3,c#5,a#5,b5,c6,c#6,d6,d#6] [db4,a5,e6,f6,f#6,g6,g#6,a6,a#6,b6,c7,c#7,d7] [g#4,c#5,f5] ~")\n  .sometimesBy(0, x => x.gain(0.55))\n  .viz("pianoroll").distort(0.12).lpf(178).speed(-2).delay(0.13).sound('gm_violin').room(0.4)`,
  )

  const probe = await page.evaluate(() => {
    const monaco = (window as any).monaco
    const ed = monaco.editor.getEditors().find((e: any) => e.getModel()?.getLanguageId?.() === 'strudel')
    const lineHeight = ed.getOption(monaco.editor.EditorOption.lineHeight)
    // visual rows = sum of wrap counts across the 3 model lines
    let visualRows = 0
    for (let l = 1; l <= ed.getModel().getLineCount(); l++) {
      visualRows += ed.getBottomForLineNumber(l) - ed.getTopForLineNumber(l)
    }
    const segs = Array.from(document.querySelectorAll('[data-track-colour-bar]')) as HTMLElement[]
    return {
      lineHeight,
      contentSpanPx: Math.round(visualRows),
      segCount: segs.length,
      segHeight: segs.length ? Math.round(segs[0].getBoundingClientRect().height) : 0,
    }
  })

  // ONE statement → ONE segment, and it spans the FULL wrapped block (every
  // visual row), not just the first row. A first-row-only bug would be ~1
  // lineHeight; the wrapped block is many rows tall.
  expect(probe.segCount).toBe(1)
  expect(probe.segHeight).toBeGreaterThan(probe.lineHeight * 3)
  // The segment covers the whole wrapped block height (allow a few px slack).
  expect(Math.abs(probe.segHeight - probe.contentSpanPx)).toBeLessThanOrEqual(4)
})
