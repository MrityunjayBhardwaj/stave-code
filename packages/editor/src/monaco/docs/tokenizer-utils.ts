/**
 * Helpers for deriving Monaco/Monarch tokenizer regex alternations from a
 * `DocsIndex`. Keeping the keyword set in lockstep with the docs index —
 * rather than maintaining a parallel hand-edited list in the tokenizer —
 * means every newly-documented symbol automatically becomes syntax-coloured.
 */

import type { DocKind, DocsIndex } from './types'

export interface AlternationOpts {
  /** If set, only keys whose kind is in this list are included. */
  includeKinds?: DocKind[]
  /** If set, keys whose kind is in this list are excluded. */
  excludeKinds?: DocKind[]
  /** Additional identifiers to merge in (e.g. hand-curated synonyms). */
  extra?: string[]
}

/**
 * Produce a regex-alternation body (no anchors, no word-boundary) suitable
 * for embedding in a Monaco Monarch pattern, e.g.:
 *   `/\b(${alt})\b/`.
 *
 * Identifiers are sorted by descending length so that longer names match
 * before any name that happens to be their prefix (e.g. `background`
 * before `back`).
 */
export function buildIdentifierAlternation(
  index: DocsIndex,
  opts: AlternationOpts = {},
): string {
  const { includeKinds, excludeKinds, extra = [] } = opts
  const names = new Set<string>()

  for (const [name, doc] of Object.entries(index.docs)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue
    if (includeKinds && (!doc.kind || !includeKinds.includes(doc.kind))) continue
    if (excludeKinds && doc.kind && excludeKinds.includes(doc.kind)) continue
    names.add(name)
  }
  for (const n of extra) if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)) names.add(n)

  return [...names]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map(escapeForRegex)
    .join('|')
}

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
