/**
 * Single source of truth for the visual-editing bottom-panel tabs.
 *
 * The scaffold seeds these as standby tabs alongside "Timeline"; each panel
 * later re-registers its own id (idempotent replace) with a live UI. Keeping
 * id/title/hint/icon here means the seed and the real panel agree on identity
 * and musician-facing copy without duplication.
 *
 * Tab order is presentation order. Titles carry NO IR jargon (PV32 / D-06):
 * "Sequencer", "Mixer", "Piano Roll" — what a musician calls them.
 */
export interface VisualEditTabDef {
  readonly id: string
  readonly title: string
  /** musician-facing standby hint shown before a pattern is bound */
  readonly hint: string
  /** codicon name (without the `codicon-` prefix) */
  readonly icon: string
}

export const SEQUENCER_TAB_ID = 'sequencer'
export const MIXER_TAB_ID = 'mixer'
export const PIANO_ROLL_TAB_ID = 'piano-roll'

export const VISUAL_EDIT_TABS: readonly VisualEditTabDef[] = [
  {
    id: SEQUENCER_TAB_ID,
    title: 'Sequencer',
    hint: 'Click a drum pattern to edit it as a step grid.',
    icon: 'symbol-array',
  },
  {
    id: MIXER_TAB_ID,
    title: 'Mixer',
    hint: 'Click a pattern to adjust its sound with knobs.',
    icon: 'settings',
  },
  {
    id: PIANO_ROLL_TAB_ID,
    title: 'Piano Roll',
    hint: 'Click a melody to edit its notes.',
    icon: 'music',
  },
]
