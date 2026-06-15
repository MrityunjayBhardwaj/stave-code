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

/** cycle → active step index in [0, steps), or null. Pure. */
export function cycleToStep(cycle: number | null, steps: number, bars: number): number | null {
  if (cycle === null || !Number.isFinite(cycle) || steps <= 0) return null
  const b = bars > 0 ? bars : 1
  const phase = ((cycle % b) + b) % b // 0..b, robust to negatives
  const step = Math.floor((phase / b) * steps)
  return Math.max(0, Math.min(steps - 1, step))
}

export function usePlayingStep(steps: number, bars: number): number | null {
  const [step, setStep] = React.useState<number | null>(null)

  React.useEffect(() => {
    let raf = 0
    const tick = (): void => {
      const next = cycleToStep(readCurrentCycle(), steps, bars)
      setStep((prev) => (prev === next ? prev : next))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [steps, bars])

  return step
}
