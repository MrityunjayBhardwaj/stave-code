/**
 * writtenSteps — where each step AS WRITTEN begins, in the columns a panel draws (#1841).
 *
 * `bd [~ bd] sd ~` is eight columns and four written steps. The grids drew every column
 * edge alike, so the four steps the text writes were invisible. This module adds no
 * reading of the pattern of its own: it re-expresses what the parser already recorded for
 * the writers — one region per top-level element, with the columns it owns
 * (`SourcePart.regions`, `AltSource.regions`) — in DRAWN columns, so a panel can draw a
 * line at each written step and a ruler that counts them. Pattern-grid epic #1832 is
 * visuals only: when the model says `hh*8` is one written step, it is drawn as one.
 *
 * Three spaces meet here, converted in one place each:
 *   part column  → shared column   `× part.factor` (`SourcePart.factor`, how the writers
 *                                  stretch a part onto the shared grid)
 *   bar column   → shared column   `b × perBar + from` (`AltSource`: single-cycle columns)
 *   shared       → drawn           `drawnAt` when the grid is drawn per bar (`perBar.ts`)
 *
 * A region set that no longer tiles the model (a Slots change moved the width out from
 * under it) is skipped, not guessed: that part draws bar and column lines only. It is the
 * same covers-check the writers use before they trust these spans. A leaf-read model
 * carries no written-step regions at all, and gets the same bar-and-column answer.
 */
import type { AltSource, NotationSource } from '../notation/model'
import { drawnAt, drawnLayout, lcmOf } from '../notation/perBar'

/** the fields both grid and roll models share that this module reads */
export interface WrittenStepsModel {
  steps: number
  bars?: number
  barSteps?: readonly number[]
  source?: NotationSource<unknown>
  altSource?: AltSource<unknown>
}

/** the columns the writers' regions were captured in */
function sharedSteps(m: WrittenStepsModel): number {
  return m.barSteps ? m.barSteps.length * lcmOf(m.barSteps) : m.steps
}

/** shared column → drawn column, or null when it falls inside a drawn column */
function toDrawn(u: number, m: WrittenStepsModel): number | null {
  const d = m.barSteps ? drawnAt(u, m.barSteps) : u
  return Number.isInteger(d) ? d : null
}

/**
 * Where the steps of ONE written element begin, in the region's own column space.
 *
 * Strudel counts an element as its weight in steps — `bd@3` 3, `hh!6` 6, while `hh*8`,
 * `bd(3,8)` and `[a b]` are 1 (#1845). The region carries that weight from the parser
 * (`ElementSpan.weight`, the number that sized it as `weight × div` columns), so the
 * steps fall every `(to − from) / weight` columns. A region with no weight, or whose
 * columns the weight does not divide, stays one step.
 */
function regionStepStarts(r: { from: number; to: number; weight?: number }): number[] {
  const w = r.weight ?? 1
  const span = r.to - r.from
  if (!Number.isInteger(w) || w <= 1 || span % w !== 0) return [r.from]
  return Array.from({ length: w }, (_, k) => r.from + (k * span) / w)
}

/**
 * Drawn columns where a written step begins, per `,`-part index (`StepLane.part`).
 * Sorted, deduplicated, and including column 0. A part the model has no current
 * regions for is absent from the map.
 */
export function writtenStepStarts(m: WrittenStepsModel): Map<number, number[]> {
  const out = new Map<number, number[]>()
  const shared = sharedSteps(m)
  const put = (part: number, us: number[]): void => {
    const cols = new Set<number>()
    for (const u of us) {
      const d = toDrawn(u, m)
      if (d !== null) cols.add(d)
    }
    out.set(part, [...cols].sort((a, b) => a - b))
  }
  if (m.source) {
    for (const p of m.source.parts) {
      const last = p.regions[p.regions.length - 1]
      if (!last || last.to * p.factor !== shared) continue // stale: no longer tiles the model
      put(
        p.part,
        p.regions.flatMap(regionStepStarts).map((c) => c * p.factor),
      )
    }
    return out
  }
  const a = m.altSource
  if (a && a.perBar * a.bars === shared) {
    const us: number[] = []
    for (let b = 0; b < a.bars; b++) for (const r of a.regions) us.push(b * a.perBar + r.from)
    put(0, us) // an alternation-as-element pattern has no `,`-parts
  }
  return out
}

/**
 * Where each bar begins in drawn columns, with `cols` as a final entry — asked of
 * `drawnLayout`, the answer the panels already draw their bar gaps from, so the ruler's
 * bar numbers cannot sit anywhere the bar lines do not.
 */
export function drawnBarStarts(m: WrittenStepsModel, cols: number): number[] {
  const layout = drawnLayout(m, cols)
  const out = [0]
  for (let c = 1; c < cols; c++) if (layout.barStart(c)) out.push(c)
  out.push(cols)
  return out
}

/**
 * The ruler's labels: `1`, `1.2`, `1.3`, … `2`, counting written steps within each bar.
 * A bar always gets its number at its first column, even when no written step begins
 * there (a step written across the bar line); `starts` null or empty → bar numbers only.
 */
export function rulerLabels(
  m: WrittenStepsModel,
  cols: number,
  starts: readonly number[] | undefined,
): Map<number, string> {
  const bars = drawnBarStarts(m, cols)
  const labels = new Map<number, string>()
  for (let b = 0; b + 1 < bars.length; b++) {
    const from = bars[b]
    const to = bars[b + 1]
    labels.set(from, String(b + 1))
    let k = 1
    for (const c of starts ?? []) {
      if (c <= from || c >= to) continue
      k++
      labels.set(c, `${b + 1}.${k}`)
    }
  }
  return labels
}
