// Transport LCD in the menubar (#857): shown by default, reflects transport
// state, advances position while playing, flips display mode on click, and
// hides behind the Editor Settings toggle (brand returns).
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

const LCD = '[data-stave-transport-lcd]'

test('shows by default and reflects transport + mode + settings toggle', async ({ page }) => {
  await boot(page)

  // Default ON: the LCD is present, the brand label is not.
  const lcd = page.locator(LCD)
  await expect(lcd).toBeVisible()
  await expect(page.locator('[data-stave-brand]')).toHaveCount(0)

  // Stopped state before play.
  await expect(lcd).toContainText('STOP')

  // Play → the LCD reads PLAY and the position advances over time.
  await page.locator('[data-testid="strudel-chrome-transport"]').click()
  await expect(lcd).toContainText('PLAY', { timeout: 8000 })
  const pos = page.locator('[data-stave-lcd-pos]')
  const first = await pos.textContent()
  await page.waitForTimeout(700)
  const second = await pos.textContent()
  expect(second, 'position should advance while playing').not.toBe(first)

  // Click the screen flips the display mode (CYC → BAR), which drives both the
  // LCD label and the shared ruler-units preference.
  await expect(lcd).toContainText('CYC')
  await lcd.click()
  await expect(lcd).toContainText('BAR')
  await lcd.click()
  await expect(lcd).toContainText('CYC')

  // Editor Settings toggle hides the LCD and brings the brand back.
  await page.locator('[data-testid="strudel-chrome-transport"]').click() // stop
  await page.getByText('File', { exact: true }).click()
  await page.getByText('Editor Settings...', { exact: true }).click()
  const lcdSwitch = page.locator('[data-testid="setting-menubarLcd"]')
  await expect(lcdSwitch).toBeVisible({ timeout: 5000 })
  await lcdSwitch.click()
  // Close the settings surface (Escape) and verify the swap.
  await page.keyboard.press('Escape')
  await expect(page.locator(LCD)).toHaveCount(0)
  await expect(page.locator('[data-stave-brand]')).toBeVisible()
})

// A document that sets no tempo still HAS one — Strudel's scheduler default.
// The readout must report the tempo the engine is running at, not one recovered
// by matching `setcps(...)` in the source text.
test('tempo readout reflects a document that spells no setcps', async ({ page }) => {
  await boot(page)
  await page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null; focus: () => void }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.getModel()?.setValue('s("bd sd")')
    t?.focus()
  })
  await page.waitForTimeout(200)

  await page.locator('[data-testid="strudel-chrome-transport"]').click()
  await expect(page.locator(LCD)).toContainText('PLAY', { timeout: 8000 })

  const tempo = page.locator('[data-stave-lcd-tempo]')
  await expect(tempo).toHaveText('0.50', { timeout: 8000 })

  // The same tempo read in the other vocabulary: 0.5 cps × 60 × 4 beats = 120
  // BPM, and a bar.beat.tick position — both through the app's one meter.
  await page.locator(LCD).click()
  await expect(page.locator(LCD)).toContainText('BAR')
  await expect(tempo).toHaveText('120', { timeout: 8000 })
  await expect(page.locator('[data-stave-lcd-pos]')).toHaveText(/^\d{3}\.[1-4]\.[1-4]$/)
})

// #1348 — the eval lamp says whether the last evaluation worked, which the
// transport dot (is the scheduler running?) cannot. A broken document turns it
// red and names the error; pressing it opens the Console and jumps to the line,
// as the error's toast does; a fixed document turns it back.
test('the eval lamp shows a failed evaluation and jumps to it (#1348)', async ({ page }) => {
  await boot(page)
  const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
  const lamp = page.locator('[data-stave-eval-lamp]')
  await expect(lamp).toHaveAttribute('data-stave-eval-lamp', 'ok')
  await expect(lamp).toHaveText('EVAL')

  const setCode = (code: string) =>
    page.evaluate((c) => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null; focus: () => void }> } } }).monaco
      const eds = m?.editor?.getEditors?.() ?? []
      const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
      t?.getModel()?.setValue(c)
      t?.focus()
    }, code)
  const caretLine = () =>
    page.evaluate(() => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; getPosition: () => { lineNumber: number } | null }> } } }).monaco
      const eds = m?.editor?.getEditors?.() ?? []
      const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
      return t?.getPosition()?.lineNumber ?? null
    })

  // A syntax error on line 2.
  await setCode('$: s("bd*2")\n$: s("hh*4"')
  await page.waitForTimeout(200)
  await page.keyboard.press(`${MOD}+Enter`)
  await expect(lamp).toHaveAttribute('data-stave-eval-lamp', 'error', { timeout: 10_000 })
  await expect(lamp).toContainText('ERR')
  const title = (await lamp.getAttribute('title')) ?? ''
  console.log(`[#1348] lamp title: ${title}`)
  expect(title.length).toBeGreaterThan(0)
  await expect(lamp).toHaveAttribute('aria-label', /^Evaluation failed: /)

  // Put the caret elsewhere, then press the lamp: Console open, caret on line 2.
  await page.keyboard.press(`${MOD}+Home`)
  expect(await caretLine()).toBe(1)
  await lamp.click()
  await expect(page.locator('[data-testid="console-panel"]')).toBeVisible({ timeout: 10_000 })
  await expect.poll(caretLine, { timeout: 5000 }).toBe(2)

  // Fixed and re-evaluated: the lamp says nothing is wrong again.
  await setCode('$: s("bd*2")\n$: s("hh*4")')
  await page.waitForTimeout(200)
  await page.keyboard.press(`${MOD}+Enter`)
  await expect(lamp).toHaveAttribute('data-stave-eval-lamp', 'ok', { timeout: 10_000 })
  await expect(lamp).toHaveText('EVAL')
})

// The error toast and the eval lamp share one "show this error" action
// (`revealLogEntry` in StaveApp, #1348). Pressing the toast still jumps to the
// line — this pins the toast side of that shared action.
test('pressing an error toast jumps to the error line (#1348)', async ({ page }) => {
  await boot(page)
  const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null; focus: () => void; setPosition: (p: { lineNumber: number; column: number }) => void }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.getModel()?.setValue('$: s("bd*2")\n$: s("hh*4"')
    t?.focus()
    t?.setPosition({ lineNumber: 1, column: 1 })
  })
  await page.waitForTimeout(200)
  await page.keyboard.press(`${MOD}+Enter`)
  const toast = page.locator('[data-testid="toast"][data-level="error"] [data-testid="toast-action"]').first()
  await expect(toast).toBeVisible({ timeout: 10_000 })
  await toast.click()
  await expect(page.locator('[data-testid="console-panel"]')).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; getPosition: () => { lineNumber: number } | null }> } } }).monaco
          const eds = m?.editor?.getEditors?.() ?? []
          const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
          return t?.getPosition()?.lineNumber ?? null
        }),
      { timeout: 5000 },
    )
    .toBe(2)
})
