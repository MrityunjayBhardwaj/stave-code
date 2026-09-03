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
 * ⚠ The toast is selected BY ITS MESSAGE TEXT because it carries no test handle
 * — the gap #1411 is about. When that lands, this should switch to the handle.
 */
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const BOUNCE_SECONDS = 8
const SAVE_ANYWAY = 'Click to save it anyway'

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
  const offer = page.getByText(SAVE_ANYWAY)
  await expect(offer).toBeVisible({ timeout: 60_000 })
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
  await expect(page.getByText(SAVE_ANYWAY)).toHaveCount(0)
})
