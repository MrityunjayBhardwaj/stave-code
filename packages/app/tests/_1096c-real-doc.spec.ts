/**
 * SCRATCH PROBE — what does the app show today for a REAL five-part bare
 * document from the corpus (OSRS Sea Shanty 2 Trap Remix, hash 0xt_O6UrjF71)?
 *
 * Counts Song lanes, mixer strips and which meters move. Nothing asserted.
 * Deleted before commit.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const OSRS = `// OSRS Sea Shanty 2 Trap Remix (Melody-Accurate)

setcps(140 / 60);

// Trap kick/snare loop
s("bd ~ sd ~ bd ~ ~ sd")
  .bank("RolandTR808")
  .gain(0.9);

// Hi-hats with swing
s("hh*16")
  .bank("RolandTR808")
  .gain(0.3)
  .pan(tri.range(0.3, 0.7));

// 808 Bassline (simplified to harmonize with melody)
note("fs1 fs1 ~ fs1 d1 ~ a1 ~ e1")
  .sound("gm_synth_bass_1")
  .gain(1.1)
  .lpf(350)
  .room(0.3);

// Accurate Sea Shanty 2 melody transcription
note("fs5 fs5 e5 fs5 a5 g#5 fs5 e5 d5 d5 cs5 b4 a4 b4 cs5 e5")
  .sound("gm_flute")
  .gain(0.8)
  .release(0.35)
  .echo(2, 1/8, 0.6)
  .room(0.4);

// Light clap texture
s("~ cp ~ ~ cp")
  .bank("RolandTR808")
  .gain(0.2)
  .room(0.15);

// @version 1.2`

/** the same document with every statement labelled — the positive control for
 *  "the app can draw five lanes for this music at all". */
const OSRS_LABELLED = OSRS.replace(/^(s\(|note\()/gm, '$: $1')

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
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
  await page.waitForTimeout(150)
}

async function play(page: Page): Promise<void> {
  await page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; focus: () => void; setPosition: (p: { lineNumber: number; column: number }) => void }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.setPosition({ lineNumber: 1, column: 1 })
    t?.focus()
  })
  await page.waitForTimeout(50)
  await page.keyboard.press(`${MOD}+Enter`)
}

async function openMixer(page: Page) {
  const root = page.locator('[data-bottom-panel="root"]')
  await root.locator('[data-bottom-panel="toggle"]').click()
  await root.locator('role=tab[name="Mixer"]').click()
  return root.locator('[data-bottom-panel-tab="mixer-console"]')
}

async function report(page: Page, label: string, code: string) {
  await boot(page)
  const drawer = await openMixer(page)
  await setStrudelCode(page, code)
  await play(page)
  await page.waitForTimeout(2500)

  const strips = await drawer.evaluate((root) =>
    [...root.querySelectorAll('[data-mixer-strip-id]')].map((el) => ({
      id: el.getAttribute('data-mixer-strip-id') ?? '?',
      capture:
        el.querySelector('[data-mixer-meter-capture]')?.getAttribute('data-mixer-meter-capture') ?? null,
      name: (el.querySelector('[data-mixer-strip-name]')?.textContent ?? '').trim(),
    })),
  )
  const peaks: Record<string, number> = {}
  for (let i = 0; i < 40; i++) {
    const reads = await drawer.evaluate((root) =>
      [...root.querySelectorAll('[data-mixer-strip-id]')].map((el) => {
        const f = el.querySelector('[data-mixer-meter-fill]') as HTMLElement | null
        const h = f ? parseFloat(f.style.height) || parseFloat(f.style.width) || 0 : 0
        return { id: el.getAttribute('data-mixer-strip-id') ?? '?', h }
      }),
    )
    for (const r of reads) peaks[r.id] = Math.max(peaks[r.id] ?? 0, r.h)
    await page.waitForTimeout(33)
  }
  const lanes = await page.locator('[data-full-song-lane]').count()

  console.log(`\n=== ${label} ===`)
  console.log(`  mixer strips : ${strips.length}`)
  console.log(`  strips       : ${JSON.stringify(strips)}`)
  console.log(`  peak meters  : ${JSON.stringify(peaks)}`)
  console.log(`  song lanes   : ${lanes}`)
}

test.describe('#1096 real-document probe', () => {
  test('the five-part bare document as written', async ({ page }) => {
    await report(page, 'BARE (as the author wrote it)', OSRS)
  })

  test('the same music, every statement labelled — positive control', async ({ page }) => {
    await report(page, 'LABELLED (positive control)', OSRS_LABELLED)
  })
})
