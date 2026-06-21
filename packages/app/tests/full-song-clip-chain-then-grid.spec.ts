/**
 * Composition probe (NOT a shipped feature) — answers a single question the
 * source read raised: after CHAINED clip ops in ONE session mutate the code,
 * (a) does each op compose cleanly on the previous result, and (b) does the
 * resulting code still bind into the Pattern grid (Sequencer / Piano Roll)?
 *
 * Two phases, in the order the user asked:
 *   PHASE 1 — drive arrange → re-arrange → split → re-arrange on the TOP lane,
 *     polling the editor source after each op. Each manipulation must rewrite
 *     the `arrange(...)` line deterministically, the bare sibling must stay
 *     byte-identical, the song must re-evaluate (lanes re-render), and the
 *     console must stay clean. This proves multi-op composition in a session.
 *   PHASE 2 — with the mutated code in place, place the Monaco cursor (what
 *     `useActiveChunk` consumes — the same position the timeline's expand→bind
 *     drives) inside two tracks and open the Pattern tab:
 *       • the BARE sibling `s("bd sd hh cp")` → expect the Sequencer grid (control)
 *       • an `arrange([w, pat])` ARM leaf `s("bd")` → OBSERVE grid vs standby
 *     The source hypothesis (chunkDetect.innermostChainUnder descends only into
 *     CallExpression args, never `[w, pat]` ArrayExpression arms) predicts the
 *     arrange arm falls to standby. This spec records what the browser actually does.
 */
import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// Top lane: two equal arms (period 8) — splittable (weight ≥ 2). Sibling below
// is a bare, unambiguously sequencer-editable track used as the grid control.
const ARRANGE0 = '$: arrange([4, s("bd")], [4, s("hh")])'
const SIB = '$: s("bd sd hh cp").bank("RolandTR909")'
const SONG = [ARRANGE0, SIB].join('\n')

async function bootShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('stave:bottomPanel.height', '360')
      localStorage.setItem('stave:bottomPanel.open', 'true')
      localStorage.setItem('stave:bottomPanel.activeTabId', 'musical-timeline')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('[data-bottom-panel="root"]').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () =>
      ((window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
        ?.editor?.getEditors?.()?.length ?? 0) > 0,
    { timeout: 20_000 },
  )
}

async function typeSongAndEval(page: Page, code: string): Promise<void> {
  await page.evaluate(() => {
    const eds =
      ((window as unknown as {
        monaco?: {
          editor?: {
            getEditors?: () => Array<{
              getModel: () => { getLanguageId?: () => string } | null
              focus: () => void
            }>
          }
        }
      }).monaco?.editor?.getEditors?.()) ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    t?.focus()
  })
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press(`${MOD}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.type(code, { delay: 8 })
  await page.waitForTimeout(400)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

function strudelSource(page: Page): Promise<string> {
  return page.evaluate(() => {
    const eds =
      ((window as unknown as {
        monaco?: {
          editor?: {
            getEditors?: () => Array<{
              getModel: () => { getLanguageId?: () => string; getValue: () => string } | null
            }>
          }
        }
      }).monaco?.editor?.getEditors?.()) ?? []
    const t = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
    return t?.getModel()?.getValue() ?? ''
  })
}

async function openSongView(page: Page): Promise<void> {
  // Song canvas is the only timeline view now (#497/U5) -- wait for it.
  await page.locator('[data-full-song="root"]').waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-lane]').first().waitFor({ timeout: 10_000 })
  await page.locator('[data-full-song-canvas]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)
}

async function gridBox(page: Page) {
  const grid = page.locator('[data-full-song="grid"]')
  const box = await grid.boundingBox()
  if (!box) throw new Error('no grid box')
  return { grid, box }
}

/** Click the leftmost (arm-0) clip on the TOP lane and apply a keyboard op. */
async function selectArm0AndPress(page: Page, key: string): Promise<void> {
  const { grid, box } = await gridBox(page)
  await page.mouse.click(box.x + box.width * 0.05, box.y + 8)
  await page.waitForTimeout(250)
  const sel = page.locator('[data-full-song="clip-selection"]')
  const selectedOk = await sel.isVisible().catch(() => false)
  console.log(`[CHAIN]   selection visible before '${key}': ${selectedOk}`)
  await page.waitForTimeout(150)
  await grid.press(key)
}

/** Place the Monaco cursor `inner` chars into the first occurrence of `needle`
 *  — exactly the position `useActiveChunk` reads to pick the active chunk. */
async function placeCursorIn(page: Page, needle: string, inner = 2): Promise<void> {
  await page.evaluate(
    ({ needle, inner }) => {
      const eds =
        ((window as unknown as {
          monaco?: {
            editor?: {
              getEditors?: () => Array<{
                getModel: () => {
                  getLanguageId?: () => string
                  getValue: () => string
                  getPositionAt: (o: number) => { lineNumber: number; column: number }
                } | null
                setPosition: (p: { lineNumber: number; column: number }) => void
                focus: () => void
              }>
            }
          }
        }).monaco?.editor?.getEditors?.()) ?? []
      const ed = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
      const model = ed?.getModel()
      if (!model) return
      const idx = model.getValue().indexOf(needle)
      if (idx < 0) return
      ed.setPosition(model.getPositionAt(idx + inner))
      ed.focus()
    },
    { needle, inner },
  )
  await page.waitForTimeout(250)
}

/** Open the Pattern tab and report which editable grid (if any) is mounted. */
async function patternGridKind(page: Page): Promise<'sequencer' | 'piano-roll' | 'standby'> {
  await page.locator('[data-bottom-panel="root"]').locator('role=tab[name="Pattern"]').click()
  await page.waitForTimeout(350)
  const drawer = page.locator('[data-bottom-panel="root"]')
  if ((await drawer.locator('[data-bottom-panel-tab="sequencer"]').count()) > 0) return 'sequencer'
  if ((await drawer.locator('[data-bottom-panel-tab="piano-roll"]').count()) > 0) return 'piano-roll'
  return 'standby'
}

function setup(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })
  return errors
}

test('chained clip ops in one session compose, then the result binds the grid (or not)', async ({
  page,
}) => {
  const errors = setup(page)
  await bootShell(page)
  await typeSongAndEval(page, SONG)
  await openSongView(page)

  // ---- PHASE 1: chain ops on the top lane, each composing on the previous ----
  // NOTE: a clip op rewrites the source → debounced re-eval republishes the IR →
  // the clip geometry updates. The next op must wait for that settle or it acts
  // on stale geometry and silently no-ops. The app's human-paced gestures clear
  // this naturally; the test paces explicitly. (Watch-item, not a correctness bug.)
  const arrangeLine = async () =>
    (await strudelSource(page)).split('\n').find((l) => l.includes('arrange(')) ?? '(gone)'

  const steps: Array<[string, string, string]> = [
    ['split', 's', 'arrange([2, s("bd")], [2, s("bd")], [4, s("hh")])'],
    ['duplicate', `${MOD}+d`, 'arrange([2, s("bd")], [2, s("bd")], [2, s("bd")], [4, s("hh")])'],
    ['split', 's', 'arrange([1, s("bd")], [1, s("bd")], [2, s("bd")], [2, s("bd")], [4, s("hh")])'],
    // #491 — Delete leaves a GAP: arm 0 becomes `[1, silence]` (width kept), the
    // rest stay in place (not a ripple/remove).
    ['delete', 'Delete', 'arrange([1, silence], [1, s("bd")], [2, s("bd")], [2, s("bd")], [4, s("hh")])'],
  ]
  for (const [name, key, expected] of steps) {
    await selectArm0AndPress(page, key)
    await expect.poll(() => strudelSource(page), { timeout: 9_000 }).toContain(expected)
    await page.waitForTimeout(2000) // settle the re-eval before the next op
    console.log(`[CHAIN] ${name}: ${await arrangeLine()}`)
    await page.screenshot({ path: `test-results/chain-${name}.png` })
  }

  // Whole-chain invariants: sibling byte-identical, song still renders, clean console.
  expect(await strudelSource(page), 'sibling untouched through the chain').toContain(SIB)
  expect(await page.locator('[data-full-song-lane]').count()).toBeGreaterThanOrEqual(2)
  expect(errors, `PHASE 1 errors:\n${errors.join('\n')}`).toEqual([])

  // ---- PHASE 2: does the mutated code still bind the Pattern grid? ----

  // (control) the bare sibling line → expect the Sequencer.
  await placeCursorIn(page, 's("bd sd hh cp")')
  const sibKind = await patternGridKind(page)
  await page.screenshot({ path: 'test-results/chain-5-grid-sibling.png' })
  expect(sibKind, 'a bare s(...) track must open the Sequencer grid').toBe('sequencer')

  // (probe) cursor inside an arrange ARM leaf s("bd") → record what binds.
  await placeCursorIn(page, 'arrange([1, s("bd")')
  // move cursor a little further so it sits inside the first leaf's s("bd")
  await placeCursorIn(page, '[1, s("bd")', 5)
  const armKind = await patternGridKind(page)
  await page.screenshot({ path: 'test-results/chain-6-grid-arrange-arm.png' })
  console.log(`[PROBE] bare sibling grid = ${sibKind}; arrange-arm grid = ${armKind}`)

  // #472 fix: an `arrange([w, pat])` arm leaf now binds the grid —
  // `chunkDetect.innermostChainUnder` descends into the `pat` CallExpression
  // inside the `[w, pat]` ArrayExpression arm. The leaf here is `s("bd")` → step.
  // Pre-fix this fell to standby (the cursor resolved to the whole `arrange(...)`).
  expect(armKind, 'arrange arm leaf s("bd") binds the Sequencer (#472)').toBe('sequencer')

  expect(errors, `PHASE 2 errors:\n${errors.join('\n')}`).toEqual([])
})

test('editing an arrange arm leaf via the grid writes back INSIDE the arm (arrange intact) #472', async ({
  page,
}) => {
  const errors = setup(page)
  await bootShell(page)
  // First arm has a 2-step leaf so the grid has a pressed cell to toggle; the
  // second arm + a bare sibling are the untouched controls.
  await typeSongAndEval(page, 'arrange([2, s("bd sd")], [2, s("hh")])\n$: s("cp")')

  await placeCursorIn(page, 's("bd sd")', 2)
  const drawer = page.locator('[data-bottom-panel="root"]')
  await drawer.locator('role=tab[name="Pattern"]').click()
  await page.waitForTimeout(350)
  const grid = drawer.locator('[data-bottom-panel-tab="sequencer"]')
  await expect(grid, 'the arrange arm leaf must open the Sequencer').toHaveCount(1)

  // Toggle the first pressed step off → rewrites the FIRST arm's mini only.
  await grid.locator('[data-seq-cell][aria-pressed="true"]').first().click()
  await page.waitForTimeout(400)

  const src = await strudelSource(page)
  // arrange wrapper intact: both `[2, s("…")]` arms present, second arm + close
  // paren untouched, sibling byte-identical, and the first arm's mini changed.
  expect(src, 'arrange wrapper + hh arm intact').toMatch(
    /arrange\(\[2, s\("[^"]*"\)\], \[2, s\("hh"\)\]\)/,
  )
  expect(src, 'sibling untouched').toContain('$: s("cp")')
  expect(src, 'first arm mini was edited (no longer "bd sd")').not.toContain('s("bd sd")')
  console.log(`[WRITEBACK] ${src.split('\n').find((l) => l.includes('arrange('))}`)
  await page.screenshot({ path: 'test-results/chain-7-arm-writeback.png' })
  expect(errors, `write-back errors:\n${errors.join('\n')}`).toEqual([])
})

test('the REAL expand→bind gesture on an arrange lane opens the grid #472', async ({ page }) => {
  const errors = setup(page)
  await bootShell(page)
  // arrange on a $: line, a bare sibling on the next line — both labelled so each
  // is its own lane in source order.
  await typeSongAndEval(page, '$: arrange([2, s("bd sd")], [2, s("hh")])\n$: s("cp")')
  await openSongView(page)

  const cursorLine = () =>
    page.evaluate(() => {
      const eds =
        ((window as unknown as {
          monaco?: { editor?: { getEditors?: () => Array<{ getModel: () => { getLanguageId?: () => string } | null; getPosition: () => { lineNumber: number } | null }> } } }
        ).monaco?.editor?.getEditors?.()) ?? []
      const ed = eds.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? eds[0]
      return ed?.getPosition?.()?.lineNumber ?? 0
    })
  const drawer = page.locator('[data-bottom-panel="root"]')
  const gridKind = async () => {
    await drawer.locator('role=tab[name="Pattern"]').click()
    await page.waitForTimeout(300)
    if ((await drawer.locator('[data-bottom-panel-tab="sequencer"]').count()) > 0) return 'sequencer'
    if ((await drawer.locator('[data-bottom-panel-tab="piano-roll"]').count()) > 0) return 'piano-roll'
    return 'standby'
  }

  // Bind the ARRANGE lane via its REAL disclosure caret (the genuine UX:
  // onBindLane → handleBindLane → revealOffsetInFile). The arrange is on line 1,
  // so it is the first lane (d1); its caret is the one in view. (The single-hit
  // `cp` sibling lane's caret can sit off-screen in the timeline grid — not
  // relevant here.)
  const arrangeCaret = page.locator('[data-full-song-lane-expand]').first()
  await arrangeCaret.scrollIntoViewIfNeeded()
  await arrangeCaret.click()
  await page.waitForTimeout(250)

  const line = await cursorLine()
  const kind = await gridKind()
  console.log(`[BIND-GESTURE] arrange lane expand→bind → cursor line ${line}, grid ${kind}`)
  await page.screenshot({ path: 'test-results/chain-8-bind-gesture.png' })

  // #472 user-facing guarantee through the REAL gesture: the bind lands the
  // cursor on the arrange line (1) AND opens the grid (Sequencer for the
  // s("bd sd") arm), not standby. Pre-fix the cursor parked at column 1 → the
  // whole arrange(...) resolved → standby.
  expect(line, 'bind moves the cursor to the arrange line').toBe(1)
  expect(kind, 'arrange lane expand→bind must open the grid, not standby').toBe('sequencer')
  expect(errors, `bind-gesture errors:\n${errors.join('\n')}`).toEqual([])
})
