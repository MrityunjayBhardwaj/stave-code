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
 * incoming source; the panel's own write-back echoes leave it untouched.
 *
 * `mutate(fn)` runs a pure transform against the latest model (synchronous, so
 * a fast drag reads its own prior edits), then writes the serialized result.
 * A transform whose serialization is inexpressible in the subset (serialize →
 * null) is dropped, leaving the document untouched.
 *
 * VELOCITY (the second write-back range): a panel may also carry a `.gain("…")`
 * mini that runs PARALLEL to the head mini — per-column velocity (#409). When
 * `serializeGain`/`applyGain` are supplied, every `mutate` writes the mini AND
 * the coordinated gain edit (replace an existing string `.gain` arg, insert
 * `.gain("…")` after the expression, or remove our `.gain` when all-neutral) as
 * ONE `replaceRanges` — a single undo step. The model is reseeded when EITHER
 * the mini OR the `.gain` changes externally. We only ever touch a `.gain`
 * whose arg is a grid-aligned string we authored; a numeric `.gain(0.8)` knob
 * or an unaligned/broadcast `.gain("0.8")` is left byte-identical.
 *
 * Built on `useActiveChunk` (the active-editor → chunk → writeback layer).
 */
import * as React from 'react'

import type { ChunkInfo } from '../chunkDetect'
import type { GainWrite, ParseResult } from '../notation/model'
import type { OffsetEdit, WriteSource } from '../writeback'
import { useActiveChunk } from './useActiveChunk'

export interface GridModelOptions<M> {
  /** writeback source tag for this panel's edits */
  source: WriteSource
  /** does this chunk belong to this panel? (head function / shape gate) */
  eligible: (chunk: ChunkInfo) => boolean
  parse: (mini: string) => ParseResult<M>
  /** model → mini, or null when the model can't be expressed in the subset */
  serialize: (model: M) => string | null
  /**
   * Read an existing `.gain("…")` onto the freshly-parsed model. `gainMini` is
   * the string arg's inner text (null when absent or non-string); `foreign` is
   * true when a `.gain` is present that we don't manage (numeric knob form).
   * Omit to opt the panel out of velocity entirely.
   */
  applyGain?: (model: M, gainMini: string | null, foreign: boolean) => M
  /** model → what to do with the `.gain` method (write / clear / skip) */
  serializeGain?: (model: M) => GainWrite
}

export interface GridModel<M> {
  model: M | null
  chunk: ChunkInfo | null
  /** transform the model and write the serialized result over the mini range */
  mutate: (fn: (model: M) => M) => void
  beginGesture: () => void
  endGesture: () => void
}

/**
 * The inner text of a `.gain("…")` string arg in the chain, and whether a
 * `.gain` we DON'T manage is present. `{ mini, foreign }`:
 *   - no `.gain`            → { null,  false }
 *   - string `.gain("…")`   → { inner, false }  (applyGain decides if it aligns)
 *   - numeric `.gain(0.8)`  → { null,  true  }   (a whole-pattern knob — hands off)
 */
function readChunkGain(chunk: ChunkInfo): { mini: string | null; foreign: boolean } {
  const call = chunk.chain.find((c) => c.name === 'gain')
  const arg = call?.args[0]
  if (!call || !arg) return { mini: null, foreign: false }
  if (arg.numeric !== null) return { mini: null, foreign: true } // numeric knob gain
  if (/^["'`]/.test(arg.raw)) return { mini: arg.raw.slice(1, -1), foreign: false }
  return { mini: null, foreign: true } // some other expression — don't touch
}

/**
 * The doc offsets velocity may edit on a fresh chunk: the inner range of a
 * string `.gain` arg (replace target) and the full `.gain(...)` call range
 * (removal target). Both null unless a string `.gain` we authored is present.
 */
function gainTargets(chunk: ChunkInfo): {
  argInner: [number, number] | null
  callRange: [number, number] | null
} {
  const call = chunk.chain.find((c) => c.name === 'gain')
  const arg = call?.args[0]
  if (!call || !arg || arg.numeric !== null || !/^["'`]/.test(arg.raw)) {
    return { argInner: null, callRange: null }
  }
  return { argInner: [arg.range[0] + 1, arg.range[1] - 1], callRange: call.range }
}

/** the gain edits for one `mutate`, given the model's `GainWrite` intent */
function gainEdits(fresh: ChunkInfo, g: GainWrite): OffsetEdit[] {
  if (g.kind === 'skip') return []
  const t = gainTargets(fresh)
  if (g.kind === 'clear') {
    // remove ONLY a string `.gain` we authored; absent/numeric → nothing to do
    return t.callRange ? [{ range: t.callRange, text: '' }] : []
  }
  if (t.argInner) return [{ range: t.argInner, text: g.mini }] // replace existing arg
  // no string `.gain` present → append `.gain("…")` after the expression
  return [{ range: [fresh.exprRange[1], fresh.exprRange[1]], text: `.gain("${g.mini}")` }]
}

/** does prev's gain intent already match the chunk's current `.gain`? */
function gainUnchanged(g: GainWrite, chunkMini: string | null): boolean {
  if (g.kind === 'skip') return true // not managing it → never force a reseed
  if (g.kind === 'clear') return chunkMini === null
  return chunkMini === g.mini
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
    const chunkGain = readChunkGain(chunk)
    const fresh = o.applyGain
      ? o.applyGain(parsed.model, chunkGain.mini, chunkGain.foreign)
      : parsed.model

    // Keep the in-progress model only when BOTH the mini and the `.gain` still
    // match what we'd serialize; any external change to either reseeds.
    const prev = modelRef.current
    const sameMini = prev != null && o.serialize(prev) === chunk.miniString
    const sameGain =
      prev == null || !o.serializeGain
        ? true
        : gainUnchanged(o.serializeGain(prev), chunkGain.mini)
    const next = prev && sameMini && sameGain ? prev : fresh
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
        if (!fresh.miniRange) return
        const edits: OffsetEdit[] = [{ range: fresh.miniRange, text: mini }]
        if (o.serializeGain) edits.push(...gainEdits(fresh, o.serializeGain(next)))
        // One pushEditOperations → the mini and its `.gain` are one undo step.
        wb.replaceRanges(edits, o.source)
      })
    },
    [applyEdit],
  )

  return { model, chunk, mutate, beginGesture, endGesture }
}
