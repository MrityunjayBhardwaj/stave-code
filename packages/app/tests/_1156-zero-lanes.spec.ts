/**
 * _1156-zero-lanes.spec.ts — PROBE (observation only; asserts nothing about the subject).
 *
 * #1156 reduced #1062's six failures to one signature — the full-song timeline shows ZERO
 * lanes — and recorded it as INTERMITTENT (~1 run in 3 for `track-custom-color:100` in
 * isolation). On this machine, on `studio_v0.2.0` @ `7f627b1f` AND on the prior studio
 * `bc718eb2`, it is not intermittent: 9 of 9 tests across four files fail 3/3, and
 * `full-song-stack-whitespace:92` fails alone. A deterministic arm of an intermittent race
 * is the cheapest place to see it, so this probe watches the window #1156 could not sample
 * finely enough — it reported lanes appearing 1–7 ms into typing and then going away, with
 * a 250 ms sampler missing the transition across 8 runs.
 *
 * WHAT IT RECORDS, and nothing else:
 *   - every console message and page error, with timestamps, from before the code is set;
 *   - the lane count sampled on every animation frame, from the moment the model is set
 *     until well past the point the spec under test gives up;
 *   - whether `[data-full-song="root"]` is mounted at each sample, so "no lanes" is
 *     distinguished from "no timeline".
 *
 * ⚠ IT ASSERTS NOTHING about lanes, deliberately. A probe that observes must never be
 * promoted into a gate — it would be an arm that cannot fail on either answer.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const TIGHT = 'stack(\n  s("bd sd"),\n  s("hh*4")\n)'
// THE DISCRIMINATING PAIR (#1097): the same music, once BARE and once with `$:` labels.
// If the bare form is what starves the lane maps, only the labelled one draws lanes.
const LABELLED = '$: s("bd sd")\n$: s("hh*4")'

async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '320')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
        .monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 20_000 },
  )
  await page.waitForFunction(
    () => {
      const m = (
        window as unknown as {
          monaco?: {
            editor?: { getEditors?: () => Array<{ getModel: () => { getValue?: () => string } | null }> }
          }
        }
      ).monaco
      const eds = m?.editor?.getEditors?.() ?? []
      return eds.some((e) => (e.getModel()?.getValue?.()?.length ?? 0) > 0)
    },
    { timeout: 20_000 },
  )
}

for (const [name, CODE] of [['BARE stack(...)', TIGHT], ['LABELLED $:', LABELLED], ['UNTOUCHED starter doc', null]] as const)
test(`#1156 — lane count per frame: ${name}`, async ({ page }) => {
  const log: string[] = []
  const t0 = Date.now()
  const stamp = (): string => String(Date.now() - t0).padStart(6)
  page.on('console', (m) => log.push(`${stamp()} console.${m.type()}: ${m.text().slice(0, 300)}`))
  page.on('pageerror', (e) => log.push(`${stamp()} PAGEERROR: ${String(e).slice(0, 300)}`))

  await boot(page)
  log.push(`${stamp()} booted`)

  // Start the per-frame sampler BEFORE the model is set, so the appear-then-vanish
  // transition #1156 describes cannot fall between two samples.
  await page.evaluate(() => {
    const w = window as unknown as { __laneSamples?: [number, number, boolean][] }
    w.__laneSamples = []
    const start = performance.now()
    const tick = (): void => {
      w.__laneSamples!.push([
        Math.round(performance.now() - start),
        document.querySelectorAll('[data-full-song-lane]').length,
        document.querySelector('[data-full-song="root"]') !== null,
      ])
      if (performance.now() - start < 12_000) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  if (CODE === null) {
    // the third arm: change nothing at all. If the app's OWN starter document draws no
    // lanes either, the surface is dead here and nothing about the fixtures matters.
    log.push(`${stamp()} left the starter document untouched`)
  } else {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } })
      .monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.focus()
    return true
  }, CODE)
  expect(ok).toBe(true) // pre-state only: the editor exists and took the text
  log.push(`${stamp()} model set`)
  await page.waitForTimeout(150)
  await page.keyboard.press(`${MOD}+Enter`)
  log.push(`${stamp()} eval pressed`)
  }

  await page.waitForTimeout(11_000)

  const samples = (await page.evaluate(
    () => (window as unknown as { __laneSamples: [number, number, boolean][] }).__laneSamples,
  )) as [number, number, boolean][]

  // Compress to TRANSITIONS — 12s of frames is thousands of rows and the question is
  // only ever "when did this value change?"
  const transitions: string[] = []
  let prev: string | null = null
  for (const [ms, lanes, root] of samples) {
    const key = `${lanes}|${root}`
    if (key !== prev) {
      transitions.push(`    ${String(ms).padStart(6)}ms  lanes=${lanes}  root=${root}`)
      prev = key
    }
  }

  const editorText = await page.evaluate(() => {
    const m = (
      window as unknown as {
        monaco?: {
          editor?: { getEditors?: () => Array<{ getModel: () => { getValue?: () => string } | null }> }
        }
      }
    ).monaco
    return m?.editor?.getEditors?.()?.[0]?.getModel?.()?.getValue?.() ?? '(none)'
  })

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      `=== #1156 ZERO-LANES PROBE — ${name}`,
      `frames sampled: ${samples.length} over ${samples.length ? samples[samples.length - 1][0] : 0}ms`,
      `max lanes ever seen: ${Math.max(0, ...samples.map((s) => s[1]))}`,
      `root ever mounted: ${samples.some((s) => s[2])}`,
      '  lane-count transitions:',
      ...transitions,
      `  editor text now: ${JSON.stringify(editorText).slice(0, 200)}`,
      '  event log:',
      ...log.map((l) => `    ${l}`),
      '',
    ].join('\n'),
  )
})
