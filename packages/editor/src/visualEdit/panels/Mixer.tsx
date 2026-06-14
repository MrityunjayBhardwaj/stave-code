/**
 * Mixer — the first write-back visual editor (#381).
 *
 * Binds to the active Monaco editor, finds the Strudel statement under the
 * cursor (`detectChunk`), and renders a Knob for every numeric argument in its
 * method chain (`.gain(0.6)` → a "gain" knob at 0.6). Dragging a knob writes a
 * surgical text edit of just that literal via the tagged `Writeback` — the
 * mini-notation and the rest of the statement stay byte-identical, and the
 * whole drag is one undo step. Audio updates through the existing live-mode
 * re-eval (content change → debounced evaluate).
 *
 * No app wiring: the panel reads the active-editor registry directly, so it
 * works as a self-contained bottom-panel tab. Shows a standby state when the
 * cursor isn't in a chunk with editable knobs (the conservatism rule).
 */
import * as React from 'react'

import {
  getActiveEditor,
  onActiveEditorChange,
  getMonacoNamespace,
} from '../../workspace/editorRegistry'
import { detectChunk, type ChunkInfo } from '../chunkDetect'
import { Writeback, formatNumber } from '../writeback'
import { Knob } from './Knob'
import { knobRangeFor } from './knobRanges'
import { VisualEditStandby } from './VisualEditStandby'
import { MIXER_TAB_ID, VISUAL_EDIT_TABS } from './tabs'

/** one knob = one numeric argument of one chain call */
interface KnobEntry {
  chainIndex: number
  argIndex: number
  method: string
  label: string
  value: number
}

const MIXER_HINT =
  VISUAL_EDIT_TABS.find((t) => t.id === MIXER_TAB_ID)?.hint ??
  'Click a pattern to adjust its sound with knobs.'

/** flatten a chunk's chain into the numeric-arg knobs it exposes */
function knobsFromChunk(chunk: ChunkInfo): KnobEntry[] {
  const knobs: KnobEntry[] = []
  chunk.chain.forEach((call, chainIndex) => {
    const numericArgs = call.args
      .map((a, argIndex) => ({ a, argIndex }))
      .filter((x) => x.a.numeric !== null)
    numericArgs.forEach(({ a, argIndex }) => {
      knobs.push({
        chainIndex,
        argIndex,
        method: call.name,
        // disambiguate when a single call has several numeric args
        label: numericArgs.length > 1 ? `${call.name} ${argIndex + 1}` : call.name,
        value: a.numeric as number,
      })
    })
  })
  return knobs
}

export function Mixer(): React.ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editor, setEditor] = React.useState<any>(() => getActiveEditor())
  const [chunk, setChunk] = React.useState<ChunkInfo | null>(null)
  const writebackRef = React.useRef<Writeback | null>(null)
  const editorRef = React.useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any

  // Track which editor is active.
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

  // Detect the chunk under the cursor; re-detect on cursor move and on
  // EXTERNAL content changes (typed edits), but not on our own knob writes
  // (those fire with writeback.currentSource === 'knob').
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
      const offset = model.getOffsetAt(position)
      setChunk(detectChunk(model.getValue(), offset))
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

  const knobs = chunk ? knobsFromChunk(chunk) : []

  // Anchor re-detection at the statement start, which is stable across the
  // intra-statement edits a knob drag makes.
  const anchorRef = React.useRef<number | null>(null)
  anchorRef.current = chunk ? chunk.statementRange[0] : null

  const writeKnob = React.useCallback(
    (chainIndex: number, argIndex: number, value: number): void => {
      const ed = editorRef.current
      const wb = writebackRef.current
      const anchor = anchorRef.current
      if (!ed || !wb || anchor == null) return
      const model = ed.getModel?.()
      if (!model) return
      // Re-detect against the live doc so the literal's range is current even
      // after earlier edits in this drag changed its length.
      const before = detectChunk(model.getValue(), anchor)
      const arg = before?.chain[chainIndex]?.args[argIndex]
      if (!arg) return
      wb.replaceRange(arg.range, formatNumber(value), 'knob')
      // Re-detect AFTER the write so the knob reads back the value we just
      // wrote (the model reflects the edit synchronously). Detecting before the
      // write would leave the readout one drag-step stale. The content-change
      // listener ignores this same edit (currentSource === 'knob').
      setChunk(detectChunk(model.getValue(), anchor))
    },
    [],
  )

  const beginGesture = React.useCallback(() => writebackRef.current?.beginGesture(), [])
  const endGesture = React.useCallback(() => writebackRef.current?.endGesture(), [])

  if (knobs.length === 0) {
    return React.createElement(VisualEditStandby, {
      panel: MIXER_TAB_ID,
      hint: MIXER_HINT,
      icon: 'settings',
    })
  }

  return (
    <div
      data-bottom-panel-tab="mixer"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        alignItems: 'flex-start',
        padding: 16,
        height: '100%',
        overflowY: 'auto',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      {knobs.map((k) => (
        <Knob
          key={`${k.chainIndex}:${k.argIndex}`}
          label={k.label}
          value={k.value}
          range={knobRangeFor(k.method, k.value)}
          onChange={(v) => writeKnob(k.chainIndex, k.argIndex, v)}
          onGestureStart={beginGesture}
          onGestureEnd={endGesture}
        />
      ))}
    </div>
  )
}
