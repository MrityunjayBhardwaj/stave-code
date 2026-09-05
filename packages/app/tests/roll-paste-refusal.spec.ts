/**
 * A refused PASTE takes its own clear back, and says so (#1447).
 *
 * ─── WHY THIS EXISTS, AND WHY IT IS A BROWSER TEST ──────────────────────────────
 * `pasteClip` stamps the clip at the ⌘-clicked target, replacing whatever note is
 * already there, and its safety rests on that being ONE op:
 *
 *   > Replace-at-target is ONE op (`pasteNote`), so a refusal takes the clear
 *   > back with it instead of leaving a deletion behind.
 *
 * `place.test.ts` already pins that at MODEL level — including the load-bearing
 * assertion that the naive clear-then-place WOULD have written a deletion. What
 * had no arm anywhere was the same property driven by POINTER, and the report:
 * `reportRefusal("Couldn't paste that note")` was the one refusal message in the
 * roll with no reader (the others are pinned by `roll-place-readback` and
 * `roll-writer-declines`).
 *
 * ─── THE FIXTURE WAS MEASURED, NOT REASONED UP ──────────────────────────────────
 * The hazard needs a refusal landing on an OCCUPIED cell — a refusal onto an empty
 * one cannot delete anything, so it does not exercise the clear-back at all. A
 * sweep over eleven hand-drivable documents found 10 such cases; this fixture
 * carries one, and carries a byte-changing acceptance for the same clip duration,
 * so refusal and control share a document:
 *
 *   copy   c3@0 (duration 2)      cell "48:0"
 *   refuse onto g3@11, OCCUPIED   cell "55:11"   <- the clear-back is on the line
 *   accept onto c3@4, empty       cell "48:4"    -> `<c3 ~>` appears
 *
 * ⚠ THE ACCEPTED TARGET IS CHOSEN FOR ITS BYTES. Several accepted pastes on this
 * fixture serialize back to the ORIGINAL document (pasting a note onto itself), and
 * an accepted arm whose result is byte-identical to a refused one proves nothing.
 * `48:4` is one whose bytes differ.
 */
import { test, expect, type Page } from '@playwright/test'
import { bootApp, seedCode, editorValue } from './_appBoot'
import { expectRefusalReported, expectNoRefusalReported } from './_console'

const CODE = '$: note("c3 <d3 [e3 g3]> ~ ~")'
/** c3, duration 2, pasted at step 4 — the acceptance whose bytes differ. */
const ACCEPTED = '$: note("c3 <d3 [e3 g3]> <c3 ~> ~")'

const COPY_FROM = '48:0' // c3 @ step 0, duration 2 — the clip
const REFUSED_ONTO = '55:11' // g3 @ step 11 — OCCUPIED, and duration 2 cannot spell here
const ACCEPTED_ONTO = '48:4' // c3 @ step 4 — empty, and the paste lands

async function openRoll(page: Page, code: string) {
  await bootApp(page, { drawer: { tabId: 'pattern', height: 520 } })
  await seedCode(page, code)
  const grid = page.locator('[data-bottom-panel-tab="piano-roll"]')
  await expect(grid, `the roll must open for ${code}`).toHaveCount(1)
  return grid
}

/** ⌘-click a cell — select-only, never an edit. Fails loudly if the fixture moved. */
async function metaClick(page: Page, key: string): Promise<void> {
  const loc = page.locator(`[data-bottom-panel-tab="piano-roll"] [data-roll-cell="${key}"]`)
  await expect(loc, `roll cell ${key} must be drawn`).toHaveCount(1)
  await loc.click({ modifiers: ['Meta'] })
  await expect(loc, `roll cell ${key} must be selected`).toHaveAttribute('data-roll-selected', 'true')
}

async function copyClipFrom(page: Page, key: string): Promise<void> {
  await metaClick(page, key)
  await page.keyboard.press('Meta+c')
}

test.describe('a refused paste takes its own clear back (#1447)', () => {
  test('the refused paste leaves the occupied target note exactly where it was', async ({
    page,
  }) => {
    await openRoll(page, CODE)
    await copyClipFrom(page, COPY_FROM)

    await metaClick(page, REFUSED_ONTO)
    await page.keyboard.press('Meta+v')

    // The bytes, not the model: "the document is unchanged" is the user-facing
    // claim, and a clear-then-place would have serialized FINE with g3 missing.
    await expect
      .poll(() => editorValue(page), { timeout: 5000 })
      .toBe(CODE)

    // …and it is reported rather than swallowed — the property place, delete and
    // resize already pin, which paste was missing.
    await expectRefusalReported(page, "Couldn't paste that note")
  })

  test('the accepted paste on the same fixture writes, and raises nothing', async ({ page }) => {
    await openRoll(page, CODE)
    await copyClipFrom(page, COPY_FROM)

    await metaClick(page, ACCEPTED_ONTO)
    await page.keyboard.press('Meta+v')

    // PRECONDITION as much as an assertion: if the paste never landed, "no warning
    // was raised" would be satisfied by a gesture that did nothing at all — which
    // is exactly what the refused arm above looks like.
    await expect
      .poll(() => editorValue(page), { timeout: 5000 })
      .toBe(ACCEPTED)

    await expectNoRefusalReported(page)
  })
})
