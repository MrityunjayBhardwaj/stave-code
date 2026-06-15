/**
 * Single source of truth for the visual-editing bottom-panel tab.
 *
 * The scaffold seeds this as a standby tab alongside "Timeline"; the live
 * Pattern panel re-registers the id (idempotent replace) with its UI. Keeping
 * id/title/hint/icon here means the seed and the real panel agree on identity
 * and musician-facing copy without duplication.
 *
 * Since #398 there is ONE adaptive visual-editing tab — "Pattern" — that
 * switches between the Sequencer and Piano Roll grids and pins the Mixer. The
 * title carries NO IR jargon (PV32 / D-06): "Pattern" is what a musician calls
 * the thing they're shaping (and Strudel's own vocabulary).
 */
export interface VisualEditTabDef {
  readonly id: string
  readonly title: string
  /** musician-facing standby hint shown before a pattern is bound */
  readonly hint: string
  /** codicon name (without the `codicon-` prefix) */
  readonly icon: string
}

/** the single adaptive visual-editing tab (#398) */
export const PATTERN_TAB_ID = 'pattern'

/**
 * Inner panel ids — no longer separate tabs (#398), but kept as the stable
 * `data-bottom-panel-tab` identity each grid/mixer renders inside the Pattern
 * panel, and as the standby test hook.
 */
export const SEQUENCER_TAB_ID = 'sequencer'
export const MIXER_TAB_ID = 'mixer'
export const PIANO_ROLL_TAB_ID = 'piano-roll'

export const VISUAL_EDIT_TABS: readonly VisualEditTabDef[] = [
  {
    id: PATTERN_TAB_ID,
    title: 'Pattern',
    hint: 'Click a drum or melodic pattern to edit it here.',
    icon: 'symbol-array',
  },
]
