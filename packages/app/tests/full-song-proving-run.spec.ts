import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

/**
 * PHASE 2 — THE PROVING RUN.
 *
 * Every claim Stave makes about being a place to write a SONG rested on one
 * observation of 32 seconds. Everything about three and a half minutes was
 * extrapolation. This arm is the first time a full-length arrangement is
 * written, played, sized and bounced end to end.
 *
 * ⚠ MANUAL. `test.skip` unless `PROVING_RUN=1`, because the bounce is
 * real-time: this costs 3.5 minutes of wall clock on its own and has no
 * business in the default gate. Run it deliberately:
 *
 *     PROVING_RUN=1 pnpm --filter @stave/app exec playwright test \
 *       tests/full-song-proving-run.spec.ts --reporter=list
 *
 * ── WHY A SPEC AND NOT A SESSION ─────────────────────────────────────────────
 * The obvious way to do a proving run is by hand, once, and write down what
 * happened. That is the shape that rots: prose nothing can contradict, exactly
 * what `bounceProbe`'s header warns about. Driving the REAL app — Monaco, the
 * File menu, the Bounce modal, the download — through an instrument that can go
 * red means the run can be repeated after every change, and the day one of
 * these assertions starts failing is the day the song path regressed.
 *
 * ⚠ IT IS NOT A SUBSTITUTE FOR A HUMAN WRITING A SONG. It measures outcomes; it
 * cannot feel friction. It cannot tell you whether `arrange()` is PLEASANT to
 * write, which is the open question behind the corpus finding that only 4% of
 * real documents arrange at all. What this proves is a FLOOR, not a ceiling.
 *
 * ── WHAT IT ESTABLISHED ON FIRST RUN (2026-08-31) ────────────────────────────
 *   bounced 208.0000s (expected 208), 104 of 104 whole cycles
 *   opening     0..8    rms 0.0262  quiet
 *   grooving    8..24   rms 0.1325  LOUD
 *   allIn      24..48   rms 0.1713  LOUD
 *   stripped   48..56   rms 0.0372  quiet
 *   allInAgain 56..80   rms 0.1713  LOUD
 *   thinning   80..88   rms 0.0747  quiet
 *   closing    88..104  rms 0.0211  quiet
 *
 * ⚠ AND WHAT THE SECOND RUN ESTABLISHED (2026-09-02), WHICH MATTERS MORE.
 * Re-run before merging, the audio device was at 16kHz rather than 48kHz and
 * EVERY section read roughly double — while the arrangement's contour was
 * untouched and the two repeats still matched each other exactly. The absolute
 * thresholds this arm shipped with therefore failed a CORRECT bounce, which is
 * the third time in three days that a measurement here has reported the sound
 * card instead of the code.
 *
 * ⚠ THE SAMPLE RATE CHANGED TWICE IN ONE HOUR ON ONE MACHINE — 48k, 16k, 48k
 * again — with no configuration touched. That is not an exotic condition to
 * design against; it is Tuesday. Every assertion below is now a RATIO taken
 * within a single run: each section against the song's own loudest section, and
 * each repeat against its twin. Nothing here may carry an absolute level.
 *
 * `allIn` and `allInAgain` reading IDENTICALLY at 0.1713 is the sharpest number
 * in that table: the same musical content, twenty-four cycles apart, rendered
 * the same both times. Reproducibility observed at song length rather than
 * argued from `rand` being a pure function of pattern-local time.
 */

/**
 * 104 cycles at 0.5 cps = 208 seconds = 3:28.
 *
 * ⚠ SECTIONS ARE NAMED BY TEXTURE, NOT BY POP-SONG FORM. Measured over 329 real
 * documents, the nine arrangements that name their arms call them `bass`,
 * `allTogether`, `ambience3`, `section00` — nobody wrote "verse". An earlier
 * draft of this file used intro/verse/chorus, which was DAW vocabulary imported
 * onto a scene that does not speak it.
 *
 * Sections are separated by GAIN as well as content, so the arrangement is
 * legible in an RMS-over-time profile without identifying instruments — the
 * same trick `bounce-arranged-song.spec.ts` uses, at eight times the length.
 */
const SONG = `setcps(120/240)

const kick  = s("bd*2").bank("RolandTR909")
const hats  = s("hh*8").bank("RolandTR909").gain(0.5)
const snare = s("~ sd").bank("RolandTR909")

const bass  = note("c2 ~ eb2 ~ g2 ~ c2 ~").s("sawtooth").cutoff(600).gain(0.8)
const pad   = note("<c3 eb3 g3 bb3>").s("triangle").gain(0.35)
const lead  = note("c4 eb4 g4 bb4 g4 eb4 c4 ~").s("square").gain(0.5)

const opening   = pad.gain(0.25)
const grooving  = stack(kick, hats, bass).gain(0.7)
const allIn     = stack(kick, hats, snare, bass, pad, lead)
const stripped  = stack(pad, bass.gain(0.4)).gain(0.3)
const allInAgain = stack(kick, hats, snare, bass, pad, lead)
const thinning  = stack(pad, lead.gain(0.4)).gain(0.4)
const closing   = pad.gain(0.2)

arrange(
  [8,  opening],
  [16, grooving],
  [24, allIn],
  [8,  stripped],
  [24, allInAgain],
  [8,  thinning],
  [16, closing]
)
`

const CYCLE_SECONDS = 2
const SONG_CYCLES = 8 + 16 + 24 + 8 + 24 + 8 + 16
const SONG_SECONDS = SONG_CYCLES * CYCLE_SECONDS

/** Section boundaries in cycles, for reading the bounced profile back. */
const SECTIONS = [
  { name: 'opening', from: 0, to: 8, loud: false },
  { name: 'grooving', from: 8, to: 24, loud: true },
  { name: 'allIn', from: 24, to: 48, loud: true },
  { name: 'stripped', from: 48, to: 56, loud: false },
  { name: 'allInAgain', from: 56, to: 80, loud: true },
  { name: 'thinning', from: 80, to: 88, loud: false },
  { name: 'closing', from: 88, to: 104, loud: false },
] as const

test.use({
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
})

/**
 * RMS per whole `windowSec` window. Only COMPLETE windows are emitted, so a
 * short file shows up as a missing window rather than a quiet one — which is
 * exactly how #1401's block-truncation was caught.
 */
function cycleRms(path: string, windowSec: number): { seconds: number; windows: number[] } {
  const buf = readFileSync(path)
  const channels = buf.readUInt16LE(22)
  const sampleRate = buf.readUInt32LE(24)
  let off = 12
  while (off + 8 <= buf.length && buf.toString('ascii', off, off + 4) !== 'data') {
    off += 8 + buf.readUInt32LE(off + 4)
  }
  const start = off + 8
  const frames = Math.floor(buf.readUInt32LE(off + 4) / (2 * channels))
  const framesPerWindow = Math.floor(sampleRate * windowSec)
  const windows: number[] = []
  for (let w = 0; (w + 1) * framesPerWindow <= frames; w++) {
    let sum = 0
    let n = 0
    const from = start + w * framesPerWindow * 2 * channels
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
  await page.waitForTimeout(600)
}

test('a full-length song can be written, sized and bounced end to end', async ({ page }) => {
  test.skip(!process.env.PROVING_RUN, 'manual proving run — set PROVING_RUN=1')
  // 3:28 of real-time capture, plus boot, evaluation and encoding.
  test.setTimeout(600_000)

  await boot(page)
  await setStrudelCode(page, SONG)

  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${mod}+Enter`)
  await page.waitForTimeout(3000)

  // ── QUESTION 1: does the app SEE the arrangement? ──────────────────────────
  // Seven arms, each bound to a name — the machinery #1392 fixed, at a length
  // it has never been asked to handle.
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByText('Bounce to WAV...').click()
  await expect(page.getByRole('dialog', { name: 'Bounce to WAV' })).toBeVisible()

  // ── QUESTION 2: does it SIZE the song from its own arrangement? ────────────
  // 3:28 is derivable only by summing the arrange weights against the
  // document's own tempo. A guessed duration cannot land here by accident.
  const offers = page.getByTestId('bounce-song-offers')
  await expect(offers).toBeVisible({ timeout: 20000 })
  const firstOffer = await offers.getByRole('button').first().textContent()
  console.log(`[proving-run] modal offered: ${firstOffer?.trim()}`)
  expect(firstOffer, 'the modal did not size the song at its arranged length').toContain('3:28')

  // ── QUESTION 3: does a full-length bounce actually complete? ───────────────
  const downloadPromise = page.waitForEvent('download', { timeout: 480_000 })
  await offers.getByRole('button').first().click()
  await page.getByRole('button', { name: 'Start Bounce' }).click()
  const download = await downloadPromise
  const wav = (await download.path())!

  const { seconds, windows } = cycleRms(wav, CYCLE_SECONDS)
  console.log(
    `[proving-run] bounced ${seconds.toFixed(4)}s (expected ${SONG_SECONDS}), ${windows.length} whole cycles`,
  )
  for (const s of SECTIONS) {
    const slice = windows.slice(s.from, s.to)
    const mean = slice.reduce((a, b) => a + b, 0) / (slice.length || 1)
    console.log(
      `[proving-run]   ${s.name.padEnd(11)} cycles ${String(s.from).padStart(3)}..${String(s.to).padEnd(3)} mean rms ${mean.toFixed(4)} ${s.loud ? '(loud)' : '(quiet)'}`,
    )
  }

  // The bounce is the whole song, not a fragment. Exact, per #1401 — the
  // capture no longer rounds down to a ScriptProcessor block.
  expect(seconds, `bounce is ${seconds}s, expected ${SONG_SECONDS}s`).toBeGreaterThanOrEqual(
    SONG_SECONDS,
  )
  expect(windows.length, 'the bounce is missing whole cycles').toBeGreaterThanOrEqual(SONG_CYCLES)

  // ── QUESTION 4: is the ARRANGEMENT actually in the file? ───────────────────
  // The sharpest of the four. A bounce can be the right LENGTH and still be the
  // wrong 208 seconds — the rotation bug fixed in #1371 produced exactly that.
  // Loud and quiet sections must land where the arrangement says they do.
  //
  // ⚠ MEASURED AS A FRACTION OF THE SONG'S OWN LOUDEST SECTION, NEVER AS AN
  // ABSOLUTE LEVEL. This arm originally asserted `mean < 0.08` for quiet and
  // `mean > 0.12` for loud, calibrated against one machine. Re-run on a
  // different audio device — 16kHz rather than 48kHz — EVERY section read
  // roughly double, and `thinning` (0.0747 -> 0.1487) crossed the quiet ceiling
  // while the arrangement itself was perfectly intact:
  //
  //     section      48kHz    16kHz   factor
  //     opening      0.0262   0.0524   2.00
  //     grooving     0.1325   0.2309   1.74
  //     allIn        0.1713   0.2875   1.68
  //     stripped     0.0372   0.0745   2.00
  //     allInAgain   0.1713   0.2875   1.68
  //     thinning     0.0747   0.1487   1.99   <- failed the absolute ceiling
  //     closing      0.0211   0.0423   2.00
  //
  // The shape survived exactly; only the LEVEL moved, so the arm had stopped
  // measuring the arrangement and started measuring the sound card. Every
  // section scales together, so dividing by the loudest cancels the device and
  // leaves the only thing this question is about: the arrangement's contour.
  const means = SECTIONS.map((s) => {
    const slice = windows.slice(s.from, s.to)
    return slice.reduce((a, b) => a + b, 0) / (slice.length || 1)
  })
  const loudest = Math.max(...means)

  // Guard the denominator, or the fractions below pass by dividing noise by
  // noise: a bounce of pure silence would give every section a ratio of NaN or
  // 1.0 and the contour check would say nothing at all.
  expect(loudest, 'the whole bounce is silent — there is no contour to check').toBeGreaterThan(0.01)

  // The band preserves the ORIGINAL arm's discriminating power rather than
  // inventing one: 0.12 / 0.08 required loud to clear quiet by 1.5x, and
  // 0.70 / 0.60 asks the same of the normalised readings. Both observed device
  // states clear it with room — quiet tops out at 0.436 (48kHz) and 0.517
  // (16kHz) against a 0.60 ceiling; loud bottoms out at 0.774 and 0.803
  // against a 0.70 floor.
  const QUIET_FRACTION = 0.6
  const LOUD_FRACTION = 0.7
  SECTIONS.forEach((s, i) => {
    const fraction = means[i] / loudest
    if (s.loud) {
      expect(
        fraction,
        `section "${s.name}" (cycles ${s.from}..${s.to}) should be loud — ` +
          `read ${means[i].toFixed(4)}, ${(fraction * 100).toFixed(1)}% of the loudest section`,
      ).toBeGreaterThan(LOUD_FRACTION)
    } else {
      expect(
        fraction,
        `section "${s.name}" (cycles ${s.from}..${s.to}) should be quiet — ` +
          `read ${means[i].toFixed(4)}, ${(fraction * 100).toFixed(1)}% of the loudest section`,
      ).toBeLessThan(QUIET_FRACTION)
    }
  })

  // ── QUESTION 5: is the same content rendered the same twice? ──────────────
  // `allIn` and `allInAgain` are the SAME musical material twenty-four cycles
  // apart. They read identically on the first run (0.1713 twice) and that was
  // the strongest single number in the table — reproducibility observed at song
  // length rather than argued from source. It was only ever printed, never
  // asserted, which is precisely how an observation stops being able to fail.
  //
  // A ratio of the two, so this survives the device change that broke the
  // absolute thresholds above. Observed: 0.1713/0.1713 at 48kHz, and
  // 0.2875/0.2875 and 0.2873/0.2871 across two runs at 16kHz — a spread of
  // 0.07%, so 1% is loose enough not to flake and tight enough that a genuine
  // re-roll between repeats could not hide inside it.
  const iA = SECTIONS.findIndex((s) => s.name === 'allIn')
  const iB = SECTIONS.findIndex((s) => s.name === 'allInAgain')
  const repeatDrift = Math.abs(means[iA] - means[iB]) / means[iA]
  console.log(
    `[proving-run] repeat: allIn ${means[iA].toFixed(4)} vs allInAgain ${means[iB].toFixed(4)} — drift ${(repeatDrift * 100).toFixed(3)}%`,
  )
  expect(
    repeatDrift,
    'the same section rendered differently the second time — a bounce is not reproducible',
  ).toBeLessThan(0.01)
})
