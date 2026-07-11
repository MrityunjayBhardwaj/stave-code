/**
 * Pure health-meter classification for the Transport LCD (#859).
 *
 * Kept in its own module — with NO `@stave/editor` import — so the logic is
 * unit-testable without dragging the editor barrel (gifenc/CJS) into a hermetic
 * app test. TransportLCD imports these; the profiler read stays in the component.
 */

export type HealthClass = "good" | "warn" | "crit";

/**
 * Map a health sample to a meter class.
 * `fps` is the worst live viz cadence (profiler on) or the rAF cadence (off);
 * `slow` = the profiler saw a uniformly-slow viz; `stallMs` = the worst recent
 * main-thread longtask (0 if none in the window). A recent stall pulls the
 * meter down even when `fps` looks fine — the whole point of the layered signal.
 */
export function healthClass(fps: number, slow: boolean, stallMs: number): HealthClass {
  if (fps < 30 || slow || stallMs >= 120) return "crit";
  if (fps < 55 || stallMs > 0) return "warn";
  return "good";
}

/** Lit-bar count (of 5) for a health class — warn/crit visibly drop bars even
 *  when the smoothed fps number lags. */
export function healthBars(cls: HealthClass, fps: number): number {
  if (cls === "crit") return 1;
  if (cls === "warn") return 3;
  return Math.round((Math.min(fps, 60) / 60) * 5);
}
