/**
 * Live notes still being set up when a render borrows superdough's globals
 * (#1656).
 *
 * ⚠ WHY A RENDER WAITS FOR THEM. A live sample note awaits its first load, then
 * reads `getAudioContext()` again to build its source (`sampler.mjs:61`). If a
 * render has swapped the global to its offline context in between, the source
 * is built on the render's context and `connect` to the note's live gain throws
 * — caught by the engine, so the note is lost without a sound. Measured in the
 * app: a bounce straight after Play left live notes due 0.29 s after the swap,
 * and a first load released within 100 ms of the swap crossed contexts on every
 * run. Holding the transport stops NEW triggers; it does nothing for these.
 *
 * ⚠ THE LIMIT IS THE NOTES' OWN START TIMES, NOT A GUESS. Once a note's start
 * time has passed on the live clock, a load that finishes later is dropped by
 * the sampler before it builds anything (`sampler.mjs:297-302`, compared on the
 * context captured when the note started). So there is nothing left to protect
 * after the latest waited note's start time, and the drain stops there even if
 * a load never answers. `capSeconds` bounds a start time that is unknown or far
 * off. What was given up on is reported, so the bounce can say so (decided on
 * #1639: a drain that runs out lets the bounce go ahead, and says it did).
 *
 * Deliberately free of imports so it can be driven by fakes.
 */

export interface DrainOutcome {
  /** In-flight triggers there were when the drain began. */
  waited: number
  /** Of those, how many had not settled when the drain stopped waiting. */
  gaveUp: number
}

export interface LiveTriggerDrain {
  /** Track one live trigger: its promise and the live-clock time it sounds at. */
  track(done: Promise<unknown>, startTime: number): void
  /** How many tracked triggers have not settled. */
  pending(): number
  /**
   * Wait for every tracked trigger to settle, or until the live clock passes the
   * latest of their start times (plus `marginSeconds`), whichever comes first.
   */
  drain(opts: {
    now: () => number
    sleep: (ms: number) => Promise<void>
    capSeconds: number
    marginSeconds: number
  }): Promise<DrainOutcome>
}

export function createLiveTriggerDrain(): LiveTriggerDrain {
  const inFlight = new Map<Promise<unknown>, number>()

  return {
    track(done, startTime) {
      inFlight.set(done, startTime)
      const settle = () => {
        inFlight.delete(done)
      }
      // Both branches: a trigger that throws has settled too, and the engine
      // already reports its error.
      done.then(settle, settle)
    },
    pending: () => inFlight.size,
    async drain({ now, sleep, capSeconds, marginSeconds }) {
      const waitingOn = [...inFlight.entries()]
      if (waitingOn.length === 0) return { waited: 0, gaveUp: 0 }
      const latest = Math.max(...waitingOn.map(([, t]) => t))
      const untilStart = Number.isFinite(latest) ? latest - now() + marginSeconds : capSeconds
      const limitMs = Math.max(0, Math.min(capSeconds, untilStart)) * 1000
      const settled = Promise.all(waitingOn.map(([p]) => p.then(() => undefined, () => undefined)))
      await Promise.race([settled, sleep(limitMs)])
      const gaveUp = waitingOn.filter(([p]) => inFlight.has(p)).length
      return { waited: waitingOn.length, gaveUp }
    },
  }
}
