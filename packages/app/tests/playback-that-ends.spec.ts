import { test, expect, type Page } from '@playwright/test'

/**
 * #1388 — an ARRANGED song plays through once and stops. In the real app.
 *
 * ── WHY THIS IS AN E2E ARM AND NOT ONLY A UNIT ONE ───────────────────────────
 * The gap was found by LISTENING: the first bounce of an arranged document
 * anyone played wrapped and restarted mid-capture. `songTermination.test.ts`
 * pins the decision — which extent kinds end, when a crossing counts, what the
 * Loop toggle overrides — with a position sequence it controls. What it cannot
 * see is whether that decision is ever REACHED: whether the extent is measured
 * on eval, whether the position accessor is wired to the playing runtime,
 * whether the sampler runs at all. Every one of those can be missing while all
 * 22 unit arms stay green, and the symptom is the original bug, unchanged.
 *
 * So this arm asks the running app the same question the listening did: press
 * Play, wait longer than the song, and see whether it stopped by itself.
 *
 * ── THE DOCUMENTS ───────────────────────────────────────────────────────────
 * `SONG` is the arranged fixture from `bounce-arranged-song.spec.ts`, unchanged
 * so the two arms speak about the same document: `arrange([4,…],[8,…],[4,…])`
 * at `setcps(120/240)` = 0.5 cps, so 16 cycles = 32 seconds.
 *
 * `LOOP_DOC` is the control, and it is what makes the arm capable of failing in
 * the other direction. A change that simply stopped every document after 32
 * seconds would satisfy the arranged arm perfectly; only the control catches
 * it. It is also the shape 96.7% of real documents have.
 */

/** `setcps(120/240)` — one cycle is 2s. */
const CYCLE_SECONDS = 2
/** Σ arm weights = 4 + 8 + 4. */
const SONG_CYCLES = 16
const SONG_SECONDS = SONG_CYCLES * CYCLE_SECONDS // 32

const SONG = `setcps(120/240)

const intro = s("bd ~ ~ ~").bank("RolandTR909").gain(0.25)

const verse = stack(
  s("bd*2 sd*2").bank("RolandTR909"),
  s("hh*8").bank("RolandTR909").gain(0.7)
).gain(1)

const outro = s("bd ~ ~ ~").bank("RolandTR909").gain(0.25)

arrange([4, intro], [8, verse], [4, outro])
`

/** No arrangement anywhere — the control. Must never stop on its own. */
const LOOP_DOC = `setcps(120/240)

s("bd*2 sd*2").bank("RolandTR909")
`

/** Well past the song's end, so "it stopped" and "we stopped watching" cannot
 *  be confused. */
const WATCH_SECONDS = 44
const SAMPLE_MS = 250

async function boot(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await page.waitForFunction(
    () => {
      const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
      return (m?.editor?.getEditors?.()?.length ?? 0) > 0
    },
    { timeout: 15_000 },
  )
}

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
      setPosition: (p: { lineNumber: number; column: number }) => void
    }>
    const target = editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.setPosition({ lineNumber: 1, column: 1 })
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(400)
}

/** True while the transport reads "Stop", i.e. the document is playing. */
async function isPlaying(page: Page): Promise<boolean> {
  const label = await page.getByTestId('strudel-chrome-transport').textContent()
  return (label ?? '').includes('Stop')
}

/**
 * Press Play and WAIT FOR IT TO BE PLAYING — never a fixed delay.
 *
 * ⚠ A fixed `waitForTimeout(1000)` here was wrong, and it was wrong in the way
 * that matters: the first run of a session is cold (engine init, sample load)
 * and was not yet playing at t=1s, while the second, warm run was. The watch
 * would then have begun before the song did, and "it stopped" would have meant
 * nothing. The precondition assert caught it rather than the arm reporting a
 * confident "stopped at 0.3s".
 */
async function pressPlay(page: Page): Promise<void> {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${mod}+Enter`)
  await expect(
    page.getByTestId('strudel-chrome-transport'),
    'the transport never started — the watch below would prove nothing',
  ).toContainText('Stop', { timeout: 60_000 })
}

interface Watch {
  /** Seconds after Play at which the transport first read "Play" again, or
   *  `null` if it was still playing when we stopped watching. */
  readonly stoppedAtS: number | null
  /** Every sample, for the failure message — an assertion about WHEN something
   *  happened is unreadable without the sequence it happened in. */
  readonly profile: string
}

/**
 * Watch the transport for `seconds`, sampling the button.
 *
 * ⚠ THE PRECONDITION BLOCK IS NOT DECORATION. An observation harness that does
 * not report its own state lets its silence read as the subject's: a previous
 * session read a clean "0 lanes / 0 errors" from a panel that had never opened.
 * So this prints what it saw BEFORE the watch — if the document was not playing
 * when the watch began, "it stopped" means nothing.
 */
async function watchTransport(page: Page, seconds: number, label: string): Promise<Watch> {
  const t0 = Date.now()
  const samples: string[] = []
  let stoppedAtS: number | null = null

  const startedPlaying = await isPlaying(page)
  // eslint-disable-next-line no-console
  console.log(
    `[#1388 ${label}] PRECONDITION — playing at t=0: ${startedPlaying}; ` +
      `loop toggle present: ${await page.getByTestId('strudel-chrome-loop-toggle').count()}; ` +
      `watching ${seconds}s at ${SAMPLE_MS}ms`,
  )
  expect(startedPlaying, `[${label}] not playing when the watch began — the watch proves nothing`).toBe(true)

  while ((Date.now() - t0) / 1000 < seconds) {
    await page.waitForTimeout(SAMPLE_MS)
    const t = (Date.now() - t0) / 1000
    const playing = await isPlaying(page)
    samples.push(`${t.toFixed(1)}s:${playing ? '▶' : '■'}`)
    if (!playing && stoppedAtS === null) stoppedAtS = t
  }

  const profile = samples.join(' ')
  // eslint-disable-next-line no-console
  console.log(`[#1388 ${label}] stoppedAtS=${stoppedAtS} profile=${profile}`)
  return { stoppedAtS, profile }
}

test.use({
  // The arrangement's length is read off the document, but the POSITION comes
  // from the running scheduler — and a suspended AudioContext never advances it.
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
})

test.describe('#1388 — playback that ends', () => {
  test('an arranged song stops itself at its last cycle', async ({ page }) => {
    test.setTimeout(180_000)

    await boot(page)
    await setStrudelCode(page, SONG)
    await pressPlay(page)

    // The Loop toggle is offered because this document HAS a definite end —
    // the same predicate the watcher stops on. Its presence here is the
    // cheapest evidence that the extent was measured at all.
    await expect(
      page.getByTestId('strudel-chrome-loop-toggle'),
      'no Loop toggle — the document was not recognised as arranged',
    ).toBeVisible()
    await expect(page.getByTestId('strudel-chrome-loop-toggle')).toHaveAttribute('data-loop', 'off')

    const { stoppedAtS, profile } = await watchTransport(page, WATCH_SECONDS, 'arranged')

    expect(stoppedAtS, `still playing after ${WATCH_SECONDS}s — profile: ${profile}`).not.toBeNull()
    // It stopped at the END, not early. A song that stopped at 2s is as broken
    // as one that never stops, and both would satisfy "it stopped".
    expect(
      stoppedAtS!,
      `stopped at ${stoppedAtS}s, expected near ${SONG_SECONDS}s — profile: ${profile}`,
    ).toBeGreaterThan(SONG_SECONDS - CYCLE_SECONDS)
    expect(
      stoppedAtS!,
      `stopped at ${stoppedAtS}s, expected near ${SONG_SECONDS}s — profile: ${profile}`,
    ).toBeLessThan(SONG_SECONDS + 2 * CYCLE_SECONDS)
  })

  test('a looping document is left alone — the control', async ({ page }) => {
    test.setTimeout(180_000)

    await boot(page)
    await setStrudelCode(page, LOOP_DOC)
    await pressPlay(page)

    // No definite end, so no Loop toggle: a control that changes nothing would
    // teach the user that the ones that do work might not.
    await expect(page.getByTestId('strudel-chrome-loop-toggle')).toHaveCount(0)

    const { stoppedAtS, profile } = await watchTransport(page, WATCH_SECONDS, 'looping')
    expect(
      stoppedAtS,
      `a document with no arrangement stopped at ${stoppedAtS}s — profile: ${profile}`,
    ).toBeNull()
  })

  test('Loop ON keeps an arranged song going past its end', async ({ page }) => {
    test.setTimeout(180_000)

    await boot(page)
    await setStrudelCode(page, SONG)
    await pressPlay(page)

    const toggle = page.getByTestId('strudel-chrome-loop-toggle')
    await toggle.click()
    await expect(toggle).toHaveAttribute('data-loop', 'on')

    const { stoppedAtS, profile } = await watchTransport(page, WATCH_SECONDS, 'arranged+loop')
    expect(
      stoppedAtS,
      `Loop was ON and the song still stopped at ${stoppedAtS}s — profile: ${profile}`,
    ).toBeNull()
  })
})
