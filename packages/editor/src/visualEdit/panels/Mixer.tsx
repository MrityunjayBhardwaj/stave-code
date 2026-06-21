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

/**
 * A per-column `.gain("…")` velocity string the grid authored — flat numeric
 * tokens (with optional `~` rests and `@n` holds). Carried on the gain knob so
 * dragging the knob rescales every column proportionally (a master fader over
 * the per-step velocities) instead of leaving the chunk with no gain control.
 */
interface ManagedGain {
  tokens: string[]
  /** loudest column (the knob's value); rests/`~` excluded */
  ceiling: number
  /** the original quote character, preserved on write-back */
  quote: string
}

const GAIN_TOKEN = /^(\d+(?:\.\d+)?)(@\d+)?$/

/**
 * Read a `.gain` arg's raw text as a managed per-column velocity string, or
 * null when it isn't one we authored (a scalar, a single-token broadcast, a
 * signal/identifier, or a token shape we don't manage → the Mixer hands off and
 * shows no knob, exactly as before).
 */
function parseManagedGain(raw: string): ManagedGain | null {
  const quote = raw[0] === '"' || raw[0] === "'" || raw[0] === '`' ? raw[0] : ''
  if (!quote || raw[raw.length - 1] !== quote) return null
  const tokens = raw.slice(1, -1).trim().split(/\s+/).filter((t) => t !== '')
  if (tokens.length < 2) return null // single token = broadcast, not per-column
  let ceiling = 0
  for (const t of tokens) {
    if (t === '~') continue
    const m = GAIN_TOKEN.exec(t)
    if (!m) return null // a token we didn't author → foreign, hands off
    ceiling = Math.max(ceiling, parseFloat(m[1]))
  }
  return { tokens, ceiling, quote }
}

/** Rescale every column so the loudest hits the knob's new value (shape kept). */
function scaleManagedGain(mg: ManagedGain, value: number): string {
  const factor = mg.ceiling > 0 ? value / mg.ceiling : null
  const out = mg.tokens.map((t) => {
    if (t === '~') return '~'
    const m = GAIN_TOKEN.exec(t) as RegExpExecArray
    const nv = factor === null ? value : parseFloat(m[1]) * factor
    return formatNumber(Math.max(0, nv)) + (m[2] ?? '')
  })
  return mg.quote + out.join(' ') + mg.quote
}

/** one knob = one numeric argument of one chain call */
interface KnobEntry {
  chainIndex: number
  argIndex: number
  method: string
  label: string
  value: number
  /** present when the knob is a master fader over a per-column gain string */
  gain?: ManagedGain
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
    // A per-column `.gain("…")` velocity has no numeric arg, so it surfaced no
    // knob and `+ gain` is disabled (gain is present) — a dead state. Surface a
    // master gain knob at the ceiling; dragging it rescales all columns.
    if (call.name === 'gain' && call.args.length === 1 && call.args[0].numeric === null) {
      const mg = parseManagedGain(call.args[0].raw)
      if (mg) {
        knobs.push({ chainIndex, argIndex: 0, method: 'gain', label: 'gain', value: mg.ceiling, gain: mg })
      }
    }
  })
  return knobs
}

export function Mixer(): React.ReactElement {
  const { chunk, applyEdit, beginGesture, endGesture } = useActiveChunk()

  const knobs = chunk ? knobsFromChunk(chunk) : []

  const writeKnob = React.useCallback(
    (entry: KnobEntry, value: number): void => {
      applyEdit((fresh, wb) => {
        const arg = fresh.chain[entry.chainIndex]?.args[entry.argIndex]
        if (!arg) return
        if (entry.gain) {
          // re-read the fresh arg so the scale reflects the current columns; the
          // whole `.gain("…")` arg is rewritten as one surgical edit (one undo).
          const mg = parseManagedGain(arg.raw) ?? entry.gain
          wb.replaceRange(arg.range, scaleManagedGain(mg, value), 'knob')
          return
        }
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
              onChange={(v) => writeKnob(k, v)}
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
