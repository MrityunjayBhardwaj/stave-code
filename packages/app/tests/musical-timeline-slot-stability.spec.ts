/**
 * MusicalTimeline slot-key stability (#483) — Playwright observation.
 *
 * Bug: the Live-view timeline keyed each `$:` track's row by the SOURCE
 * CHARACTER OFFSET of its `$:` line. Editing one track's content changed the
 * length of its line, which shifted the character offset of every line BELOW
 * it — so those tracks' slot keys churned, and the stale keys lingered in the
 * session's `hasHadEvents` set as junk ghost rows labelled with the raw `$N`
 * internal key.
 *
 * Fix: key rows by the `$:` ORDINAL (index among the top-level `$:` tracks),
 * which is invariant under content edits and `.p()` renames. Reserved ghost
 * rows show their last-known orbit/`.p()` label, never the raw key.
 *
 * Repro (verified in the real browser): `$: s("bd*4")\n$: s("hh*8")` → rows
 * `d1`/`d2`. Editing line 1 to `s("bd*16")` (a longer line) used to spawn a
 * stale third row labelled `$13`; it must now stay exactly `d1`/`d2`.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '320')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })
}

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const eds = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    if (!t) return false
    t.getModel()?.setValue(c)
    t.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function evalStrudel(page: Page): Promise<void> {
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2000)
}

async function stopStrudel(page: Page): Promise<void> {
  await page.keyboard.press(`${MOD}+.`)
  await page.waitForTimeout(400)
}

/** Ordered row labels (the `data-musical-timeline-track-label` attribute). */
function rowLabels(page: Page): Promise<(string | null)[]> {
  return page
    .locator('[data-musical-timeline-track-label]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-musical-timeline-track-label')))
}

test('editing one track’s content does NOT spawn a stale ghost row (#483)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await setCode(page, '$: s("bd*4")\n$: s("hh*8")')
  await evalStrudel(page)
  await expect(page.locator('[data-musical-timeline-track-row]')).toHaveCount(2, { timeout: 6000 })
  expect(await rowLabels(page)).toEqual(['d1', 'd2'])

  // Edit line 1 to a LONGER line while playing — this shifts line 2's source
  // offset. With the old char-offset keying this spawned a stale `$N` ghost row.
  await setCode(page, '$: s("bd*16")\n$: s("hh*8")')
  await evalStrudel(page)
  await page.waitForTimeout(400)

  // Still exactly two rows, same labels — no churn, no raw-key ghost.
  await expect(page.locator('[data-musical-timeline-track-row]')).toHaveCount(2)
  expect(await rowLabels(page)).toEqual(['d1', 'd2'])
  // No row label is a raw internal slot key (`$` followed by digits).
  for (const label of await rowLabels(page)) {
    expect(label, `raw slot-key leaked as a row label: ${label}`).not.toMatch(/^\$\d+$/)
  }

  // Edit line 1 again to a SHORTER line — still stable.
  await setCode(page, '$: s("bd")\n$: s("hh*8")')
  await evalStrudel(page)
  await page.waitForTimeout(400)
  await expect(page.locator('[data-musical-timeline-track-row]')).toHaveCount(2)
  expect(await rowLabels(page)).toEqual(['d1', 'd2'])

  await stopStrudel(page)
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})

test('reserved/ghost rows never show a raw $N slot key after a structural edit (#483)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await bootShell(page)
  await setCode(page, '$: s("bd*4")\n$: s("hh*8")\n$: s("cp*2")')
  await evalStrudel(page)
  await expect(page.locator('[data-musical-timeline-track-row]')).toHaveCount(3, { timeout: 6000 })
  expect(await rowLabels(page)).toEqual(['d1', 'd2', 'd3'])

  // Comment the MIDDLE track and re-eval. A structural edit can leave a
  // RESERVED (ghost) row whose track is no longer in the IR. The #483 fix
  // guarantees that row shows its last-known orbit label (e.g. `d2`), NEVER
  // the raw internal slot key (`$13` etc.). The exact row COUNT after a
  // structural reshuffle of ordinals is out of scope here (tracked in #485).
  await setCode(page, '$: s("bd*4")\n// $: s("hh*8")\n$: s("cp*2")')
  await evalStrudel(page)
  await page.waitForTimeout(400)

  const labels = await rowLabels(page)
  expect(labels.length).toBeGreaterThan(0)
  for (const label of labels) {
    expect(label, `raw slot-key leaked as a row label: ${label}`).not.toMatch(/^\$\d+$/)
  }
  // The live bd track is always present and orbit-labelled.
  expect(labels).toContain('d1')

  await stopStrudel(page)
  expect(errors, `unexpected console/page errors:\n${errors.join('\n')}`).toEqual([])
})
