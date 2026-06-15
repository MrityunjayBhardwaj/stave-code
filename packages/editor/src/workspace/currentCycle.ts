/**
 * currentCycle — a tiny accessor registry for the live transport cycle.
 *
 * The visual-editing panels are seeded inside the editor package and have no
 * direct line to the per-file runtime that owns the scheduler clock (that lives
 * in the app's StrudelEditorClient). The app already computes a "current cycle"
 * accessor for the MusicalTimeline; it registers the same accessor here so the
 * bottom-panel grids (Sequencer / Piano Roll) can read the playing cycle and
 * highlight the active step — independent of which bottom-panel tab is open
 * (so they can't rely on the Timeline's own rAF, which pauses when another tab
 * is active).
 *
 * Mirrors the active-editor registry shape: one process-wide accessor, set by
 * the app, read by the panels. Returns null when nothing is playing or no
 * accessor is registered.
 */
type CycleAccessor = () => number | null

let accessor: CycleAccessor | null = null

/** App registers the live-cycle accessor (or null to clear). */
export function setCurrentCycleAccessor(fn: CycleAccessor | null): void {
  accessor = fn
}

/** Current transport cycle, or null when not playing / no accessor. */
export function readCurrentCycle(): number | null {
  if (!accessor) return null
  try {
    return accessor()
  } catch {
    return null
  }
}
