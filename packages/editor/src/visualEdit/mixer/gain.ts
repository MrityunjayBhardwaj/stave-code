/**
 * gain.ts — the single source for reading and rescaling a chunk's `.gain`.
 *
 * Two representations share one home so the param panel (the master-gain knob,
 * #478) and the channel-strip fader (`StripModel`, the Mixer milestone) can't
 * drift on what a `.gain` value means (PV129 — one gain path):
 *
 *  - a SCALAR `.gain(0.85)` — a single level, the common case;
 *  - a MANAGED per-column velocity string `.gain("0.5 1 0.8")` the grid authored,
 *    where the fader is a master over the columns (drag rescales them all,
 *    shape kept, anchored at the loudest — the ceiling).
 *
 * Anything else (`.gain(sine)`, a single-token broadcast, a token shape we
 * didn't author) is FOREIGN — every gain affordance hands off and shows the
 * value read-only rather than corrupting an expression it doesn't understand.
 */
import type { ChunkInfo } from '../chunkDetect'
import { formatNumber } from '../writeback'

/**
 * A per-column `.gain("…")` velocity string the grid authored — flat numeric
 * tokens (with optional `~` rests and `@n` holds). Dragging a fader over it
 * rescales every column proportionally (a master fader over the per-step
 * velocities) instead of leaving the chunk with no gain control.
 */
export interface ManagedGain {
  tokens: string[]
  /** loudest column (the fader's value); rests/`~` excluded */
  ceiling: number
  /** the original quote character, preserved on write-back */
  quote: string
}

const GAIN_TOKEN = /^(\d+(?:\.\d+)?)(@\d+)?$/

/**
 * Read a `.gain` arg's raw text as a managed per-column velocity string, or
 * null when it isn't one we authored (a scalar, a single-token broadcast, a
 * signal/identifier, or a token shape we don't manage → hands off).
 */
export function parseManagedGain(raw: string): ManagedGain | null {
  const quote = raw[0] === '"' || raw[0] === "'" || raw[0] === '`' ? raw[0] : ''
  if (!quote || raw[raw.length - 1] !== quote) return null
  const tokens = raw
    .slice(1, -1)
    .trim()
    .split(/\s+/)
    .filter((t) => t !== '')
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

/** Rescale every column so the loudest hits the new value (shape kept). */
export function scaleManagedGain(mg: ManagedGain, value: number): string {
  const factor = mg.ceiling > 0 ? value / mg.ceiling : null
  const out = mg.tokens.map((t) => {
    if (t === '~') return '~'
    const m = GAIN_TOKEN.exec(t) as RegExpExecArray
    const nv = factor === null ? value : parseFloat(m[1]) * factor
    return formatNumber(Math.max(0, nv)) + (m[2] ?? '')
  })
  return mg.quote + out.join(' ') + mg.quote
}

/**
 * How a strip's fader reads (and, later, writes) a chunk's gain.
 *  - `scalar`   — a plain `.gain(n)`; the fader sits at `value`.
 *  - `managed`  — a `.gain("…")` velocity string; the fader sits at `ceiling`
 *                 and a drag rescales all columns (`scaleManagedGain`).
 *  - `foreign`  — a `.gain(sine)` / token shape we don't author; fader disabled.
 *  - `absent`   — no `.gain`; fader at unity, the first drag inserts one (S1).
 */
export type GainState =
  | { kind: 'scalar'; value: number; range: [number, number] }
  | { kind: 'managed'; ceiling: number; mg: ManagedGain; range: [number, number] }
  | { kind: 'foreign' }
  | { kind: 'absent' }

/**
 * Classify a chunk's `.gain` into a `GainState` — the read half of the strip
 * fader. Pure: a `ChunkInfo` in, a tagged union out, no React, no audio.
 */
export function readGainState(chunk: ChunkInfo): GainState {
  const call = chunk.chain.find((c) => c.name === 'gain' && c.args.length >= 1)
  const arg = call?.args[0]
  if (!call || !arg) return { kind: 'absent' }
  if (arg.numeric !== null) return { kind: 'scalar', value: arg.numeric, range: arg.range }
  const mg = parseManagedGain(arg.raw)
  if (mg) return { kind: 'managed', ceiling: mg.ceiling, mg, range: arg.range }
  return { kind: 'foreign' }
}
