import { test, expect, type Page } from '@playwright/test'

/**
 * #339 — "pattern highlighting sometimes anchors to the wrong line."
 *
 * REPRODUCE-FIRST diagnostic (P130: observe, don't infer). Drives the live app
 * through the suspect scenarios and, while playing, reads the Monaco MODEL
 * decorations whose className includes `strudel-active-hap` — reporting, for
 * each highlight, the LINE it landed on AND the TEXT under it. If offsets are
 * correct the highlighted text is a real pattern token ("0", "sawtooth", …);
 * if the offset base has drifted, the text is shifted/whitespace and the line
 * is wrong.
 *
 * Run:
 *   SET339=1 pnpm --filter @stave/app exec playwright test highlight-wrong-line.spec.ts \
 *     --headed --timeout=120000 --workers=1
 *
 * SYNTHS ONLY (drum samples fail headless, P146). Meta+Enter on darwin (P159).
 */

test.use({ viewport: { width: 1400, height: 1000 } })

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function boot(page: Page): Promise<void> {
  page.on('console', (m) => {
    const t = m.text()
    if (t.includes('[339]')) console.log('  > ' + t) // eslint-disable-line no-console
  })
  await page.addInitScript(() => {
    ;(window as any).__STAVE_E2E__ = true // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      localStorage.setItem('stave:bottomPanel.open', 'false')
      localStorage.setItem('stave.viz.worker', '0')
    } catch { /* ignore */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(800)
}

async function setCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    ;(window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.setValue(c) // eslint-disable-line @typescript-eslint/no-explicit-any
  }, code)
  await page.waitForTimeout(150)
}

async function run(page: Page): Promise<void> {
  await page.locator('.monaco-editor').first().click()
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus()) // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1500)
}

async function stop(page: Page): Promise<void> {
  await page.locator('.monaco-editor').first().click()
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus()) // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.keyboard.press(`${MOD}+Period`)
  await page.waitForTimeout(400)
}

/**
 * Poll the model decorations for `ms`, accumulating every distinct
 * (line, text) a `strudel-active-hap` decoration landed on.
 */
async function collectHighlights(
  page: Page,
  ms: number
): Promise<Array<{ line: number; col: number; text: string; hits: number }>> {
  const samples = Math.max(1, Math.round(ms / 40))
  const acc = new Map<string, { line: number; col: number; text: string; hits: number }>()
  for (let i = 0; i < samples; i++) {
    const found = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ed = (window as any).monaco?.editor?.getEditors?.()?.[0]
      const model = ed?.getModel()
      if (!model) return []
      return model
        .getAllDecorations()
        .filter((d: any) => (d.options?.className || '').includes('strudel-active-hap')) // eslint-disable-line @typescript-eslint/no-explicit-any
        .map((d: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
          line: d.range.startLineNumber,
          col: d.range.startColumn,
          text: model.getValueInRange(d.range),
        }))
    })
    for (const f of found) {
      const key = `${f.line}:${f.col}:${f.text}`
      const e = acc.get(key)
      if (e) e.hits++
      else acc.set(key, { ...f, hits: 1 })
    }
    await page.waitForTimeout(40)
  }
  return Array.from(acc.values()).sort((a, b) => a.line - b.line || a.col - b.col)
}

function report(label: string, code: string, hl: Array<{ line: number; col: number; text: string; hits: number }>): void {
  /* eslint-disable no-console */
  console.log(`\n===== ${label} =====`)
  console.log('CODE (numbered):')
  code.split('\n').forEach((l, i) => console.log(`  L${i + 1}: ${JSON.stringify(l)}`))
  console.log(`HIGHLIGHTS observed (${hl.length} distinct):`)
  if (hl.length === 0) console.log('  (none — nothing highlighted)')
  for (const h of hl) {
    console.log(`  L${h.line} col${h.col}  text=${JSON.stringify(h.text)}  (x${h.hits})`)
  }
  /* eslint-enable no-console */
}

test('S1 — prelude + multi-line block', async ({ page }) => {
  test.skip(!process.env.SET339, 'manual diagnostic — set SET339=1')
  await boot(page)
  // setcps prelude on L1; pattern token "0 2 4 7" on L2; chain on L3.
  const code = `setcps(0.5)\n$: note("0 2 4 7")\n  .slow(2)`
  await setCode(page, code)
  await run(page)
  const hl = await collectHighlights(page, 3000)
  report('S1 prelude + multi-line ($: note on L2)', code, hl)
  await stop(page)
})

test('S4 — named block (post-#418)', async ({ page }) => {
  test.skip(!process.env.SET339, 'manual diagnostic — set SET339=1')
  await boot(page)
  // Named label `drums:` → transpiler `.p('drums')`. Token on L2.
  const code = `setcps(0.5)\ndrums: note("0 2 4 7").slow(2)`
  await setCode(page, code)
  await run(page)
  const hl = await collectHighlights(page, 3000)
  report('S4 named block drums: (token on L2)', code, hl)
  await stop(page)
})

test('S5 — multiple stacked blocks', async ({ page }) => {
  test.skip(!process.env.SET339, 'manual diagnostic — set SET339=1')
  await boot(page)
  // Each block's mini-string on its own line: L2, L3, L4.
  const code = `setcps(0.5)\n$: note("0 2").slow(2)\n$: note("4 7").slow(2)\n$: s("sawtooth*2")`
  await setCode(page, code)
  await run(page)
  const hl = await collectHighlights(page, 3000)
  report('S5 stacked blocks (tokens on L2,L3,L4)', code, hl)
  await stop(page)
})

test('S3b — insert a LINE above the playing block (wrong-LINE repro)', async ({ page }) => {
  test.skip(!process.env.SET339, 'manual diagnostic — set SET339=1')
  await boot(page)
  const code = `setcps(0.5)\n$: note("0 2 4 7").slow(2)`
  await setCode(page, code)
  await run(page)
  const before = await collectHighlights(page, 1500)
  report('S3b BEFORE (note token on L2)', code, before)
  // Insert a WHOLE NEW BLOCK line between L1 and L2 (at start of L2), WITHOUT
  // re-evaluating. The still-running pattern keeps emitting haps for the note
  // block whose offsets now fall INSIDE the freshly-inserted line.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ed = (window as any).monaco?.editor?.getEditors?.()?.[0]
    const model = ed?.getModel()
    if (!model) return
    model.applyEdits([{ range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }, text: '$: s("hh*8")\n' }])
  })
  await page.waitForTimeout(300)
  const after = await collectHighlights(page, 2000)
  const newCode = await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.getValue()) // eslint-disable-line @typescript-eslint/no-explicit-any
  report('S3b AFTER (note block now on L3; stale haps highlight which line?)', newCode || '', after)

  // #339 regression gate: the still-running note block moved to L3. Highlights
  // must follow it there — NONE may land on the freshly-inserted L2 `hh` line
  // (the pre-fix bug painted "8" on L2). Anchors track the live edit.
  expect(after.length).toBeGreaterThan(0)
  expect(after.every((h) => h.line === 3)).toBe(true)
  await stop(page)
})

test('S3 — edit AFTER eval without re-evaluating (stale offsets)', async ({ page }) => {
  test.skip(!process.env.SET339, 'manual diagnostic — set SET339=1')
  await boot(page)
  const code = `setcps(0.5)\n$: note("0 2 4 7").slow(2)`
  await setCode(page, code)
  await run(page)
  const before = await collectHighlights(page, 1500)
  report('S3 BEFORE edit (token on L2)', code, before)
  // Insert TWO blank lines at the very top WITHOUT re-evaluating.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ed = (window as any).monaco?.editor?.getEditors?.()?.[0]
    const model = ed?.getModel()
    if (!model) return
    model.applyEdits([{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: '\n\n' }])
  })
  await page.waitForTimeout(300)
  const after = await collectHighlights(page, 2000)
  const newCode = await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.getValue()) // eslint-disable-line @typescript-eslint/no-explicit-any
  report('S3 AFTER inserting 2 blank lines at top (token now on L4; stale offsets still say L2?)', newCode || '', after)
  await stop(page)
})

test('S6 — eval HALF-WRITTEN (invalid) syntax while playing keeps live tracking', async ({ page }) => {
  test.skip(!process.env.SET339, 'manual diagnostic — set SET339=1')
  await boot(page)
  // 1) Play a valid, DENSE pattern (epoch 1; note token on L2). cps=1 + no
  //    slow() → 4 notes/cycle so a short window reliably catches every loc.
  const code = `setcps(1)\n$: note("0 2 4 7")`
  await setCode(page, code)
  await run(page)
  await collectHighlights(page, 2500) // warm anchors for every note ("0".."7")

  // 2) Insert a block ABOVE the playing one WITHOUT re-evaluating → note moves
  //    to L3; highlights should already track there (S3b behaviour).
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()
    m?.applyEdits([{ range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 }, text: '$: s("hh*8")\n' }])
  })
  await page.waitForTimeout(300)
  const tracked = await collectHighlights(page, 2500)
  report('S6 after shift, before bad eval (note now on L3)', '', tracked)

  // 3) Make the syntax INVALID (unterminated string) and EVALUATE it. The
  //    eval errors → the OLD pattern keeps playing with OLD-coordinate offsets.
  //    The epoch must NOT bump, so highlights must STAY on L3 (not reset/drift
  //    back to the wrong L2 `hh` line).
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = (window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()
    const last = m.getLineCount()
    m?.applyEdits([{ range: { startLineNumber: last, startColumn: m.getLineMaxColumn(last), endLineNumber: last, endColumn: m.getLineMaxColumn(last) }, text: '\n$: note("' }])
  })
  await page.waitForTimeout(150)
  await run(page) // eval the invalid code → error
  await page.waitForTimeout(500)
  const afterBadEval = await collectHighlights(page, 2500)
  const totalDecos = await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.getAllDecorations()?.length ?? -1) // eslint-disable-line @typescript-eslint/no-explicit-any
  const badCode = await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.getModel()?.getValue()) // eslint-disable-line @typescript-eslint/no-explicit-any
  report('S6 AFTER evaluating invalid syntax (highlights must NEVER land on the wrong line)', badCode || '', afterBadEval)
  // eslint-disable-next-line no-console
  console.log(`  total model decorations (incl. anchors) = ${totalDecos}`)

  // THE #339 invariant for a failed eval: no highlight may land on the WRONG
  // line (the inserted L2 `hh` block, which the running pattern does not use).
  // The eval was rejected, so the old pattern keeps its old-coordinate offsets;
  // because the epoch did NOT bump, anchors stay valid → any highlight that
  // does paint stays on the real block (L3). (Whether haps keep flowing through
  // a failed eval is separate; 0 is acceptable, a wrong-line highlight is not.)
  expect(afterBadEval.every((h) => h.line === 3)).toBe(true)

  // Recovery: fix the syntax and re-evaluate → fresh epoch rebuilds anchors,
  // highlights return on the correct lines. This program has TWO playing
  // blocks — `s("hh*8")` on L2 and `note("0 2 4 7")` on L3 — so BOTH legitimately
  // highlight on their own lines (never L1's setcps).
  const recoverCode = `setcps(1)\n$: s("hh*8")\n$: note("0 2 4 7")`
  await setCode(page, recoverCode)
  await run(page)
  const recovered = await collectHighlights(page, 2500)
  report('S6 RECOVERY after fixing syntax + re-eval (hh on L2, note on L3)', recoverCode, recovered)
  expect(recovered.length).toBeGreaterThan(0)
  // Every highlight on a real playing block's line (L2 or L3), at least one on
  // each — and never on the setcps prelude (L1).
  expect(recovered.every((h) => h.line === 2 || h.line === 3)).toBe(true)
  expect(recovered.some((h) => h.line === 2)).toBe(true)
  expect(recovered.some((h) => h.line === 3)).toBe(true)
  await stop(page)
})
