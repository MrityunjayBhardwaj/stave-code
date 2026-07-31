/**
 * viewResolution.ts — HOW FINELY THE PANEL DRAWS A PATTERN, as distinct from how
 * finely the DOCUMENT spells it (#1055, Phase 2 of #1052).
 *
 * This module is deliberately dependency-free. It holds a representation decision
 * and a ceiling decision, both of which the phase that introduces the parameter is
 * required to settle rather than leave for Phase 4 to discover.
 *
 * ── THE REPRESENTATION: A MULTIPLIER, NEVER A COLUMN COUNT ────────────────────
 * #1055 warns about stale view state: "the cursor moves to a different pattern, the
 * model is replaced, and the view resolution left over from the previous pattern
 * produces a wrong layout with no error at all."
 *
 * That hazard is a property of storing an ABSOLUTE column count, and it disappears
 * when the stored thing is a multiplier:
 *
 *   count:      "show 32 columns" is MEANINGLESS for a 3-column pattern — 32 is not
 *               a whole-number ratio of 3, so the carried-over value is either
 *               refused or silently coerced, and coercion is the wrong layout with
 *               no error.
 *   multiplier: "show it 2× finer" is meaningful for EVERY pattern. A 3-column
 *               pattern shows 6, a 4-column pattern shows 8. There is no pattern for
 *               which the carried value is nonsense.
 *
 * So the reset rule this phase owes is: THERE IS NOTHING TO RESET. A multiplier is
 * total over models where a count is partial, and choosing the total representation
 * dissolves the defect instead of adding a rule that has to remember to fire. That
 * is the same move as [[PV257]]'s `looping` — make the wrong state unrepresentable
 * rather than detectable.
 *
 * ── THE CEILING: THE VIEW'S IS NOT THE DOCUMENT'S ─────────────────────────────
 * `MAX_STEPS = 64` in `parse.ts` is a DOCUMENT-EXPANSION guard, and its own comment
 * says so: "ceiling on expanded columns so `[7 hits][11 hits]` can't blow up the
 * grid". It protects the reader from a combinatorial blow-up in the notation.
 *
 * A view refine expands nothing in the document — it asks the same notation to be
 * drawn at a finer grid. Gating it with a document-expansion guard is a category
 * error, and a visible one: it would close the panel because the user asked to look
 * more closely.
 *
 * The ceiling that DOES bear on a view is "how many columns can a person read and
 * click", and that quantity is already named and already justified in
 * `resolution.ts`: `MAX_RESOLUTION_STEPS = 256` — "a flat grid past this is unwieldy
 * to edit and the serialized mini grows linearly … 256 columns = a 16-bar 1/16 grid,
 * well beyond the grids' editable range." That is exactly this question, answered,
 * for the op path. So the view ceiling is DERIVED from it rather than invented:
 * a new third constant would be a second oracle for one property ([[PV200]]).
 *
 * The value is duplicated rather than imported only to keep this module free of
 * dependencies; `viewResolution.test.ts` asserts the two stay equal, so they cannot
 * drift apart silently.
 *
 * MEASURED EXPOSURE at the time of the decision (corpus, `_1055-ceiling-exposure`):
 * against the DOCUMENT ceiling of 64 a ×2 refine would strand 20 of 958 grids (2.1%)
 * and 39 of 544 rolls (7.2%), rising to 23.5% / 38.6% at ×8. Against the view
 * ceiling of 256 those become 0 and 0 at ×2, and the first grid crossing appears at
 * ×8. So the separation is worth a constant, and the number says so.
 */

/** the identity view: draw the pattern exactly as the document spells it */
export const UNREFINED: ViewScale = 1

/**
 * Ceiling on RENDERED columns. Kept equal to `MAX_RESOLUTION_STEPS` in
 * `resolution.ts` — same question, same answer, and `viewResolution.test.ts` fails
 * if the two ever diverge.
 */
export const MAX_VIEW_STEPS = 256

/**
 * How much finer than the document the view draws. A whole-number multiplier ≥ 1;
 * `1` is the document's own resolution. Never an absolute column count — see the
 * header for why that distinction is the whole reset rule.
 */
export type ViewScale = number

/** is `k` a usable view scale at all? (shape only — says nothing about a model) */
export function isViewScale(k: number): boolean {
  return Number.isInteger(k) && k >= UNREFINED
}

/**
 * The columns a view at `scale` would draw for a document of `documentSteps`.
 * Total: defined for every model, which is the point of the multiplier.
 */
export function viewSteps(documentSteps: number, scale: ViewScale): number {
  return documentSteps * scale
}

/**
 * May a view at `scale` be drawn for a pattern of `perBar × bars` document columns?
 *
 * Asked of the VIEW ceiling, never the document's. At `UNREFINED` this is implied by
 * the document already having been admitted — `parse.ts` refuses any pattern whose
 * `perBar × bars` exceeds `MAX_STEPS` (64), and 64 ≤ `MAX_VIEW_STEPS` (256) — which
 * is why introducing this parameter is provably inert while nothing writes a scale
 * other than 1.
 */
export function viewScaleFits(perBar: number, bars: number, scale: ViewScale): boolean {
  if (!isViewScale(scale)) return false
  return viewSteps(perBar * bars, scale) <= MAX_VIEW_STEPS
}
