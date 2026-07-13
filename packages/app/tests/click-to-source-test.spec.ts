import { test, expect, type Page } from '@playwright/test'

// QUARANTINED (#874). These drive `[data-musical-timeline-note="…"]` — per-note
// DOM blocks of the LIVE-VIEW timeline, which the #497/U5 DOM-view retirement
// deleted (the timeline is a canvas now). Unlike the sibling musical-timeline
// specs (retired outright — their row model is gone and the canvas has its own
// stability coverage), this one guards a CAPABILITY whose fate is unresolved:
// clicking an individual NOTE and landing on ITS source line. The canvas has
// lane-header jump (#610) but no note-level jump, so this may be a capability
// that quietly disappeared rather than one deliberately dropped. Skipped — not
// deleted — so the question stays on the record. Resolve in #874: either restore
// note-level click-to-source on the canvas and rewrite this against it, or
// retire it deliberately.
test.skip(true, 'note-level click-to-source: capability unresolved — see #874')


const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function bootWithDrawer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '420')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch { /* noop */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
  await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })
}

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const m = (window as unknown as Record<string, unknown>).monaco as
      | { editor?: { getEditors?: () => unknown[] } }
      | undefined
    const eds = (m?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { setValue: (s: string) => void } | null
      focus: () => void
    }>
    const e = eds[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(100)
}

async function runCode(page: Page): Promise<void> {
  await page.evaluate(() => {
    const m = (window as unknown as Record<string, unknown>).monaco as
      | { editor?: { getEditors?: () => unknown[] } }
      | undefined
    ;(m?.editor?.getEditors?.()?.[0] as { focus: () => void } | undefined)?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2000)
}

async function getLine(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const m = (window as unknown as Record<string, unknown>).monaco as
      | { editor?: { getEditors?: () => { getPosition: () => { lineNumber: number } | null }[] } }
      | undefined
    return m?.editor?.getEditors?.()?.[0]?.getPosition()?.lineNumber ?? null
  })
}

async function resetCursor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const m = (window as unknown as Record<string, unknown>).monaco as
      | { editor?: { getEditors?: () => unknown[] } }
      | undefined
    const ed = (m?.editor?.getEditors?.()?.[0] as {
      setPosition: (p: { lineNumber: number; column: number }) => void
    } | undefined)
    ed?.setPosition({ lineNumber: 1, column: 1 })
  })
  await page.waitForTimeout(100)
}

test.describe('click-to-source', () => {
  test('note() with loc lands on correct line', async ({ page }) => {
    await bootWithDrawer(page)
    await setCode(page, [
      '// line 1',
      'setcps(120/240)',
      '$: note("c4 e4").s("sawtooth").gain(0.3)',
    ].join('\n'))
    await runCode(page)

    const blocks = page.locator('[data-musical-timeline-note="$default"]')
    await expect(blocks).toHaveCount(2, { timeout: 5000 })
    await resetCursor(page)
    await blocks.first().click()
    await page.waitForTimeout(300)

    expect(await getLine(page)).toBe(3)
  })

  test('s("bd") fallback walk finds $: block', async ({ page }) => {
    await bootWithDrawer(page)
    await setCode(page, [
      '// line 1',
      'setcps(120/240)',
      '$: s("bd").gain(0.5)',
    ].join('\n'))
    await runCode(page)

    const blocks = page.locator('[data-musical-timeline-note="bd"]')
    await expect(blocks).toHaveCount(1, { timeout: 5000 })
    await resetCursor(page)
    await blocks.click()
    await page.waitForTimeout(300)

    expect(await getLine(page)).toBe(3)
  })

  test('multi-line $: stack blocks resolve to correct line', async ({ page }) => {
    await bootWithDrawer(page)
    await setCode(page, [
      '// Strudel',
      'setcps(130/240)',
      '',
      '$: stack(',
      '  s("bd [~ bd] ~ bd").gain(0.5),',
      ')',
    ].join('\n'))
    await runCode(page)

    await expect(page.locator('[data-musical-timeline-note]')).toHaveCount(3, { timeout: 5000 })
    const bdBlocks = page.locator('[data-musical-timeline-note="bd"]')
    await expect(bdBlocks).toHaveCount(3, { timeout: 3000 })
    await resetCursor(page)
    await bdBlocks.first().click()
    await page.waitForTimeout(300)
    expect(await getLine(page)).toBe(4)
  })
})
