/**
 * Reporting a refused surgical write, in ONE place (#1414).
 *
 * `applyOffsetEditsToFile` names five distinct refusals. Two surfaces write
 * through it — the Song Timeline's clip gestures and the Mixer's backdrop write
 * — and before this module they said so in two different voices: one turned the
 * refusal into a sentence, the other leaked the raw enum into a message a user
 * reads. The table belongs wherever the SECOND caller appeared, which is here.
 *
 * ⚠ WHY `warn` AND NOT `error`. StaveApp's toast bridge raises a toast for
 * errors only; warnings reach the Console panel and the activity-bar unread
 * badge without interrupting. A gesture that quietly declined should be
 * findable, not shouty — and on the timeline the clip already snaps back on its
 * own, because the canvas re-derives its extents from the IR. What was missing
 * was never the visual: it was knowing WHICH refusal fired.
 */
import { emitLog, type WriteRefusal } from '@stave/editor'

/**
 * Human-readable cause for each refusal. A `Record` over the union rather than a
 * lookup with a fallback, so adding a `WriteRefusal` cannot compile until
 * someone has written the sentence a user will actually see.
 */
export const REFUSAL_CAUSE: Record<WriteRefusal, string> = {
  'no-editor': 'the editor for this document is not mounted',
  'no-monaco': 'the editor core has not finished loading',
  'no-edits': 'the change could not be expressed in the document',
  'stale-document':
    'the document changed underneath the gesture, so the edit was dropped rather than applied at stale offsets — try again',
  'writeback-threw': 'the write-back itself failed',
}

/**
 * Report a refused write. `what` names the gesture from the user's point of view
 * ("Timeline: delete clip", "Mixer: the backdrop"), because the cause alone does
 * not say what they were trying to do.
 *
 * emitLog coalesces on (level, runtime, source, message), so a repeated refusal
 * bumps ONE row's count instead of flooding the Console — which is also what
 * makes "how often, and which one" readable off the panel at all.
 */
export function reportWriteRefusal(
  fileId: string | undefined,
  what: string,
  refusal: WriteRefusal,
): void {
  emitLog({
    level: 'warn',
    runtime: 'stave',
    source: fileId,
    message: `${what} was not applied — ${REFUSAL_CAUSE[refusal]}.`,
  })
}
