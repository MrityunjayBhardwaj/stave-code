// Pure planner for "assign a sound to the cursor" (#830).
//
// `assignSoundToCursor` (WorkspaceShell) is a React closure that reaches Monaco
// imperatively, so its decision can't be unit-tested as written. This module
// extracts the whole decision into a pure function over `(doc, offset, sound)`
// — mirroring the `detectChunk(doc, offset)` idiom — so the line-aware source
// insert can be pinned by fast unit tests. WorkspaceShell computes the plan
// here and applies it via `Writeback`; the tested code is the shipped code.

import { detectChunk } from './chunkDetect'
import { readChainMethod } from './panels/chainMethod'
import { patternKind } from './panels/patternKind'

/**
 * An offset-space edit describing how to write a sound name at the cursor.
 * `replace` swaps an existing range (an existing `.sound()` argument);
 * `insert` drops text at a single offset (a zero-width edit).
 */
export type SoundAssignPlan =
  | { kind: 'replace'; range: [number, number]; text: string }
  | { kind: 'insert'; offset: number; text: string }

/**
 * Decide how to write `sound` at `offset` in `doc`, or return `null` when
 * there is nothing to do (empty sound name).
 *
 * Two cases, matching the picker's behavior:
 *  - A note/roll chunk under the cursor → set/replace its `.sound()`. The name
 *    is single-quoted so it stays a string literal, not a reified mini-pattern.
 *  - No note chunk under the cursor → drop a fresh `s("…")` source pattern on
 *    its OWN line. Inserting at the raw offset lands mid-token or inside a
 *    comment (observed: `// scratch` → `// scratchs("…")`), so the insert goes
 *    at the END of the cursor's line, prefixed with a newline only when that
 *    line already has content. Double-quoted: a standalone `s("…")` is
 *    idiomatic mini-notation.
 */
export function planSoundAssignment(
  doc: string,
  offset: number,
  sound: string,
): SoundAssignPlan | null {
  if (!sound) return null

  const chunk = detectChunk(doc, offset)
  if (chunk && patternKind(chunk) === 'roll') {
    const cur = readChainMethod(chunk, ['sound', 's'])
    if (cur) return { kind: 'replace', range: cur.range, text: `'${sound}'` }
    return { kind: 'insert', offset: chunk.exprRange[1], text: `.sound('${sound}')` }
  }

  // Line-aware source insert. Compute the cursor's line span in pure string
  // space: `lineStart` is just past the previous newline (or 0), `lineEnd` is
  // the next newline (or end of doc) — the position Monaco's `getLineMaxColumn`
  // resolves to. Insert before that newline so the pattern owns its line.
  const lineStart = doc.lastIndexOf('\n', offset - 1) + 1
  const nextNewline = doc.indexOf('\n', offset)
  const lineEnd = nextNewline === -1 ? doc.length : nextNewline
  const hasContent = doc.slice(lineStart, lineEnd).trim().length > 0
  return {
    kind: 'insert',
    offset: lineEnd,
    text: `${hasContent ? '\n' : ''}s("${sound}")`,
  }
}
