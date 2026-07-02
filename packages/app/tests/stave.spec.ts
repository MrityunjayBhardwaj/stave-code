import { test, expect } from '@playwright/test'

test.describe('Stave — Page Structure', () => {
  test('renders the app — page title + workspace shell', async ({ page }) => {
    await page.goto('/')
    // The app chrome no longer has a heading/subtitle <header>; the brand lives
    // in the document title (and the transient boot preloader).
    await expect(page).toHaveTitle(/Stave/)
    await expect(page.locator('[data-workspace-shell="root"]')).toBeVisible({ timeout: 15000 })
  })

  test('play control exposes the Ctrl+Enter shortcut', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
    // Shortcuts moved from a page footer onto the toolbar play/stop control's
    // title. At rest the control reads "Play (Ctrl+Enter)"; it toggles to
    // "Stop (Ctrl+.)" only while playing, so only Ctrl+Enter is asserted here.
    await expect(page.locator('[title*="Ctrl+Enter"]').first()).toBeVisible()
  })

  test('no 3-tab top bar switcher — old standalone buttons are gone', async ({ page }) => {
    await page.goto('/')
    // Wait for the shell to render
    await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 10000 })
    // The old-style "Sonic Pi" / "Viz Editor" standalone role=button switcher no longer exists
    const sonicPiBtn = page.getByRole('button', { name: /^Sonic Pi$/i })
    await expect(sonicPiBtn).toHaveCount(0)
    const vizBtn = page.getByRole('button', { name: /^Viz Editor$/i })
    await expect(vizBtn).toHaveCount(0)
  })
})

test.describe('Stave — WorkspaceShell', () => {
  test('workspace shell renders', async ({ page }) => {
    await page.goto('/')
    const shell = page.locator('[data-workspace-shell="root"]')
    await expect(shell).toBeVisible({ timeout: 10000 })
  })

  test('fresh load opens a single Strudel tab (#175)', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
    // #175 — the default workspace opens one Strudel tab, not the old tab wall.
    const tabs = page.locator('[data-workspace-tab]')
    await expect(tabs).toHaveCount(1)
    await expect(tabs.first()).toHaveAttribute('data-workspace-tab', 'tab-pattern.strudel')
  })

  test('Monaco editor loads in the first tab', async ({ page }) => {
    await page.goto('/')
    const editor = page.locator('.monaco-editor')
    await expect(editor).toBeVisible({ timeout: 10000 })
  })

  test('default Strudel code is present in first tab', async ({ page }) => {
    await page.goto('/')
    await page.locator('.monaco-editor').waitFor({ timeout: 10000 })
    const editorContent = page.locator('.monaco-editor .view-lines')
    await expect(editorContent).toContainText('setcps')
  })
})

test.describe('Stave — Tab Switching', () => {
  // The old default workspace shipped multiple language tabs (strudel + sonicpi)
  // to switch between; #175 collapsed that to a single Strudel tab. Exercise
  // switching by opening a second (viz) tab from the file tree, then switching
  // back — verifying each tab keeps its own code.
  test('switching between tabs preserves each editor\'s code', async ({ page }) => {
    await page.goto('/')
    await page.locator('.monaco-editor .view-lines').waitFor({ timeout: 15000 })
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('setcps')

    // Open a viz preset as a second tab (double-click pins it).
    await page
      .locator('[data-file-tree-item*="hydra"], [data-file-tree-item*="p5"]')
      .first()
      .dblclick()
    await page.waitForTimeout(300)

    // Switch to the viz tab.
    const vizTab = page.locator('[data-workspace-tab]').filter({ hasText: /p5|hydra/i }).first()
    await vizTab.click()
    await page.waitForTimeout(300)

    // Switch back to the Strudel tab — its code must be intact.
    await page.locator('[data-workspace-tab]', { hasText: 'pattern.strudel' }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('setcps')
  })
})

test.describe('Stave — Viz Tabs', () => {
  test('viz file tabs are visible in the tab bar after opening one', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 10000 })
    // Issue #175 — the default workspace now opens a single Strudel tab,
    // not the 11-tab wall. Open a viz preset via the file tree to verify
    // viz files can become tabs. Double-click pins the tab.
    const vizItem = page
      .locator('[data-file-tree-item*="hydra"], [data-file-tree-item*="p5"]')
      .first()
    await vizItem.dblclick()
    await page.waitForTimeout(300)
    const tabTexts = await page.locator('[data-workspace-tab]').allTextContents()
    const hasViz = tabTexts.some((t) => /p5|hydra/i.test(t))
    expect(hasViz).toBe(true)
  })

  test('clicking hydra tab shows hydra code', async ({ page }) => {
    await page.goto('/')
    await page.locator('.monaco-editor').waitFor({ timeout: 10000 })

    // Find and click the hydra tab
    const allTabs = page.locator('[data-workspace-tab]')
    const count = await allTabs.count()
    for (let i = 0; i < count; i++) {
      const text = await allTabs.nth(i).textContent()
      if (text && /hydra/i.test(text)) {
        await allTabs.nth(i).click()
        await page.waitForTimeout(500)
        const editorContent = page.locator('.monaco-editor .view-lines')
        await expect(editorContent).toContainText('osc')
        break
      }
    }
  })
})

test.describe('Stave — Accessibility', () => {
  test('page has single H1 heading "Stave"', async ({ page }) => {
    await page.goto('/')
    const h1 = page.locator('h1')
    await expect(h1).toHaveCount(1)
    await expect(h1).toHaveText('Stave')
  })

  test('no duplicate IDs on the page', async ({ page }) => {
    await page.goto('/')
    await page.locator('.monaco-editor').waitFor({ timeout: 10000 })

    const duplicates = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll('[id]')).map(el => el.id)
      const seen = new Set<string>()
      const dupes: string[] = []
      for (const id of ids) {
        if (seen.has(id)) dupes.push(id)
        seen.add(id)
      }
      return dupes
    })
    expect(duplicates).toEqual([])
  })
})
