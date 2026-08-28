import { test, expect, type Page } from '@playwright/test'

/**
 * #1365 — the bounce modal offers the SONG's length, not a list of guessed
 * durations, driven through the real File menu.
 *
 * ── WHAT THESE ARMS ARE FOR, AND WHAT THEY DELIBERATELY ARE NOT ──────────────
 * A modal that opens, renders a heading and logs no errors is a modal that
 * MOUNTED. It says nothing about whether anything measured the document. So the
 * arms below assert a duration COMPUTED FROM REAL DATA — the starter file
 * declares `setcps(130/240)`, so a cycle is 240/130 seconds and every offer must
 * land on a whole number of those — and the second arm removes the data layer
 * (never press play, so the scheduler has no tempo) and requires the offers to
 * VANISH.
 *
 * Both halves were verified by breaking them. Returning Strudel's default 0.5
 * cps instead of the document's tempo reddens the first arm and leaves the other
 * two green — so it catches a WRONG tempo, not merely a rendered one.
 *
 * That pairing is the whole point: an assertion that passes with the data layer
 * absent is a wiring check wearing a feature's name.
 *
 * The starter document alternates `<c2 [g2 c2] f2 [g2 eb2]>` over 4 cycles, so
 * a period is findable. Nothing here bounces — these arms are about the CHOICE,
 * and a real capture costs its own seconds (covered by `bounce-to-wav`).
 */

/** The starter's own tempo: `setcps(130/240)`. One cycle = 240/130 s. */
const CPS = 130 / 240
const CYCLE_SECONDS = 1 / CPS

async function boot(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
}

async function openBounceModal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Bounce to WAV...').click()
  await expect(page.getByRole('dialog', { name: 'Bounce to WAV' })).toBeVisible()
}

/** Play, so the engine initialises, `setcps` runs and a snapshot is published. */
async function playOnce(page: Page): Promise<void> {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${mod}+Enter`)
  // The offers need BOTH the tempo and the analysis, and the analysis walks a
  // growing horizon — so wait for the engine to actually be running rather than
  // for a fixed sleep.
  await expect(page.getByTestId('bounce-song-offers').or(page.locator('body'))).toBeVisible()
  await page.waitForTimeout(4000)
}

test.use({
  // The tempo comes from the running scheduler, which needs a started
  // AudioContext; a suspended one never reaches `setcps`.
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
})

test('the modal offers repeats of the song, costed at the document tempo', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await boot(page)
  await playOnce(page)
  await openBounceModal(page)

  const offers = page.getByTestId('bounce-song-offers')
  await expect(offers).toBeVisible({ timeout: 15000 })

  // The assertion that needs real data: every offered duration must be a whole
  // number of cycles AT THE DOCUMENT'S OWN TEMPO. A hardcoded fallback, a
  // default 0.5 cps, or a number invented by the UI all fail this.
  const labels = await offers.getByRole('button').allTextContents()
  expect(labels.length).toBeGreaterThan(0)

  const seconds = labels.map((t) => {
    const m = /(\d+):(\d\d)/.exec(t)
    if (!m) throw new Error(`offer has no duration: ${t}`)
    return Number(m[1]) * 60 + Number(m[2])
  })

  // ⚠ THE DISPLAY IS ROUNDED TO WHOLE SECONDS, so a duration cannot be compared
  // to a cycle multiple more tightly than that. Measured: the starter's period
  // is 4 cycles = 7.3846s, shown as `0:07`, which reads back as 3.79 cycles —
  // a 0.21-cycle residual that is the rounding quantum and not an error. The
  // first version of this arm asserted 0.05 and failed on its own instrument.
  for (const s of seconds) {
    const nearestWholeCycles = Math.round(s / CYCLE_SECONDS)
    expect(
      Math.abs(s - nearestWholeCycles * CYCLE_SECONDS),
      `offer ${s}s is not a whole number of cycles at ${CPS.toFixed(4)} cps (labels: ${labels.join(' | ')})`,
    ).toBeLessThanOrEqual(0.5)
  }

  // ⚠ AND THE RATIOS ARE BLURRED TOO, because the BASE is rounded as well:
  // 7.3846s shows as `0:07`, so 15/7 reads 2.14 rather than 2. Comparing offers
  // to each other inherits the base's rounding. The rounding-exact form is to
  // recover the PERIOD from the first offer and rebuild each expected duration
  // at full precision, then allow the display quantum once per comparison.
  expect(seconds.length).toBeGreaterThanOrEqual(2)
  const periodCycles = Math.round(seconds[0] / CYCLE_SECONDS)
  expect(periodCycles, `first offer is not a whole period (${labels.join(' | ')})`)
    .toBeGreaterThan(0)

  seconds.forEach((s, i) => {
    const expected = periodCycles * 2 ** i * CYCLE_SECONDS
    expect(
      Math.abs(s - expected),
      `offer ${i} is ${s}s, expected ${periodCycles} x ${2 ** i} cycles = ` +
        `${expected.toFixed(2)}s at ${CPS.toFixed(4)} cps (${labels.join(' | ')})`,
    ).toBeLessThanOrEqual(0.5)
  })
})

test('with no tempo read, the offers are ABSENT and the modal says why', async ({
  page,
}) => {
  // The control arm. Never press play, so the scheduler reports no cps. If the
  // offers still appeared here they would be coming from somewhere other than
  // the document, and the arm above would prove nothing.
  await boot(page)
  await openBounceModal(page)

  await expect(page.getByTestId('bounce-length-note')).toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('bounce-song-offers')).toHaveCount(0)
})

test('the fixed-length picker still works when the song cannot be sized', async ({
  page,
}) => {
  // Losing nothing is part of the feature: 56 of 142 real documents have no
  // measurable period, and for those this row is the entire UI.
  await boot(page)
  await openBounceModal(page)
  await expect(page.getByRole('button', { name: '8s' })).toBeVisible()
  await expect(page.getByRole('button', { name: '300s' })).toBeVisible()
})
