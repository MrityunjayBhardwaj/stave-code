/**
 * Issue #613 — a visible Find/Replace affordance on the editor. Monaco's
 * find+replace widget already works via Cmd+F / Cmd+H, but there was no
 * discoverable button (the project rule: every file type gets a visible action,
 * not just a hidden shortcut). EditorView now renders a ⌕ button (top-right of
 * the editor area, where the find widget appears) that opens the widget with
 * the replace row expanded — universal across every editor tab.
 */
import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 15_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null; focus: () => void }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.getModel()?.setValue(c)
    t?.focus()
  }, code)
  await page.waitForTimeout(150)
}

test('the ⌕ button is visible and opens the find+replace widget', async ({ page }) => {
  await boot(page)
  await setStrudelCode(page, '$: s("bd sn bd sn")\nd1: note("c e g")')

  const findBtn = page.locator('[data-editor-find]').first()
  await expect(findBtn).toBeVisible()

  // closed by default
  await expect(page.locator('.monaco-editor .find-widget.visible')).toHaveCount(0)

  await findBtn.click()

  // the widget opens WITH the replace row (find + replace, not find-only)
  await expect(page.locator('.monaco-editor .find-widget.visible')).toHaveCount(1)
  await expect(
    page.locator('.monaco-editor .find-widget .replace-part input, .monaco-editor .find-widget .replace-part textarea').first(),
  ).toBeVisible()
})
