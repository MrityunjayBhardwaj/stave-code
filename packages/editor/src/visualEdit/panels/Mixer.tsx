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
import { MIXER_TAB_ID } from './tabs'
import { useActiveChunk } from './useActiveChunk'
import { QUICK_TRANSFORMS } from './quickTransforms'

/** one knob = one numeric argument of one chain call */
interface KnobEntry {
  chainIndex: number
  argIndex: number
  method: string
  label: string
  value: number
}

const MIXER_HINT = 'Click a pattern to adjust its sound with knobs.'

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

  // Quick transforms (#390): append `.method(default)` to the expression when
  // that method isn't already in the chain — surfaces a new knob.
  const addTransform = React.useCallback(
    (method: string, value: number): void => {
      applyEdit((fresh, wb) => {
        if (fresh.chain.some((c) => c.name === method)) return // already present
        wb.insertAt(fresh.exprRange[1], `.${method}(${formatNumber(value)})`, 'knob')
      })
    },
    [applyEdit],
  )

  // Standby only when there's no editable pattern under the cursor. A pattern
  // with no numeric args still shows the quick-transform row so effects can be
  // added (then dragged).
  if (!chunk || chunk.chain.length === 0) {
    return React.createElement(VisualEditStandby, {
      panel: MIXER_TAB_ID,
      hint: MIXER_HINT,
      icon: 'settings',
    })
  }

  const present = new Set(chunk.chain.map((c) => c.name))

  return (
    <div
      data-bottom-panel-tab="mixer"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: 16,
        height: '100%',
        overflowY: 'auto',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div data-mixer-transforms style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {QUICK_TRANSFORMS.map((t) => (
          <button
            key={t.method}
            type="button"
            disabled={present.has(t.method)}
            data-mixer-transform={t.method}
            onClick={() => addTransform(t.method, t.value)}
            style={{
              padding: '3px 10px',
              fontSize: 11,
              borderRadius: 4,
              border: '1px solid var(--border, #3a3a42)',
              background: present.has(t.method)
                ? 'var(--background, #1c1c20)'
                : 'var(--background-elevated, #26262c)',
              color: present.has(t.method)
                ? 'var(--foreground-muted, #6a6a72)'
                : 'var(--foreground, #e6e6ea)',
              cursor: present.has(t.method) ? 'default' : 'pointer',
            }}
          >
            + {t.label}
          </button>
        ))}
      </div>
      {knobs.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
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
      ) : (
        <span style={{ fontSize: 11, color: 'var(--foreground-muted, #a0a0aa)' }}>
          Add an effect above, or drag a knob once the pattern has one.
        </span>
      )}
    </div>
  )
}
