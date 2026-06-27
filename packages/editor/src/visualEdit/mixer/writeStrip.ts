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

/** A JS reserved word can't be a LabeledStatement label (`return: …` is a syntax
 *  error), so a rename to one is rejected. Config heads (`setcps`, `hush`, …) are
 *  NOT here — they're plain identifiers and rename them as a LABEL is valid
 *  (`setcps: s("bd")` parses; the label never invokes the function). */
const RESERVED_LABELS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while',
  'with', 'yield', 'await', 'let',
  // strict-mode reserved — Strudel transpiles as a module, so these are syntax
  // errors AS labels too; reject them rather than write a name that breaks eval.
  'implements', 'interface', 'package', 'private', 'protected', 'public', 'static',
])

/** A valid track label: a JS identifier (incl. `$`/`_`) that is not a reserved
 *  word. Mirrors what a `name:` LabeledStatement accepts. Exported so the rename
 *  UIs can gate/validate keystrokes without re-deriving the rule. */
export function isValidTrackLabel(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name) && !RESERVED_LABELS.has(name)
}

/**
 * The edit an inline rename makes — write the user's chosen `name:` label into
 * the code (#580, Phase C). Renaming is the ONLY way a descriptive name reaches
 * the file: the display never auto-names (the `d{N}` friction prompts THIS edit).
 *
 *  - named   (`bass:`)  → replace the label with `newLabel` (`lead: …`);
 *  - anon    (`$:`, label `'$'`) → replace the `$` → INSERT a name (`drums: …`);
 *  - the `_` mute marker is PRESERVED (only the bare label is rewritten), so a
 *    muted track stays muted across a rename and the edit round-trips cleanly.
 *
 * Returns null when the statement is unlabelled (a bare expression has no label
 * slot), when `newLabel` is not a valid track label (invalid → no write, the UI
 * reverts), or when it equals the current bare label (no-op). Surgical: only the
 * label characters change; the pattern expression is byte-identical.
 */
export function renameEdit(fresh: ChunkInfo, newLabel: string): StripEdit | null {
  if (fresh.label === null) return null // a bare expression has no label slot
  if (!isValidTrackLabel(newLabel)) return null // invalid → caller reverts
  const muted = fresh.label.startsWith('_')
  const bareLabel = muted ? fresh.label.slice(1) : fresh.label
  if (newLabel === bareLabel) return null // no-op
  const start = fresh.statementRange[0] + (muted ? 1 : 0) // keep the `_` marker
  const end = fresh.statementRange[0] + fresh.label.length
  return { range: [start, end], text: newLabel }
}
