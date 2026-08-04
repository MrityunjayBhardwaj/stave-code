/**
 * Reaching the Slots resolution control from a browser spec (#1157).
 *
 * This lived as two identical copies — `resolution.spec.ts` and
 * `notation-spelling.spec.ts` — while `velocity.spec.ts` clicked the preset
 * directly. The control's shape has since changed twice, and BOTH times the
 * two copies were corrected and the third spec was missed:
 *
 *   #1057 — the refine-rewrite contract changed; the copies' assertions were
 *           updated, `velocity.spec.ts` was not.
 *   #1059 — the absolute presets moved BEHIND the readout (below); the copies
 *           grew `preset()`, `velocity.spec.ts` kept its direct click and so
 *           waited out the full timeout on a locator that never resolves.
 *
 * A spec that was known-red and left inside `gate:editing:browser` costs the
 * whole gate its meaning — "green" quietly came to mean 57 of 58. So the
 * gesture now lives in the module all three CALL rather than in copies each
 * one reads, and the next change to this control is a single edit here.
 *
 * ─── The control's shape (#601, #1059) ──────────────────────────────────────
 * The "Slots" control moved out of the grid header and into the Pattern
 * inspector (#601). Its resting shape is `÷2 [16] ×2`; the absolute 4/8/16/32/64
 * list is a dropdown the readout opens on double-click, so it is NOT in the DOM
 * until opened. Opening is idempotent — the dropdown stays open until a preset
 * is chosen, Escape, or a press outside — so `preset()` is safe to call before
 * every interaction, including consecutive ones.
 */
import type { Locator } from '@playwright/test'

/** The "Slots" control lives in the Pattern inspector (#601), not the grid header. */
export const slotsControl = (drawer: Locator): Locator => drawer.locator('[data-mixer-body]')

/** Open the preset dropdown if it is closed, then locate the `n`-slot preset (#1059). */
export async function preset(slots: Locator, n: number): Promise<Locator> {
  if ((await slots.locator('[data-resolution-presets]').count()) === 0) {
    await slots.locator('[data-resolution-current]').dblclick()
  }
  return slots.locator(`[data-resolution-step="${n}"]`)
}
