import { test, expect, type Page } from '@playwright/test'

// Perf profiler (#228) — OBSERVE, don't infer. This test enables the profiler
// (window.__STAVE_PERF__ before load → auto-enable at module init), drives a
// HEAVY patch (multiple audio tracks + a backdrop viz), lets it run, then reads
// window.__stavePerf.snapshot() and PRINTS the real numbers. Assertions guard
// STRUCTURE (data is actually produced), not env-dependent thresholds — the
// numbers themselves are the observation, logged for a human to read.

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function setCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as any).monaco?.editor?.getEditors?.()?.[0]
    if (!e) return false
    e.getModel()?.setValue(c)
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function runCode(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus())
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(2500)
}

test.describe('Phase perf — profiler produces real per-frame data (#228)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_PERF__ = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__STAVE_E2E__ = true
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(1000)
  })

  test('a heavy multi-track + backdrop-viz patch yields frames, sections, longtask + trigger data', async ({
    page,
  }) => {
    // The profiler auto-enabled at module load (the global was set first).
    const enabledAtBoot = await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).__stavePerf?.snapshot?.()?.enabled ?? false,
    )
    expect(enabledAtBoot).toBe(true)

    // HEAVY patch: 4 audio tracks driving the scheduler + a backdrop p5 viz
    // (.pianoroll() pins a compiledVizProvider p5 instance running its own rAF).
    const heavy = [
      `$: s("bd*4, ~ sd ~ sd").bank("RolandTR909")`,
      `$: s("hh*16").gain(0.4)`,
      `$: note("c2 eb2 g2 c3").s("sawtooth").lpf(800)`,
      `$: note("c4 eb4 g4 bb4").s("triangle").room(0.4).pianoroll()`,
    ].join('\n')
    await setCode(page, heavy)
    await runCode(page)

    // Audio must actually be running (not a false-green silent context).
    const acState = await page.evaluate(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (window as any).getAudioContext?.()?.state ?? 'none'
      } catch {
        return 'error'
      }
    })

    // Clean measurement window AFTER mount, then let it run ~4s.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.evaluate(() => (window as any).__stavePerf?.reset?.())
    await page.waitForTimeout(4000)

    const snap = await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).__stavePerf?.snapshot?.(),
    )

    // ── OBSERVATION (printed for a human to read) ─────────────────────────────
    // eslint-disable-next-line no-console
    console.log('\n=== PERF SNAPSHOT (#228) — audioCtx=' + acState + ' ===')
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(snap, null, 2))

    // ── STRUCTURE assertions (data is produced; not env thresholds) ───────────
    expect(snap).toBeTruthy()
    expect(snap.enabled).toBe(true)
    expect(snap.uptimeMs).toBeGreaterThan(3000)

    // At least one viz instance rendered frames with a real fps.
    const frameIds = Object.keys(snap.frames)
    expect(frameIds.length).toBeGreaterThanOrEqual(1)
    const anyFps = frameIds.some((id) => snap.frames[id].fps > 0)
    expect(anyFps).toBe(true)

    // The renderer's per-frame work was timed.
    //
    // `*.bus` is the MAIN-THREAD renderer's section name. Viz renders in a worker
    // by default (#245), where the per-frame cost comes back as `viz.worker.draw`
    // (the frameAck bridge — the worker bundle never imports `perf`, so this is
    // how it is not a profiler blind spot). Observed on the default path:
    // sections are viz.worker.{sample,write,draw} and there is no `.bus` at all,
    // so the spec was demanding a name only the fallback path emits and reading
    // "the profiler yields no data" when it was yielding plenty (#875).
    // Accept EITHER vocabulary — the claim is that the mounted renderer's
    // per-frame work is timed, whichever thread it runs on.
    const sectionNames = Object.keys(snap.sections)
    const hasFrameWorkSection = sectionNames.some(
      (n) => n.endsWith('.bus') || n === 'viz.worker.draw',
    )
    expect(
      hasFrameWorkSection,
      `no per-frame renderer section; got: ${sectionNames.join(', ')}`,
    ).toBe(true)

    // Live viz-instance GAUGE reflects ≥1 mounted renderer (gauges survive the
    // reset() that clears cumulative counters — they're current state). Same
    // split: `viz.p5`/`viz.hydra` are main-thread; a worker renderer gauges
    // `viz.worker`.
    const liveViz =
      (snap.gauges['viz.p5'] ?? 0) +
      (snap.gauges['viz.hydra'] ?? 0) +
      (snap.gauges['viz.worker'] ?? 0)
    expect(liveViz).toBeGreaterThanOrEqual(1)

    // longtask block is present (count may legitimately be 0 on a fast machine
    // or unsupported platform — we assert the SHAPE, not a count).
    expect(snap.longtasks).toHaveProperty('count')
    expect(snap.longtasks).toHaveProperty('maxMs')
  })

  test('the header copy button copies the live snapshot as JSON to the clipboard (#729)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    // Drive a little so the snapshot has real content, then let a frame land.
    await setCode(page, '$: s("bd*4").bank("RolandTR909")._pianoroll()')
    await runCode(page)

    // The overlay auto-renders when perf is enabled. Copy button sits beside close.
    const copyBtn = page.locator('[aria-label="Copy performance snapshot as JSON"]')
    await expect(copyBtn).toBeVisible({ timeout: 6000 })
    await copyBtn.click()

    // Read the clipboard back — the REAL artifact, not the button's icon flip.
    const text = await page.evaluate(() => navigator.clipboard.readText())
    const parsed = JSON.parse(text) as Record<string, unknown>
    // Shape of a PerfSnapshot — proves it's the snapshot, not some other payload.
    expect(parsed).toHaveProperty('frames')
    expect(parsed).toHaveProperty('sections')
    expect(parsed).toHaveProperty('enabled', true)

    // The button flips to a ✓ acknowledgement.
    await expect(copyBtn).toHaveText('✓')
  })
})
