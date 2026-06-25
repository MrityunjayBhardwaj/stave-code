/**
 * writeStrip.ts — the strip controls' write decisions, as PURE functions.
 *
 * Each takes a freshly-detected chunk and a target value and returns the single
 * surgical text edit to make (a replace range + text), or null when the control
 * must hand off (a foreign/patterned value it can't safely rewrite). Keeping the
 * decision pure — `ChunkInfo` + value → `StripEdit` — means the fader/pan
 * write-back is unit-testable without Monaco; the caller just applies the edit
 * through the tagged `Writeback` inside `applyToStrip` (one undo step).
 *
 * Surgical & conservative (V-mixer-1, P194): only the targeted literal changes;
 * a signal/expression value disables the control rather than corrupting it.
 */
import type { ChunkInfo } from '../chunkDetect'
import { formatNumber } from '../writeback'
import { readGainState, scaleManagedGain } from './gain'

/** a single surgical edit: replace `range` with `text` (insert = zero-width range). */
export interface StripEdit {
  range: [number, number]
  text: string
}

/**
 * The edit a fader drag makes for `value` (a linear gain):
 *  - scalar  → replace the literal;
 *  - managed → rescale every velocity column to the new ceiling (shape kept);
 *  - absent  → append `.gain(value)` at the end of the expression;
 *  - foreign → null (a signal gain — the fader is disabled).
 */
export function gainEdit(fresh: ChunkInfo, value: number): StripEdit | null {
  const g = readGainState(fresh)
  switch (g.kind) {
    case 'scalar':
      return { range: g.range, text: formatNumber(value) }
    case 'managed':
      return { range: g.range, text: scaleManagedGain(g.mg, value) }
    case 'absent':
      return { range: [fresh.exprRange[1], fresh.exprRange[1]], text: `.gain(${formatNumber(value)})` }
    case 'foreign':
      return null
  }
}

/**
 * The edit a pan drag makes for `value` (0..1, 0.5 = centre — grounded GR2):
 *  - scalar  → replace the literal;
 *  - absent  → append `.pan(value)`;
 *  - patterned/signal → null (hands off).
 */
export function panEdit(fresh: ChunkInfo, value: number): StripEdit | null {
  const call = fresh.chain.find((c) => c.name === 'pan' && c.args.length >= 1)
  if (!call) {
    return { range: [fresh.exprRange[1], fresh.exprRange[1]], text: `.pan(${formatNumber(value)})` }
  }
  const arg = call.args[0]
  if (arg.numeric === null) return null // a signal/patterned pan — disabled
  return { range: arg.range, text: formatNumber(value) }
}

/**
 * The edit a mute toggle makes — flip the `_`-prefix marker on the statement's
 * label (design §6.4, D2). Mute is ORTHOGONAL to gain: it never touches `.gain`
 * (the P194 dual-representation trap, V-mixer-2), only the one-character marker
 * at `statementRange[0]` (the label's first char):
 *  - mute   → insert `_` before the label (`$: …`→`_$: …`, `d1: …`→`_d1: …`);
 *  - unmute → delete that leading `_`.
 * Returns null when already in the requested state, or for an unlabelled
 * statement (a bare expression — `_s(...)` would be a different identifier, so
 * the marker doesn't apply). Surgical: only the marker changes, so unmute is the
 * exact inverse of mute and round-trips byte-for-byte.
 */
export function muteEdit(fresh: ChunkInfo, muted: boolean): StripEdit | null {
  if (fresh.label === null) return null // unlabelled — can't carry the marker
  const isMuted = fresh.label.startsWith('_')
  if (muted === isMuted) return null // already in the requested state
  const pos = fresh.statementRange[0]
  return muted
    ? { range: [pos, pos], text: '_' } // insert the marker
    : { range: [pos, pos + 1], text: '' } // delete the leading `_`
}
