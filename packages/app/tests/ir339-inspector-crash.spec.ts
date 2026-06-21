/**
 * ir339-inspector-crash.spec.ts — #475 regression driver. Reproduces the IR
 * Inspector white-screen on a pickRestart song in the LIVE app: opens the
 * bottom timeline + IR inspector, evaluates, expands the whole tree, clicks
 * rows, flips IR-mode + pass tabs, steps the playhead — and captures any
 * pageerror / console error. Before the #475 fix this threw
 * `kids is not iterable` (NamedPick unhandled in projectedChildren); after,
 * it runs clean (0 errors). Gated IR339=1 — inert in CI.
 *   IR339=1 pnpm --filter @stave/app exec playwright test ir339-inspector-crash.spec.ts --workers=1 --timeout=120000
 */
import { test, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

const CODE = `// drums — backbeat verses, four-on-the-floor choruses
drums: "<~@4 verse@8 chorus@8 verse@8 chorus@8 ~@4>".pickRestart({
  verse: s("[bd,sd] ~ sd ~ [bd,sd] ~ [bd,sd] ~").bank("RolandTR909").lpf(800),
  chorus: s("bd ~ [bd,sd] ~ bd ~ [bd,sd] ~").bank("RolandTR909"),
})

hats: "<~@4 verse@8 chorus@8 verse@8 chorus@8 ~@4>".pickRestart({
  verse: s("[bd,lt,hh] [bd,hh] [bd,hh] [bd,hh]").bank("RolandTR909").gain(1.36).dist(1.5).lpf(800).room(0.5),
  chorus: s("~ oh [lt,sh] oh ~ oh ~ oh").bank("RolandTR909").gain(0.5),
})._pianoroll().lpf(800).room(0.59).delay(0.4).speed(1.5).gain(0.8).distort(0.3)

bass: "<~@4 verse@8 chorus@8 verse@8 chorus@8 ~@4>".pickRestart({
  verse: note("<[a1 ~ ~ [a1,g2] ~ ~ a1 ~] [f1 ~ d2 f1 ~ ~ f1 ~] [c2 a2 ~ c2 ~ ~ c2 ~] [g1 ~ ~ g1 ~ ~ g1 ~]>").s("sawtooth").lpf(500),
  chorus: note("<[a1 a1 a1 a1] [f1 f1 f1 f1] [c2 c2 c2 c2] [g1 g1 g1 g1]>").s("sawtooth").lpf(700),
})

keys: "<pads@12 chorus@8 pads@8 chorus@8 pads@4>".pickRestart({
  pads: note("<[a3,c4,e4] [a3,c4,f4] [g3,c4,e4] [g3,b3,d4]>").s("recorder_alto_stacc").room(0.6).lpf(600),
  verse: note("<[a1 ~ ~ [a1,g2] ~ ~ a1 ~] [f1 ~ d2 f1 ~ ~ f1 ~] [c2 a2 ~ c2 ~ ~ c2 ~] [g1 ~ ~ g1 ~ ~ g1 ~]>").s("sawtooth").lpf(500),
  chorus: note("<[a3,c4,e4,a4] [a3,c4,f4,a4] [g3,c4,e4,g4] [g3,b3,d4,g4]>").piano().room(0.4),
})

lead: "<~@4 ~@8 chorus@8 ~@8 chorus@8 ~@4>".pickRestart({
  chorus: note("<[e5 ~ ~ d5 c5 ~ d5 ~] [c5 ~ a4 ~ ~ ~ ~ ~] [e5 ~ ~ d5 c5 ~ d5 ~] [d5 ~ b4 ~ g4 ~ ~ ~]>").piano().room(0.5),
})`

// Synth-only structural twin (no samples → eval succeeds headless, P146):
// same pickRestart + named blocks + _pianoroll + FX chain + <> alternation.
const CODE_SYNTH = CODE
  .replace(/s\("\[bd,sd\][^"]*"\)\.bank\("RolandTR909"\)/g, 'note("c2 ~ e2 ~ c2 ~ c2 ~").s("sawtooth")')
  .replace(/s\("bd[^"]*"\)\.bank\("RolandTR909"\)/g, 'note("c2 ~ e2 ~ c2 ~ e2 ~").s("sawtooth")')
  .replace(/s\("\[bd,lt,hh\][^"]*"\)\.bank\("RolandTR909"\)/g, 'note("c4 c4 c4 c4").s("triangle")')
  .replace(/s\("~ oh[^"]*"\)\.bank\("RolandTR909"\)/g, 'note("~ c4 e4 c4 ~ c4 ~ c4").s("triangle")')
  .replace(/\.s\("recorder_alto_stacc"\)/g, '.s("sawtooth")')
  .replace(/\.piano\(\)/g, '.s("sawtooth")')

async function setCode(page: Page, code: string): Promise<void> {
  await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ed = (window as any).monaco?.editor?.getEditors?.()?.[0]
    ed?.getModel()?.setValue(c)
    ed?.focus()
  }, code)
  await page.waitForTimeout(200)
}

async function snapshotState(page: Page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[data-testid="ir-passes-tablist"] [role="tab"]')].map((t) => t.textContent)
    const sec = document.querySelector('[data-testid="ir-tree-section"]')
    const tl = document.querySelector('[aria-label="Timeline"]') ? 'present' : 'absent'
    return {
      tabs: tabs.join('|'),
      treeChildren: sec ? sec.querySelectorAll('*').length : -1,
      treeText: (sec instanceof HTMLElement ? sec.innerText : '(none)').slice(0, 220).replace(/\n/g, ' / '),
      timeline: tl,
    }
  })
}

async function drive(page: Page, label: string, code: string, errors: string[]): Promise<void> {
  /* eslint-disable no-console */
  const mon = page.locator('.monaco-editor').first()
  if (!(await mon.count())) {
    console.log(`[339] ${label}: SKIP — .monaco-editor absent (prior crash unmounted the shell)`)
    return
  }
  await setCode(page, code)
  await mon.click({ timeout: 5000 }).catch((e) => console.log(`[339] ${label}: click failed — ${String(e).split('\n')[0]}`))
  await page.evaluate(() => (window as any).monaco?.editor?.getEditors?.()?.[0]?.focus()).catch(() => {}) // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.keyboard.press(`${MOD}+Enter`).catch(() => {})
  await page.waitForTimeout(2500)
  const st = await snapshotState(page).catch(() => null)
  console.log(`[339] ${label}: tabs=[${st?.tabs}] treeChildren=${st?.treeChildren} timeline=${st?.timeline} errors=${errors.length}`)
  console.log(`[339] ${label}: treeText="${st?.treeText}"`)
  // step the playhead (J/K) — a common crash trigger for the inspector timeline
  for (let i = 0; i < 6; i++) { await page.keyboard.press('j').catch(() => {}); await page.waitForTimeout(120) }
  await page.waitForTimeout(800)
  // exercise the inspector render surfaces that the bare eval+playhead path missed:
  // expand every tree node, click rows (reveal/source-map), flip IR mode + pass tabs.
  await expandAndPoke(page, label)
  console.log(`[339] ${label}: after interaction errors=${errors.length}`)
  await page.screenshot({ path: `/tmp/ir339-${label}.png` }).catch(() => {})
  /* eslint-enable no-console */
}

async function expandAndPoke(page: Page, label: string): Promise<void> {
  /* eslint-disable no-console */
  try {
    // Expand-all in the IR tree (deep nodes are where opaque pickRestart holes live).
    for (let pass = 0; pass < 8; pass++) {
      const toggles = page.locator('[data-testid="ir-tree-section"] [aria-expanded="false"]')
      const n = await toggles.count().catch(() => 0)
      if (!n) break
      for (let i = 0; i < n; i++) {
        await toggles.nth(i).click({ timeout: 1000 }).catch(() => {})
      }
      await page.waitForTimeout(120)
    }
    // Click the first several tree rows (triggers reveal-in-editor / source mapping).
    const rows = page.locator('[data-testid="ir-tree-section"] [role="treeitem"], [data-testid="ir-tree-section"] button')
    const rn = Math.min(await rows.count().catch(() => 0), 12)
    for (let i = 0; i < rn; i++) await rows.nth(i).click({ timeout: 800 }).catch(() => {})
    await page.waitForTimeout(200)
    // Flip IR mode toggle (the raw-IR render path) and step through pass tabs.
    await page.locator('[data-testid="ir-mode-toggle"]').click({ timeout: 800 }).catch(() => {})
    await page.waitForTimeout(200)
    const tabs = page.locator('[data-testid="ir-passes-tablist"] [role="tab"]')
    const tn = await tabs.count().catch(() => 0)
    for (let i = 0; i < tn; i++) { await tabs.nth(i).click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(150) }
  } catch (e) {
    console.log(`[339] ${label}: expandAndPoke aborted — ${String(e).split('\n')[0]}`)
  }
  /* eslint-enable no-console */
}

test('IR339 — exact + synth-twin pickRestart song; capture crash', async ({ page }) => {
  test.skip(!process.env.IR339, 'manual repro — set IR339=1')
  const errors: string[] = []
  /* eslint-disable no-console */
  page.on('pageerror', (e) => {
    const entry = `PAGEERROR: ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 24).join('\n')}`
    errors.push(entry)
    console.log(`\n[339] >>> LIVE PAGEERROR #${errors.length}\n${entry}\n[339] <<<\n`)
  })
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    // m.text() collapses component stacks; pull each arg's full string too.
    const entry = `CONSOLE.ERROR: ${m.text()}`
    errors.push(entry)
    console.log(`\n[339] >>> LIVE CONSOLE.ERROR #${errors.length}: ${m.text().slice(0, 2000)}\n[339] <<<\n`)
  })
  /* eslint-enable no-console */

  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.open', 'true') // timeline visible
    } catch { /* ignore */ }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('.monaco-editor').first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(600)
  // Open the IR Inspector panel.
  await page.locator('button[aria-label="IR Inspector"]').first().click().catch(() => {})
  await page.waitForTimeout(500)

  await drive(page, 'EXACT-samples', CODE, errors)
  await drive(page, 'SYNTH-twin', CODE_SYNTH, errors)

  /* eslint-disable no-console */
  console.log(`\n[339] ===== TOTAL ${errors.length} error(s) =====`)
  for (const e of errors.slice(0, 12)) console.log('[339] ' + e + '\n')
  /* eslint-enable no-console */
})
