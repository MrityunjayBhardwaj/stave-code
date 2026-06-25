/**
 * useMixerModel — the channel-strip Mixer's binding to the document.
 *
 * Where `useActiveChunk` tracks the ONE chunk under the cursor, the Mixer needs
 * ALL of them: it is a row of strips, cursor-independent. This hook tracks the
 * active Monaco editor and re-derives the whole strip array from the document on
 * every content change, exactly like `useActiveChunk` re-detects on edits —
 * sharing the same editor-registry plumbing so the two can't drift.
 *
 * S0 is READ-ONLY: it returns `strips` only. The per-strip write path
 * (`applyToStrip`, the generalization of `useActiveChunk.applyEdit` from "the
 * chunk at the cursor" to "the chunk with this id") lands in S1.
 */
import * as React from 'react'

import { getActiveEditor, onActiveEditorChange } from '../../workspace/editorRegistry'
import { detectAllChunks } from '../chunkDetect'
import { buildStripModels, type StripModel } from './stripModel'

export interface MixerModel {
  /** one strip per top-level statement, in source order (re-derived on edits) */
  strips: StripModel[]
}

export function useMixerModel(): MixerModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editor, setEditor] = React.useState<any>(() => getActiveEditor())
  const [strips, setStrips] = React.useState<StripModel[]>([])

  // Track the active editor (same source as useActiveChunk).
  React.useEffect(() => {
    setEditor(getActiveEditor())
    return onActiveEditorChange(() => setEditor(getActiveEditor()))
  }, [])

  // Re-derive the strip array from the document — on mount and on every content
  // change. Pure projection (detectAllChunks → buildStripModels), so a re-derive
  // is cheap and always reflects the live text (invariant V-mixer-1).
  React.useEffect(() => {
    if (!editor) {
      setStrips([])
      return
    }
    const rederive = (): void => {
      const model = editor.getModel?.()
      if (!model) {
        setStrips([])
        return
      }
      setStrips(buildStripModels(detectAllChunks(model.getValue())))
    }
    rederive()
    const model = editor.getModel?.()
    const sub = model?.onDidChangeContent?.(rederive)
    return () => sub?.dispose?.()
  }, [editor])

  return { strips }
}
