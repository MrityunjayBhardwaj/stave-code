/**
 * useGridModel — model-in-state binding shared by the grid panels (Sequencer,
 * Piano Roll).
 *
 * Both panels parse the chunk's mini-notation into a structured model, edit it,
 * and write the serialized result back over the mini range. The model is held
 * in component state rather than derived per-render so structure the user
 * clears (an emptied lane, a deleted note) survives — its serialized form may
 * omit it, but the editable scaffold stays. The model is reseeded only on
 * EXTERNAL edits, detected by comparing what we'd serialize against the
 * incoming mini; the panel's own write-back echoes leave it untouched.
 *
 * `mutate(fn)` runs a pure transform against the latest model (synchronous, so
 * a fast drag reads its own prior edits), then writes the serialized result.
 * A transform whose serialization is inexpressible in the subset (serialize →
 * null) is dropped, leaving the document untouched.
 *
 * Built on `useActiveChunk` (the active-editor → chunk → writeback layer).
 */
import * as React from 'react'

import type { ChunkInfo } from '../chunkDetect'
import type { ParseResult } from '../notation/model'
import type { WriteSource } from '../writeback'
import { useActiveChunk } from './useActiveChunk'

export interface GridModelOptions<M> {
  /** writeback source tag for this panel's edits */
  source: WriteSource
  /** does this chunk belong to this panel? (head function / shape gate) */
  eligible: (chunk: ChunkInfo) => boolean
  parse: (mini: string) => ParseResult<M>
  /** model → mini, or null when the model can't be expressed in the subset */
  serialize: (model: M) => string | null
}

export interface GridModel<M> {
  model: M | null
  chunk: ChunkInfo | null
  /** transform the model and write the serialized result over the mini range */
  mutate: (fn: (model: M) => M) => void
  beginGesture: () => void
  endGesture: () => void
}

export function useGridModel<M>(opts: GridModelOptions<M>): GridModel<M> {
  const { chunk, applyEdit, beginGesture, endGesture } = useActiveChunk()
  const [model, setModel] = React.useState<M | null>(null)
  // Mirror for synchronous reads inside pointer handlers / rapid drags.
  const modelRef = React.useRef<M | null>(null)
  React.useEffect(() => {
    modelRef.current = model
  }, [model])

  // opts is recreated each render; keep the latest in a ref so the reconcile
  // effect can depend on `chunk` alone.
  const optsRef = React.useRef(opts)
  optsRef.current = opts

  React.useEffect(() => {
    const o = optsRef.current
    if (!chunk || chunk.miniString === null || !o.eligible(chunk)) {
      modelRef.current = null
      setModel(null)
      return
    }
    const parsed = o.parse(chunk.miniString)
    if (!parsed.ok) {
      modelRef.current = null
      setModel(null)
      return
    }
    const prev = modelRef.current
    const next = prev && o.serialize(prev) === chunk.miniString ? prev : parsed.model
    modelRef.current = next
    setModel(next)
  }, [chunk])

  const mutate = React.useCallback(
    (fn: (m: M) => M): void => {
      const o = optsRef.current
      const prev = modelRef.current
      if (prev == null) return
      const next = fn(prev)
      if (next === prev) return
      const mini = o.serialize(next)
      if (mini == null) return // inexpressible — leave the document untouched
      modelRef.current = next
      setModel(next)
      applyEdit((fresh, wb) => {
        if (fresh.miniRange) wb.replaceRange(fresh.miniRange, mini, o.source)
      })
    },
    [applyEdit],
  )

  return { model, chunk, mutate, beginGesture, endGesture }
}
