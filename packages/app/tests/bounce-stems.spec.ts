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
 * The sounds that draw randomness (supersaw, reverb, crackle, noise, zzfx) have
 * their own arm below: until #1665 they rendered differently every time, so a
 * set of stems could not be checked against a mix that used them.
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

/** How far apart two renders are: the largest gap, in 16-bit steps, and how many samples differ. */
function apart(a: Buffer, b: Buffer): { steps: number; samples: number; of: number } {
  const x = samplesOf(a)
  const y = samplesOf(b)
  expect(y.length).toBe(x.length)
  let steps = 0
  let samples = 0
  for (let i = 0; i < x.length; i++) {
    const d = Math.round(Math.abs(x[i] - y[i]) * 32768)
    if (d > 0) samples++
    if (d > steps) steps = d
  }
  return { steps, samples, of: x.length }
}

/** The same song, rendered again: one step apart at most, on almost no samples. */
function expectSameRender(a: Buffer, b: Buffer, label: string): void {
  const gap = apart(a, b)
  console.log(`[#1665] ${label}: ${gap.samples}/${gap.of} samples differ, by at most ${gap.steps} step(s)`)
  expect(gap.steps, `${label}: largest difference in 16-bit steps`).toBeLessThanOrEqual(1)
  expect(gap.samples, `${label}: samples that differ`).toBeLessThan(gap.of / 1000)
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

/**
 * #1665 / #1675 — every sound that draws randomness, in one song. Until #1665 each
 * of them rendered differently every time (supersaw 157% of the signal apart,
 * crackle 196%, reverb up to 39%), and white noise matched only until a reload.
 * The draws are now named by the sound they belong to, so the same song bounces
 * to the same samples, after a reload too, and its stems add back up to it with
 * the random sounds in them.
 *
 * ⚠ "The same" is to within one 16-bit step, not byte for byte. With four or
 * more tracks summed, a handful of samples (7 of 768,000, measured) land one
 * step apart between two renders; every pair of these tracks renders exactly.
 * That is the browser summing the same inputs in a different order (float
 * rounding), which nothing in the song controls. Before #1665 the same
 * comparison was thousands of steps apart on nearly every sample.
 */
const RANDOM_DOC = `setcps(0.5)
saw: note("c3 e3").s("supersaw").gain(0.2)
room: note("g3 ~ b3 ~").s("sawtooth").gain(0.2).decay(0.1).sustain(0).room(0.6).size(3)
dust: s("crackle*4").gain(0.8).decay(0.3).sustain(0)
hiss: s("white*4").gain(0.2).decay(0.1).sustain(0)
fx: note("c4 e4").s("z_sawtooth").zrand(0.5).gain(0.2)`

async function reopen(page: Page, code: string): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-workspace-shell="root"]').waitFor({ timeout: 15000 })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 })
  await setDocument(page, code)
}

test('a song with random sounds bounces to the same file every time, and its stems add up to it (#1665)', async ({ page }) => {
  test.setTimeout(240_000)
  await setDocument(page, RANDOM_DOC)

  const first = await bounce(page, 'Mix')
  const second = await bounce(page, 'Mix')
  const m = samplesOf(first.bytes)
  // Not silence agreeing with silence: the song has sound in it.
  expect(rms(m)).toBeGreaterThan(0.01)
  expectSameRender(first.bytes, second.bytes, 'bounced twice')

  // A reload throws away every cache a session keeps (the noise buffer was one).
  await reopen(page, RANDOM_DOC)
  const afterReload = await bounce(page, 'Mix')
  expectSameRender(first.bytes, afterReload.bytes, 'bounced after a reload')

  const stems = await bounce(page, 'Stems')
  const zip = await JSZip.loadAsync(stems.bytes)
  const names = Object.keys(zip.files)
  expect(names).toEqual(['01-saw.wav', '02-room.wav', '03-dust.wav', '04-hiss.wav', '05-fx.wav'])
  const sum = new Float32Array(m.length)
  for (const name of names) {
    const a = samplesOf(await zip.file(name)!.async('nodebuffer'))
    expect(a.length, `${name} length`).toBe(m.length)
    expect(rms(a), `${name} level`).toBeGreaterThan(0.0001)
    for (let i = 0; i < a.length; i++) sum[i] += a[i]
  }
  const diff = new Float32Array(m.length)
  for (let i = 0; i < m.length; i++) diff[i] = m[i] - sum[i]
  const residual = rms(diff) / rms(m)
  console.log(`[#1665] mix rms ${rms(m).toFixed(4)} · stems residual ${residual.toFixed(4)}`)
  // The same bound as the deterministic song above. Before #1665 two renders of
  // one master already differed by more than this.
  expect(residual).toBeLessThan(0.01)
  await expectNoUncaught(page)
})

/**
 * #1675 — a bounce hears its reverb from the first note. The room's impulse
 * response is built asynchronously, and a render outran it by about four
 * seconds of song, so every bounce started dry. One short note every two
 * seconds into a long room: the tail after the first note must be as present
 * as the tail after a note well past that point. Both windows are in one file,
 * so the ratio carries no device level with it.
 */
test('a bounce has its reverb from the first note, not from seconds in (#1675)', async ({ page }) => {
  test.setTimeout(120_000)
  await setDocument(page, `setcps(0.5)
$: note("c3").s("sawtooth").gain(0.4).decay(0.05).sustain(0).room(0.9).size(4)`)
  const { bytes } = await bounce(page, 'Mix')
  const s = samplesOf(bytes)
  // The file's own rate, from its header, not an assumed one.
  const sr = bytes.readUInt32LE(24)
  const tail = (from: number, to: number) => rms(s.subarray(Math.round(from * sr) * 2, Math.round(to * sr) * 2))
  // Well after the note (50 ms) and before the next one (2 s): reverb only.
  const early = tail(0.4, 1.9)
  const late = tail(6.4, 7.9)
  console.log(`[#1675] sr=${sr} early tail ${early.toFixed(5)} · late tail ${late.toFixed(5)}`)
  expect(late).toBeGreaterThan(0.0005)
  expect(early / late).toBeGreaterThan(0.8)
  await expectNoUncaught(page)
})
