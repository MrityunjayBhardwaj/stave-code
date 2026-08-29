import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

/**
 * #1371 — a bounce of an ARRANGED document exports the song from the top.
 *
 * ── WHY THIS ARM EXISTS ──────────────────────────────────────────────────────
 * Every other bounce spec drives the starter file, which has no arrangement at
 * all — so until this one, nothing checked that a bounce contains a SONG rather
 * than a loop, and nobody had listened to one.
 *
 * The recorder taps the master analyser in real time, so it captures whatever
 * the transport is playing at that instant. Before #1371 the transport was
 * left wherever the listening had got to, and the exported song came out
 * ROTATED by however long you had been playing it: measured on this exact
 * document, a 4s wait rotated it 4s and a 12s wait rotated it 12s, so the file
 * opened mid-verse. Nothing surfaced it — the WAV is valid, full-length and not
 * silent. Only the audio shows it, which is why this arm reads the audio.
 *
 * ── WHAT MAKES IT A REGRESSION ARM RATHER THAN A WIRING CHECK ────────────────
 * The `LISTEN_BEFORE_BOUNCE_S` wait is the whole point. Remove it and the arm
 * passes against the old, broken behaviour too, because with no elapsed time
 * there is no rotation to see. The wait is what makes the assertion capable of
 * failing.
 *
 * ── THE DOCUMENT ─────────────────────────────────────────────────────────────
 * Sections are separated by GAIN, not timbre, so the arrangement is legible in
 * an RMS-over-time profile without identifying instruments:
 *
 *   [4, intro]  gain 0.25   quiet    cycles  0..4    seconds  0..8
 *   [8, verse]  gain 1.0    LOUD     cycles  4..12   seconds  8..24
 *   [4, outro]  gain 0.25   quiet    cycles 12..16   seconds 24..32
 *
 * at `setcps(120/240)` = 0.5 cps, so a cycle is 2s and the song is 32s. The
 * modal sizes it from the document's own arrangement and offers `1 repeat 0:32`.
 */

/** `setcps(120/240)`. One cycle = 2s. */
const CYCLE_SECONDS = 2
/** Σ arm weights = 4 + 8 + 4. */
const SONG_CYCLES = 16
const SONG_SECONDS = SONG_CYCLES * CYCLE_SECONDS

/** Seconds of listening before the bounce — the condition under test. */
const LISTEN_BEFORE_BOUNCE_S = 12

const SONG = `setcps(120/240)

const intro = s("bd ~ ~ ~").bank("RolandTR909").gain(0.25)

const verse = stack(
  s("bd*2 sd*2").bank("RolandTR909"),
  s("hh*8").bank("RolandTR909").gain(0.7)
).gain(1)

const outro = s("bd ~ ~ ~").bank("RolandTR909").gain(0.25)

arrange([4, intro], [8, verse], [4, outro])
`

/**
 * RMS per window over a 16-bit stereo WAV.
 *
 * The window is ONE CYCLE, deliberately. The verse alternates a loud downbeat
 * with a quieter offbeat (0.236 / 0.097 measured), so a per-second profile puts
 * genuine verse seconds below any threshold that also clears the intro. A
 * whole-cycle window averages the beat structure out and leaves only the
 * section's own level: intro ~0.03 against verse ~0.18.
 */
function cycleRms(path: string, windowSec: number): { seconds: number; windows: number[] } {
  const buf = readFileSync(path)
  const sampleRate = buf.readUInt32LE(24)
  const channels = buf.readUInt16LE(22)
  const frames = (buf.length - 44) / (2 * channels)
  const framesPerWindow = Math.floor(sampleRate * windowSec)
  const windows: number[] = []
  for (let w = 0; (w + 1) * framesPerWindow <= frames; w++) {
    let sum = 0
    let n = 0
    const from = 44 + w * framesPerWindow * 2 * channels
    const to = from + framesPerWindow * 2 * channels
    for (let i = from; i + 1 < to && i + 1 < buf.length; i += 2) {
      const v = buf.readInt16LE(i) / 32768
      sum += v * v
      n++
    }
    windows.push(n === 0 ? 0 : Math.sqrt(sum / n))
  }
  return { seconds: frames / sampleRate, windows }
}

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

test.use({
  // The tempo and the arrangement both come from the running scheduler, which
  // needs a started AudioContext; a suspended one never reaches `setcps`.
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
})

test('a bounce taken mid-listen still exports the song from its first bar', async ({ page }) => {
  test.setTimeout(240_000)

  await boot(page)
  await setStrudelCode(page, SONG)

  // Play, and then LISTEN for a while — the condition that used to rotate the
  // export. Without this wait the arm cannot fail.
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${mod}+Enter`)
  await page.waitForTimeout(LISTEN_BEFORE_BOUNCE_S * 1000)

  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Bounce to WAV...').click()
  await expect(page.getByRole('dialog', { name: 'Bounce to WAV' })).toBeVisible()

  // The modal must have measured the ARRANGEMENT, not guessed a duration: the
  // document's extent is Σ weight = 16 cycles = 32s at its own tempo.
  const offers = page.getByTestId('bounce-song-offers')
  await expect(offers).toBeVisible({ timeout: 15000 })
  const firstOffer = await offers.getByRole('button').first().textContent()
  expect(firstOffer, 'the modal did not size the song at its arranged length').toContain('0:32')

  const downloadPromise = page.waitForEvent('download', { timeout: 180_000 })
  await offers.getByRole('button').first().click()
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  const download = await downloadPromise
  const wav = (await download.path())!

  const { seconds, windows } = cycleRms(wav, CYCLE_SECONDS)
  const profile = windows.map((r, i) => `${i * CYCLE_SECONDS}s ${r.toFixed(4)}`).join('  ')

  expect(seconds, `bounce is ${seconds}s, expected ${SONG_SECONDS}s`).toBeGreaterThan(SONG_SECONDS - 1.5)

  // Measured on this document: intro/outro windows ~0.029, verse windows ~0.18.
  // The thresholds sit either side of that gap with room to spare, so the arm
  // tests WHICH SECTION is playing rather than an exact level.
  const QUIET = 0.08
  const LOUD = 0.12

  // Cycles 0..3 — intro. Under the old behaviour a 12s wait opened this window
  // in the middle of the verse, so this is the assertion that catches it.
  for (let w = 0; w < 4; w++) {
    expect(windows[w], `cycle ${w} should be the quiet intro — profile: ${profile}`).toBeLessThan(QUIET)
  }
  // Cycles 4..11 — the verse, all eight of them.
  for (let w = 4; w < 12; w++) {
    expect(windows[w], `cycle ${w} should be the loud verse — profile: ${profile}`).toBeGreaterThan(LOUD)
  }
  // Cycles 12..15 — outro. Distinguishes a correct song from one that merely
  // starts right and then runs past its end.
  for (let w = 12; w < 16; w++) {
    expect(windows[w], `cycle ${w} should be the quiet outro — profile: ${profile}`).toBeLessThan(QUIET)
  }
})
