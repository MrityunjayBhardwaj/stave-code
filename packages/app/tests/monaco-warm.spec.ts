import { test, expect } from '@playwright/test'

/**
 * #689 — Monaco should be warmed during the boot preloader window, in parallel
 * with the IndexedDB boot, rather than fetched only when the first <Editor>
 * mounts (which lands after the shell renders).
 */

// Make indexedDB.open hang so the preloader stays up (shell never mounts) — a
// clean window in which to observe that Monaco loads INDEPENDENTLY of the boot.
const HANG_IDB = `
  (function () {
    const dead = () => ({
      result: null, error: null,
      onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null,
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
    });
    try {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        get() { return { open: dead, deleteDatabase: dead, databases: () => Promise.resolve([]), cmp: () => 0 }; },
      });
    } catch (e) {}
  })();
`

test.describe('Monaco warm (#689)', () => {
  test('Monaco fetches during the preloader window, parallel to a blocked IDB boot', async ({ page }) => {
    const monacoReqs: number[] = []
    const t0 = Date.now()
    page.on('request', (r) => {
      // Monaco is self-hosted at /monaco/vs (#690), so its loader/core fetches
      // are same-origin — not the old jsdelivr `…/monaco-editor/…` CDN URL.
      if (/\/monaco\/vs\//.test(r.url())) monacoReqs.push(Date.now() - t0)
    })

    await page.addInitScript(HANG_IDB)
    await page.goto('/')

    // Preloader is up; the IDB boot is hung so the shell can't mount.
    await expect(page.locator('#stave-preloader')).toBeVisible()

    // The warm (fired the moment the editor module loaded) should already be
    // fetching Monaco even though the boot is stuck.
    await expect.poll(() => monacoReqs.length, { timeout: 10000 }).toBeGreaterThan(0)

    // Decisive: it happened WHILE the shell was still absent → warmed during the
    // preloader, not on editor mount.
    const shellCount = await page.locator('[data-workspace-shell="root"]').count()
    console.log(`[warm] first monaco request at ${monacoReqs[0]}ms; shell mounted: ${shellCount > 0}`)
    expect(shellCount).toBe(0)
  })

  test('sanity: clean boot still loads the editor', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('setcps')
  })
})
