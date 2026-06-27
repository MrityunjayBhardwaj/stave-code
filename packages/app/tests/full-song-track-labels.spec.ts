/**
 * Track identity STEP 2 (#579) — the Song Timeline shows the LABEL for a NAMED
 * track, matching the Mixer, while an anonymous `$:` keeps its positional `d{N}`.
 *
 * AnviDev observe gate: the unit tests cover the label parse + the scene
 * resolution; this drives the REAL app end-to-end on a MIXED multi-track song
 * (named + anonymous), confirming both views read one name + one colour per
 * track. Typed (not `setValue`) so the doc reaches the file store the timeline
 * analyses (the harness note in full-song-timeline.spec).
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function typeSongAndEval(page: Page, code: string): Promise<void> {
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 8 })
  await page.waitForTimeout(400)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2200)
}

/** Mixed: NAMED (bass/d3/lead) interleaved with anonymous `$:` tracks. */
const SONG = [
  'bass: note("c2 e2").s("sawtooth")',
  '$: s("bd*4")',
  'd3: s("hh*8")',
  '$: s("cp*2")',
  'lead: note("c4").s("piano")',
  '$: s("oh*2")',
].join('\n')

// Track order (config excluded): bass(d1) $(d2) d3(d3) $(d4) lead(d5) $(d6).
// Expected DISPLAY name per lane, in source order — named→label, anon→d{N}.
const EXPECTED_NAMES = ['bass', 'd2', 'd3', 'd4', 'lead', 'd6']

test('Song Timeline shows track labels and matches the Mixer (named + anon)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, SONG)

  // ── Timeline: lane keys (identity, stays d{N}) + display names + dot colours.
  const timeline = await page.locator('[data-full-song-lane]').evaluateAll((els) =>
    els.map((e) => ({
      key: e.getAttribute('data-full-song-lane'),
      name: (e.querySelector('span:last-child') as HTMLElement | null)?.textContent ?? '',
      dot: ((): string => {
        const d = e.querySelector('span:nth-child(2)') as HTMLElement | null // caret, dot, name → dot is 2nd
        return d ? getComputedStyle(d).backgroundColor : ''
      })(),
    })),
  )

  // Identity stays positional (drives the live overlay match) …
  expect(timeline.map((l) => l.key)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'd6'])
  // … while the DISPLAY name resolves to the label for named tracks.
  expect(timeline.map((l) => l.name)).toEqual(EXPECTED_NAMES)

  // ── Mixer console: strip names + dot colours, in track order.
  const root = page.locator('[data-bottom-panel="root"]')
  await root.locator('[data-bottom-panel="toggle"]').click()
  await root.locator('role=tab[name="Mixer"]').click()
  const mixerPanel = root.locator('[data-bottom-panel-tab="mixer-console"]')
  await mixerPanel.locator('[data-mixer-strip-name]').first().waitFor({ timeout: 10_000 })

  const mixer = await mixerPanel.locator('[data-mixer-strip-id]').evaluateAll((els) =>
    els.map((e) => ({
      name: (e.querySelector('[data-mixer-strip-name]') as HTMLElement | null)?.textContent ?? '',
      dot: ((): string => {
        const d = e.querySelector('[data-mixer-strip-dot]') as HTMLElement | null
        return d ? getComputedStyle(d).backgroundColor : ''
      })(),
    })),
  )

  // Mixer names equal the timeline names (one identity per track) …
  expect(mixer.map((m) => m.name)).toEqual(EXPECTED_NAMES)
  // … and per-track the dot COLOUR matches across views (one shared palette).
  for (let i = 0; i < EXPECTED_NAMES.length; i++) {
    expect(timeline[i].dot, `lane ${EXPECTED_NAMES[i]} dot colour`).toBe(mixer[i].dot)
    expect(timeline[i].dot).toMatch(/^rgb/) // a real resolved colour, not empty
  }

  expect(errors, errors.join('\n')).toEqual([])
})
