/**
 * soloMuteSync — solo as a CODE operation (#735).
 *
 * Mute is a document property: the `_` marker in the source (`d1:` → `_d1:`), so
 * it's visible and bidirectional. Solo used to be an in-memory eval overlay with
 * no code-view trace, which read as inconsistent. This makes solo WRITE the mute
 * markers instead: soloing a track mutes every other (muteable) track in the
 * source and un-mutes the soloed one, so the engine silences off the file and the
 * code shows exactly what you hear. Un-soloing RESTORES the mutes that were set by
 * hand before solo (snapshotted in `soloStore`), so a pre-existing mute survives a
 * solo→un-solo round-trip instead of being wiped.
 *
 * `reconcileSoloMutes` is the whole policy as a PURE function (unit-tested); the
 * hook wires it to the active editor and writes the markers in one undo step.
 */
import * as React from 'react'

import {
  getActiveEditor,
  getActiveFileId,
  getMonacoNamespace,
} from '../../workspace/editorRegistry'
import { detectAllChunks } from '../chunkDetect'
import { Writeback, type OffsetEdit } from '../writeback'
import { buildStripModels } from './stripModel'
import { muteEdit } from './writeStrip'
import {
  getPreSoloMutes,
  setPreSoloMutes,
  useSoloStrips,
} from './soloStore'

/** The subset of strip facts the reconciliation needs — `id` (solo key + mute
 *  target), whether it currently carries the `_`, and whether it CAN (labelled). */
export interface SoloStripFacts {
  id: string
  muted: boolean
  muteable: boolean
}

/**
 * The mute markers the code should have after a solo change, plus the snapshot to
 * carry forward — the entire solo/mute policy in one pure, testable function.
 *
 *  - solo ACTIVE (`newSolo` non-empty): mute every muteable track that ISN'T
 *    soloed; the soloed track(s) go un-muted (audible). The snapshot is captured
 *    on the FIRST activation (the mutes present then) and preserved across further
 *    solo edits, so it always reflects the pre-solo hand-set mutes.
 *  - solo CLEARED (`newSolo` empty): restore the snapshot — the hand-set mutes
 *    from before solo — and drop it. An empty/absent snapshot un-mutes everything.
 *
 * `targetMuted` is the set of ids that should carry `_` afterwards; the caller
 * writes only the strips whose current `muted` differs.
 */
export function reconcileSoloMutes(
  strips: readonly SoloStripFacts[],
  newSolo: ReadonlySet<string>,
  prevSnapshot: ReadonlySet<string> | null,
): { targetMuted: Set<string>; nextSnapshot: ReadonlySet<string> | null } {
  if (newSolo.size > 0) {
    const snapshot =
      prevSnapshot ?? new Set(strips.filter((s) => s.muted).map((s) => s.id))
    const targetMuted = new Set(
      strips.filter((s) => s.muteable && !newSolo.has(s.id)).map((s) => s.id),
    )
    return { targetMuted, nextSnapshot: snapshot }
  }
  // Solo cleared → restore the pre-solo mutes (empty set if there were none).
  return { targetMuted: new Set(prevSnapshot ?? []), nextSnapshot: null }
}

/**
 * The Mixer's solo hook: `soloed` for the button highlight + a `toggle` that flips
 * the solo set AND writes the resulting `_` mute markers into the source as one
 * undo step. Self-contained — it derives the strips from the active editor at
 * click time (the same pure `buildStripModels` projection the Mixer renders), so
 * it needs no mixer-model plumbing and can't write to the wrong strip.
 */
export function useSoloMuteSync(): {
  soloed: ReadonlySet<string>
  toggle: (id: string) => void
} {
  const { soloed, toggle: toggleSet } = useSoloStrips()
  const toggle = React.useCallback(
    (id: string) => {
      const fileId = getActiveFileId()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const editor: any = getActiveEditor()
      const model = editor?.getModel?.()
      const monaco = getMonacoNamespace()

      const newSolo = new Set(soloed)
      if (newSolo.has(id)) newSolo.delete(id)
      else newSolo.add(id)

      if (editor && model && monaco) {
        const chunks = detectAllChunks(model.getValue())
        const strips = buildStripModels(chunks)
        const { targetMuted, nextSnapshot } = reconcileSoloMutes(
          strips.map((s) => ({ id: s.id, muted: s.muted, muteable: s.muteable })),
          newSolo,
          getPreSoloMutes(fileId),
        )
        // Only write the strips whose marker actually changes; batch them as ONE
        // undo step (and one live re-eval). Offsets come from a single detection —
        // `replaceRanges` resolves them against the original doc simultaneously.
        const edits: OffsetEdit[] = []
        strips.forEach((s) => {
          if (!s.muteable) return
          const want = targetMuted.has(s.id)
          if (want === s.muted) return
          const e = muteEdit(chunks[s.index], want)
          if (e) edits.push({ range: e.range, text: e.text })
        })
        if (edits.length > 0) {
          new Writeback(editor, monaco).replaceRanges(edits, 'mixer')
        }
        setPreSoloMutes(fileId, nextSnapshot)
      }

      // Update the in-memory highlight set (the solo button's lit state).
      toggleSet(id)
    },
    [soloed, toggleSet],
  )
  return { soloed, toggle }
}
