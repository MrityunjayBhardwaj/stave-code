import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

/**
 * #1346 — Bounce to WAV, driven through the real File menu.
 *
 * The point of these arms is the one thing a unit test cannot check: that the
 * bytes are AUDIO. `LiveRecorder` taps the master analyser, so a bounce with
 * the transport stopped resolves with a perfectly valid WAV of pure silence and
 * no error — the same silent-failure shape the offline renderer has (#1353).
 * "A download arrived" and "a WAV parsed" are therefore both false cleans here;
 * only a non-zero sample count means the feature works.
 *
 * The bounce is real-time, so the capture arms genuinely spend their seconds.
 */

const BOUNCE_SECONDS = 8

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
})

/**
 * RMS over a 16-bit stereo WAV's whole PCM payload.
 *
 * Deliberately RMS and not PEAK. `stop()` halts Strudel's scheduler but does
 * not cancel Web Audio nodes already scheduled in the lookahead window, so a
 * bounce taken over a STOPPED transport still catches a fraction of a second of
 * residual tail — which clears any sane peak threshold. Measured: a peak-based
 * arm passed under a break that removed playback entirely. RMS averages that
 * tail down across the take, so it separates "recorded the music" from
 * "recorded the ring-out".
 */
function rmsOf(path: string): number {
  const buf = readFileSync(path)
  // Second half only. A scheduling tail DECAYS; music does not. Measuring the
  // back half is what turns a ~3x separation into a decisive one.
  const start = 44 + Math.floor((buf.length - 44) / 2 / 4) * 4
  let sum = 0
  let n = 0
  for (let i = start; i + 1 < buf.length; i += 2) {
    const v = buf.readInt16LE(i) / 32768
    sum += v * v
    n++
  }
  return n === 0 ? 0 : Math.sqrt(sum / n)
}

/** Sample frames in a 16-bit stereo WAV. */
function framesOf(path: string): number {
  return (readFileSync(path).length - 44) / 4
}

async function openBounceModal(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Bounce to WAV...').click()
  await expect(page.getByRole('dialog', { name: 'Bounce to WAV' })).toBeVisible()
}

test('the File menu offers Bounce to WAV', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await expect(page.getByText('Bounce to WAV...')).toBeVisible()
})

test('a bounce downloads a WAV whose audio is NOT silent', async ({ page }) => {
  test.setTimeout(90_000)
  await openBounceModal(page)
  await page.getByRole('button', { name: `${BOUNCE_SECONDS}s` }).click()

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  const download = await downloadPromise
  const path = await download.path()

  // The assertion that matters, and the threshold is MEASURED, not guessed.
  // Second-half RMS with playback guaranteed: 0.15890. With the playback
  // guarantee removed (engine still initialised, transport stopped): exactly 0,
  // because the scheduling tail has fully decayed by the halfway mark. 0.02 is
  // eight times below the live figure and above any noise floor.
  //
  // An earlier version of this arm measured PEAK over the whole take and passed
  // under that same break — the residual tail alone cleared it. Peak could not
  // tell "recorded the music" from "recorded the ring-out".
  expect(rmsOf(path!)).toBeGreaterThan(0.02)
})

test('the bounce is named .wav', async ({ page }) => {
  test.setTimeout(90_000)
  await openBounceModal(page)
  await page.getByRole('button', { name: `${BOUNCE_SECONDS}s` }).click()

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.wav$/)
})

test('stopping early keeps what was recorded rather than discarding it', async ({ page }) => {
  test.setTimeout(90_000)
  await openBounceModal(page)
  // 60s, so the take can only end by the Stop button.
  await page.getByRole('button', { name: '60s' }).click()

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  await page.getByRole('progressbar').waitFor({ timeout: 15_000 })
  await page.waitForTimeout(4000)
  await page
    .getByRole('dialog', { name: 'Bounce to WAV' })
    .getByRole('button', { name: 'Stop' })
    .click()

  const download = await downloadPromise
  // Well under 60s of audio, and well over zero — a shorter file, not nothing.
  const frames = framesOf((await download.path())!)
  expect(frames).toBeGreaterThan(0)
})

test('a stopped-early bounce is shorter than the length that was asked for', async ({ page }) => {
  test.setTimeout(90_000)
  await openBounceModal(page)
  await page.getByRole('button', { name: '60s' }).click()

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  await page.getByRole('progressbar').waitFor({ timeout: 15_000 })
  await page.waitForTimeout(4000)
  await page
    .getByRole('dialog', { name: 'Bounce to WAV' })
    .getByRole('button', { name: 'Stop' })
    .click()

  const download = await downloadPromise
  expect(framesOf((await download.path())!)).toBeLessThan(60 * 40000)
})

test('the modal closes once the bounce has been saved', async ({ page }) => {
  test.setTimeout(90_000)
  await openBounceModal(page)
  await page.getByRole('button', { name: `${BOUNCE_SECONDS}s` }).click()

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  await downloadPromise

  await expect(page.getByRole('dialog', { name: 'Bounce to WAV' })).toBeHidden({ timeout: 10_000 })
})

/** RMS over the first `ms` of a 16-bit stereo WAV. */
function headRmsOf(path: string, ms: number): number {
  const buf = readFileSync(path)
  const end = Math.min(buf.length, 44 + Math.floor((48000 * ms) / 1000) * 4)
  let sum = 0
  let n = 0
  for (let i = 44; i + 1 < end; i += 2) {
    const v = buf.readInt16LE(i) / 32768
    sum += v * v
    n++
  }
  return n === 0 ? 0 : Math.sqrt(sum / n)
}

/**
 * #1356 — the product path, which is the only one that can answer this.
 *
 * Stopping halts Strudel's scheduler but does not cancel Web Audio nodes
 * already scheduled, so the graph keeps sounding for ~1.25s after the transport
 * reads stopped. A bounce started inside that window SUMS the previous take
 * under the opening of the new file: louder, doubled, no error.
 *
 * Measured on the engine path with zero delay the head ran 24% hot. This arm
 * asks the question through the menu, where the user's own clicks are part of
 * the timing — the only version of it that describes the shipped product.
 */
/**
 * ⚠ THIS ARM ASSERTS A RATIO, NOT A LEVEL, AND THAT IS THE WHOLE POINT (#1357).
 *
 * It used to assert `headRms < 0.155` against figures measured once:
 *
 *     clean, no prior playback        0.1400
 *     after a stop, NO settle         0.1623   (+15.8%)
 *     after a stop, WITH the settle   0.1499   (+7.0%)
 *
 * That threshold went red without any code change, and the cause was not Stave.
 * Re-measured on a different audio-device state the SAME actions on the SAME
 * commit read roughly DOUBLE — 0.30621 clean, 0.31262 after a stop — and the
 * doubling reproduced against a pre-fix `dist`, which rules out the code. An
 * absolute level here measures the sound card as much as the defect, and at
 * 0.155 the old arm failed a CLEAN bounce as surely as a contaminated one.
 *
 * ⚠ Same trap as #1401, one day apart: a threshold calibrated against one
 * hardware property. There a 32s take divided evenly into 4096-frame blocks at
 * 48kHz and not at 44.1kHz; here the level itself scales with the device. When
 * an audio assertion goes red with no plausible code change, suspect the
 * measurement's dependence on hardware BEFORE suspecting whatever shipped last.
 *
 * So both readings are taken in ONE run, on ONE device state, and compared to
 * each other. The ratio band is chosen to preserve exactly the discriminating
 * power the level had: 0.155/0.1400 = 1.107 sat between the with-settle (+7.0%)
 * and no-settle (+15.8%) cases, so it passed with the settle and failed without
 * it. That is what this arm exists to catch — the RINGING TAIL regression of
 * #1356 — and 1.107 catches it identically while surviving a device change.
 *
 * ⚠ It deliberately does NOT catch #1357's residual, which is smaller than the
 * band and always was. Do not tighten this to absorb that; tightening it past
 * the residual makes the arm red for a defect it was never the detector for.
 * Measured residual on the current device state: 0.30621 -> 0.31262, +2.1%.
 *
 * ⚠ The first bounce is itself a play/stop, so the second has TWO behind it.
 * That is fine and deliberate: the elevation saturates after the first — 1, 2
 * and 4 prior cycles all read 0.31262, identical to five decimals — which is
 * also the measurement that ruled out state ACCUMULATING across evaluates.
 */
test('a bounce started right after a stop is not thickened by the previous take', async ({ page }) => {
  test.setTimeout(180_000)

  // Reading 1: a clean bounce, before this page has played anything.
  await openBounceModal(page)
  await page.getByRole('button', { name: `${BOUNCE_SECONDS}s` }).click()
  const cleanDl = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  const cleanRms = headRmsOf((await (await cleanDl).path())!, 1500)

  // Give the graph a real take to ring from.
  await page.locator('[data-testid="strudel-chrome-transport"]').click()
  await expect(page.locator('[data-stave-transport-lcd]')).toContainText('PLAY', { timeout: 15_000 })
  await page.waitForTimeout(2500)
  await page.locator('[data-testid="strudel-chrome-transport"]').click()
  await expect(page.locator('[data-stave-transport-lcd]')).toContainText('STOP', { timeout: 10_000 })

  // Reading 2: no settling pause on purpose — straight into the bounce.
  await openBounceModal(page)
  await page.getByRole('button', { name: `${BOUNCE_SECONDS}s` }).click()
  const afterDl = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  const afterRms = headRmsOf((await (await afterDl).path())!, 1500)

  const ratio = afterRms / cleanRms
  console.log(
    `[#1357] clean=${cleanRms.toFixed(5)} afterStop=${afterRms.toFixed(5)} ratio=${ratio.toFixed(4)}`,
  )

  // A clean bounce must be audible, or the ratio is a division by noise and
  // would pass for the wrong reason.
  expect(cleanRms, 'the clean reference bounce was silent').toBeGreaterThan(0.05)
  expect(ratio, 'the bounce is thickened by the previous take').toBeLessThan(1.107)
})

test('a bounce from a quiet graph reads at the reference level', async ({ page }) => {
  test.setTimeout(120_000)
  await openBounceModal(page)
  await page.getByRole('button', { name: `${BOUNCE_SECONDS}s` }).click()
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  const download = await downloadPromise
  // The reference the arm above is measured against. Pinned as a band so a
  // gain or pattern change moves this arm first, rather than silently
  // invalidating the +15.8% / +7.0% figures that depend on it.
  expect(headRmsOf((await download.path())!, 1500)).toBeGreaterThan(0.130)
})

/**
 * #1356 item 2 — the menu and the palette must agree about availability.
 *
 * `stave.audio.bounce` has always been gated (`when: canBounce()`), so the
 * palette hides it on a tab with no recordable runtime. The menu item was not:
 * it opened the modal and let the user pick a length before admitting, via a
 * toast, that it could not bounce. Only strudel and sonicpi are wired to a
 * runtime, so a hydra tab is the case.
 */
test('the Bounce menu item is disabled on a tab with no audio runtime', async ({ page }) => {
  const hydra = page.locator('[data-file-tree-item*="hydra"]').first()
  await expect(hydra).toHaveCount(1)
  await hydra.dblclick()
  await page.waitForTimeout(800)

  await page.getByRole('button', { name: 'File', exact: true }).click()
  await expect(page.getByText('Bounce to WAV...')).toBeDisabled()
})
