/**
 * #1667 — a track the user named `d2:` must not take the name the track below it
 * was going to be given.
 *
 * `d{N}` is the name a track gets when it has no label. It was decided one track
 * at a time, so it was unique among the OTHER positional names but not against a
 * label the user had written — and `d2:` is a legal label. The two tracks then
 * shared one identity, which is not a display blemish: the row source
 * de-duplicates by it, so the Song Timeline drew ONE lane for the two statements
 * and the second track vanished from the arrangement.
 *
 * AnviDev observe gate: the unit tests pin the assignment (trackId.test.ts) and
 * the strips (stripModel.test.ts). This drives the REAL app and looks at what the
 * user looks at — how many lanes are drawn, what they are called, and whether the
 * two tracks are told apart by colour in both views.
 *
 * Modelled on `full-song-track-labels.spec.ts`, deliberately: that spec is the
 * NON-colliding control for the same two surfaces, and it must keep reading the
 * names it always read.
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

/**
 * The label `d2:` claims the name the SECOND statement would otherwise be given.
 * The third is unlabelled too and must not land on a name either of the first two
 * took — so the expected reading is `d2` (the user's own label, which never
 * moves), then `d3`, then `d4`.
 */
const SONG = ['d2: s("bd*2")', '$: s("hh*4")', '$: s("cp*2")'].join('\n')
const EXPECTED_NAMES = ['d2', 'd3', 'd4']

test('a d2: label does not swallow the unlabelled tracks under it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await typeSongAndEval(page, SONG)

  const timeline = await page.locator('[data-full-song-lane]').evaluateAll((els) =>
    els.map((e) => ({
      key: e.getAttribute('data-full-song-lane'),
      name: (e.querySelector('span:last-child') as HTMLElement | null)?.textContent ?? '',
      dot: ((): string => {
        const d = e.querySelector('[data-full-song-lane-dot]') as HTMLElement | null
        return d ? getComputedStyle(d).backgroundColor : ''
      })(),
    })),
  )

  // THE ROW COUNT IS THE POINT. Three statements, three lanes — the collision
  // used to leave two, which reads as "you wrote two tracks" for a three-track
  // song. Asserted before the names, because a wrong name is visible and a
  // missing row is not.
  expect(timeline).toHaveLength(3)
  expect(timeline.map((l) => l.key)).toEqual(EXPECTED_NAMES)
  expect(timeline.map((l) => l.name)).toEqual(EXPECTED_NAMES)

  // ── Mixer console: the same three tracks, the same three names.
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

  expect(mixer.map((m) => m.name)).toEqual(EXPECTED_NAMES)

  // Distinct names are only half of it — the name is also the colour seed, so a
  // collision painted two different tracks the same colour in BOTH views.
  expect(new Set(mixer.map((m) => m.dot)).size).toBe(3)
  for (let i = 0; i < EXPECTED_NAMES.length; i++) {
    expect(timeline[i].dot, `lane ${EXPECTED_NAMES[i]} dot colour`).toBe(mixer[i].dot)
    expect(timeline[i].dot).toMatch(/^rgb/)
  }

  expect(errors, errors.join('\n')).toEqual([])
})
