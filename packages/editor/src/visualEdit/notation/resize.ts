/**
 * Step-count changes. A flat mini string spans one cycle, so step count is the
 * note value (8 steps → 8th notes, 16 → 16ths):
 *
 *  - "spread" (default): preserve musical time — 8→16 moves a hit at step i to
 *    step 2i, so it sounds identical at finer resolution; shrinking quantizes
 *    hits onto the coarser grid (any hit in a bucket keeps the bucket on).
 *  - "pad": preserve step indices — append/truncate at the end, stretching or
 *    compressing the groove (hardware "pattern length" semantics).
 *
 * Multi-bar (`<...>`) patterns don't resize — their column resolution is fixed
 * by the bar groups — so both functions return the model unchanged.
 */
import type { PianoRollModel, StepGridModel } from './model'

export type ResizeMode = 'spread' | 'pad'

export function resizeGrid(
  model: StepGridModel,
  nextSteps: number,
  mode: ResizeMode,
): StepGridModel {
  if (nextSteps === model.steps || (model.bars ?? 1) > 1) return model
  if (mode === 'pad' || model.steps === 0) {
    return {
      ...model,
      steps: nextSteps,
      lanes: model.lanes.map((l) => ({ ...l, cells: padCells(l.cells, nextSteps) })),
    }
  }
  const from = model.steps
  return {
    ...model,
    steps: nextSteps,
    lanes: model.lanes.map((l) => ({
      ...l,
      cells: Array.from({ length: nextSteps }, (_, j) => {
        if (nextSteps >= from) {
          // upsample: a hit only at the exact mapped position
          return (j * from) % nextSteps === 0 && l.cells[(j * from) / nextSteps] === true
        }
        // downsample: any hit in the bucket lands on this step
        const lo = Math.ceil((j * from) / nextSteps)
        const hi = Math.ceil(((j + 1) * from) / nextSteps)
        return l.cells.slice(lo, hi).some(Boolean)
      }),
    })),
  }
}

export function resizeRoll(
  model: PianoRollModel,
  nextSteps: number,
  mode: ResizeMode,
): PianoRollModel {
  if (nextSteps === model.steps || (model.bars ?? 1) > 1) return model
  if (mode === 'pad' || model.steps === 0) {
    return {
      ...model,
      steps: nextSteps,
      notes: model.notes
        .filter((n) => n.start < nextSteps)
        .map((n) => ({ ...n, duration: Math.min(n.duration, nextSteps - n.start) })),
    }
  }
  const factor = nextSteps / model.steps
  const scaled = model.notes
    .map((n) => {
      const start = Math.floor(n.start * factor)
      const end = Math.max(start + 1, Math.round((n.start + n.duration) * factor))
      return { ...n, start, duration: Math.min(end, nextSteps) - start }
    })
    .filter((n) => n.start < nextSteps && n.duration >= 1)
  // drop collisions from downsampling (same pitch onto the same step)
  const seen = new Set<string>()
  return {
    ...model,
    steps: nextSteps,
    notes: scaled.filter((n) => {
      const key = `${n.pitch}@${n.start}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  }
}

function padCells(cells: boolean[], steps: number): boolean[] {
  if (cells.length === steps) return [...cells]
  if (cells.length > steps) return cells.slice(0, steps)
  return [...cells, ...new Array(steps - cells.length).fill(false)]
}
