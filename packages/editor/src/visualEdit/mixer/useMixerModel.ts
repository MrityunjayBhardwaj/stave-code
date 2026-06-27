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
   * The detected chunks behind `strips`, aligned 1:1 — `chunks[i]` is the chunk
   * `strips[i]` projects from. Alignment is by each strip's ABSOLUTE source index
   * (`strips[i].index`), NOT the strip-array position: `buildStripModels` drops
   * config/transport statements (`setcps`, `samples` — #559), so the k-th strip
   * is NOT the k-th detected chunk. The expand drawer (S4b) binds a strip's full
   * knob chain to `chunks[i]`. Stored alongside `strips` in one state so the two
   * never drift. (The write path still re-derives a FRESH chunk at write time —
   * `chunks` is for RENDER, `applyToStrip` for freshness.)
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

/**
 * Follow a strip edit in the code view (#595): move the editor caret to the
 * track's statement so the user sees which line their fader/knob/rename landed
 * on. Writeback applies edits with a null cursor-computer (`pushEditOperations`
 * with `() => null`), so the write never moves the caret itself — this is the
 * only thing that does, and a pin survives the next tick untouched.
 *
 * `reveal + focus` runs only when the target statement changed since the last
 * jump OR the editor isn't focused; a continuous drag (many ticks on ONE strip)
 * then re-centres + re-focuses once and leaves the caret pinned, rather than
 * thrashing the scroll/focus every frame. Monaco hides the caret while blurred,
 * so `focus()` is what makes the jump visible. Cursor placement is a courtesy —
 * any failure is swallowed so it can never break the write.
 */
export function jumpCursorToTrack(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  trackOffset: number,
  lastJumpRef: React.MutableRefObject<number | null>,
): void {
  try {
    const pos = model.getPositionAt?.(trackOffset)
    if (!pos) return
    const changed = lastJumpRef.current !== trackOffset
    if (changed || !editor.hasTextFocus?.()) {
      editor.setPosition?.(pos)
      editor.revealLineInCenter?.(pos.lineNumber)
      editor.focus?.()
    }
    lastJumpRef.current = trackOffset
  } catch {
    /* cursor following is a courtesy; never let it break the write */
  }
}

export function useMixerModel(): MixerModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editor, setEditor] = React.useState<any>(() => getActiveEditor())
  const [derived, setDerived] = React.useState<Derived>(EMPTY_DERIVED)
  const editorRef = React.useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const writebackRef = React.useRef<Writeback | null>(null)
  // The statement offset the cursor was last jumped to (#595). Lets a continuous
  // fader/knob drag (many `applyToStrip` ticks on ONE strip) reveal+focus once,
  // then leave the caret pinned, instead of re-centring + re-focusing per frame.
  const lastJumpRef = React.useRef<number | null>(null)

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
    lastJumpRef.current = null // a fresh editor → next strip edit re-jumps
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
      const allChunks = detectAllChunks(model.getValue())
      const strips = buildStripModels(allChunks)
      // Expose the chunks aligned 1:1 with strips by each strip's ABSOLUTE source
      // index. buildStripModels filters out config/transport statements (setcps,
      // samples — #559), so `strips[i]` is NOT `allChunks[i]`; `strips[i].index`
      // is the chunk's true position. Without this, a leading config line shifts
      // every strip's chunk by one and the expand drawer would write to the
      // PREVIOUS track (or onto setcps for the first strip).
      setDerived({ strips, chunks: strips.map((s) => allChunks[s.index]) })
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
      // Write to the strip's chunk by its ABSOLUTE source index, NOT the strip
      // array position: buildStripModels drops config/transport lines (#559), so
      // the filtered strip index is off-by-one per preceding config line. Using
      // `chunks[idx]` wrote the fader/knob edit onto the PREVIOUS statement —
      // onto `setcps` for the first strip. `strip.index` is the chunk's real
      // position, so this ties every write to the strip's own track.
      const strip = buildStripModels(chunks).find((s) => s.id === id)
      if (!strip) return
      const fresh = chunks[strip.index]
      // The track's statement start — where the cursor follows to (#595). Read
      // BEFORE the mutate: the edit (gain/pan/knob, or the label on a rename) is
      // at or after this offset, so the offset stays valid afterwards.
      const trackOffset = fresh.statementRange[0]
      mutate(fresh, wb)
      jumpCursorToTrack(ed, model, trackOffset, lastJumpRef)
    },
    [],
  )

  const beginGesture = React.useCallback(() => writebackRef.current?.beginGesture(), [])
  const endGesture = React.useCallback(() => writebackRef.current?.endGesture(), [])

  return { strips: derived.strips, chunks: derived.chunks, applyToStrip, beginGesture, endGesture }
}
