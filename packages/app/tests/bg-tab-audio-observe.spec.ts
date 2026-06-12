/**
 * PHASE-E OBSERVATION (#228 roadmap "scenario 8") — does a BACKGROUNDED tab
 * throttle the audio scheduler? The gate for building a worker-timer (Phase E).
 *
 * GROUNDED model (read the source, don't infer):
 *   - The Strudel scheduler is a main-thread `setInterval` LOOKAHEAD clock
 *     (@strudel/core/zyklus.mjs): `setInterval(onTick, 100ms)`, each tick
 *     schedules every event up to `t + interval + overlap` ≈ `t + 200ms`. So the
 *     scheduler tolerates a gap of only ~200ms before it stops scheduling ahead.
 *   - Chrome throttles `setInterval` in a HIDDEN tab to ≥1000ms (and far worse
 *     under "intensive throttling"). 1Hz ticks vs a 200ms lookahead ⇒ ~800ms/s
 *     of UNSCHEDULED audio ⇒ stutter; zyklus's catch-up while-loop then fires the
 *     missed events with PAST deadlines (clumped/glitched), so even the trigger
 *     COUNT can be preserved while the CADENCE is destroyed.
 *   - BUT Chrome is documented to EXEMPT pages that are playing audio from
 *     intensive throttling — which could make this a non-issue. That is the
 *     hypothesis under test, not an assumption.
 *
 * METHOD — genuinely background the page (a 2nd tab via bringToFront; faking
 * `document.visibilityState` does NOT trigger real timer throttling), then run
 * TWO probes on the hidden page:
 *   A) a raw `setInterval(…,100ms)` tick counter — a CONTROL: is the browser
 *      throttling THIS page's timers at all? (if not — audio-exempt or headless
 *      doesn't reproduce — then a clean audio result is real, not a false negative)
 *   B) the `audio.triggers` profiler counter, sampled at 300ms buckets — does the
 *      audio scheduler keep a SMOOTH cadence, or collapse / clump?
 *
 * This test ASSERTS little — it LOGS the full picture so the build/skip decision
 * for the worker-timer is made on observed numbers (Lokāyata), not inference.
 *
 * ── OUTCOME (2026-06-07) — GROUNDED VERDICT: do NOT build the worker-timer ──
 * Playwright CANNOT background a tab: `bringToFront()` does not flip the other
 * page's `visibilityState` to hidden (control-confirmed via the raw-timer probe +
 * `hiddenSeen`, in BOTH headless and headed), and faking `document.visibilityState`
 * triggers app handlers but not Chrome's real throttler. So the worst case is not
 * automatable here. The decision is instead two-layer GROUNDED:
 *   (1) SOURCE — @strudel/core/zyklus.mjs: `setInterval(onTick, 100ms)`, lookahead
 *       `t + interval + overlap` ≈ t+200ms.
 *   (2) CHROME POLICY (cited) — developer.chrome.com/blog/timer-throttling-in-chrome-88:
 *       a page that "has made noises in the past 30 seconds" is in the MINIMAL
 *       (NOT-throttled) tier — NOT the 1/sec regular tier. The audio exemption is
 *       a FULL exemption while audible, lapsing 30s after sound stops.
 *   ⇒ A hidden Stave tab PLAYING AUDIO is not throttled → the 100ms scheduler tick
 *     survives → audio cadence is fine. The worker-timer is unnecessary for the
 *     common case (continuous playback). NARROW residual edge (documented, not
 *     built-for): a pattern with a >30s SILENT gap in a hidden tab — the exemption
 *     lapses, setInterval clamps to 1/sec, and the first events after the gap
 *     clump (zyklus catch-up fires past-deadline events) until sound resumes.
 *
 * Kept as a documented investigation harness (own flag, skips gracefully when the
 * tooling can't background) — it would yield real numbers if a future method can
 * genuinely hide a page. A definitive Lokāyata confirmation needs a MANUAL headed
 * run (human backgrounds the tab + listens). See PV82 / PK29.
 *
 * Run: BGTAB=1 pnpm --filter @stave/app exec playwright test bg-tab-audio-observe.spec.ts --timeout=180000 --workers=1
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// A dense, steady, CONTINUOUS audio bed (no sparse gaps) so the trigger cadence
// is a clean carrier — plus a worker viz so it's the real "worker-viz" scenario
// the question asks about (Phase C will pause the viz when hidden; audio is the
// focus). High event density → a clear per-bucket trigger signal.
const PAT = [
  `$: s("hh*16").bank("RolandTR909").gain(0.9).viz('bgt')`,
  `$: s("bd*4, ~ sd").bank("RolandTR909")`,
  `$: note("c2 e2 g2 c3").s("sawtooth").lpf(800)`,
].join('\n')

const VIZ = `function setup(){ createCanvas(stave.width, stave.height) }
function draw(){ background(10,10,20); stroke(120,180,255); for(let i=0;i<60;i++){ line(i*8, 0, i*8, (sig.fft[i%sig.fft.length]||0)*height) } }`

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(300)
}

async function press(page: Page, key: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(key)
}

/** Read the cumulative audio.triggers counter + the raw-setInterval tick count. */
async function probes(page: Page): Promise<{ triggers: number; rawTicks: number; hidden: boolean }> {
  return page.evaluate(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    triggers: ((window as any).__stavePerf?.snapshot?.()?.counters?.['audio.triggers'] ?? 0) as number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawTicks: ((window as any).__bgRawTicks ?? 0) as number,
    hidden: document.visibilityState === 'hidden',
  }))
}

/** Sample both probes in `buckets` windows of `ms` each; return per-bucket
 *  deltas (so we see CADENCE, not just totals). */
async function sampleCadence(
  page: Page,
  buckets: number,
  ms: number,
): Promise<{ trigPerBucket: number[]; rawPerBucket: number[]; hiddenSeen: boolean }> {
  const trig: number[] = []
  const raw: number[] = []
  let hiddenSeen = false
  let prev = await probes(page)
  for (let i = 0; i < buckets; i++) {
    await page.waitForTimeout(ms)
    const cur = await probes(page)
    trig.push(cur.triggers - prev.triggers)
    raw.push(cur.rawTicks - prev.rawTicks)
    if (cur.hidden) hiddenSeen = true
    prev = cur
  }
  return { trigPerBucket: trig, rawPerBucket: raw, hiddenSeen }
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

test.describe('Phase E observation — backgrounded-tab audio scheduler (#228 scenario 8)', () => {
  // Own flag only (NOT E2E_VERIFY): this is a manual investigation harness that
  // can't pass under automation — Playwright cannot background a tab. The Phase-E
  // verdict is grounded in the header (zyklus source + cited Chrome policy).
  test.skip(!process.env.BGTAB, 'manual harness — Playwright cannot background a tab; verdict is grounded (see header)')

  test('does a hidden tab throttle the audio scheduler? (raw-timer control + trigger cadence)', async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
      // Raw-timer CONTROL: a plain 100ms setInterval. If Chrome throttles this
      // hidden page, this counter's rate collapses too — proving the method
      // induced real throttling (not a faked visibility event).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__bgRawTicks = 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setInterval(() => { (window as any).__bgRawTicks++ }, 100)
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)

    await page.evaluate((code) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__staveRegisterViz?.({ id: 'bgt', name: 'bgt', renderer: 'p5', code, requires: ['streaming'], nativeSize: { w: 900, h: 160 }, createdAt: 1, updatedAt: 1 })
    }, VIZ)

    await press(page, `${MOD}+Period`)
    await page.waitForTimeout(400)
    await setCode(page, PAT)
    await press(page, `${MOD}+Enter`)
    await page.waitForTimeout(3000) // let audio settle + AudioContext run

    // ── VISIBLE baseline (the page is foreground) ──
    const visible = await sampleCadence(page, 8, 400) // ~3.2s
    const visTrigRate = sum(visible.trigPerBucket) / (8 * 0.4)
    const visRawRate = sum(visible.rawPerBucket) / (8 * 0.4)

    // ── BACKGROUND it: a 2nd tab takes the foreground → page becomes hidden ──
    const page2 = await ctx.newPage()
    await page2.goto('about:blank')
    await page2.bringToFront()
    await page.waitForTimeout(11000) // let Chrome's background timer throttling engage (~1Hz clamp)

    // ── HIDDEN sample (page.evaluate still works on a hidden page) ──
    const hidden = await sampleCadence(page, 15, 400) // ~6s hidden
    const hidTrigRate = sum(hidden.trigPerBucket) / (15 * 0.4)
    const hidRawRate = sum(hidden.rawPerBucket) / (15 * 0.4)

    // ── RESTORE: bring the audio page back to the foreground ──
    await page.bringToFront()
    await page.waitForTimeout(3000)
    const restored = await sampleCadence(page, 6, 400) // ~2.4s
    const resTrigRate = sum(restored.trigPerBucket) / (6 * 0.4)
    const resRawRate = sum(restored.rawPerBucket) / (6 * 0.4)

    await ctx.close()

    /* eslint-disable no-console */
    console.log('\n=== PHASE-E BG-TAB OBSERVATION (#228 scenario 8) ===')
    console.log(`hiddenSeen during hidden window: ${hidden.hiddenSeen}`)
    console.log(`RAW setInterval ticks/s   visible=${visRawRate.toFixed(1)}  hidden=${hidRawRate.toFixed(1)}  restored=${resRawRate.toFixed(1)}`)
    console.log(`AUDIO triggers/s          visible=${visTrigRate.toFixed(1)}  hidden=${hidTrigRate.toFixed(1)}  restored=${resTrigRate.toFixed(1)}`)
    console.log(`audio trig per 400ms bucket — visible: ${JSON.stringify(visible.trigPerBucket)}`)
    console.log(`audio trig per 400ms bucket — hidden:  ${JSON.stringify(hidden.trigPerBucket)}`)
    console.log(`raw  ticks per 400ms bucket — hidden:  ${JSON.stringify(hidden.rawPerBucket)}`)
    const throttledControl = visRawRate > 0 && hidRawRate < visRawRate * 0.5
    const audioDegraded = visTrigRate > 0 && hidTrigRate < visTrigRate * 0.5
    console.log(`\nINTERPRETATION:`)
    console.log(`  browser throttled this page's timers (raw control): ${throttledControl ? 'YES' : 'NO'}`)
    console.log(`  audio scheduler rate degraded while hidden:         ${audioDegraded ? 'YES' : 'NO'}`)
    if (!throttledControl) {
      console.log(`  ⇒ method did NOT induce throttling (audio-exempt or headless does not reproduce).`)
      console.log(`    A clean audio result here is real but the worst case is UNPROVEN in headless — needs a headed run to be conclusive.`)
    } else if (audioDegraded) {
      console.log(`  ⇒ bg-tab DOES break audio cadence → Phase E worker-timer is DEMANDED.`)
    } else {
      console.log(`  ⇒ timers throttled but AUDIO SURVIVED → no worker-timer needed (Vairāgya). Understand why (audio-exempt scheduling?).`)
    }
    console.log('===================================================\n')
    /* eslint-enable no-console */

    // Method sanity: did the page ACTUALLY background? Playwright's bringToFront
    // does not reliably hide a page (headless AND headed — observed 2026-06-07).
    // If it didn't, the run is inconclusive BY TOOLING — skip, don't fail (the
    // grounded verdict in the header stands regardless).
    test.skip(
      !hidden.hiddenSeen || !throttledControl,
      'inconclusive: tooling did not background the page (visibilityState stayed visible / raw timer not throttled) — see grounded verdict in header',
    )

    // Reached only if a future method genuinely backgrounds the page: then these
    // become the real gate. Audio must recover on foreground regardless.
    expect(resTrigRate, 'audio must resume when the tab returns to foreground').toBeGreaterThan(visTrigRate * 0.5)
    if (audioDegraded) {
      // eslint-disable-next-line no-console
      console.log('OBSERVED: bg-tab degraded audio → revisit the Phase-E worker-timer decision.')
    }
  })
})
