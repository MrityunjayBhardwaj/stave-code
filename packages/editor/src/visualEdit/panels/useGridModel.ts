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
 * the mini OR the `.gain` changes externally. WHICH BYTES that write changes is
 * not decided here: `gridWriteEdits` (`codeView/notation/gainEdit`, #1887) builds
 * the edit list and this hook hands it to `commit` (#1909).
 *
 * Built on `useActiveChunk` (the active-editor → chunk → writeback layer).
 */
import * as React from 'react'

import type { ChunkInfo } from '../../codeView'
import type { ChunkGain, GainWrite, ParseResult } from '../../codeView'
import { UNREFINED, absorbViewScale, type ViewScale } from '../../codeView'
import { commit, type WriteSource } from '../../codeView'
import { gridWriteEdits, readChunkGain, gainUnchanged } from '../../codeView'
import { useActiveChunk } from './useActiveChunk'

export interface GridModelOptions<M> {
  /** writeback source tag for this panel's edits */
  source: WriteSource
  /** does this chunk belong to this panel? (head function / shape gate) */
  eligible: (chunk: ChunkInfo) => boolean
  parse: (mini: string, viewScale: ViewScale) => ParseResult<M>
  /**
   * How finely to DRAW the chunk (#1057). A change here re-parses at the new scale
   * and writes nothing — that is the free zone's whole mechanism. Defaults to the
   * document's own resolution, so a panel that never sets it behaves as before.
   */
  viewScale?: ViewScale
  /**
   * Called after a write-back has actually SPELLED the refinement, so the panel can
   * drop it: the document now says what was drawn (`absorbViewScale`). Not called
   * when the transform declined or the result was inexpressible — nothing was
   * written — and not called when the write was expressible at the document's own
   * resolution, because then the document's spelling did not change and the user's
   * view must stay where they put it (see `collapseToDocument`).
   */
  onViewScaleConsumed?: () => void
  /**
   * Express a model drawn at a finer view at the DOCUMENT's own resolution, or
   * `null` when the edit really used a column the document does not have (#1057).
   *
   * A write consults this FIRST, so that only a write which NEEDS the finer
   * spelling respells the file. Omitting it restores the previous behaviour —
   * every write spells what was drawn — which is what keeps a caller that never
   * refines behaving exactly as it did.
   */
  collapseToDocument?: (model: M) => M | null
  /** model → mini, or null when the model can't be expressed in the subset */
  serialize: (model: M) => string | null
  /**
   * Read an existing `.gain` (scalar or per-column) onto the freshly-parsed
   * model. Omit to opt the panel out of velocity entirely.
   */
  applyGain?: (model: M, gain: ChunkGain) => M
  /** model → what to do with the `.gain` method (write / clear / skip) */
  serializeGain?: (model: M) => GainWrite
}

export interface GridModel<M> {
  model: M | null
  /** the model the document's text reads as right now — `model` may be the edited one */
  read: M | null
  chunk: ChunkInfo | null
  /** transform the model and write the serialized result over the mini range */
  mutate: (fn: (model: M) => M) => void
  /**
   * Write `model` over the mini range UNCONDITIONALLY — no live-model guard, no
   * identity short-circuit (#1453).
   *
   * `mutate` is a transform OF the current model, so it correctly declines when
   * there is no current model and when the transform changed nothing. A gesture's
   * commit-time settle is a different question: the gesture already knows the model
   * it started from, and it is asserting what the document must now hold. Routing
   * that through `mutate` made it silently skippable — a mid-drag frame can leave
   * the document unparseable, which nulls the live model, which made `mutate`
   * return before running the callback that computes the refusal. The gate was
   * disabled by the write it exists to undo.
   */
  settle: (model: M) => void
  /**
   * Replace the whole mini with `mini` as written — not a model's serialization
   * (#1824). For rewrites that change what the grid IS (its length) rather than a
   * cell in it; the model reseeds from the result like any external edit. The
   * caller has already checked the result reads back.
   */
  writeMini: (mini: string) => void
  beginGesture: () => void
  endGesture: () => void
}


export function useGridModel<M extends { viewScale?: ViewScale }>(
  opts: GridModelOptions<M>,
): GridModel<M> {
  const { chunk, applyEdit, beginGesture, endGesture } = useActiveChunk()
  const [model, setModel] = React.useState<M | null>(null)
  // WHAT THE TEXT READS AS, beside the model kept on screen (#1849). After a write the
  // kept model is the one that was edited, and its `source` still describes the text it
  // was parsed from — so anything drawn from the WRITTEN structure (step lines) has to
  // be read off this instead: `<[~ sd ~ sd] ~>` has no steps in bar 2, while the edited
  // model's source still says `~ sd ~ sd`, repeated.
  const [read, setRead] = React.useState<M | null>(null)
  // Mirror for synchronous reads inside pointer handlers / rapid drags.
  const modelRef = React.useRef<M | null>(null)
  React.useEffect(() => {
    modelRef.current = model
  }, [model])

  // opts is recreated each render; keep the latest in a ref so the reconcile
  // effect can depend on `chunk` alone.
  const optsRef = React.useRef(opts)
  optsRef.current = opts

  // Read off the LIVE opts rather than the ref: this one has to be a real
  // dependency, because changing how finely we draw is precisely a reason to
  // re-parse (#1057) and a ref would swallow it.
  const viewScale = opts.viewScale ?? UNREFINED
  // The scale the retained model was actually built at. Without it a scale change
  // could keep the previous model whenever it happened to serialize back to the
  // source — retaining a ×2 model for a ×1 view, with no error anywhere.
  const modelScaleRef = React.useRef<ViewScale>(UNREFINED)

  React.useEffect(() => {
    const o = optsRef.current
    if (!chunk || chunk.miniString === null || !o.eligible(chunk)) {
      modelRef.current = null
      setModel(null)
      setRead(null)
      return
    }
    const parsed = o.parse(chunk.miniString, viewScale)
    if (!parsed.ok) {
      modelRef.current = null
      setModel(null)
      setRead(null)
      return
    }
    setRead(parsed.model)
    const chunkGain = readChunkGain(chunk)
    const fresh = o.applyGain ? o.applyGain(parsed.model, chunkGain) : parsed.model

    // Keep the in-progress model only when the mini, the `.gain` AND the scale it
    // was drawn at all still match; any external change to either — or any change
    // to how finely we are drawing — reseeds.
    const prev = modelRef.current
    // ASKED THE WAY THE WRITE ASKS IT. A refined model does not serialize to the
    // document's bytes — it serializes to the drawn spelling — so comparing it
    // directly would call every refined model "changed" and reseed on every frame
    // of a velocity drag. The honest question is the one `mutate` answers: what
    // would this model WRITE? (#1057)
    const asWritten = prev == null ? null : (o.collapseToDocument?.(prev) ?? prev)
    const sameMini = asWritten != null && o.serialize(asWritten) === chunk.miniString
    const sameGain =
      prev == null || !o.serializeGain
        ? true
        : gainUnchanged(o.serializeGain(prev), chunkGain)
    const sameScale = modelScaleRef.current === viewScale
    const next = prev && sameMini && sameGain && sameScale ? prev : fresh
    modelScaleRef.current = viewScale
    modelRef.current = next
    setModel(next)
  }, [chunk, viewScale])

  /**
   * The write half, shared by `mutate` and `settle` — everything from "what
   * resolution should this spell" down to the edit. Holds no opinion about whether
   * the write SHOULD happen; its callers decide that, and they decide it
   * differently (#1453).
   */
  const writeModel = React.useCallback(
    (next: M): void => {
      const o = optsRef.current
      // WHAT RESOLUTION SHOULD THIS WRITE SPELL? Only an edit that used a column
      // the document does not have needs the finer one; a velocity drag does not,
      // and respelling for it rewrites the file to record how closely someone was
      // looking (#1057). Asked once, here, rather than per op — and asked of the
      // real ÷k guard rather than predicted, the same discipline `slotState` uses.
      const atDocument = o.collapseToDocument ? o.collapseToDocument(next) : null
      const spellsRefinement = atDocument === null
      const toWrite = atDocument ?? next
      const mini = o.serialize(toWrite)
      if (mini == null) return // inexpressible — leave the document untouched
      // The refinement is absorbed ONLY when the write actually spelled it. When
      // the write went out at the document's own resolution the file's spelling
      // did not change, so the marker and the panel's scale both stay put — and
      // the model on screen stays the one the user is looking at.
      const written = spellsRefinement ? absorbViewScale(next) : next
      if (spellsRefinement) modelScaleRef.current = UNREFINED
      modelRef.current = written
      setModel(written)
      if (spellsRefinement) o.onViewScaleConsumed?.()
      applyEdit((fresh, wb) => {
        // ⚠ THE SAME MODEL as the mini. These read `next` and `toWrite` separately
        // once, and the gain mini was widened to the drawn column count while the
        // notation was not — two ranges disagreeing about the document's resolution.
        const edits = gridWriteEdits(fresh, mini, o.serializeGain ? o.serializeGain(toWrite) : null)
        // One commit → the mini and its `.gain` are one undo step.
        commit(wb, edits, o.source)
      })
    },
    [applyEdit],
  )

  const mutate = React.useCallback(
    (fn: (m: M) => M): void => {
      const prev = modelRef.current
      if (prev == null) return
      const next = fn(prev)
      if (next === prev) return
      writeModel(next)
    },
    [writeModel],
  )

  /** See {@link GridModel.settle}. Deliberately skips both of `mutate`'s guards. */
  const settle = React.useCallback((next: M): void => writeModel(next), [writeModel])

  /** See {@link GridModel.writeMini}. One edit, so one undo step. */
  const writeMini = React.useCallback(
    (mini: string): void => {
      applyEdit((fresh, wb) => {
        commit(wb, gridWriteEdits(fresh, mini, null), optsRef.current.source)
      })
    },
    [applyEdit],
  )

  return { model, read, chunk, mutate, settle, writeMini, beginGesture, endGesture }
}
