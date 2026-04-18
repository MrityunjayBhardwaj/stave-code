/**
 * Shared shape for every runtime's hover/completion documentation index.
 *
 * The goal is one schema across Strudel, Sonic Pi, p5.js, Hydra, and any
 * future runtime, so hover + completion providers are factory-built from
 * the same index — not hand-rolled per runtime.
 */

export type DocKind =
  | 'function'
  | 'method'
  | 'variable'
  | 'constant'
  | 'keyword'
  | 'synth'
  | 'sample'
  | 'fx'

export interface RuntimeDoc {
  /** Callable form, e.g. `note(pattern: string)` or `.fast(n)` */
  signature: string
  /** Prose description (Markdown allowed). */
  description: string
  /** Short inline example, shown verbatim. */
  example?: string
  /** Classification — drives the Monaco completion icon. */
  kind?: DocKind
  /** Return description, e.g. `Pattern` or `void`. */
  returns?: string
  /** Topic / category for filtering (e.g. `transform`, `shape`). */
  category?: string
  /** Permalink into the upstream reference. */
  sourceUrl?: string
}

export interface DocsIndex {
  /** Monaco language id. */
  runtime: string
  /** Identifier → doc entry. Identifier is the bare name, no `.` prefix. */
  docs: Record<string, RuntimeDoc>
  /** Optional alias → canonical name map (e.g. `bg` → `background`). */
  aliases?: Record<string, string>
  /** Provenance for sync scripts and staleness checks. */
  meta?: {
    version?: string
    fetchedAt?: string
    source?: string
  }
}

/**
 * Look up a doc by word, honouring aliases. Returns `null` if unknown.
 */
export function resolveDoc(
  index: DocsIndex,
  word: string,
): { name: string; doc: RuntimeDoc } | null {
  const direct = index.docs[word]
  if (direct) return { name: word, doc: direct }
  const aliasTarget = index.aliases?.[word]
  if (aliasTarget && index.docs[aliasTarget]) {
    return { name: aliasTarget, doc: index.docs[aliasTarget] }
  }
  return null
}
