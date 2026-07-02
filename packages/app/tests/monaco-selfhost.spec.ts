import { test, expect } from '@playwright/test'

/**
 * #690 — Monaco is self-hosted from `/monaco/vs` instead of the jsdelivr CDN
 * default, so the editor loads from our own origin and works offline / with the
 * CDN blocked.
 */
test.describe('Monaco self-host (#690)', () => {
  test('editor loads with the jsdelivr CDN blocked; fetches only /monaco/vs', async ({ page }) => {
    const selfHosted: string[] = []
    let cdnHits = 0

    // Simulate no CDN: abort anything to jsdelivr (where Monaco used to load from).
    await page.route('**://cdn.jsdelivr.net/**', (r) => {
      cdnHits++
      return r.abort()
    })
    page.on('request', (r) => {
      if (/\/monaco\/vs\//.test(r.url())) selfHosted.push(new URL(r.url()).pathname)
    })

    await page.goto('/')

    // Editor must load fully despite the CDN being blocked.
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('setcps')

    // It loaded from our origin, and never depended on the CDN.
    expect(selfHosted.some((p) => p.endsWith('/monaco/vs/loader.js'))).toBe(true)
    expect(cdnHits).toBe(0)
    console.log(`[selfhost] /monaco/vs requests: ${selfHosted.length}; jsdelivr hits: ${cdnHits}`)
  })

  test('the Monaco worker also loads from /monaco/vs (same-origin under COEP)', async ({ page }) => {
    const workerReqs: string[] = []
    page.on('request', (r) => {
      const u = r.url()
      if (/\/monaco\/vs\//.test(u) && /worker/i.test(u)) workerReqs.push(u)
    })
    await page.goto('/')
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 20000 })
    // Typing/tokenization spins up Monaco's worker; give it a moment.
    await page.locator('.monaco-editor').click()
    await page.waitForTimeout(1500)
    expect(workerReqs.length).toBeGreaterThan(0)
  })
})
