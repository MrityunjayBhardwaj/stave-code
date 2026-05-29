/**
 * significance — cheap change-magnitude heuristic for the auto-commit driver
 * (Phase F, #196). Gates the IDLE commit path: only commit when a meaningful
 * amount changed (≥5 lines OR ≥200 chars vs HEAD). The per-eval path bypasses
 * this (an eval is an intentional checkpoint — RESEARCH Q1).
 *
 * Pure; not a precise diff. Trims the common prefix/suffix and measures the
 * differing middle — good enough to separate "typed a few words" from "pasted
 * a section", without an O(n²) edit-distance.
 */

export interface DiffMagnitude {
  readonly lines: number
  readonly chars: number
}

/** Size of the differing middle region after trimming common ends. */
function trimmedDelta(a: readonly string[], b: readonly string[]): number {
  let start = 0
  const min = Math.min(a.length, b.length)
  while (start < min && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  return Math.max(endA - start, endB - start)
}

export function diffMagnitude(prev: string, next: string): DiffMagnitude {
  if (prev === next) return { lines: 0, chars: 0 }
  const chars = trimmedDelta(Array.from(prev), Array.from(next))
  const lines = trimmedDelta(prev.split('\n'), next.split('\n'))
  return { lines, chars }
}

export interface SignificanceOpts {
  readonly minLines?: number
  readonly minChars?: number
}

export const DEFAULT_MIN_LINES = 5
export const DEFAULT_MIN_CHARS = 200

/**
 * True if the summed magnitude across all changed files crosses either floor.
 * `changes` are the (prev, next) pairs for files that differ from HEAD.
 */
export function isSignificant(
  changes: ReadonlyArray<{ prev: string; next: string }>,
  opts: SignificanceOpts = {},
): boolean {
  const minLines = opts.minLines ?? DEFAULT_MIN_LINES
  const minChars = opts.minChars ?? DEFAULT_MIN_CHARS
  let lines = 0
  let chars = 0
  for (const { prev, next } of changes) {
    const d = diffMagnitude(prev, next)
    lines += d.lines
    chars += d.chars
  }
  return lines >= minLines || chars >= minChars
}
