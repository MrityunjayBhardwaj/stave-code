/**
 * useMixerModel — the channel-strip Mixer's binding to the document.
 *
 * Where `useActiveChunk` tracks the ONE chunk under the cursor, the Mixer needs
 * ALL of them: it is a row of strips, cursor-independent. This hook tracks the
 * active Monaco editor and re-derives the whole strip array from the document on
 * every content change, exactly like `useActiveChunk` re-detects on edits —
 * sharing the same editor-registry plumbing so the two can't drift.
 *
 * `applyToStrip(id, mutate)` is `useActiveChunk.applyEdit` generalised from "the
 * chunk at the cursor" to "the chunk with this stable id": it re-derives the
 * strips against the live model, finds the one with `id`, and hands `mutate` its
 * FRESH chunk + the tagged `Writeback` (one write path, no fork). The strip
 * array re-derives from the resulting content change, so the fader/pan read back
 * exactly what they wrote (V-mixer-1).
 */
import * as React from 'react'

import { getActiveEditor, onActiveEditorChange, getMonacoNamespace } from '../../workspace/editorRegistry'
import { detectAllChunks, type ChunkInfo } from '../chunkDetect'
import { Writeback } from '../writeback'
import { buildStripModels, type StripModel } from './stripModel'

export interface MixerModel {
  /** one strip per top-level statement, in source order (re-derived on edits) */
  strips: StripModel[]
  /**
   * The detected chunks behind `strips`, SAME index — `chunks[i]` is the chunk
   * `strips[i]` projects from. The expand drawer (S4b) binds a strip's full knob
   * chain to its render-time chunk by id (`chunks[strips.findIndex(...)]`).
   * Stored alongside `strips` in one state so the two never drift. (The write
   * path still re-derives a FRESH chunk at write time — `chunks` is for RENDER,
   * `applyToStrip` for freshness.)
   */
  chunks: ChunkInfo[]
  /**
   * Mutate the strip with this id through its fresh chunk. Re-derives against
   * the live model, so offsets are valid even after earlier edits in the same
   * gesture changed a literal's length. No-op if the strip can't be re-found.
   */
  applyToStrip: (id: string, mutate: (fresh: ChunkInfo, wb: Writeback) => void) => void
  /** open a gesture — edits until `endGesture` coalesce into one undo step */
  beginGesture: () => void
  endGesture: () => void
}

/** the strip array + its source chunks, kept together so they can't drift */
interface Derived {
  strips: StripModel[]
  chunks: ChunkInfo[]
}
const EMPTY_DERIVED: Derived = { strips: [], chunks: [] }

export function useMixerModel(): MixerModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editor, setEditor] = React.useState<any>(() => getActiveEditor())
  const [derived, setDerived] = React.useState<Derived>(EMPTY_DERIVED)
  const editorRef = React.useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const writebackRef = React.useRef<Writeback | null>(null)

  // Track the active editor (same source as useActiveChunk).
  React.useEffect(() => {
    setEditor(getActiveEditor())
    return onActiveEditorChange(() => setEditor(getActiveEditor()))
  }, [])

  // (Re)build the Writeback when the active editor changes.
  React.useEffect(() => {
    editorRef.current = editor
    const monaco = getMonacoNamespace()
    writebackRef.current = editor && monaco ? new Writeback(editor, monaco) : null
  }, [editor])

  // Re-derive the strip array from the document — on mount and on every content
  // change (incl. our own writes, so the strips read back what they wrote). Pure
  // projection (detectAllChunks → buildStripModels), so it always reflects the
  // live text (invariant V-mixer-1).
  React.useEffect(() => {
    if (!editor) {
      setDerived(EMPTY_DERIVED)
      return
    }
    const rederive = (): void => {
      const model = editor.getModel?.()
      if (!model) {
        setDerived(EMPTY_DERIVED)
        return
      }
      const chunks = detectAllChunks(model.getValue())
      setDerived({ strips: buildStripModels(chunks), chunks })
    }
    rederive()
    const model = editor.getModel?.()
    const sub = model?.onDidChangeContent?.(rederive)
    return () => sub?.dispose?.()
  }, [editor])

  const applyToStrip = React.useCallback(
    (id: string, mutate: (fresh: ChunkInfo, wb: Writeback) => void): void => {
      const ed = editorRef.current
      const wb = writebackRef.current
      if (!ed || !wb) return
      const model = ed.getModel?.()
      if (!model) return
      const chunks = detectAllChunks(model.getValue())
      const idx = buildStripModels(chunks).findIndex((s) => s.id === id)
      if (idx < 0) return
      mutate(chunks[idx], wb)
    },
    [],
  )

  const beginGesture = React.useCallback(() => writebackRef.current?.beginGesture(), [])
  const endGesture = React.useCallback(() => writebackRef.current?.endGesture(), [])

  return { strips: derived.strips, chunks: derived.chunks, applyToStrip, beginGesture, endGesture }
}
