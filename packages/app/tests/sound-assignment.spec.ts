/**
 * Sound assignment — #514 instrument picker, #515 kit picker, #516 add-voice.
 *
 * End-to-end proof that each picker writes a lossless surgical edit to the
 * Strudel source: `.sound('…')`/`.s` on a Piano-Roll `note(...)`, `.bank('…')`
 * on a Sequencer `s(...)`, and a new drum voice that stages in-model then writes
 * to the pattern on the first hit. Single-quoted literals (PV44).
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

async function setStrudelCode(page: Page, code: string): Promise<void> {
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
    target.setPosition({ lineNumber: 1, column: 8 })
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; getValue: () => string } | null
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    return target?.getModel()?.getValue() ?? ''
  })
}

async function openPattern(page: Page) {
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('[data-bottom-panel="toggle"]').click()
  await drawer.locator('role=tab[name="Pattern"]').click()
  return drawer
}

test.describe('Sound assignment (#514/#515/#516)', () => {
  test('#514 Piano Roll instrument picker writes + replaces .sound', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: note("c e g")')
    const drawer = await openPattern(page)
    const select = drawer.locator('[data-mixer-sound-select="instrument"]')
    await expect(select).toHaveCount(1)

    await select.selectOption('sawtooth')
    await page.waitForTimeout(120)
    expect(await strudelValue(page)).toBe("$: note(\"c e g\").sound('sawtooth')")

    // selecting a different instrument REPLACES the arg in place (no second call)
    await select.selectOption('gm_alto_sax')
    await page.waitForTimeout(120)
    expect(await strudelValue(page)).toBe("$: note(\"c e g\").sound('gm_alto_sax')")
  })

  test('#515 Sequencer kit picker writes + replaces .bank (Roland → Yamaha)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd sd hh")')
    const drawer = await openPattern(page)
    const select = drawer.locator('[data-mixer-sound-select="kit"]')
    await expect(select).toHaveCount(1)

    await select.selectOption('RolandTR909')
    await page.waitForTimeout(120)
    expect(await strudelValue(page)).toBe("$: s(\"bd sd hh\").bank('RolandTR909')")

    await select.selectOption('YamahaRX5')
    await page.waitForTimeout(120)
    expect(await strudelValue(page)).toBe("$: s(\"bd sd hh\").bank('YamahaRX5')")
  })

  test('#516 add a drum voice stages in-model, writes on first hit; remove drops it', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd ~ sd ~")')
    const drawer = await openPattern(page)
    const addVoice = drawer.locator('[data-seq-add-voice]')
    await expect(addVoice).toHaveCount(1)

    // add `cp` — a new row appears, but the source stays unchanged (staging)
    await addVoice.selectOption('cp')
    await page.waitForTimeout(120)
    await expect(drawer.locator('[data-seq-remove-voice="cp"]')).toHaveCount(1)
    expect(await strudelValue(page)).toBe('$: s("bd ~ sd ~")')

    // place a hit in the new (3rd) lane's first column → it writes into the pattern
    await drawer.locator('[data-seq-cell="2:0"]').click()
    await page.waitForTimeout(120)
    expect(await strudelValue(page)).toBe('$: s("[bd,cp] ~ sd ~")')

    // remove the voice → it drops back out of the pattern
    await drawer.locator('[data-seq-remove-voice="cp"]').click()
    await page.waitForTimeout(120)
    expect(await strudelValue(page)).toBe('$: s("bd ~ sd ~")')
  })
})
