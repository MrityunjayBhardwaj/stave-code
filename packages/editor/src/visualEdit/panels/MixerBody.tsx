/**
 * MixerBody — the full per-chunk knob chain (#381 body, extracted for S4b).
 *
 * Given ONE chunk plus its write handlers, this renders the sound/kit picker,
 * the Snap picker (roll), the quick-transform row, and a Knob for every numeric
 * argument in the chain. It is binding-agnostic: the Pattern tab's `Mixer`
 * wrapper feeds it the cursor chunk (`useActiveChunk`), and the Mixer console's
 * `ExpandDrawer` feeds it a strip's chunk (`applyToStrip(id, …)`). Same body,
 * two bindings, zero duplicated write logic (the S4 redesign's whole point).
 *
 * Unlike the old `Mixer`, MixerBody does NOT early-return on an empty chain — it
 * always renders the body so an effect-less strip still shows the transforms row
 * (you can ADD an effect, then drag it). The standby for "no chunk under the
 * cursor" lives in the `Mixer` wrapper, which only mounts MixerBody once a chunk
 * exists. The catalog hooks live here (called unconditionally — MixerBody always
 * renders), so the wrapper can keep its own early-return.
 */
import * as React from 'react'

import { type ChunkInfo } from '../chunkDetect'
import { type Writeback, formatNumber } from '../writeback'
import { Knob } from './Knob'
import { knobRangeFor } from './knobRanges'
import { QUICK_TRANSFORMS } from './quickTransforms'
import { patternKind, isRollChunk } from './patternKind'
import { parsePianoRoll } from '../notation/parse'
import { type Division, DIVISIONS, isRepresentable, stepsPerBar } from './division'
import { readChainMethod } from './chainMethod'
import { type ManagedGain, parseManagedGain, scaleManagedGain } from '../mixer/gain'
import { INSTRUMENTS, DRUM_KITS, type SoundGroup } from './soundCatalog'
import { useSoundCatalog, useDrumKitCatalog } from '../../workspace/soundRegistry'

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

/**
 * A grouped `<select>` for sound assignment (#514 instrument / #515 kit). When
 * the chunk's current value isn't in the curated catalog (a hand-typed sound or
 * a kit outside the shortlist), it's surfaced as a leading option so the picker
 * still shows what's set — the write-back accepts any string (PV141 #6).
 */
function SoundSelect({
  label,
  groups,
  value,
  placeholder,
  onChange,
}: {
  label: string
  groups: SoundGroup[]
  value: string
  placeholder: string
  onChange: (v: string) => void
}): React.ReactElement {
  const known = groups.some((g) => g.options.some((o) => o.value === value))
  return (
    <label
      data-mixer-sound={label.toLowerCase()}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}
    >
      <span style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>{label}</span>
      <select
        data-mixer-sound-select={label.toLowerCase()}
        value={known ? value : value === '' ? '' : '__custom__'}
        onChange={(e) => e.target.value !== '__custom__' && onChange(e.target.value)}
        style={{
          padding: '4px 8px',
          fontSize: 12,
          borderRadius: 4,
          border: '1px solid var(--border, #3a3a42)',
          background: 'var(--background-elevated, #26262c)',
          color: 'var(--foreground, #e6e6ea)',
          maxWidth: 220,
        }}
      >
        <option value="">{placeholder}</option>
        {value !== '' && !known && <option value="__custom__">{value} (current)</option>}
        {groups.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

/**
 * Columns-per-bar of the roll under the cursor, read straight off the chunk's
 * mini (no model state — a pure parse), or null when it isn't a grid-editable
 * melody. The division picker uses it to grey out divisions this grid can't
 * snap to (#432 Slice 2).
 */
function rollStepsPerBar(chunk: ChunkInfo | null): number | null {
  if (!chunk || chunk.miniString === null || !isRollChunk(chunk)) return null
  const parsed = parsePianoRoll(chunk.miniString)
  return parsed.ok ? stepsPerBar(parsed.model.steps, parsed.model.bars) : null
}

/**
 * Snap/quantize division picker (#432 Slice 2) — Piano Roll only (the Sequencer
 * is already cell-quantized, no continuous gesture to snap). Divisions the grid
 * can't represent are disabled, never silently inert (honest control).
 */
function DivisionSelect({
  division,
  spb,
  onChange,
}: {
  division: Division
  spb: number | null
  onChange: (d: Division) => void
}): React.ReactElement {
  return (
    <label
      data-mixer-division
      style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}
    >
      <span style={{ color: 'var(--foreground-muted, #a0a0aa)' }}>Snap</span>
      <select
        data-mixer-division-select
        value={division}
        onChange={(e) => onChange(e.target.value as Division)}
        style={{
          padding: '4px 8px',
          fontSize: 12,
          borderRadius: 4,
          border: '1px solid var(--border, #3a3a42)',
          background: 'var(--background-elevated, #26262c)',
          color: 'var(--foreground, #e6e6ea)',
          maxWidth: 220,
        }}
      >
        {DIVISIONS.map((d) => {
          const ok = spb == null || isRepresentable(spb, d.value)
          return (
            <option key={d.value} value={d.value} disabled={!ok}>
              {ok ? d.label : `${d.label} (n/a)`}
            </option>
          )
        })}
      </select>
    </label>
  )
}

export interface MixerBodyProps {
  /** the chunk this body edits (cursor chunk, or a strip's chunk in the drawer) */
  chunk: ChunkInfo
  /** the shared write path — re-resolves the chunk fresh, hands `mutate` it + the
   *  tagged Writeback (identical shape to `useActiveChunk.applyEdit`). */
  applyEdit: (mutate: (fresh: ChunkInfo, wb: Writeback) => void) => void
  /** wrap a knob drag as one undo step (coalesced gesture) */
  beginGesture: () => void
  endGesture: () => void
  /** Piano-Roll snap/quantize division (#432) — a Pattern-tab concern, so the
   *  Mixer console drawer leaves it undefined and the Snap picker is omitted. */
  division?: Division
  onDivisionChange?: (d: Division) => void
  /** optional `data-bottom-panel-tab` marker — the Pattern inspector sets it
   *  (`"mixer"`), the drawer leaves it off so it doesn't pollute the console
   *  tab's scoping (P-MIX-7: one body marker per tab). */
  dataTab?: string
}

export function MixerBody({
  chunk,
  applyEdit,
  beginGesture,
  endGesture,
  division,
  onDivisionChange,
  dataTab,
}: MixerBodyProps): React.ReactElement {
  // Live instrument registry (#514 / PV141 #6) — prefer the engine's real
  // soundMap (synths/soundfonts/samples) over the curated shortlist; fall back
  // to INSTRUMENTS until the live list is available.
  const liveInstruments = useSoundCatalog()
  // Live drum-kit registry (#515 / PV141 #6) — bank names from the
  // tidal-drum-machines manifest; fall back to curated DRUM_KITS until ready.
  const liveKits = useDrumKitCatalog()

  const knobs = knobsFromChunk(chunk)

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

  // Quick transforms toggle off (#390): clicking an already-present effect
  // deletes its `.method(…)` call (and its knob with it). A member call's
  // `range` is [dot, callEnd] (chunkDetect), so deleting it drops the whole
  // call cleanly. Guard to members (i > 0) so the head pattern is never deleted.
  const removeTransform = React.useCallback(
    (method: string): void => {
      applyEdit((fresh, wb) => {
        const idx = fresh.chain.findIndex((c, i) => i > 0 && c.name === method)
        if (idx === -1) return
        wb.deleteRange(fresh.chain[idx].range, 'knob')
      })
    },
    [applyEdit],
  )

  // Sound assignment (#514 instrument / #515 kit): write a string-valued chain
  // method. Replace an existing `.sound`/`.s`/`.bank` arg in place, else append
  // `.canonical('value')`. Single-quoted literal (PV44 — double quotes reify to
  // mini). Reuses the `'knob'` write source, like `addTransform`.
  const writeChainMethod = React.useCallback(
    (names: string[], canonical: string, value: string): void => {
      if (value === '') return
      applyEdit((fresh, wb) => {
        const cur = readChainMethod(fresh, names)
        if (cur) wb.replaceRange(cur.range, `'${value}'`, 'knob')
        else wb.insertAt(fresh.exprRange[1], `.${canonical}('${value}')`, 'knob')
      })
    },
    [applyEdit],
  )

  const present = new Set(chunk.chain.map((c) => c.name))
  const kind = patternKind(chunk)
  const rollSpb = kind === 'roll' ? rollStepsPerBar(chunk) : null

  return (
    <div
      data-bottom-panel-tab={dataTab}
      data-mixer-body
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
      {kind === 'roll' && (
        <SoundSelect
          label="Instrument"
          groups={liveInstruments ?? INSTRUMENTS}
          value={readChainMethod(chunk, ['sound', 's'])?.value ?? ''}
          placeholder="Default synth"
          onChange={(v) => writeChainMethod(['sound', 's'], 'sound', v)}
        />
      )}
      {kind === 'roll' && division !== undefined && onDivisionChange && (
        <DivisionSelect division={division} spb={rollSpb} onChange={onDivisionChange} />
      )}
      {kind === 'step' && (
        <SoundSelect
          label="Kit"
          groups={liveKits ?? DRUM_KITS}
          value={readChainMethod(chunk, ['bank'])?.value ?? ''}
          placeholder="Default kit"
          onChange={(v) => writeChainMethod(['bank'], 'bank', v)}
        />
      )}
      <div data-mixer-transforms style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {QUICK_TRANSFORMS.map((t) => {
          // A present effect is an ON toggle: clicking it again removes the call
          // (#390 toggle). Filled = on; the leading glyph flips +/✓ to telegraph
          // that a second click takes it off.
          const active = present.has(t.method)
          return (
            <button
              key={t.method}
              type="button"
              data-mixer-transform={t.method}
              data-mixer-transform-active={active ? 'true' : undefined}
              aria-pressed={active}
              title={active ? `Remove ${t.label}` : `Add ${t.label}`}
              onClick={() => (active ? removeTransform(t.method) : addTransform(t.method, t.value))}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                borderRadius: 4,
                cursor: 'pointer',
                border: active
                  ? '1px solid var(--accent, #6ea8fe)'
                  : '1px solid var(--border, #3a3a42)',
                background: active ? 'var(--accent, #6ea8fe)' : 'var(--background-elevated, #26262c)',
                color: active ? '#0b0b0e' : 'var(--foreground, #e6e6ea)',
              }}
            >
              {active ? '✓' : '+'} {t.label}
            </button>
          )
        })}
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
