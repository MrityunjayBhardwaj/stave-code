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
