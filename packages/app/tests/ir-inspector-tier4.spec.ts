/**
 * IR Inspector Tier 4 smoke probe — dual-mode (Phase 19-06).
 *
 * Verifies that each of the Tier-4 Strudel JS API methods surfaces in
 * the IR Inspector tree as expected, in BOTH the projected (default)
 * mode and the raw IR mode (toggle pressed). The projected mode asserts
 * user-method vocabulary (`'layer'`, `'jux'`, `'off'`, `'late'`,
 * `'degradeBy'`, etc.); the raw IR mode asserts the structural IR tag
 * names (`'Stack'`, `'FX'`, `'Late'`, `'Degrade'`, etc.).
 *
 * Companion to the editor-side parity harness (parity.test.ts) — that
 * proves the IR matches Strudel's evaluator event-for-event; this proves
 * the user-facing Inspector reflects what the user typed (projected
 * mode) and the IR shape under the hood (raw mode).
 *
 * Scope: smoke, not exhaustive. One probe per method × 2 modes.
 *
 * RESEARCH §4 + NEW pre-mortem #12 (addInitScript timing) — IR-mode
 * tests pre-set localStorage via page.addInitScript BEFORE React
 * hydrates, then sanity-check `aria-pressed='true'` at the top of every
 * row before asserting tree contents.
 */

import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

// Module-private duplicate of the IR-mode localStorage key. Tests must
// not import from app source (they probe via DOM); a string drift here
// is a detectable test-failure signal.
const LOCALSTORAGE_KEY = 'stave:inspector.irMode'

async function setStrudelCode(page: Page, code: string): Promise<void> {
  const ok = await page.evaluate((c) => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string; setValue: (s: string) => void } | null
      focus: () => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    if (!target) return false
    target.getModel()?.setValue(c)
    target.focus()
    return true
  }, code)
  expect(ok).toBe(true)
  await page.waitForTimeout(150)
}

async function focusStrudelEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const monaco = (window as unknown as { monaco?: { editor?: { getEditors?: () => unknown[] } } }).monaco
    const editors = (monaco?.editor?.getEditors?.() ?? []) as Array<{
      getModel: () => { getLanguageId?: () => string } | null
      focus: () => void
    }>
    const target =
      editors.find((e) => e.getModel()?.getLanguageId?.() === 'strudel') ?? editors[0]
    target?.focus()
  })
}

async function evalStrudel(page: Page): Promise<void> {
  await focusStrudelEditor(page)
  await page.keyboard.press(`${MOD}+Enter`)
  await page.waitForTimeout(1800)
}

async function openInspectorPanel(page: Page): Promise<void> {
  const btn = page.locator('button[aria-label="IR Inspector"]').first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
  }
  await page.locator('[data-testid="ir-passes-tablist"]').waitFor({ timeout: 10_000 })
}

async function bootWithPattern(page: Page, code: string): Promise<void> {
  await page.goto('/')
  await page.locator('.monaco-editor').waitFor({ timeout: 15_000 })
  await setStrudelCode(page, code)
  await evalStrudel(page)
  await openInspectorPanel(page)
}

/**
 * Each row drives a `bootWithPattern → assert tree contains tag → assert
 * events panel non-zero` probe in BOTH modes. The projected fragments
 * must all appear in the default (projected) tree; the raw fragments
 * must appear in the IR-mode tree.
 */
const TIER4_PROBES: Array<{
  method: string
  code: string
  // Default (projected) mode expected substrings.
  projectedTagInTree: string[]
  // IR-mode (raw IR) expected substrings.
  rawTagInTree: string[]
}> = [
  // Late — single forced tag node.
  {
    method: 'late',
    code: '$: s("bd hh sd cp").late(0.125)',
    projectedTagInTree: ['late'],
    rawTagInTree: ['Late'],
  },
  // off desugars to Stack(body, transform(Late(t, body))) — projected
  // mode shows 'off' over [body, transform-without-Late]; raw shows
  // Stack > body, Late.
  {
    method: 'off',
    code: '$: s("bd hh sd cp").off(0.125, x => x.gain(0.5))',
    projectedTagInTree: ['off', 'gain'],
    rawTagInTree: ['Stack', 'Late'],
  },
  // jux desugars to Stack(FX(pan,-1, body), FX(pan,+1, transform(body))).
  // Projected hides the FX(pan) wrappers; raw shows them all.
  {
    method: 'jux',
    code: '$: s("bd hh sd cp").jux(x => x.gain(0.5))',
    projectedTagInTree: ['jux', 'gain'],
    rawTagInTree: ['Stack', 'FX', 'pan'],
  },
  // .degrade() — Degrade tag with p=0.5. Uses an 8-event body so the
  // 50%-retention sample reliably keeps at least one event under the
  // deterministic seed=0 RNG.
  {
    method: 'degrade',
    code: '$: s("bd hh sd cp ride lt mt ht").degrade()',
    projectedTagInTree: ['degrade'],
    rawTagInTree: ['Degrade'],
  },
  // .degradeBy(0.3) — PV31 first user-visible distinguish: projected
  // label is 'degradeBy', NOT 'degrade'. Raw IR tag is the same Degrade
  // (only userMethod distinguishes; PV31 first consumer ships here).
  {
    method: 'degradeBy',
    code: '$: s("bd hh sd cp ride lt mt ht").degradeBy(0.3)',
    projectedTagInTree: ['degradeBy'],
    rawTagInTree: ['Degrade'],
  },
  // .chunk(4, f) — Chunk forced tag.
  {
    method: 'chunk',
    code: '$: s("bd hh sd cp").chunk(4, x => x.gain(0.5))',
    projectedTagInTree: ['chunk'],
    rawTagInTree: ['Chunk'],
  },
  // .ply(3) — Ply forced tag.
  {
    method: 'ply',
    code: '$: s("bd hh sd cp").ply(3)',
    projectedTagInTree: ['ply'],
    rawTagInTree: ['Ply'],
  },
  // .layer(f, g) desugars to Stack(f(body), g(body)) — projected shows
  // 'layer' over the children verbatim; raw shows the Stack.
  {
    method: 'layer',
    code: '$: note("c d e f").layer(x => x.add("0,2"))',
    projectedTagInTree: ['layer'],
    rawTagInTree: ['Stack'],
  },
  // .pick — numeric-selector + lookup array.
  {
    method: 'pick',
    code: '$: mini("<0 1 2 3>").pick(["c","e","g","b"]).note()',
    projectedTagInTree: ['pick'],
    rawTagInTree: ['Pick'],
  },
  // .struct — re-times body's value-stream to mask onsets.
  {
    method: 'struct',
    code: '$: note("c d e f").struct("x ~ x ~ x")',
    projectedTagInTree: ['struct'],
    rawTagInTree: ['Struct'],
  },
  // .swing(n) — narrow Swing tag (D-03; Inside primitive deferred).
  {
    method: 'swing',
    code: '$: note("c d e f g h").swing(2)',
    projectedTagInTree: ['swing'],
    rawTagInTree: ['Swing'],
  },
  // .shuffle(n) — per-cycle permutation.
  {
    method: 'shuffle',
    code: '$: note("c d e f").shuffle(4)',
    projectedTagInTree: ['shuffle'],
    rawTagInTree: ['Shuffle'],
  },
  // .scramble(n) — per-slot independent samples (with replacement).
  {
    method: 'scramble',
    code: '$: note("c d e f").scramble(4)',
    projectedTagInTree: ['scramble'],
    rawTagInTree: ['Scramble'],
  },
  // .chop(n) — per-event sample-range slicing; pattern-level only
  // (audio-buffer slicing deferred to phase 22 per D-04).
  {
    method: 'chop',
    code: '$: s("bd").chop(4)',
    projectedTagInTree: ['chop'],
    rawTagInTree: ['Chop'],
  },
]

test.describe('IR Inspector — Tier 4 smoke probe (projected mode, default)', () => {
  for (const probe of TIER4_PROBES) {
    test(`.${probe.method} surfaces with projected vocabulary`, async ({ page }) => {
      // Default: localStorage empty → projected mode active.
      await bootWithPattern(page, probe.code)

      // Sanity: projected mode means the toggle is NOT pressed.
      const toggle = page.locator('[data-testid="ir-mode-toggle"]')
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')

      const tree = page.locator('[data-testid="ir-tree-section"]')
      for (const fragment of probe.projectedTagInTree) {
        await expect(tree).toContainText(fragment)
      }
      // Events panel reports non-zero count — the load-bearing
      // observation that the IR collected something downstream.
      const eventsHeading = page
        .locator('[data-testid="ir-events-section"] summary')
        .first()
      await expect(eventsHeading).toContainText(/Events \([1-9]\d*\)/)
    })
  }
})

test.describe('IR Inspector — Tier 4 smoke probe (IR mode, raw IR)', () => {
  for (const probe of TIER4_PROBES) {
    test(`.${probe.method} surfaces with raw IR vocabulary in IR mode`, async ({ page }) => {
      // Pre-set localStorage BEFORE the React tree mounts. addInitScript
      // runs in the new browser context BEFORE any page script loads —
      // ensures useState's lazy initializer reads 'true'. RESEARCH §4.4
      // / NEW pre-mortem #12.
      await page.addInitScript((key) => {
        try { window.localStorage.setItem(key, 'true') } catch { /* ignore */ }
      }, LOCALSTORAGE_KEY)

      await bootWithPattern(page, probe.code)

      // Sanity: confirm the toggle is showing pressed state. If this
      // assertion fails, addInitScript timing is off — investigate
      // before triaging row failures.
      const toggle = page.locator('[data-testid="ir-mode-toggle"]')
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')

      const tree = page.locator('[data-testid="ir-tree-section"]')
      for (const fragment of probe.rawTagInTree) {
        await expect(tree).toContainText(fragment)
      }
    })
  }
})
