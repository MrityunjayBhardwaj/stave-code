/**
 * enginePeriod.ts — THE ONE definition of "what period does this pattern really have".
 *
 * Extracted from `writer-census.test.ts` (#1020) for the same reason the edit probe
 * was extracted in #1009: a second consumer now needs it. The cap sweep asks the
 * engine for a period in order to say WHICH asks a cap admits, and the census asks it
 * to check that an `unstable-period` label is not a misattribution. Two copies of a
 * period oracle are two oracles that can only agree with themselves ([[PV192]]), and
 * a divergence between them would show up as the sweep and the gate disagreeing about
 * the same mini with no way to tell which was right.
 *
 * The extraction is answer-neutral by construction: the census's own assertions
 * (31 past the cap, 2 aperiodic, 0 within it) are what pin it.
 */
import { mini as reifyMini } from '@strudel/mini/mini.mjs'

/** cycles probed — a doubling of the largest period searched, so a period is only believed when it repeated */
export const PERIOD_WINDOW = 48
/** the largest period searched; the surface caps may never exceed `PERIOD_WINDOW / 2` */
export const PERIOD_SEARCH = 24

/**
 * The pattern's TRUE cycle period, probed from the engine — the independent answer a
 * projection's `unstable-period` verdict is checked against.
 *
 * Probed over `PERIOD_WINDOW` cycles for a search to `PERIOD_SEARCH`, so a period is
 * only believed when at least a doubling of it repeated ([[PV229]]: under-windowing
 * returns a clean, plausible, wrong number). `0` means aperiodic within that window,
 * which is a different fact from "past the cap" and must be counted separately.
 */
export function truePeriod(m: string): number {
  const key = (c: number): string => {
    try {
      const haps = (
        reifyMini(m) as {
          queryArc(
            a: number,
            b: number,
          ): { whole?: { begin: { valueOf(): number } }; value: unknown; hasOnset?: () => boolean }[]
        }
      ).queryArc(c, c + 1)
      return JSON.stringify(
        haps
          .filter((h) => (h.hasOnset?.() ?? false) && h.whole)
          .map((h) => [
            Math.round((h.whole!.begin.valueOf() - c) * 720720),
            JSON.stringify(h.value),
          ])
          .sort(),
      )
    } catch {
      return 'ERR'
    }
  }
  const keys = Array.from({ length: PERIOD_WINDOW }, (_, c) => key(c))
  for (let p = 1; p <= PERIOD_SEARCH; p++) {
    let ok = true
    for (let c = p; c < keys.length; c++)
      if (keys[c] !== keys[c % p]) {
        ok = false
        break
      }
    if (ok) return p
  }
  return 0
}
