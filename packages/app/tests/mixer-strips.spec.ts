/**
 * Mixer channel-strip row — S0 (#540). Read-only projection: one strip per
 * top-level statement, cursor-independent, with name / source / pan / gain
 * readouts derived purely from the document.
 *
 * The strip band shares the Pattern ▸ Mixer column with the #381 param panel,
 * which keeps priority in a short drawer — so these assert the strips' presence
 * and content in the DOM (always rendered, scrollable) rather than fixed screen
 * coordinates.
 */
import { test, expect, type Page } from '@playwright/test'

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

/**
 * open the global Mixer console tab (#540 / S4 — the strip band lives here now)
 * and return a locator SCOPED to its panel. Both tab bodies stay mounted (the
 * bottom panel only hides the inactive one), so the Pattern tab's local strip
 * also carries `data-mixer-strip-id` — scoping the returned locator to the
 * console panel keeps strip selectors unambiguous.
 */
async function openMixer(page: Page) {
  const root = page.locator('[data-bottom-panel="root"]')
  await root.locator('[data-bottom-panel="toggle"]').click()
  await root.locator('role=tab[name="Mixer"]').click()
  return root.locator('[data-bottom-panel-tab="mixer-console"]')
}

/** open the Pattern tab — its grid (sequencer/roll) sits beside the cursor
 *  track's local mixer strip, so a grid edit and that track's meter are
 *  co-visible (the global Mixer tab shows strips but not the grid). Returns a
 *  locator scoped to the Pattern panel. */
async function openPattern(page: Page) {
  const root = page.locator('[data-bottom-panel="root"]')
  await root.locator('[data-bottom-panel="toggle"]').click()
  await root.locator('role=tab[name="Pattern"]').click()
  return root.locator('[data-bottom-panel-tab="pattern"]')
}

/** drag the drawer taller so the full strip (incl. fader) is on screen */
async function enlargeDrawer(page: Page): Promise<void> {
  const handle = page.locator('[data-bottom-panel="resize-handle"]')
  const hb = await handle.boundingBox()
  if (!hb) return
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 320, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}

async function strudelValue(page: Page): Promise<string> {
  return page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string; getValue: () => string } | null }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

async function undo(page: Page): Promise<void> {
  await page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; trigger: (s: string, id: string, p: unknown) => void }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.trigger('test', 'undo', null)
  })
  await page.waitForTimeout(60)
}

/** vertical drag on a strip's fader by `dyUp` pixels (up = louder) */
async function dragFader(page: Page, drawer: ReturnType<Page['locator']>, stripId: string, dyUp: number): Promise<void> {
  const fader = drawer.locator(`[data-mixer-strip-id="${stripId}"] [data-mixer-strip-fader]`)
  const box = await fader.boundingBox()
  if (!box) throw new Error(`no fader box for ${stripId}`)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy - dyUp, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(80)
}

/** the strudel editor's current caret line (1-based), or -1 if no editor */
async function cursorLine(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; getPosition: () => { lineNumber: number } | null }> } } }).monaco
    const eds = m?.editor?.getEditors?.() ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getPosition?.()?.lineNumber ?? -1
  })
}

test.describe('Mixer strip row (#540 / S0)', () => {
  test('renders one strip per top-level statement, in source order', async ({ page }) => {
    await boot(page)
    await setStrudelCode(
      page,
      ['$: s("bd sn")', 'd1: note("c e g").sound("piano")', '$: s("hh*4")'].join('\n'),
    )
    const drawer = await openMixer(page)
    const strips = drawer.locator('[data-mixer-strip]')
    await expect(strips).toHaveCount(3)
    // names: anonymous $: fall back to head/source; the named track keeps its label
    // (a mix console names channels — the source line was dropped in S4).
    await expect(strips.nth(1).locator('[data-mixer-strip-name]')).toHaveText('d1')
    // kinds projected from the head fn
    await expect(strips.nth(0)).toHaveAttribute('data-mixer-strip-kind', 'step')
    await expect(strips.nth(1)).toHaveAttribute('data-mixer-strip-kind', 'roll')
  })

  test('reads gain as a dB fader readout, pan as L/C/R', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").gain(1).pan(0.8)')
    const drawer = await openMixer(page)
    const strip = drawer.locator('[data-mixer-strip]').first()
    await expect(strip.locator('[data-mixer-strip-db]')).toHaveText('0.0') // gain 1 = 0 dB
    await expect(strip.locator('[data-mixer-strip-pan]')).toHaveText('R60') // 0.8 → R60
  })

  test('hands off a signal gain (fader disabled, shown as "sig")', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").gain(sine)')
    const drawer = await openMixer(page)
    const strip = drawer.locator('[data-mixer-strip]').first()
    await expect(strip.locator('[data-mixer-strip-gain]')).toHaveText('sig')
  })

  test('re-derives the strip list when the document changes (pure projection)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd")')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-mixer-strip]')).toHaveCount(1)
    await setStrudelCode(page, '$: s("bd")\n$: s("hh")\nd1: note("c e")')
    await expect(drawer.locator('[data-mixer-strip]')).toHaveCount(3)
  })
})

test.describe('Mixer strip write-back (#540 / S1)', () => {
  test('dragging a fader sets that track gain; siblings byte-identical; one undo', async ({ page }) => {
    await boot(page)
    const original = '$: s("bd").gain(0.5)\nd1: note("c e").gain(0.8)\n$: s("hh*4").gain(0.5)'
    await setStrudelCode(page, original)
    const drawer = await openMixer(page)
    await enlargeDrawer(page)

    // drag the SECOND anonymous strip (#1 = the hh*4 line) up → louder
    await dragFader(page, drawer, '#1', 40)
    const after = await strudelValue(page)
    const lines = after.split('\n')
    // only the third line changed; lines 0 and 1 are byte-identical
    expect(lines[0]).toBe('$: s("bd").gain(0.5)')
    expect(lines[1]).toBe('d1: note("c e").gain(0.8)')
    const m = lines[2].match(/^\$: s\("hh\*4"\)\.gain\((\d*\.?\d+)\)$/)
    expect(m, `unexpected line: ${lines[2]}`).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(0.5)

    // one undo reverts the whole drag
    await undo(page)
    expect(await strudelValue(page)).toBe(original)
  })

  test('dragging a fader on a track with no .gain inserts one', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd")')
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    await dragFader(page, drawer, '#0', 30)
    expect(await strudelValue(page)).toMatch(/^\$: s\("bd"\)\.gain\(\d*\.?\d+\)$/)
  })

  test('a managed velocity gain rescales proportionally (ceiling-anchored)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd sn").gain("0.5 1")')
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    await dragFader(page, drawer, '#0', -30) // drag DOWN → quieter
    const after = await strudelValue(page)
    const m = after.match(/gain\("([\d.]+) ([\d.]+)"\)/)
    expect(m, `unexpected: ${after}`).not.toBeNull()
    const [a, b] = [Number(m![1]), Number(m![2])]
    expect(b).toBeLessThan(1) // ceiling came down
    expect(a / b).toBeCloseTo(0.5, 2) // shape (0.5 : 1) preserved
  })

  test('dragging pan writes .pan', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd")')
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    const pan = drawer.locator('[data-mixer-strip-id="#0"] [data-mixer-strip-pan-control]')
    const box = await pan.boundingBox()
    if (!box) throw new Error('no pan box')
    const cy = box.y + box.height / 2
    await page.mouse.move(box.x + box.width / 2, cy)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 40, cy, { steps: 8 }) // drag right → R
    await page.mouse.up()
    await page.waitForTimeout(80)
    expect(await strudelValue(page)).toMatch(/^\$: s\("bd"\)\.pan\(0\.[5-9]\d*\)$/)
  })

  test('a signal .gain stays read-only (drag is a no-op)', async ({ page }) => {
    await boot(page)
    const original = '$: s("bd").gain(sine)'
    await setStrudelCode(page, original)
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    await dragFader(page, drawer, '#0', 40)
    expect(await strudelValue(page)).toBe(original)
  })
})

// A config/transport line (`setcps`, `samples`) is filtered out of the strips
// (#559), so the strip-array index is off-by-one from the detected-chunk index
// for every track after it. The write path must address a strip's chunk by its
// ABSOLUTE source index (`strip.index`), not the strip position — otherwise the
// fader/knob edit lands on the PREVIOUS statement (onto `setcps` for the first
// strip). This is the "the mixer set the modifier onto setcps" bug.
test.describe('Mixer write-back with a leading config line (#559 off-by-one)', () => {
  test('the face fader edits the first TRACK, never the setcps line above it', async ({ page }) => {
    await boot(page)
    const original = 'setcps(0.5)\n$: s("bd").gain(0.5)\nd1: s("hh*4").gain(0.8)'
    await setStrudelCode(page, original)
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    // #0 is the FIRST TRACK (setcps has no strip). Dragging it down must edit
    // that track's gain, not write a modifier onto the setcps line.
    await dragFader(page, drawer, '#0', -30)
    const lines = (await strudelValue(page)).split('\n')
    expect(lines[0]).toBe('setcps(0.5)') // config line BYTE-IDENTICAL
    const m = lines[1].match(/^\$: s\("bd"\)\.gain\((\d*\.?\d+)\)$/)
    expect(m, `unexpected track line: ${lines[1]}`).not.toBeNull()
    expect(Number(m![1])).toBeLessThan(0.5) // the first TRACK got quieter
    expect(lines[2]).toBe('d1: s("hh*4").gain(0.8)') // sibling byte-identical
  })

  test('the expand drawer binds + writes to the right track past a config line', async ({ page }) => {
    await boot(page)
    const original = 'setcps(0.5)\n$: s("bd").gain(0.5)\nd1: note("c e").lpf(800)'
    await setStrudelCode(page, original)
    const drawer = await openMixer(page)
    await enlargeDrawer(page)

    await toggleExpand(page, drawer, 'd1')
    // The drawer must READ d1's chain (an lpf knob), not the previous track's.
    const d1Drawer = drawer.locator('[data-mixer-expand-for="d1"]')
    await expect(d1Drawer.locator('[data-knob="lpf"]')).toHaveCount(1)

    const slider = d1Drawer.locator('[data-knob="lpf"] [role="slider"]')
    await slider.scrollIntoViewIfNeeded()
    const box = await slider.boundingBox()
    if (!box) throw new Error('no lpf knob box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 40, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(80)

    const lines = (await strudelValue(page)).split('\n')
    expect(lines[0]).toBe('setcps(0.5)') // config line untouched
    expect(lines[1]).toBe('$: s("bd").gain(0.5)') // previous track untouched
    const m = lines[2].match(/^d1: note\("c e"\)\.lpf\((\d*\.?\d+)\)$/)
    expect(m, `unexpected d1 line: ${lines[2]}`).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(800) // d1's OWN lpf changed
  })
})

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

/** evaluate/play the current doc. Focuses the STRUDEL editor (not just
 * `getEditors()[0]`, which may be another Monaco instance after the mixer is
 * open / a control was clicked) so the Cmd+Enter eval keybinding lands. */
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

/** the live fill height (0..100) of a strip's meter bar. */
async function meterFill(
  page: Page,
  drawer: ReturnType<Page['locator']>,
  stripId: string,
): Promise<number> {
  return drawer
    .locator(`[data-mixer-strip-id="${stripId}"] [data-mixer-meter-fill]`)
    .evaluate((e) => parseFloat((e as HTMLElement).style.height) || 0)
}

/** click a strip's mute button. */
async function clickMute(
  page: Page,
  drawer: ReturnType<Page['locator']>,
  stripId: string,
): Promise<void> {
  await drawer.locator(`[data-mixer-strip-id="${stripId}"] [data-mixer-strip-mute]`).click()
  await page.waitForTimeout(80)
}

test.describe('Mixer strip mute (#543 / S3)', () => {
  test('mute marks the file orthogonally to gain; un-mute round-trips byte-identical', async ({
    page,
  }) => {
    await boot(page)
    // named tracks → the muted track keeps a stable id (`d1`), so the strip is
    // easy to address before and after the toggle.
    const original = 'd1: s("bd").gain(0.5)\n$: s("hh*4")'
    await setStrudelCode(page, original)
    const drawer = await openMixer(page)

    // mute d1 → the `_` marker is prefixed; `.gain(0.5)` is UNTOUCHED (orthogonal,
    // V-mixer-2) and the sibling line is byte-identical.
    await clickMute(page, drawer, 'd1')
    const muted = await strudelValue(page)
    expect(muted.split('\n')[0]).toBe('_d1: s("bd").gain(0.5)')
    expect(muted.split('\n')[1]).toBe('$: s("hh*4")')

    // the strip reflects the muted state but keeps its name `d1`.
    const strip = drawer.locator('[data-mixer-strip-id="d1"]')
    await expect(strip).toHaveAttribute('data-mixer-strip-muted', '')
    await expect(strip.locator('[data-mixer-strip-mute]')).toHaveAttribute('aria-pressed', 'true')
    await expect(strip.locator('[data-mixer-strip-name]')).toHaveText('d1')

    // un-mute → the marker is removed; the document is the exact original.
    await clickMute(page, drawer, 'd1')
    expect(await strudelValue(page)).toBe(original)
    await expect(strip.locator('[data-mixer-strip-mute]')).toHaveAttribute('aria-pressed', 'false')
  })

  test('the mute control is disabled on a bare-expression strip (no label to carry)', async ({
    page,
  }) => {
    await boot(page)
    await setStrudelCode(page, 's("bd*4")')
    const drawer = await openMixer(page)
    await expect(drawer.locator('[data-mixer-strip] [data-mixer-strip-mute]')).toBeDisabled()
  })

  test('a `_`-muted track is silent (dark meter) while a sibling plays (GR3, per-track)', async ({
    page,
  }) => {
    await boot(page)
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    // d1 is muted (`_d1`), d2 plays. Named tracks → stable ids d1/d2. The mute
    // WRITE itself is covered by the round-trip test above; here we observe the
    // ENGINE effect of the idiom: the engine skips `_d1` entirely (no scheduler),
    // so d1's meter stays dark while d2 moves — and crucially d2 still plays, so
    // the `_d1` label neither errors the eval nor shifts d2's captureId (GR3).
    await setStrudelCode(page, '_d1: s("bd*8").gain(0.9)\nd2: s("hh*8").gain(0.9)')

    let d1Max = 0
    let d2Max = 0
    // Re-eval up to 3× (the editor→file sync can race the first eval — S2 note).
    for (let attempt = 0; attempt < 3 && d2Max < 15; attempt++) {
      await play(page)
      await page.waitForTimeout(500)
      d1Max = 0
      d2Max = 0
      for (let i = 0; i < 30; i++) {
        d1Max = Math.max(d1Max, await meterFill(page, drawer, 'd1'))
        d2Max = Math.max(d2Max, await meterFill(page, drawer, 'd2'))
        await page.waitForTimeout(33)
      }
    }
    expect(d2Max, 'sibling d2 plays — `_d1` does not break the eval or shift its captureId').toBeGreaterThan(15)
    expect(d1Max, 'muted `_d1` is silent — dark meter').toBeLessThan(8)
  })

  test('LIVE mute: clicking mute while playing silences the track immediately (no manual re-eval)', async ({
    page,
  }) => {
    await boot(page)
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    await setStrudelCode(page, 'd1: s("bd*8").gain(0.9)\nd2: s("hh*8").gain(0.9)')

    // start playback; both meters move.
    let d1Max = 0
    let d2Max = 0
    for (let attempt = 0; attempt < 3 && (d1Max < 15 || d2Max < 15); attempt++) {
      await play(page)
      await page.waitForTimeout(500)
      d1Max = 0
      d2Max = 0
      for (let i = 0; i < 30; i++) {
        d1Max = Math.max(d1Max, await meterFill(page, drawer, 'd1'))
        d2Max = Math.max(d2Max, await meterFill(page, drawer, 'd2'))
        await page.waitForTimeout(33)
      }
    }
    expect(d1Max, 'd1 plays before muting').toBeGreaterThan(15)
    expect(d2Max, 'd2 plays before muting').toBeGreaterThan(15)

    // click mute on d1 — and DO NOT re-evaluate. Live mute re-evals the playing
    // file itself, so d1 goes silent (dark) within a beat while d2 keeps moving.
    await clickMute(page, drawer, 'd1')
    expect((await strudelValue(page)).split('\n')[0]).toBe('_d1: s("bd*8").gain(0.9)')
    await page.waitForTimeout(600)
    let d1Muted = 0
    let d2Still = 0
    for (let i = 0; i < 30; i++) {
      d1Muted = Math.max(d1Muted, await meterFill(page, drawer, 'd1'))
      d2Still = Math.max(d2Still, await meterFill(page, drawer, 'd2'))
      await page.waitForTimeout(33)
    }
    expect(d1Muted, 'live mute silences d1 immediately — dark, no manual eval').toBeLessThan(8)
    expect(d2Still, 'sibling d2 keeps playing').toBeGreaterThan(15)
  })

  test('LIVE fader: dragging the fader while playing changes the level immediately (no manual re-eval)', async ({
    page,
  }) => {
    await boot(page)
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    await setStrudelCode(page, 'd1: s("bd*8").gain(0.9)')

    // start playback; the meter runs high at gain 0.9.
    let high = 0
    for (let attempt = 0; attempt < 3 && high < 15; attempt++) {
      await play(page)
      await page.waitForTimeout(500)
      high = 0
      for (let i = 0; i < 30; i++) {
        high = Math.max(high, await meterFill(page, drawer, 'd1'))
        await page.waitForTimeout(33)
      }
    }
    expect(high, 'd1 runs high at gain 0.9').toBeGreaterThan(15)

    // drag the fader DOWN — and DO NOT re-evaluate. The gesture-end live re-eval
    // applies the lower gain, so the meter drops within a beat on its own.
    await dragFader(page, drawer, 'd1', -55) // negative = down → quieter
    expect(await strudelValue(page)).toMatch(/gain\(0?\.\d+\)/) // gain lowered, still scalar
    await page.waitForTimeout(600)
    let low = 0
    for (let i = 0; i < 30; i++) {
      low = Math.max(low, await meterFill(page, drawer, 'd1'))
      await page.waitForTimeout(33)
    }
    expect(low, 'meter follows the lowered fader live').toBeLessThan(high - 8)
  })

  test('LIVE sequencer: silencing a track\'s steps while playing goes dark immediately (centralised at the write path)', async ({
    page,
  }) => {
    await boot(page)
    // The Pattern tab shows the Sequencer grid beside the cursor track's LOCAL
    // mixer strip (with its meter) — so we can edit the steps and watch the
    // meter in one view. Editing the sequencer is a DIFFERENT surface than the
    // mixer write path, so this proves the live re-eval is centralised at
    // Writeback (the meter darkens with no manual eval).
    const drawer = await openPattern(page)
    await enlargeDrawer(page)
    await setStrudelCode(page, 'd1: s("bd*4")')

    let lit = 0
    for (let attempt = 0; attempt < 3 && lit < 15; attempt++) {
      await play(page)
      await page.waitForTimeout(500)
      lit = 0
      for (let i = 0; i < 30; i++) {
        lit = Math.max(lit, await meterFill(page, drawer, 'd1'))
        await page.waitForTimeout(33)
      }
    }
    expect(lit, 'd1 pulses at bd*4').toBeGreaterThan(15)

    // turn every step OFF in the sequencer — no manual re-eval. Each toggle is a
    // Writeback gesture, so it re-evals on release; once the track has no hits its
    // meter goes dark while it's still "playing".
    const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
    for (let s = 0; s < 4; s++) {
      const cell = grid.locator(`[data-seq-cell="0:${s}"]`)
      if ((await cell.count()) && (await cell.getAttribute('aria-pressed')) === 'true') {
        await cell.click()
        await page.waitForTimeout(60)
      }
    }
    // Let the live re-eval land AND the already-scheduled haps flush — Strudel
    // schedules a cycle ahead, so a silenced pattern fades over ~1 cycle rather
    // than cutting instantly (unlike mute, which removes the scheduler outright).
    await page.waitForTimeout(3200)
    // Measure the SUSTAINED level (mean of several reads) — the track is now
    // silent, so the fill sits at ~0; a max-of-window would catch a flush blip.
    let sum = 0
    const N = 12
    for (let i = 0; i < N; i++) {
      sum += await meterFill(page, drawer, 'd1')
      await page.waitForTimeout(40)
    }
    expect(sum / N, 'silencing the steps darkens the meter live, no manual eval').toBeLessThan(8)
  })
})

test.describe('Mixer live meters (#540 / S2)', () => {
  test('each strip fuses a meter keyed by its captureId; dark before play', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd*4")\nd1: note("c e g")')
    const drawer = await openMixer(page)
    await enlargeDrawer(page)

    // one meter per strip, keyed by the strip's captureId (the analyser join).
    await expect(drawer.locator('[data-mixer-strip-meter]')).toHaveCount(2)
    await expect(
      drawer.locator('[data-mixer-strip-id="#0"] [data-mixer-meter-capture="$0"]'),
    ).toBeVisible()
    await expect(
      drawer.locator('[data-mixer-strip-id="d1"] [data-mixer-meter-capture="d1"]'),
    ).toBeVisible()

    // nothing playing yet → both bars dark.
    expect(await meterFill(page, drawer, '#0')).toBeLessThan(2)
    expect(await meterFill(page, drawer, 'd1')).toBeLessThan(2)
  })

  test('a playing track lights its own meter; a silent track stays dark (per-track)', async ({
    page,
  }) => {
    await boot(page)
    // Open the mixer BEFORE evaluating so the meter's bus subscription is live
    // when the program publishes (and pinned to this file, not the bus default).
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    await setStrudelCode(page, '$: s("bd*8").gain(0.9)\n$: silence')

    // Poll for the loud track's meter to move; re-eval once if the first
    // evaluate raced the editor→file sync.
    let loudMax = 0
    let quietMax = 0
    for (let attempt = 0; attempt < 2 && loudMax < 15; attempt++) {
      await play(page)
      await page.waitForTimeout(500)
      loudMax = 0
      quietMax = 0
      for (let i = 0; i < 30; i++) {
        loudMax = Math.max(loudMax, await meterFill(page, drawer, '#0'))
        quietMax = Math.max(quietMax, await meterFill(page, drawer, '#1'))
        await page.waitForTimeout(33)
      }
    }

    // The loud track's meter moves; the silent track's stays dark — proof the
    // join is per-track (a master-mix tap would light both).
    expect(loudMax).toBeGreaterThan(15)
    expect(quietMax).toBeLessThan(8)
  })
})

/** click a strip's ▸/◂ expand toggle (Mixer console only). */
async function toggleExpand(
  page: Page,
  drawer: ReturnType<Page['locator']>,
  stripId: string,
): Promise<void> {
  await drawer.locator(`[data-mixer-strip-id="${stripId}"] [data-mixer-strip-expand]`).click()
  await page.waitForTimeout(60)
}

test.describe('Mixer strip expand drawer (#550 / S4b)', () => {
  test('the ▸ toggle opens that strip\'s drawer inline; ◂ collapses it (sticky)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").gain(0.5)\nd1: note("c e").lpf(800)')
    const drawer = await openMixer(page)

    // nothing expanded by default
    await expect(drawer.locator('[data-mixer-expand-drawer]')).toHaveCount(0)

    await toggleExpand(page, drawer, 'd1')
    await expect(drawer.locator('[data-mixer-expand-for="d1"]')).toHaveCount(1)
    await expect(
      drawer.locator('[data-mixer-strip-id="d1"] [data-mixer-strip-expand]'),
    ).toHaveAttribute('aria-expanded', 'true')

    // sticky: it stays open until toggled again
    await toggleExpand(page, drawer, 'd1')
    await expect(drawer.locator('[data-mixer-expand-for="d1"]')).toHaveCount(0)
  })

  test('the drawer binds to THAT strip\'s chain, not the cursor\'s track', async ({ page }) => {
    await boot(page)
    // cursor lands on line 1 (#0, a gain track); d1 carries an lpf instead.
    await setStrudelCode(page, '$: s("bd").gain(0.2)\nd1: note("c e").lpf(800)')
    const drawer = await openMixer(page)

    await toggleExpand(page, drawer, 'd1')
    const d1Drawer = drawer.locator('[data-mixer-expand-for="d1"]')
    // d1's own chain → an lpf knob; NOT the cursor track's gain(0.2).
    await expect(d1Drawer.locator('[data-knob="lpf"]')).toHaveCount(1)
    await expect(d1Drawer.locator('[data-knob="gain"]')).toHaveCount(0)
  })

  test('dragging a knob in the drawer edits only that statement; siblings byte-identical; one undo', async ({
    page,
  }) => {
    await boot(page)
    const original = '$: s("bd").gain(0.5)\nd1: note("c e").lpf(800)\n$: s("hh*4").gain(0.5)'
    await setStrudelCode(page, original)
    const drawer = await openMixer(page)
    await enlargeDrawer(page)

    await toggleExpand(page, drawer, 'd1')
    const slider = drawer.locator('[data-mixer-expand-for="d1"] [data-knob="lpf"] [role="slider"]')
    await expect(slider).toHaveCount(1)
    await slider.scrollIntoViewIfNeeded()
    const box = await slider.boundingBox()
    if (!box) throw new Error('no lpf knob box')
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy - 40, { steps: 8 }) // up → louder cutoff
    await page.mouse.up()
    await page.waitForTimeout(80)

    const lines = (await strudelValue(page)).split('\n')
    // only the d1 line changed; the two anonymous gain lines are byte-identical
    expect(lines[0]).toBe('$: s("bd").gain(0.5)')
    expect(lines[2]).toBe('$: s("hh*4").gain(0.5)')
    const m = lines[1].match(/^d1: note\("c e"\)\.lpf\((\d*\.?\d+)\)$/)
    expect(m, `unexpected d1 line: ${lines[1]}`).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(800)

    // one undo reverts the whole drag
    await undo(page)
    expect(await strudelValue(page)).toBe(original)
  })

  test('expanding a second strip keeps the first open (multi)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").gain(0.5)\nd1: note("c e").lpf(800)')
    const drawer = await openMixer(page)

    await toggleExpand(page, drawer, '#0')
    await toggleExpand(page, drawer, 'd1')
    await expect(drawer.locator('[data-mixer-expand-drawer]')).toHaveCount(2)
    await expect(drawer.locator('[data-mixer-expand-for="#0"]')).toHaveCount(1)
    await expect(drawer.locator('[data-mixer-expand-for="d1"]')).toHaveCount(1)
  })

  test('expand never writes the file, and persists across a reload (V-mixer-1)', async ({ page }) => {
    await boot(page)
    const original = '$: s("bd").gain(0.5)\nd1: note("c e").lpf(800)'
    await setStrudelCode(page, original)
    let drawer = await openMixer(page)

    await toggleExpand(page, drawer, 'd1')
    await expect(drawer.locator('[data-mixer-expand-for="d1"]')).toHaveCount(1)
    // expand is UI state — the document is untouched (V-mixer-1).
    expect(await strudelValue(page)).toBe(original)

    // reload: the expanded set is persisted in localStorage (per file), so the
    // d1 drawer re-opens once its strip exists again — without touching the file.
    await page.reload()
    await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 15_000 })
    await page.waitForFunction(
      () => {
        const m = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
        return (m?.editor?.getEditors?.()?.length ?? 0) > 0
      },
      { timeout: 15_000 },
    )
    drawer = await openMixer(page)
    await setStrudelCode(page, original)
    await expect(drawer.locator('[data-mixer-expand-for="d1"]')).toHaveCount(1)
    expect(await strudelValue(page)).toBe(original)
  })

  test('an expanded anonymous strip stays open when an EARLIER track is muted (#555)', async ({
    page,
  }) => {
    await boot(page)
    // two anonymous tracks (#0, #1) around a named one; #1 = the cp line.
    await setStrudelCode(page, '$: s("bd")\nd1: s("hh")\n$: s("cp")')
    const drawer = await openMixer(page)
    await enlargeDrawer(page)

    // expand the SECOND anonymous strip (#1).
    await toggleExpand(page, drawer, '#1')
    await expect(drawer.locator('[data-mixer-expand-for="#1"]')).toHaveCount(1)

    // mute the FIRST anonymous track (#0). Its engine captureId leaves the count
    // ($1→$0 for #1), but #1's STABLE id does not shift — so its drawer must stay
    // open and bound to #1 (under the old positional id it would have collapsed).
    await clickMute(page, drawer, '#0')
    await expect(drawer.locator('[data-mixer-strip-id="#0"][data-mixer-strip-muted]')).toHaveCount(
      1,
    )
    await expect(drawer.locator('[data-mixer-expand-for="#1"]')).toHaveCount(1)
  })
})

/** the live fill height (0..100) of the master meter. */
async function masterFill(page: Page, drawer: ReturnType<Page['locator']>): Promise<number> {
  return drawer
    .locator('[data-mixer-master-meter-fill]')
    .evaluate((e) => parseFloat((e as HTMLElement).style.height) || 0)
}

/** click a strip's solo button. */
async function clickSolo(
  page: Page,
  drawer: ReturnType<Page['locator']>,
  stripId: string,
): Promise<void> {
  await drawer.locator(`[data-mixer-strip-id="${stripId}"] [data-mixer-strip-solo]`).click()
  await page.waitForTimeout(60)
}

/** sustained mean of a sampler over n×40ms (P-MIX-6/8: mean, not max). */
async function sustainedMean(sample: () => Promise<number>, n: number, page: Page): Promise<number> {
  let s = 0
  for (let i = 0; i < n; i++) {
    s += await sample()
    await page.waitForTimeout(40)
  }
  return s / n
}

test.describe('Mixer master + solo (#550 / S5)', () => {
  test('the master strip shows a live meter while playing', async ({ page }) => {
    await boot(page)
    // Open the mixer before evaluating (meter subscription live — P-MIX-4).
    const drawer = await openMixer(page)
    await setStrudelCode(page, 'd1: s("bd*8").gain(0.9)')
    await expect(drawer.locator('[data-mixer-master-strip]')).toHaveCount(1)

    // dark before play
    expect(await masterFill(page, drawer)).toBeLessThan(8)

    let mx = 0
    for (let attempt = 0; attempt < 2 && mx < 15; attempt++) {
      await play(page)
      await page.waitForTimeout(1200) // audio context resume + first hits
      for (let i = 0; i < 25; i++) {
        mx = Math.max(mx, await masterFill(page, drawer))
        await page.waitForTimeout(33)
      }
    }
    // the master output meter moves once audio flows
    expect(mx).toBeGreaterThan(15)
  })

  test('solo silences non-soloed tracks via an eval overlay; the file is untouched', async ({
    page,
  }) => {
    await boot(page)
    // Open the mixer BEFORE evaluating so the meter's bus subscription is live
    // when the program publishes (the documented ordering — P-MIX-4 harness note).
    const drawer = await openMixer(page)
    const original = 'd1: s("bd*8").gain(0.9)\nd2: s("hh*8").gain(0.9)'
    await setStrudelCode(page, original)

    // Poll until d2 is audibly playing (re-eval once if the first play raced the
    // editor→file sync), then sample a sustained mean (P-MIX-6/8).
    let d2pre = 0
    for (let attempt = 0; attempt < 2 && d2pre < 20; attempt++) {
      await play(page)
      await page.waitForTimeout(700)
      d2pre = await sustainedMean(() => meterFill(page, drawer, 'd2'), 12, page)
    }
    expect(d2pre).toBeGreaterThan(20)

    // SOLO d1 → d2 silenced by the overlay, d1 stays, FILE byte-identical (D3)
    await clickSolo(page, drawer, 'd1')
    await page.waitForTimeout(2500) // re-eval + a cycle to flush queued haps
    expect(await sustainedMean(() => meterFill(page, drawer, 'd2'), 20, page)).toBeLessThan(8)
    expect(await sustainedMean(() => meterFill(page, drawer, 'd1'), 20, page)).toBeGreaterThan(20)
    expect(await strudelValue(page)).toBe(original) // solo never writes the file

    // UNSOLO → d2 comes back
    await clickSolo(page, drawer, 'd1')
    await page.waitForTimeout(2500)
    expect(await sustainedMean(() => meterFill(page, drawer, 'd2'), 20, page)).toBeGreaterThan(20)
    expect(await strudelValue(page)).toBe(original)
  })

  test('a solo dims the non-soloed strips (and not the soloed one)', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, 'd1: s("bd*8")\nd2: s("hh*8")')
    const drawer = await openMixer(page)

    await clickSolo(page, drawer, 'd1')
    const opacity = (id: string) =>
      drawer.locator(`[data-mixer-strip-id="${id}"]`).evaluate((e) => (e as HTMLElement).style.opacity)
    expect(await opacity('d2')).toBe('0.45') // non-soloed → dimmed
    expect(await opacity('d1')).not.toBe('0.45') // soloed → full
  })
})

// When a strip setting changes, the editor caret follows to that track's
// statement so the user sees which line their fader/knob/rename landed on
// (#595). Every code-writing strip interaction routes through the ONE write
// path (applyToStrip), so the jump is verified through the face fader here.
test.describe('Mixer cursor-follows-strip (#595)', () => {
  test('a fader drag jumps the caret to that track, past a config line', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, 'setcps(0.5)\n$: s("bd").gain(0.5)\nd1: s("hh*4").gain(0.8)')
    expect(await cursorLine(page)).toBe(1) // caret starts on the setcps line
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    // drag the named track's fader (d1, on line 3) — the caret must land there,
    // NOT on the setcps line (the #559 off-by-one applies to the jump too).
    await dragFader(page, drawer, 'd1', 30)
    expect(await cursorLine(page)).toBe(3)
  })

  test('dragging a different strip moves the caret to the new track', async ({ page }) => {
    await boot(page)
    await setStrudelCode(page, '$: s("bd").gain(0.5)\nd1: note("c e").gain(0.8)\n$: s("hh*4").gain(0.5)')
    const drawer = await openMixer(page)
    await enlargeDrawer(page)
    await dragFader(page, drawer, '#0', 20) // first anon track → line 1
    expect(await cursorLine(page)).toBe(1)
    await dragFader(page, drawer, 'd1', 20) // named track → line 2
    expect(await cursorLine(page)).toBe(2)
    await dragFader(page, drawer, '#1', 20) // second anon track → line 3
    expect(await cursorLine(page)).toBe(3)
  })
})
