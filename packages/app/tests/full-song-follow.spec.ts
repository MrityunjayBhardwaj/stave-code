/**
 * Full-song view: follow playhead (auto-scroll) — Playwright observation spec (#415).
 *
 * AnviDev observe gate: songAxis.test.ts covers the followScrollLeft math and
 * FullSongTimeline.test.tsx covers the toggle in jsdom (which has no real
 * layout/scroll); this drives the REAL app to confirm the end-to-end behaviour
 * against a real playing song —
 *   1. With the song zoomed in and Follow ON (default), the grid auto-scrolls
 *      to keep the moving playhead within the viewport (scrollLeft tracks it).
 *   2. With Follow OFF, the view stays where the user left it (no auto-scroll)
 *      even as the playhead drifts past the edge.
 *   3. No console / page errors throughout.
 *
 * INPUT NOTE (same as the sibling specs): the eval reads the FILE STORE, so the
 * analyzed song is the starter example — assertions are generic (the playhead
 * moves, the view follows / stops following), never a fixed scroll value.
 *
 * AUDIO NOTE: playback is real but not audibly observed here; this spec watches
 * the scroll geometry only.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const STORAGE_KEYS = {
  height: 'stave:bottomPanel.height',
  open: 'stave:bottomPanel.open',
  activeTabId: 'stave:bottomPanel.activeTabId',
} as const

async function preOpenDrawer(page: Page): Promise<void> {
  await page.addInitScript(
    ([heightKey, openKey, activeKey]: readonly string[]) => {
      try {
        window.localStorage.setItem(heightKey, '320')
        window.localStorage.setItem(openKey, 'true')
        window.localStorage.setItem(activeKey, 'musical-timeline')
      } catch {
        /* ignore */
      }
    },
    [STORAGE_KEYS.height, STORAGE_KEYS.open, STORAGE_KEYS.activeTabId],
  )
}

async function bootShell(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
}

async function evalStrudel(page: Page): Promise<void> {
  await page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

/** Sample the grid's scrollLeft, the playhead's content-x, and the viewport
 *  width over `n` ticks spaced `gapMs` apart. */
async function sampleScroll(
  page: Page,
  n: number,
  gapMs: number,
): Promise<Array<{ scrollLeft: number; playheadX: number; clientWidth: number }>> {
  const out: Array<{ scrollLeft: number; playheadX: number; clientWidth: number }> = []
  for (let i = 0; i < n; i++) {
    const s = await page.locator('[data-full-song="grid"]').evaluate((el) => {
      const playhead = el.querySelector('[data-full-song="playhead"]') as HTMLElement | null
      return {
        scrollLeft: el.scrollLeft,
        // offsetLeft is content-space x (grid-content is not translated; the
        // grid scrolls natively), so playheadX - scrollLeft is the on-screen x.
        playheadX: playhead ? playhead.offsetLeft : Number.NaN,
        clientWidth: el.clientWidth,
      }
    })
    out.push(s)
    if (i < n - 1) await page.waitForTimeout(gapMs)
  }
  return out
}

test('full-song view: Follow auto-scrolls to keep the playhead in view; off freezes it', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await preOpenDrawer(page)
  await bootShell(page)
  await evalStrudel(page)

  // Enter the full-song view and wait for analysis + a live playhead.
  const toggle = page.locator('[data-musical-timeline="view-toggle"]')
  await toggle.waitFor({ timeout: 10_000 })
  await toggle.click()
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song="playhead"]').waitFor({ timeout: 8_000 })

  // Follow defaults ON.
  const followToggle = page.locator('[data-full-song-follow-toggle]')
  expect(await followToggle.getAttribute('data-follow')).toBe('on')

  // Zoom in hard so the content is many viewports wide — the playhead then
  // sweeps well past the dead-zone band each cycle, forcing follow to scroll.
  for (let i = 0; i < 6; i++) await page.locator('[data-full-song-zoom-in]').click()
  const grid = page.locator('[data-full-song="grid"]')
  const overflow = await grid.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }))
  expect(overflow.sw).toBeGreaterThan(overflow.cw + 50)

  // (1) Follow ON → over ~3s the view auto-scrolls (scrollLeft changes) and the
  //     playhead never leaves the viewport.
  const onSamples = await sampleScroll(page, 7, 450)
  const onScrolls = onSamples.map((s) => s.scrollLeft)
  const scrollRange = Math.max(...onScrolls) - Math.min(...onScrolls)
  expect(scrollRange, `follow ON should auto-scroll; samples=${onScrolls.join(',')}`).toBeGreaterThan(5)
  for (const s of onSamples) {
    if (Number.isNaN(s.playheadX)) continue // playhead briefly absent between wraps
    const viewportX = s.playheadX - s.scrollLeft
    expect(viewportX).toBeGreaterThanOrEqual(-24)
    expect(viewportX).toBeLessThanOrEqual(s.clientWidth + 24)
  }

  // (2) Follow OFF → the view stays put. Turn it off, park the scroll, wait past
  //     the manual-scroll guard, then confirm scrollLeft no longer tracks.
  await followToggle.click()
  expect(await followToggle.getAttribute('data-follow')).toBe('off')
  await grid.evaluate((el) => {
    el.scrollLeft = 40
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.waitForTimeout(1400) // > USER_SCROLL_GUARD_MS so any guard has lapsed
  const offSamples = await sampleScroll(page, 4, 450)
  const offScrolls = offSamples.map((s) => s.scrollLeft)
  const offRange = Math.max(...offScrolls) - Math.min(...offScrolls)
  expect(offRange, `follow OFF should freeze the view; samples=${offScrolls.join(',')}`).toBeLessThanOrEqual(2)

  // Visual evidence (observe, don't infer).
  await page.screenshot({ path: 'test-results/full-song-follow.png' })

  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
