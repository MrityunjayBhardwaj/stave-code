/**
 * _1097-bare-track-maps.spec.ts — PROBE (observation only; asserts nothing about the subject).
 *
 * #1097 says the `.p()` hook is the sole writer of every per-track map, so a document that
 * never calls `.p()` gets an empty entry in all of them. #1095 fixed exactly one — the song
 * frame — and left `capturedPatterns` (→ `trackSchedulers`) alone.
 *
 * The mixer is where that gap becomes visible without instrumenting the engine. Strips are
 * built from the PARSED DOCUMENT (`buildStripModels`), so a bare statement already gets a
 * strip; the meter is painted from `trackSchedulers` keyed by `captureId`, so a strip whose
 * captureId has no scheduler paints dark forever. Strip and meter therefore disagree, and
 * both halves are readable from the DOM: `data-mixer-meter-capture` carries the join key and
 * `data-mixer-meter-fill`'s width/height carries the level.
 *
 * THE THREE ARMS, and why the middle one exists:
 *   1. ONE bare statement   — `buildStripModels` gives it `$0`, which is exactly the id the
 *      engine's bare entry uses (`BARE_CAPTURE_ID`). So this is the case a fix at the #1095
 *      site would join correctly.
 *   2. TWO bare statements  — the strips take `$0` and `$1` in SOURCE ORDER, but Strudel
 *      plays only the LAST expression. So the id the engine would write (`$0`) and the strip
 *      that is actually sounding (`$1`) are different strips. This is #1096 reached through
 *      the mixer, and it is why "write the bare entry at `$0`" is not automatically right.
 *   3. `$:` LABELLED control — the same music through the `.p()` path. If its meters do not
 *      move, the instrument is broken and arms 1 and 2 say nothing.
 *
 * ⚠ IT ASSERTS NOTHING about the bare arms, deliberately — only that the control moved, which
 * is the positive control for the measurement itself, not a claim about the product. A probe
 * that observes must never become a gate: it would pass on either answer.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const ARMS = [
  { name: 'ONE bare statement', code: 's("bd*4")' },
  { name: 'TWO bare statements (strudel plays the LAST)', code: 's("bd*4")\ns("hh*8")' },
  { name: 'LABELLED $: control', code: '$: s("bd*4")\n$: s("hh*8")' },
] as const

async function boot(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
}

async function setCode(page: Page, code: string): Promise<boolean> {
  return page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.focus()
    return true
  }, code)
}

for (const arm of ARMS)
  test(`#1097 — mixer strips vs schedulers: ${arm.name}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`))

    await boot(page)

    // Open the global Mixer console tab — the strip band lives there.
    const root = page.locator('[data-bottom-panel="root"]')
    await root.locator('[data-bottom-panel="toggle"]').click()
    await root.locator('role=tab[name="Mixer"]').click()

    expect(await setCode(page, arm.code)).toBe(true) // pre-state only: the editor took the text
    await page.waitForTimeout(200)
    await page.keyboard.press(`${MOD}+Enter`) // play — the meters only move under transport

    // Sample every strip meter's painted level for 6s, keyed by its join id.
    await page.evaluate(() => {
      const w = window as unknown as { __meterMax?: Record<string, number> }
      w.__meterMax = {}
      const start = performance.now()
      const tick = (): void => {
        for (const m of Array.from(document.querySelectorAll('[data-mixer-strip-meter]'))) {
          const id = m.getAttribute('data-mixer-meter-capture') ?? '(none)'
          const fill = m.querySelector('[data-mixer-meter-fill]') as HTMLElement | null
          if (!fill) continue
          // horizontal strips paint width, vertical paint height — take whichever is set.
          const pct = parseFloat(fill.style.width) || parseFloat(fill.style.height) || 0
          w.__meterMax![id] = Math.max(w.__meterMax![id] ?? 0, pct)
        }
        if (performance.now() - start < 6_000) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.waitForTimeout(6_500)

    const meterMax = (await page.evaluate(
      () => (window as unknown as { __meterMax: Record<string, number> }).__meterMax,
    )) as Record<string, number>

    // What the DOM says exists, independent of whether it ever moved.
    const strips = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-mixer-strip-meter]')).map((m) => ({
        capture: m.getAttribute('data-mixer-meter-capture') ?? '(none)',
      })),
    )

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        `=== #1097 BARE-TRACK MAPS — ${arm.name}`,
        `code: ${JSON.stringify(arm.code)}`,
        `strip meters in the DOM: ${strips.length} — captureIds ${JSON.stringify(strips.map((s) => s.capture))}`,
        `max painted level per captureId: ${JSON.stringify(meterMax)}`,
        `any meter moved: ${Object.values(meterMax).some((v) => v > 0)}`,
        `page errors: ${errors.length ? JSON.stringify(errors) : 'none'}`,
        '',
      ].join('\n'),
    )

    // POSITIVE CONTROL, and the only assertion in the file: the labelled arm must move a
    // meter. Without it a flat reading on the bare arms could equally mean the probe never
    // measured anything — an absence with no control is not an observation.
    if (arm.name.startsWith('LABELLED')) {
      expect(Object.values(meterMax).some((v) => v > 0)).toBe(true)
    }
  })
