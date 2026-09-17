import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { expectNoUncaught, watchUncaught } from './_uncaught'

/**
 * #1648 — exporting stems, driven through the real File menu.
 *
 * A zip that downloads and holds WAVs proves the plumbing, not the feature. The
 * feature is that each file is ONE TRACK of the song you hear: so the arm
 * bounces the same document as a mix too, and requires the stems to add back up
 * to it, sample for sample within a small residual. That fails if a stem missed
 * `all(...)` (the per-track captures are taken before it: 42% off, measured), if
 * a sound no track owns went missing (it has its own stem), or if a stem is
 * shifted or a different length.
 *
 * The document avoids supersaw and reverb on purpose: those draw fresh
 * randomness every render, so two renders of the same song never match exactly
 * (#1665). Every sound here renders the same twice.
 */

const SECONDS = 8

const DOC = `setcps(0.5)
drums: s("bd*4").gain(0.6)
$: note("c3 e3 g3 b3").s("sawtooth").gain(0.3).lpf(1200)
$: s("hh*4").gain(0)
all(x => x.postgain(0.8).stack(s("cp*2").gain(0.4)))`

test.beforeEach(async ({ page }) => {
  await watchUncaught(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
})

async function setDocument(page: Page, code: string): Promise<void> {
  await page.locator('.monaco-editor').first().click()
  await page.evaluate((c) => {
    const eds = ((window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { setValue: (s: string) => void; getLanguageId?: () => string } | null }> } } }).monaco?.editor?.getEditors?.()) ?? []
    const target = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    target?.getModel()?.setValue(c)
  }, code)
}

async function openBounceModal(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Bounce to WAV...').click()
  await expect(page.getByRole('dialog', { name: 'Bounce to WAV' })).toBeVisible()
}

/** Interleaved stereo samples of a 16-bit WAV, as floats. */
function samplesOf(bytes: Buffer): Float32Array {
  const n = Math.floor((bytes.length - 44) / 2)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = bytes.readInt16LE(44 + i * 2) / 32768
  return out
}

function rms(a: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * a[i]
  return Math.sqrt(s / Math.max(1, a.length))
}

async function bounce(page: Page, kind: 'Mix' | 'Stems'): Promise<{ name: string; bytes: Buffer }> {
  await openBounceModal(page)
  await page.getByRole('button', { name: `${SECONDS}s` }).click()
  await page.getByTestId('bounce-export-kind').getByRole('button', { name: kind }).click()
  const downloadPromise = page.waitForEvent('download', { timeout: 90_000 })
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  const download = await downloadPromise
  const bytes = readFileSync((await download.path())!)
  await expect(page.getByRole('dialog', { name: 'Bounce to WAV' })).toBeHidden({ timeout: 30_000 })
  return { name: download.suggestedFilename(), bytes }
}

test('stems export one WAV per track in a zip, and they add back up to the mix (#1648)', async ({ page }) => {
  test.setTimeout(180_000)
  await setDocument(page, DOC)

  const stems = await bounce(page, 'Stems')
  expect(stems.name).toMatch(/-stems\.zip$/)
  // The silent track is named, not shipped as a file of zeros.
  await expect(page.getByText(/Stems saved — 3 tracks; no file for d3/)).toBeVisible({ timeout: 10_000 })

  const mix = await bounce(page, 'Mix')
  expect(mix.name).toMatch(/\.wav$/)

  const zip = await JSZip.loadAsync(stems.bytes)
  const names = Object.keys(zip.files)
  // Tracks in document order, named as the mixer names them; the sound `all(...)`
  // adds and no track owns is its own stem, so the set can add up to the mix.
  expect(names).toEqual(['01-drums.wav', '02-d2.wav', '04-song-level.wav'])

  const m = samplesOf(mix.bytes)
  const sum = new Float32Array(m.length)
  const levels: Record<string, number> = {}
  for (const name of names) {
    const a = samplesOf(await zip.file(name)!.async('nodebuffer'))
    // Same length as the mix, sample for sample: lined up, nothing cut.
    expect(a.length, `${name} length`).toBe(m.length)
    levels[name] = rms(a)
    for (let i = 0; i < a.length; i++) sum[i] += a[i]
  }
  const diff = new Float32Array(m.length)
  for (let i = 0; i < m.length; i++) diff[i] = m[i] - sum[i]
  const residual = rms(diff) / rms(m)
  console.log(`[#1648] mix rms ${rms(m).toFixed(4)} · stems ${JSON.stringify(levels)} · residual ${residual.toFixed(4)}`)

  // Every stem has sound of its own…
  for (const name of names) expect(levels[name], `${name} level`).toBeGreaterThan(0.005)
  // …and together they are the mix. Measured 0.0002 on this document; 0.01 is
  // far below what a missed transform (0.42) or a missing stem does.
  expect(residual).toBeLessThan(0.01)
  await expectNoUncaught(page)
})

/**
 * #1666 — a stems export renders the song once per track and holds every result
 * until the zip is built, so its cost is seconds × tracks. Six tracks of an
 * hour held 4.1 GB and failed in the archive step, after paying for every
 * render. The dialog is where that has to be caught, because it is the only
 * place the length is chosen.
 *
 * Driven through the real menu because the track count is the part a unit test
 * cannot supply: it comes from the engine's own registered tracks, through the
 * bounce handle, and only once the document has been evaluated.
 */
const THIRTEEN_TRACKS = `setcps(0.5)
${Array.from({ length: 13 }, (_, i) => `$: note("c${2 + (i % 4)}").s("sine").gain(0.1)`).join('\n')}`

test('a stems export of many tracks is offered less than the mix (#1666)', async ({ page }) => {
  test.setTimeout(120_000)
  await setDocument(page, THIRTEEN_TRACKS)
  // The count comes from the engine's registered tracks, so the document has to
  // have been evaluated — pressing play is how a user gets there.
  // PROBE: no play — is the track count known?

  await openBounceModal(page)
  const dialog = page.getByRole('dialog', { name: 'Bounce to WAV' })
  // As a mix, the whole fixed grid is on offer.
  await expect(dialog.getByRole('button', { name: '300s', exact: true })).toBeVisible()

  await page.getByTestId('bounce-export-kind').getByRole('button', { name: 'Stems' }).click()
  // 3600 / 13 = 276s, so the longest fixed pick goes and the next one stays.
  await expect(dialog.getByRole('button', { name: '300s', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '120s', exact: true })).toBeVisible()

  // …and it comes back on Mix, so this is the stems ceiling and not a document
  // that could never offer 300s in the first place.
  await page.getByTestId('bounce-export-kind').getByRole('button', { name: 'Mix' }).click()
  await expect(dialog.getByRole('button', { name: '300s', exact: true })).toBeVisible()
  await expectNoUncaught(page)
})
