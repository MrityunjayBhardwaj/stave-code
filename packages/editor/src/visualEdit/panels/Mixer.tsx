/**
 * Mixer — the first write-back visual editor (#381).
 *
 * Finds the Strudel statement under the cursor (via `useActiveChunk`) and
 * renders a Knob for every numeric argument in its method chain (`.gain(0.6)`
 * → a "gain" knob at 0.6). Dragging a knob writes a surgical text edit of just
 * that literal through the tagged `Writeback` — the mini-notation and the rest
 * of the statement stay byte-identical, and the whole drag is one undo step.
 * Audio updates through the existing live-mode re-eval.
 *
 * Shows a standby state when the cursor isn't in a chunk with editable knobs
 * (the conservatism rule).
 */
import * as React from 'react'

import { type ChunkInfo } from '../chunkDetect'
import { formatNumber } from '../writeback'
import { Knob } from './Knob'
import { knobRangeFor } from './knobRanges'
import { VisualEditStandby } from './VisualEditStandby'
import { MIXER_TAB_ID, VISUAL_EDIT_TABS } from './tabs'
import { useActiveChunk } from './useActiveChunk'

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
  const { chunk, applyEdit, beginGesture, endGesture } = useActiveChunk()

  const knobs = chunk ? knobsFromChunk(chunk) : []

  const writeKnob = React.useCallback(
    (chainIndex: number, argIndex: number, value: number): void => {
      applyEdit((fresh, wb) => {
        const arg = fresh.chain[chainIndex]?.args[argIndex]
        if (!arg) return
        wb.replaceRange(arg.range, formatNumber(value), 'knob')
      })
    },
    [applyEdit],
  )

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
