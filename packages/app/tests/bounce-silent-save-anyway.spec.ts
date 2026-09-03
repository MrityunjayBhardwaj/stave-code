/**
 * A document that is MEANT to be silent can still be bounced (#1410) —
 * Playwright observation (AnviDev observe gate).
 *
 * #1402 made the capture boundary refuse to hand back a WAV of silence, which
 * was right: a bounce that recorded nothing used to download a full-length file
 * of zeros and say "Bounce saved." But the refusal was absolute, and two callers
 * could opt out where no user could — so someone whose document genuinely plays
 * nothing had no way to get their file at all. Measured over the real corpus:
 * 4 of 142 evaluable documents are silent. Rare, not hypothetical.
 *
 * The escape is a second chance rather than a setting. The take is ALREADY
 * encoded when the guard fires (the peak is not known until the samples have
 * been walked), so it rides on the error and keeping it costs one click instead
 * of re-recording a three-minute bounce.
 *
 * ⚠ DELIBERATELY NOT A CHECKBOX IN THE BOUNCE MODAL. That would ask every user
 * to answer a question that 4 documents in 142 will ever face, before they know
 * whether it applies to them.
 *
 * ⚠ THE SECOND ARM IS THE CONTROL AND IT IS NOT OPTIONAL. Without it, the first
 * arm cannot distinguish "the refusal fired correctly" from "the app now offers
 * to save everything" — and an always-on offer would be a regression that reads
 * as a pass.
 *
 * ⚠ SELECTION IS BY HANDLE, ASSERTION IS ON TEXT (#1411). The toast now carries
 * `data-testid` + `data-level`, so these arms no longer break silently when
 * someone rewords the message. But the handle alone does NOT identify the
 * refusal: the generic "Bounce failed — see console" fallback is an error toast
 * too, and the specific message only renders because `err instanceof
 * SilentCaptureError` survives the app↔editor package boundary. So the text is
 * still asserted, precisely — a loose regex over both would pass while that
 * silently broke.
 */
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const BOUNCE_SECONDS = 8
const SAVE_ANYWAY = 'Click to save it anyway'
const ERROR_TOAST = '[data-testid="toast"][data-level="error"]'
const TOAST_ACTION = '[data-testid="toast-action"]'

test.beforeEach(async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15_000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15_000 })
})

async function openBounceModal(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Bounce to WAV...').click()
  await expect(page.getByRole('dialog', { name: 'Bounce to WAV' })).toBeVisible()
  await page.getByRole('button', { name: `${BOUNCE_SECONDS}s` }).click()
}

test('a silent document is refused, then saved on request — full length and honest', async ({
  page,
}) => {
  test.setTimeout(120_000)

  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type('silence', { delay: 10 })
  await page.waitForTimeout(300)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1500)

  await openBounceModal(page)

  let autoDownloaded = false
  page.on('download', () => {
    autoDownloaded = true
  })
  await page.getByRole('button', { name: 'Start Bounce' }).click()

  // The offer appears; the file does NOT arrive by itself.
  const offer = page.locator(ERROR_TOAST).locator(TOAST_ACTION)
  await expect(offer).toBeVisible({ timeout: 60_000 })
  // Selected by handle, but pinned on the message: this must be the refusal
  // the user can act on, not the generic "see console" fallback.
  await expect(offer).toContainText(SAVE_ANYWAY)
  expect(autoDownloaded, 'a silent bounce must not save itself').toBe(false)

  // Taking the offer hands over the take.
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
  await offer.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.wav$/)

  const path = await download.path()
  const buf = readFileSync(path!)
  // ⚠ FULL LENGTH, not truncated at the throw: 44-byte header + 8s stereo
  // 16-bit. The guard fires after the samples are written, so the whole take is
  // there — a shorter file would mean the escape hands over a different bounce
  // from the one that was refused.
  expect(buf.subarray(0, 4).toString()).toBe('RIFF')
  const frames = (buf.length - 44) / 4
  expect(frames).toBeGreaterThan(BOUNCE_SECONDS * 40_000)

  // And it is honestly silent — the point is that the USER chose to keep it,
  // not that the file turned out to have audio after all.
  let nonZero = 0
  for (let i = 44; i + 1 < buf.length; i += 2) {
    if (buf.readInt16LE(i) !== 0) nonZero++
  }
  expect(nonZero, 'the saved take should be the silence that was refused').toBe(0)
})

test('CONTROL — an audible document still saves itself, with no offer to save anyway', async ({
  page,
}) => {
  test.setTimeout(120_000)
  // The default document plays. Nothing about the escape should touch this path.
  await openBounceModal(page)

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.wav$/)
  // Nothing was refused, so there is no error toast at all — a stronger claim
  // than "the offer text is absent", and one the handle makes cheap to state.
  await expect(page.locator(ERROR_TOAST)).toHaveCount(0)
})

test('a keyboard-only user can retrieve a refused bounce (#1411)', async ({ page }) => {
  test.setTimeout(120_000)

  // ⚠ THIS IS THE PATH #1410 CREATED AND LEFT UNREACHABLE. The offer to keep a
  // refused take exists ONLY on the toast — there is no menu item, no dialog,
  // no second chance. Before #1411 the toast body had an `onClick` and nothing
  // else: no tab stop, no key handler. Someone working without a mouse could
  // watch their bounce be refused and have no way to ask for it, and the cost
  // of missing it is re-recording the whole take in real time.
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type('silence', { delay: 10 })
  await page.waitForTimeout(300)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1500)

  await openBounceModal(page)
  await page.getByRole('button', { name: 'Start Bounce' }).click()

  const offer = page.locator(ERROR_TOAST).locator(TOAST_ACTION)
  await expect(offer).toBeVisible({ timeout: 60_000 })
  await expect(offer).toContainText(SAVE_ANYWAY)

  // Reach it the way a keyboard user does — by walking the tab order, not by
  // calling focus() on it. Programmatic focus would prove the element accepts
  // focus while saying nothing about whether anyone can GET there, which is
  // the half that was actually missing. Bounded so a failure reports "never
  // reached" instead of hanging; the toast lives 20s, this takes about one.
  let reached = false
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press('Tab')
    reached = await offer.evaluate((el) => el === document.activeElement)
  }
  expect(reached, 'the offer must be reachable by Tab').toBe(true)

  // And Enter must activate it — the native <button> behaviour that a
  // `div` with an onClick does not have.
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
  await page.keyboard.press('Enter')
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.wav$/)

  const buf = readFileSync((await download.path())!)
  expect(buf.subarray(0, 4).toString()).toBe('RIFF')
  expect((buf.length - 44) / 4).toBeGreaterThan(BOUNCE_SECONDS * 40_000)
})
