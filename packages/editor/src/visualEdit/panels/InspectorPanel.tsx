/**
 * Inspector — the selected-note event fields inside the Mixer (#432).
 *
 * The Mixer is the Pattern surface's inspector: when a note (Piano Roll) or step
 * (Sequencer) is selected, this section shows its event fields and edits them.
 * It runs its OWN `useGridModel` (one per kind) bound to the same chunk the grid
 * edits — independent panels converging on the chunk under the cursor is the
 * established pattern (PatternPanel doc, useActiveChunk). Edits go through the
 * same serialize/`.gain` write path the grid uses (one path — PV129).
 *
 * VELOCITY = `.gain` (0–127 display, #427 Q1). Roll: pitch/velocity/position/
 * length editable. Step: sound (read-only — it's the Kit/voice), velocity
 * editable, position read-only.
 */
import * as React from 'react'

import { parsePianoRoll, parseStepGrid, applyRollGain, applyStepGain } from '../notation/parse'
import {
  serializePianoRoll,
  serializeStepGrid,
  serializeRollGain,
  serializeStepGain,
} from '../notation/serialize'
import type { PianoRollModel, StepGridModel } from '../notation/model'
import { isRollChunk, isStepChunk } from './patternKind'
import { useGridModel } from './useGridModel'
import {
  type SelectedNote,
  VELOCITY_MAX,
  velocityToGain,
  resolveRollFields,
  resolveStepFields,
  setGroupGain,
  setColumnGain,
  setRollPitch,
  setRollStart,
  setRollDuration,
  rollPitchToken,
} from './inspector'

export interface InspectorProps {
  selected?: SelectedNote | null
  onSelect?: (sel: SelectedNote | null) => void
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--foreground-muted, #a0a0aa)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}
const valueStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--foreground, #e6e6ea)',
  fontVariantNumeric: 'tabular-nums',
}
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

/** a small −/＋ stepper around a read-only value */
function Stepper({
  field,
  display,
  onStep,
  disabled,
}: {
  field: string
  display: string
  onStep: (delta: number) => void
  disabled?: boolean
}): React.ReactElement {
  const btn: React.CSSProperties = {
    width: 22,
    height: 22,
    padding: 0,
    borderRadius: 4,
    border: '1px solid var(--border, #3a3a42)',
    background: 'var(--background-elevated, #26262c)',
    color: disabled ? 'var(--foreground-muted, #6a6a72)' : 'var(--foreground, #e6e6ea)',
    cursor: disabled ? 'default' : 'pointer',
  }
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{field}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          aria-label={`${field} down`}
          data-inspector-step={`${field}:down`}
          disabled={disabled}
          onClick={() => onStep(-1)}
          style={btn}
        >
          −
        </button>
        <span data-inspector-value={field} style={{ ...valueStyle, minWidth: 32, textAlign: 'center' }}>
          {display}
        </span>
        <button
          type="button"
          aria-label={`${field} up`}
          data-inspector-step={`${field}:up`}
          disabled={disabled}
          onClick={() => onStep(1)}
          style={btn}
        >
          ＋
        </button>
      </span>
    </div>
  )
}

export function Inspector({ selected, onSelect }: InspectorProps): React.ReactElement | null {
  // One model instance per kind, bound to the active chunk (the non-matching one
  // returns a null model cheaply via its eligibility gate). Hooks run
  // unconditionally — every early return is BELOW them (PV144).
  const rollGrid = useGridModel<PianoRollModel>({
    source: 'roll',
    eligible: isRollChunk,
    parse: parsePianoRoll,
    serialize: serializePianoRoll,
    applyGain: applyRollGain,
    serializeGain: serializeRollGain,
  })
  const stepGrid = useGridModel<StepGridModel>({
    source: 'seq',
    eligible: isStepChunk,
    parse: parseStepGrid,
    serialize: serializeStepGrid,
    applyGain: applyStepGain,
    serializeGain: serializeStepGain,
  })

  if (!selected) return null

  // ── Piano Roll: pitch / velocity / position / length, all editable ──
  if (selected.kind === 'roll') {
    const model = rollGrid.model
    if (!model) return null
    const f = resolveRollFields(model, selected)
    if (!f) return null
    const { mutate, beginGesture, endGesture } = rollGrid

    const stepPitch = (delta: number): void => {
      if (f.midi === null) return
      const newMidi = f.midi + delta
      const token = rollPitchToken(model, newMidi)
      if (token === selected.pitch) return
      if (model.notes.some((n) => n.start === selected.start && n.pitch === token)) return // dup
      mutate((m) => setRollPitch(m, selected, newMidi))
      onSelect?.({ kind: 'roll', pitch: token, start: selected.start })
    }
    const stepPosition = (delta: number): void => {
      const newStart = Math.max(0, Math.min(selected.start + delta, model.steps - 1))
      if (newStart === selected.start) return
      mutate((m) => setRollStart(m, selected, newStart))
      onSelect?.({ kind: 'roll', pitch: selected.pitch, start: newStart })
    }
    const stepLength = (delta: number): void => {
      mutate((m) => setRollDuration(m, selected.start, f.length + delta))
    }
    const setVelocity = (v: number): void => {
      mutate((m) => setGroupGain(m, selected.start, velocityToGain(v)))
    }

    return (
      <InspectorShell title={f.pitch}>
        <Stepper field="pitch" display={f.pitch} onStep={stepPitch} disabled={f.midi === null} />
        <VelocityRow
          velocity={f.velocity}
          onChange={setVelocity}
          onGestureStart={beginGesture}
          onGestureEnd={endGesture}
        />
        <Stepper field="position" display={String(f.position + 1)} onStep={stepPosition} />
        <Stepper field="length" display={String(f.length)} onStep={stepLength} />
      </InspectorShell>
    )
  }

  // ── Sequencer step: sound (read-only) + velocity + position (read-only) ──
  const model = stepGrid.model
  if (!model) return null
  const f = resolveStepFields(model, selected)
  if (!f) return null
  return (
    <InspectorShell title={f.sound}>
      <div style={rowStyle}>
        <span style={labelStyle}>sound</span>
        <span data-inspector-value="sound" style={valueStyle}>
          {f.sound}
        </span>
      </div>
      <VelocityRow
        velocity={f.velocity}
        onChange={(v) => stepGrid.mutate((m) => setColumnGain(m, selected.step, velocityToGain(v)))}
        onGestureStart={stepGrid.beginGesture}
        onGestureEnd={stepGrid.endGesture}
      />
      <div style={rowStyle}>
        <span style={labelStyle}>position</span>
        <span data-inspector-value="position" style={valueStyle}>
          {f.position + 1}
        </span>
      </div>
    </InspectorShell>
  )
}

function InspectorShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div
      data-mixer-inspector
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 10,
        borderRadius: 6,
        border: '1px solid var(--border, #3a3a42)',
        background: 'var(--background, #1c1c20)',
      }}
    >
      <div style={{ ...labelStyle, color: 'var(--foreground, #e6e6ea)', fontSize: 11 }}>
        Note · {title}
      </div>
      {children}
    </div>
  )
}

function VelocityRow({
  velocity,
  onChange,
  onGestureStart,
  onGestureEnd,
}: {
  velocity: number
  onChange: (v: number) => void
  onGestureStart: () => void
  onGestureEnd: () => void
}): React.ReactElement {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>velocity</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="range"
          min={0}
          max={VELOCITY_MAX}
          value={velocity}
          data-inspector-velocity
          aria-label="velocity"
          onPointerDown={onGestureStart}
          onPointerUp={onGestureEnd}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: 120 }}
        />
        <span data-inspector-value="velocity" style={{ ...valueStyle, minWidth: 28, textAlign: 'right' }}>
          {velocity}
        </span>
      </span>
    </div>
  )
}
