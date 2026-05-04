/**
 * IR Inspector Tier 4 smoke probe (Phase 19-03).
 *
 * Verifies that each of the six newly-modeled Strudel JS API methods
 * surfaces in the IR Inspector tree as expected — Late/Degrade/Chunk/
 * Ply as their own forced-tag nodes, jux/off as the documented Stack
 * desugars. Companion to the editor-side parity harness
 * (parity.test.ts) — that proves the IR matches Strudel's evaluator
 * event-for-event; this proves the user-facing Inspector reflects
 * what they typed.
 *
 * Scope: smoke, not exhaustive. One probe per method, asserting the
 * load-bearing tag/text appears in the tree and the events panel
 * reports a non-zero count. Strict per-position checks live in the
 * editor-side harness.
 */

import { test, expect, type Page } from '@playwright/test'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

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
 * events panel non-zero` probe. The `tagInTree` strings match what
 * IRInspectorPanel renders for each tag's `<summary>` line — the tag
 * name itself, plus a discriminating substring where two methods would
 * otherwise look identical (e.g. "Stack 2 tracks" + "Late" together
 * pins down off vs jux).
 */
const TIER4_PROBES: Array<{
  method: string
  code: string
  // Substrings that MUST all appear somewhere inside the IR tree section.
  tagInTree: string[]
}> = [
  // Late — single forced tag node.
  {
    method: 'late',
    code: '$: s("bd hh sd cp").late(0.125)',
    tagInTree: ['Late'],
  },
  // off desugars to Stack(body, transform(Late(t, body))) — the Stack
  // wraps a Late on the offset side. Both must be visible.
  {
    method: 'off',
    code: '$: s("bd hh sd cp").off(0.125, x => x.gain(0.5))',
    tagInTree: ['Stack', 'Late'],
  },
  // jux desugars to Stack(FX(pan,-1, body), FX(pan,+1, transform(body))).
  // Two FX(pan, ...) nodes inside a Stack.
  {
    method: 'jux',
    code: '$: s("bd hh sd cp").jux(x => x.gain(0.5))',
    tagInTree: ['Stack', 'FX', 'pan'],
  },
  // .degrade() — Degrade tag with p=0.5. Uses an 8-event body so the
  // 50%-retention sample reliably keeps at least one event under the
  // deterministic seed=0 RNG (a 4-event probe occasionally drops all
  // four under the legacy seed pattern).
  {
    method: 'degrade',
    code: '$: s("bd hh sd cp ride lt mt ht").degrade()',
    tagInTree: ['Degrade'],
  },
  // .degradeBy(0.3) — Degrade tag with retention p=0.7.
  {
    method: 'degradeBy',
    code: '$: s("bd hh sd cp ride lt mt ht").degradeBy(0.3)',
    tagInTree: ['Degrade'],
  },
  // .chunk(4, f) — Chunk forced tag.
  {
    method: 'chunk',
    code: '$: s("bd hh sd cp").chunk(4, x => x.gain(0.5))',
    tagInTree: ['Chunk'],
  },
  // .ply(3) — Ply forced tag (W4 T10 promoted from desugar to tag after
  // a probe showed Fast(n, Seq(body × n)) compresses events into [0, 1/n)).
  {
    method: 'ply',
    code: '$: s("bd hh sd cp").ply(3)',
    tagInTree: ['Ply'],
  },
  // -------------------------------------------------------------------
  // Phase 19-04 — Tier 4 second half (Pick, Struct, Swing, Shuffle,
  // Scramble, Chop forced tags + .layer(...) desugar to Stack).
  // -------------------------------------------------------------------
  // .layer(f, g) desugars to Stack(f(body), g(body)) — the Stack node
  // is the load-bearing observation; no Layer tag exists.
  {
    method: 'layer',
    code: '$: note("c d e f").layer(x => x.add("0,2"))',
    tagInTree: ['Stack'],
  },
  // .pick — numeric-selector + lookup array. Use mini() + .note() so
  // the test-env transpiler reaches a numeric Pattern selector reliably
  // (String.prototype.pick maps numeric strings to MIDI which the lookup
  // can't index by). Inspector renders the tag plus the lookup count.
  {
    method: 'pick',
    code: '$: mini("<0 1 2 3>").pick(["c","e","g","b"]).note()',
    tagInTree: ['Pick'],
  },
  // .struct — re-times body's value-stream to mask onsets (4-step mask
  // selects 3 onsets out of 4 cycle slots; events panel must be > 0).
  {
    method: 'struct',
    code: '$: note("c d e f").struct("x ~ x ~ x")',
    tagInTree: ['Struct'],
  },
  // .swing(n) — narrow Swing tag (D-03; Inside primitive deferred).
  // 6-note body so per-cycle events are visible after timing nudges.
  {
    method: 'swing',
    code: '$: note("c d e f g h").swing(2)',
    tagInTree: ['Swing'],
  },
  // .shuffle(n) — per-cycle permutation; n=4 over 4 events makes every
  // slot a full reordering.
  {
    method: 'shuffle',
    code: '$: note("c d e f").shuffle(4)',
    tagInTree: ['Shuffle'],
  },
  // .scramble(n) — per-slot independent samples (with replacement).
  {
    method: 'scramble',
    code: '$: note("c d e f").scramble(4)',
    tagInTree: ['Scramble'],
  },
  // .chop(n) — per-event sample-range slicing; pattern-level only
  // (audio-buffer slicing deferred to phase 22 per D-04).
  {
    method: 'chop',
    code: '$: s("bd").chop(4)',
    tagInTree: ['Chop'],
  },
]

test.describe('IR Inspector — Tier 4 smoke probe', () => {
  for (const probe of TIER4_PROBES) {
    test(`.${probe.method} surfaces in IR tree and emits events`, async ({ page }) => {
      await bootWithPattern(page, probe.code)
      const tree = page.locator('[data-testid="ir-tree-section"]')
      for (const fragment of probe.tagInTree) {
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
