/**
 * useActiveChunk — the shared binding every write-back panel sits on.
 *
 * Tracks the active Monaco editor, builds a `Writeback` for it, and detects the
 * Strudel chunk under the cursor — re-detecting on cursor move and on EXTERNAL
 * content changes (typed edits) but never on the panel's own writes (those fire
 * with `writeback.currentSource != null`). Panels get the current `chunk` plus
 * `applyEdit`, which re-resolves the chunk against the live document right
 * before mutating it (so offsets stay valid even after earlier edits in the
 * same gesture changed a literal's length) and refreshes the display after.
 *
 * This is the single home for the active-editor → chunk → writeback wiring;
 * the Mixer, Sequencer, and Piano Roll panels all consume it so the binding
 * logic can't drift between them.
 */
import * as React from 'react'

import {
  getActiveEditor,
  onActiveEditorChange,
  getMonacoNamespace,
} from '../../workspace/editorRegistry'
import { detectChunk, type ChunkInfo } from '../chunkDetect'
import { Writeback } from '../writeback'

export interface ActiveChunk {
  /** the chunk under the cursor, or null when there's nothing editable */
  chunk: ChunkInfo | null
  /**
   * Mutate the document through the chunk. Re-detects the chunk against the
   * live model (anchored at the statement start, stable across intra-statement
   * edits), runs `mutate` with that fresh chunk + the writeback, then refreshes
   * the displayed chunk so the panel reads back exactly what it wrote. No-op if
   * the chunk can't be re-found (the statement moved/changed under the panel).
   */
  applyEdit: (mutate: (fresh: ChunkInfo, wb: Writeback) => void) => void
  /** open a gesture — edits until `endGesture` coalesce into one undo step */
  beginGesture: () => void
  endGesture: () => void
}

export function useActiveChunk(): ActiveChunk {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editor, setEditor] = React.useState<any>(() => getActiveEditor())
  const [chunk, setChunk] = React.useState<ChunkInfo | null>(null)
  const writebackRef = React.useRef<Writeback | null>(null)
  const editorRef = React.useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const anchorRef = React.useRef<number | null>(null)
  anchorRef.current = chunk ? chunk.statementRange[0] : null

  // Track the active editor.
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

  // Detect the chunk under the cursor; re-detect on cursor move + external
  // content changes (ignoring the panel's own tagged writes).
  React.useEffect(() => {
    if (!editor) {
      setChunk(null)
      return
    }
    const redetect = (): void => {
      const model = editor.getModel?.()
      const position = editor.getPosition?.()
      if (!model || !position) {
        setChunk(null)
        return
      }
      setChunk(detectChunk(model.getValue(), model.getOffsetAt(position)))
    }
    redetect()
    const model = editor.getModel?.()
    const subs = [
      editor.onDidChangeCursorPosition?.(redetect),
      model?.onDidChangeContent?.(() => {
        if (writebackRef.current?.currentSource != null) return // our own edit
        redetect()
      }),
    ]
    return () => {
      for (const s of subs) s?.dispose?.()
    }
  }, [editor])

  const applyEdit = React.useCallback(
    (mutate: (fresh: ChunkInfo, wb: Writeback) => void): void => {
      const ed = editorRef.current
      const wb = writebackRef.current
      const anchor = anchorRef.current
      if (!ed || !wb || anchor == null) return
      const model = ed.getModel?.()
      if (!model) return
      const fresh = detectChunk(model.getValue(), anchor)
      if (!fresh) return
      mutate(fresh, wb)
      // Re-detect AFTER the write (the model reflects edits synchronously) so
      // the panel reads back what it wrote rather than the pre-edit snapshot.
      setChunk(detectChunk(model.getValue(), anchor))
    },
    [],
  )

  const beginGesture = React.useCallback(() => writebackRef.current?.beginGesture(), [])
  const endGesture = React.useCallback(() => writebackRef.current?.endGesture(), [])

  return { chunk, applyEdit, beginGesture, endGesture }
}
