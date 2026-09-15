/**
 * Render several stems ONE AT A TIME, and report each one's outcome instead of
 * failing the set on the first (#1409).
 *
 * ⚠ SEQUENTIAL IS A CORRECTNESS RULE, NOT A PERFORMANCE CHOICE. A stem renders
 * through the real superdough graph, which works by pointing superdough's module
 * globals at an offline context for the length of the render (see
 * `renderPatternOffline`). Two renders running at once would each overwrite the
 * other's globals mid-render, so the `Promise.all` this replaces was wrong in
 * shape, not only in how it rejected.
 *
 * ⚠ ONE STEM THAT FAILS DOES NOT COST THE OTHERS. `Promise.all` rejected on the
 * first failure, so a single silent stem — a part resting through the section,
 * a muted track — threw away every stem that had already rendered. Each stem
 * now settles on its own.
 *
 * ⚠ A FAILED STEM KEEPS ITS ERROR, NOT A COPY OF ITS BYTES. A silent stem throws
 * `SilentCaptureError`, which carries the refused take (#1410). That take is
 * deliberately never RETURNED — reaching into a thrown error is the opt-out that
 * keeps silence from arriving anywhere by accident — so it is not lifted into a
 * field here either. A caller that wants it asks
 * `outcome.error instanceof SilentCaptureError` and reads `refused`.
 *
 * Deliberately free of imports so the ordering can be driven by fakes: the
 * render arrives as an argument.
 */

export type StemOutcome<R> = ({ ok: true } & R) | { ok: false; error: unknown }

export async function renderStemsInOrder<R extends object>(
  stems: Record<string, string>,
  render: (code: string) => Promise<R>,
  onProgress?: (stem: string, i: number, total: number) => void
): Promise<Record<string, StemOutcome<R>>> {
  const keys = Object.keys(stems)
  const outcomes: Record<string, StemOutcome<R>> = {}
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    try {
      outcomes[key] = { ok: true, ...(await render(stems[key])) }
    } catch (error) {
      outcomes[key] = { ok: false, error }
    }
    onProgress?.(key, i + 1, keys.length)
  }
  return outcomes
}
