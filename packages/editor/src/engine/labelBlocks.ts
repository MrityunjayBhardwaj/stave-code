/**
 * Shared label-block scanning for inline-viz placement.
 *
 * Strudel's transpiler turns any JS label statement `x: y` into `y.p('x')`
 * (`@strudel/transpiler` transpiler.mjs:468). So every top-level "track" in a
 * patch is a label statement: `$:` (anonymous), `foo:` (named), `$foo:`.
 *
 * Inline `.viz()` placement has to map each captured viz request back to the
 * source block that owns it. That mapping logic used to be duplicated across
 * `StrudelEngine.buildVizRequestsWithLines` and `viewZones.reAnchorZones`,
 * each hard-coding `startsWith('$:')` — which is why only anonymous `$:`
 * blocks ever got a zone (#418). This module is the single owner of "what is
 * a block opener" and "how is its track keyed", so both sites stay in lockstep.
 */

// A JS label statement at the START of a line: an identifier (which may begin
// with `$`) immediately followed by `:`. Anchored to the line start.
const LABEL_RE = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*:/

/**
 * The track label opened by `line`, or null if `line` is not a block opener.
 *
 * Column-0 requirement: a real block opener (`$:`, `foo:`) sits at column 0,
 * whereas continuation lines and object-literal keys (`  gain: 0.5,`) are
 * indented. Requiring no leading whitespace is what keeps `gain:`-style keys
 * inside a multi-line argument from being mistaken for a new block (#418).
 */
export function blockLabelAt(line: string): string | null {
  if (line.length === 0 || /^\s/.test(line)) return null
  const m = LABEL_RE.exec(line)
  return m ? m[1] : null
}

export interface PlacedViz {
  vizId: string
  afterLine: number
  contentHash: string
  options?: Record<string, unknown>
}

/**
 * Map each captured viz request to the line after its source block's last
 * line. Mirrors `StrudelEngine`'s `.p()` capture keying EXACTLY so the keys
 * line up:
 *   - `$`-containing labels (`$:`, `$foo:`) → positional `$0/$1/…` in source
 *     order (the engine can't distinguish multiple anonymous `$:` any other
 *     way, since they all transpile to `.p('$')`).
 *   - named labels (`foo:`, `d1:`) → their literal label.
 * The positional counter advances for EVERY `$`-label line (viz or not), same
 * as the capture side, so indices never drift between the two scanners.
 */
export function buildLabelBlockRequests(
  code: string,
  requests: Map<string, string>,
  vizOptions?: Map<string, Record<string, unknown>>,
): Map<string, PlacedViz> {
  const result = new Map<string, PlacedViz>()
  const lines = code.split('\n')
  let anonIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const label = blockLabelAt(lines[i])
    if (label == null) continue

    const key = label.includes('$') ? `$${anonIndex++}` : label
    const vizId = requests.get(key)
    if (!vizId) continue

    // Last content line of this block: stop at the next block opener or a
    // `setcps(...)` statement, skip blanks/comments.
    let lastLineIdx = i
    for (let j = i + 1; j < lines.length; j++) {
      if (blockLabelAt(lines[j]) != null || lines[j].trim().startsWith('setcps')) break
      const next = lines[j].trim()
      if (next !== '' && !next.startsWith('//')) lastLineIdx = j
    }

    // Content hash — first 120 chars of the block, whitespace-normalized.
    // Used by pruneZoneOverrides to detect block reordering.
    const blockLines = lines.slice(i, lastLineIdx + 1).join(' ').replace(/\s+/g, ' ').trim()
    const contentHash = blockLines.slice(0, 120)

    const options = vizOptions?.get(key)
    result.set(key, { vizId, afterLine: lastLineIdx + 1, contentHash, ...(options ? { options } : {}) })
  }

  return result
}
