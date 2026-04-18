/**
 * Helpers for deriving Monaco/Monarch tokenizer regex alternations from a
 * `DocsIndex`. Keeping the keyword set in lockstep with the docs index —
 * rather than maintaining a parallel hand-edited list in the tokenizer —
 * means every newly-documented symbol automatically becomes syntax-coloured.
 */

import type { DocKind, DocsIndex, RuntimeDoc } from './types'

export interface AlternationOpts {
  /** If set, only keys whose kind is in this list are included. */
  includeKinds?: DocKind[]
  /** If set, keys whose kind is in this list are excluded. */
  excludeKinds?: DocKind[]
  /** Arbitrary filter applied after kind-based filtering. */
  filter?: (name: string, doc: RuntimeDoc) => boolean
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
  const { includeKinds, excludeKinds, filter, extra = [] } = opts
  const names = new Set<string>()

  for (const [name, doc] of Object.entries(index.docs)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue
    if (includeKinds && (!doc.kind || !includeKinds.includes(doc.kind))) continue
    if (excludeKinds && doc.kind && excludeKinds.includes(doc.kind)) continue
    if (filter && !filter(name, doc)) continue
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

/**
 * Build a Monaco Monarch rule that matches a word-boundary-wrapped
 * alternation and emits `token`. Returns an empty array when the
 * alternation is empty — an empty capture group (`\b()\b`) matches the
 * empty string at every position and crashes the tokenizer with
 * "no progress in tokenizer in rule".
 */
export function keywordRule(
  alternation: string,
  token: string,
): Array<[RegExp, string]> {
  if (!alternation) return []
  return [[new RegExp(`\\b(${alternation})\\b`), token]]
}

/**
 * Same guard as `keywordRule` but for method-chain syntax — matches
 * `.name\b` so chained Hydra/p5 calls tokenize as methods.
 */
export function methodRule(
  alternation: string,
  token: string,
): Array<[RegExp, string]> {
  if (!alternation) return []
  return [[new RegExp(`\\.(${alternation})\\b`), token]]
}
