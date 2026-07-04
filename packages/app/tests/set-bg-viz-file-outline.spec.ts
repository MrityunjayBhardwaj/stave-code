/**
 * A viz file (.p5 / .hydra) set as its OWN group background must not frame its
 * code view in a blue focus outline (#723, viz-file case). Setting the viz as
 * backdrop flips its code panel to backdrop mode, so the Monaco surface goes
 * transparent and the `.monaco-editor` focus outline (`--vscode-focusBorder`,
 * ~#007fd4) — invisible against an opaque surface — would read as a blue frame.
 * The globals.css rule that drops the outline in backdrop mode covers every
 * `.monaco-editor` under the code panel, viz files included; this locks that.
 */
import { test, expect, type Page } from '@playwright/test'

async function openVizFile(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').waitFor({ timeout: 15000 })
  // Open a bundled .p5 preset via the file tree (bundled p5 fileIds contain "p5").
  const item = page.locator('[data-file-tree-item*="p5"]').first()
  await item.waitFor({ timeout: 10000 })
  await item.dblclick()
  await page.locator('[data-workspace-chrome="viz"]').first().waitFor({ timeout: 10000 })
}

const outlineStyle = (page: Page) =>
  page.evaluate(() => {
    const ed = document.querySelector('[data-stave-code-panel] .monaco-editor')
    return getComputedStyle(ed as Element).outlineStyle
  })

test('no blue focus outline frames a viz file set as its own background (#723)', async ({ page }) => {
  await openVizFile(page)

  // Focus first — the outline only computes while `.monaco-editor` is focused.
  // Without a backdrop it's the usual 1px focus border (present).
  await page.locator('.monaco-editor .view-lines').first().click()
  expect(await outlineStyle(page)).not.toBe('none')

  // Set this viz file as the group backdrop (the real gesture the user reported).
  await page.locator('[data-testid="viz-chrome-bg-toggle"]').first().click()
  await page.waitForTimeout(400)
  await expect(
    page.locator('[data-stave-code-panel][data-stave-backdrop="on"]'),
  ).toHaveCount(1)

  // Re-focus over the now-transparent surface — the outline must be gone.
  await page.locator('.monaco-editor .view-lines').first().click()
  await page.waitForTimeout(150)
  expect(await outlineStyle(page)).toBe('none')
})
