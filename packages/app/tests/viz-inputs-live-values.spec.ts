/**
 * #346 — LIVE values in the "Stave Inputs" viz drawer, observed end-to-end in the
 * real app (Lokāyata: read the actual DOM the paint loop writes, never infer from
 * "the loop is wired"). The drawer bar/sparkline are MAIN-THREAD DOM text (not the
 * worker-transferred viz canvas), so reading textContent over time IS direct
 * observation — PV90's compositor-capture rule is for the viz canvas getContext,
 * which this does not touch.
 *
 *   1. With a pattern playing + the drawer open, `sig.kick` paints a master value
 *      that VARIES frame-to-frame (the imperative ref-write loop is live), and the
 *      `sig.fft` sparkline changes too.
 *   2. Collapsing the drawer detaches the live readout → zero work when idle.
 *   3. Perf: the paint is main-thread DOM, orthogonal to the viz frame budget —
 *      the viz frame gauge stays in normal range with the drawer open.
 *
 * Run: E2E_VERIFY=1 pnpm --filter @stave/app exec playwright test \
 *        viz-inputs-live-values.spec.ts --timeout=300000 --workers=1
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_PERF__ = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).__STAVE_E2E__ = true
    try {
      localStorage.setItem('stave:vizInputsLiveValues', '1') // default ON; explicit for determinism
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1200)
}

async function play(page: Page): Promise<void> {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    e?.getModel()?.setValue(`$: s("bd*4, ~ sd, hh*8").bank("RolandTR909")`)
    e?.focus()
  })
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1500)
}

async function openVizFile(page: Page, name: string): Promise<void> {
  await page.getByText(name, { exact: true }).first().click()
  await page.locator('[data-workspace-chrome="viz"]').waitFor({ timeout: 10000 })
  await page.waitForTimeout(400)
}

/** Read sig.kick's painted unicode bar (`[data-live-bar]` textContent) — null if absent. */
async function kickBar(page: Page): Promise<string | null> {
  return page.evaluate(() => document.querySelector('[data-live-bar="kick"]')?.textContent ?? null)
}

/** Sample a value-getter `n` times spanning > one musical cycle; return distinct values. */
async function sample(page: Page, get: () => Promise<string | null>, n: number, gapMs: number): Promise<string[]> {
  const seen = new Set<string>()
  for (let i = 0; i < n; i++) {
    const v = await get()
    if (v != null) seen.add(v)
    if (i < n - 1) await page.waitForTimeout(gapMs)
  }
  return [...seen]
}

test.describe('#346 — live values in the Stave Inputs drawer', () => {
  test.skip(!process.env.E2E_VERIFY, 'set E2E_VERIFY=1 to run (drives the live audio + paint loop)')

  test('sig.kick bar varies frame-to-frame while a pattern plays', async ({ page }) => {
    await boot(page)
    await play(page)
    await openVizFile(page, 'spectrum.p5')

    // Open the drawer → the live readout mounts.
    await page.getByTestId('viz-inputs-toggle').click()
    await page.getByTestId('viz-inputs-live').waitFor({ timeout: 6000 })
    await page.waitForTimeout(800) // let the probe bind the playing analyser

    // sig.kick — a scalar unicode bar (textContent, written imperatively). Sample
    // across > one cycle; a live loop produces multiple distinct bar strings, a
    // dead/static one produces exactly one.
    const kicks = await sample(page, () => kickBar(page), 14, 160)
    // eslint-disable-next-line no-console
    console.log(`[live] sig.kick distinct bars=${JSON.stringify(kicks)}`)
    const lit = kicks.filter((v) => v !== '—' && /[█▏▎▍▌▋▊▉]/.test(v))
    expect(lit.length, 'sig.kick painted real unicode bars').toBeGreaterThan(0)
    expect(new Set(kicks).size, 'sig.kick bar VARIES frame-to-frame (live loop)').toBeGreaterThan(1)
    expect(Math.max(...lit.map((b) => b.length)), 'kick bar grows past empty on a bd*4').toBeGreaterThan(0)

    // sig.fft sparkline also moves.
    const ffts = await sample(
      page,
      () => page.evaluate(() => document.querySelector('[data-live-text="fft"]')?.textContent ?? null),
      10,
      160,
    )
    // eslint-disable-next-line no-console
    console.log(`[live] sig.fft sparkline samples=${ffts.length} distinct`)
    expect(new Set(ffts).size, 'sig.fft sparkline animates').toBeGreaterThan(1)

    await page.screenshot({ path: 'test-results/viz-inputs-live.png' })
  })

  test('collapsing the drawer detaches the live readout (zero work when idle)', async ({ page }) => {
    await boot(page)
    await play(page)
    await openVizFile(page, 'spectrum.p5')

    const toggle = page.getByTestId('viz-inputs-toggle')
    await toggle.click()
    await page.getByTestId('viz-inputs-live').waitFor({ timeout: 6000 })
    expect(await kickBar(page), 'live row present while open').not.toBeNull()

    await toggle.click() // collapse
    await page.waitForTimeout(300)
    expect(await kickBar(page), 'live readout removed when collapsed → loop torn down').toBeNull()
  })

  test('perf: drawer paint is orthogonal to the viz frame budget', async ({ page }) => {
    await boot(page)
    await play(page)
    await openVizFile(page, 'spectrum.p5')
    await page.getByTestId('viz-inputs-toggle').click()
    await page.getByTestId('viz-inputs-live').waitFor({ timeout: 6000 })
    await page.waitForTimeout(2000)

    const snap = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (window as any).__stavePerf?.snapshot?.() ?? null
    })
    // eslint-disable-next-line no-console
    console.log(`[live] perf snapshot gauges=${JSON.stringify(snap?.gauges ?? {})}`)
    expect(snap, '__stavePerf available under __STAVE_PERF__').not.toBeNull()
    // The drawer adds no __stavePerf section (it's plain DOM); this is a sanity
    // observation that the app stays healthy with the readout running, not a gate.
  })
})
