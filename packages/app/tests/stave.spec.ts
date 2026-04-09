import { test, expect } from '@playwright/test'

test.describe('Stave — Page Structure', () => {
  test('renders main heading and subtitle', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Stave')
    await expect(page.locator('header p')).toContainText('One workspace')
  })

  test('footer shows keyboard shortcuts', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('footer')).toContainText('Ctrl+Enter')
    await expect(page.locator('footer')).toContainText('Ctrl+.')
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

  test('shell has 4 tabs visible', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 10000 })
    // Each tab is rendered with data-workspace-tab attribute
    const tabs = page.locator('[data-workspace-tab]')
    await expect(tabs).toHaveCount(4)
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
  test('clicking sonicpi tab switches to Sonic Pi code', async ({ page }) => {
    await page.goto('/')
    await page.locator('.monaco-editor').waitFor({ timeout: 10000 })

    // Click the tab whose fileId text contains "sonicpi"
    const sonicpiTab = page.locator('[data-workspace-tab]', { hasText: 'pattern.sonicpi' })
    await sonicpiTab.click()
    await page.waitForTimeout(500)
    const editorContent = page.locator('.monaco-editor .view-lines')
    await expect(editorContent).toContainText('live_loop')
  })

  test('switching back to strudel tab preserves original code', async ({ page }) => {
    await page.goto('/')
    await page.locator('.monaco-editor').waitFor({ timeout: 10000 })

    // Switch to sonicpi
    await page.locator('[data-workspace-tab]', { hasText: 'pattern.sonicpi' }).click()
    await page.waitForTimeout(500)

    // Switch back to strudel
    await page.locator('[data-workspace-tab]', { hasText: 'pattern.strudel' }).click()
    await page.waitForTimeout(500)

    const editorContent = page.locator('.monaco-editor .view-lines')
    await expect(editorContent).toContainText('setcps')
  })
})

test.describe('Stave — Viz Tabs', () => {
  test('viz file tabs are visible in the tab bar', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 10000 })

    // Look for tabs with viz-related file ids
    const allTabs = page.locator('[data-workspace-tab]')
    const tabTexts = await allTabs.allTextContents()
    const hasP5 = tabTexts.some(t => /p5/i.test(t))
    const hasHydra = tabTexts.some(t => /hydra/i.test(t))
    expect(hasP5 || hasHydra).toBe(true)
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
