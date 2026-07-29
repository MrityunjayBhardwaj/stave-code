/**
 * usePlayingStep — the step/column currently playing, for live highlight in the
 * Sequencer and Piano Roll (#391).
 *
 * Reads the transport cycle from the shared accessor each animation frame and
 * maps it to a step index. A flat pattern spans one cycle, so step =
 * floor((cycle mod 1) × steps); a `<...>` multi-bar pattern spans `bars`
 * cycles, so the phase is taken mod `bars`. Returns null when nothing is
 * playing. The mapping is the pure `cycleToStep` (unit-tested); the hook is the
 * rAF loop around it.
 */
import * as React from 'react'

import { readCurrentCycle } from '../../workspace/currentCycle'

/**
 * cycle → active column index in `[0, cols)`, or null. Pure.
 *
 * `steps` and `cols` are two different numbers and #1087 is why they had to be told
 * apart. `steps` is the pattern's LENGTH, which `@n` weights need not make a whole number
 * of columns — `note("c4@1.5 e4@1.2")` is 2.7 long — and it is what the phase runs over,
 * so the mapping divides by it. `cols` is how many columns the panel DREW. The clamp was
 * `steps - 1`, which on that pattern is `1.7`: a value no column index can equal, so the
 * playing highlight never fired on the last column at all.
 */
export function cycleToStep(
  cycle: number | null,
  steps: number,
  bars: number,
  cols: number,
): number | null {
  if (cycle === null || !Number.isFinite(cycle) || steps <= 0 || cols <= 0) return null
  const b = bars > 0 ? bars : 1
  const phase = ((cycle % b) + b) % b // 0..b, robust to negatives
  const step = Math.floor((phase / b) * steps)
  return Math.max(0, Math.min(cols - 1, step))
}

export function usePlayingStep(steps: number, bars: number, cols: number): number | null {
  const [step, setStep] = React.useState<number | null>(null)

  React.useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const next = cycleToStep(readCurrentCycle(), steps, bars, cols)
      setStep((prev) => (prev === next ? prev : next))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [steps, bars, cols])

  return step
}
