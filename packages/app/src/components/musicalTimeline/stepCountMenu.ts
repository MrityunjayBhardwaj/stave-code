/**
 * The step counts a stepped lane's `#` chip offers (#1602), each labelled with what
 * choosing it does to the song — before anything is written or evaluated.
 *
 * Counts that FIT come first: a count whose steps divide the length they play
 * against, or that the length divides. Inside an arrangement section that length is
 * the section's own; in a loop it is the bars the lane shows. Real documents sit
 * almost entirely on those counts (2, 4, 8 and 16 are 123 of 167), and a count that
 * does not fit a section plays that section differently on every pass.
 *
 * ⚠ THE LOOP PREVIEW IS COMPOSED HERE, NEVER MEASURED. A lane's measured period
 * already holds the parameter being changed, and a least common multiple cannot be
 * taken apart, so the new song length starts from the lane WITHOUT its stepped
 * parameters (`previewRepeat` reads each lane's rest period) plus every stepped
 * parameter's song period, the edited one replaced. This module only supplies those
 * periods; the arithmetic stays in the editor, beside the analysis it reads.
 *
 * Pure, and imports only types from `@stave/editor`: the editor functions are
 * injected, as `steppedLane.ts` injects the knob table, so the app's tests hand
 * them in from source.
 */
import type { SectionWindow, SongAnalysis, StepCountEdit, SteppedAutomation, TimeStep } from '@stave/editor'

/** The editor functions the options are built from — injected, see the header. */
export interface StepCountDeps {
  readonly stepCountEdit: (a: SteppedAutomation, n: number, source: string) => StepCountEdit | null
  readonly previewRepeat: (analysis: SongAnalysis, laneKey: string, paramPeriods: readonly number[]) => number | null
  readonly songPeriodOf: (a: { readonly periodCycles: number; readonly placements: SteppedAutomation['placements'] }) => number | null
}

export interface StepCountOption {
  readonly steps: number
  /** `3 steps · song repeats every 12 bars (was 4)` — the count, then what it does. */
  readonly label: string
  /** The new steps divide the length they play against, or that length divides them. */
  readonly fits: boolean
  /** Choosing it removes a step the user wrote — a caller must ask first. */
  readonly dropsWritten: boolean
  /** It removes written steps and there is no way to ask. */
  readonly disabled: boolean
}

/** One stepped parameter on the lane, and the counts it can change to. */
export interface StepCountGroup {
  readonly automation: SteppedAutomation
  readonly options: readonly StepCountOption[]
}

/** The fewest counts offered, so a short lane still reaches 16. */
const MIN_OFFERED = 16

/** Mirrors the editor's `isSectionWindow`, which this module may not import at runtime. */
const isSection = (step: TimeStep): step is SectionWindow => 'total' in step

/**
 * The cycles of the innermost arrangement section `a` plays in, when every route
 * to it agrees; null for a parameter under no section, or arranged into sections of
 * different lengths. A section of no cycles never plays and is left out.
 */
export function sectionLengthOf(a: SteppedAutomation): number | null {
  let agreed: number | null = null
  for (const placement of a.placements) {
    const sections = placement.filter(isSection)
    if (sections.length === 0) return null
    const inner = sections[sections.length - 1].cycles
    if (inner === 0) continue
    if (agreed !== null && agreed !== inner) return null
    agreed = inner
  }
  return agreed
}

const countText = (n: number): string => `${n} ${n === 1 ? 'step' : 'steps'}`

/**
 * The options for every stepped parameter on lane `laneKey`, fitting counts first,
 * each group in ascending order. The current count is never offered: the edit for
 * it is null.
 */
export function stepCountOptions(args: {
  readonly automations: readonly SteppedAutomation[]
  readonly laneKey: string
  readonly analysis: SongAnalysis | null
  /** The bars the lane shows — the length a loop's steps play against. */
  readonly laneCycles: number
  readonly source: string
  /** Whether a cut that removes written steps can be confirmed. */
  readonly canConfirm: boolean
  readonly deps: StepCountDeps
}): readonly StepCountGroup[] {
  const { automations, laneKey, analysis, laneCycles, source, canConfirm, deps } = args

  /** The song's repeat with `a` at `edit`'s steps, or null when it cannot be said. */
  const previewFor = (a: SteppedAutomation, edit: StepCountEdit): number | null => {
    if (!analysis) return null
    const periods: number[] = []
    for (const b of automations) {
      const p = deps.songPeriodOf(b === a ? { periodCycles: edit.periodCycles, placements: a.placements } : b)
      if (p === null) return null
      periods.push(p)
    }
    return deps.previewRepeat(analysis, laneKey, periods)
  }

  return automations.map((a) => {
    const section = sectionLengthOf(a)
    const length = section ?? Math.max(1, Math.round(laneCycles))
    const options: StepCountOption[] = []
    for (let n = 1; n <= Math.max(MIN_OFFERED, 2 * length); n++) {
      const edit = deps.stepCountEdit(a, n, source)
      if (!edit) continue
      const p = edit.periodCycles
      const parts = [countText(n)]
      if (edit.keepsSound) {
        parts.push('plays the same')
      } else if (section !== null) {
        if (section % p !== 0) parts.push('this section plays differently each pass')
      } else {
        const repeat = previewFor(a, edit)
        const was = analysis?.repeatCycles ?? null
        if (repeat === null) parts.push('song length unknown')
        else if (repeat !== was) parts.push(`song repeats every ${repeat} bars${was === null ? '' : ` (was ${was})`}`)
      }
      if (edit.dropsWritten) parts.push('removes written steps')
      options.push({
        steps: n,
        label: parts.join(' · '),
        fits: length % p === 0 || p % length === 0,
        dropsWritten: edit.dropsWritten,
        disabled: edit.dropsWritten && !canConfirm,
      })
    }
    return { automation: a, options: [...options.filter((o) => o.fits), ...options.filter((o) => !o.fits)] }
  })
}
