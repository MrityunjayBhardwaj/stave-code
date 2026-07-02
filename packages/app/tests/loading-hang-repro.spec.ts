import { test, expect } from '@playwright/test'

/**
 * Reproduction + regression for the intermittent "keeps on loading" hang (#685).
 *
 * Root cause (grounded): the bootstrap crosses IndexedDB several times. The
 * FIRST crossing is projectRegistry.openDb (`stave-projects`) via
 * getLastOpenedProject, then initProjectDoc's y-indexeddb `whenSynced`. Every
 * raw `indexedDB.open` / `whenSynced` only settles on a SUCCESSFUL open — no
 * `.catch`, no timeout. When IDB is blocked (another tab), rejected (private
 * mode), or corrupted, the open never fires and the preloader spins forever.
 *
 * Fix is retry-then-fallback: bound the boot, auto-retry once (recovers
 * transient failures silently WITH persistence), and only surface a blocking
 * Retry / Continue screen after a second failure.
 */

// A request object whose success/error callbacks NEVER fire — simulates a
// blocked/unresponsive IDB open.
const deadRequestFactory = `
  function makeDead(recorder) {
    return function () {
      if (recorder) recorder();
      return {
        result: null, error: null,
        onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null,
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
      };
    };
  }
`

// Fault A: indexedDB.open ALWAYS hangs — a permanent failure.
const HANG_IDB_FOREVER = `
  (function () {
    ${deadRequestFactory}
    window.__idbOpens = [];
    const dead = makeDead(function () { window.__idbOpens.push('open'); });
    try {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        get() { return { open: dead, deleteDatabase: dead, databases: () => Promise.resolve([]), cmp: () => 0 }; },
      });
    } catch (e) {}
  })();
`

// Fault B: indexedDB.open hangs for the FIRST ~8s, then real IDB resumes — a
// transient failure that the automatic retry should recover from silently.
const HANG_IDB_TRANSIENT = `
  (function () {
    ${deadRequestFactory}
    const real = window.indexedDB;
    const start = Date.now();
    const RELEASE_AT = 8000;
    const dead = makeDead(null);
    try {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        get() {
          if (Date.now() - start < RELEASE_AT) {
            return { open: dead, deleteDatabase: dead, databases: () => Promise.resolve([]), cmp: () => 0 };
          }
          return real;
        },
      });
    } catch (e) {}
  })();
`

const blockedScreen = (page: import('@playwright/test').Page) =>
  page.getByRole('alertdialog', { name: /couldn't load your saved projects/i })
const degradedNotice = (page: import('@playwright/test').Page) =>
  page.getByRole('status').filter({ hasText: /won't be saved this session/i })

test.describe('Loading hang — IndexedDB open never resolves (#685)', () => {
  test('permanent hang → blocking screen → Continue starts an ephemeral session', async ({ page }) => {
    await page.addInitScript(HANG_IDB_FOREVER)
    await page.goto('/')

    // Preloader shows immediately (static HTML in layout.tsx).
    await expect(page.locator('#stave-preloader')).toBeVisible()

    // After the initial attempt (~8s) + one auto-retry (~4s) both fail, the
    // blocking screen appears instead of an infinite spinner.
    await expect(blockedScreen(page)).toBeVisible({ timeout: 20000 })

    // Confirm we actually parked on the registry DB open (the primary hang
    // point) — proves the guard fired, not luck.
    const idbOpens = await page.evaluate(() => (window as unknown as { __idbOpens?: string[] }).__idbOpens ?? [])
    expect(idbOpens.length).toBeGreaterThan(0)

    // Retry is offered; Continue drops into a temporary in-memory session.
    await expect(page.getByRole('button', { name: /^retry$/i })).toBeVisible()
    await page.getByRole('button', { name: /continue without saving/i }).click()

    await expect(page.locator('[data-workspace-shell="root"]')).toBeVisible({ timeout: 15000 })
    await expect(blockedScreen(page)).toHaveCount(0)
    await expect(degradedNotice(page)).toBeVisible()
  })

  test('transient hang → auto-retry recovers silently WITH persistence', async ({ page }) => {
    await page.addInitScript(HANG_IDB_TRANSIENT)
    await page.goto('/')

    // The first attempt times out, the automatic retry hits real IDB and the
    // app boots normally — no blocking screen, no degraded notice.
    await expect(page.locator('[data-workspace-shell="root"]')).toBeVisible({ timeout: 25000 })
    await expect(blockedScreen(page)).toHaveCount(0)
    await expect(degradedNotice(page)).toHaveCount(0)
  })

  test('sanity: without any fault, the shell mounts fast + no screens', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-workspace-shell="root"]')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('#stave-preloader')).toHaveCount(0, { timeout: 5000 })
    await expect(blockedScreen(page)).toHaveCount(0)
    await expect(degradedNotice(page)).toHaveCount(0)
  })
})
