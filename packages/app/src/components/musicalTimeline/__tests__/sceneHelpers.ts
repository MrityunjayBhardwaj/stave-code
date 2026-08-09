/**
 * TEST-ONLY convenience for `buildTimelineScene`.
 *
 * The scene used to infer its span from `analysis.displaySpan` when the caller
 * passed none. That inference is gone from production, because a windowed
 * analysis has no `displaySpan` to infer from and giving it a synthetic one
 * would defeat the point of the type.
 *
 * It was only ever exercised by tests and density-only callers — `FullSongTimeline`
 * has always passed an explicit span — so rather than delete the convenience it
 * moved HERE, where being a convenience is honest. The body below is the deleted
 * production fallback, verbatim, which is what makes these fixtures mean exactly
 * what they meant before the seam changed.
 *
 * Not used by `windowOrigin.test.ts`: those arms are ABOUT the window, so they
 * call the real signature and say their span out loud.
 */
import type { SongAnalysis } from '@stave/editor'
import { buildTimelineScene, type CollectedMarks, type TimelineScene } from '../timelineScene'
import type { DeclaredTrack } from '../trackOrder'

export function sceneOf(
  analysis: SongAnalysis | null,
  originCycle: number,
  carriedPeakDensity: number | null,
  marks?: CollectedMarks,
  spanOverride?: number,
  code?: string | null,
  customColorByName?: ReadonlyMap<string, string>,
  declaredTracks?: readonly DeclaredTrack[],
): TimelineScene {
  const spanCycles =
    spanOverride != null && spanOverride >= 1
      ? Math.max(1, Math.round(spanOverride))
      : analysis
        ? Math.max(1, analysis.displaySpan.cycles)
        : 1
  return buildTimelineScene(
    analysis,
    { originCycle, spanCycles },
    analysis?.periodCycles ?? null,
    carriedPeakDensity,
    marks,
    code,
    customColorByName,
    declaredTracks,
  )
}
