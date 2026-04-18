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
    /**
     * Fallback URL for the hover "Reference →" link when an entry has no
     * `sourceUrl` of its own. Useful for runtimes whose docs don't carry
     * stable per-function permalinks (e.g. Strudel).
     */
    docsBaseUrl?: string
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

/**
 * Assert that a vendored JSON blob conforms to `DocsIndex`. Runs at
 * module-load when each runtime's index is imported, so a malformed
 * `data/*.json` file from an upstream-regenerate surfaces as a loud
 * startup error rather than a silent hover/completion gap.
 *
 * Throws if `runtime` isn't a non-empty string, if `docs` isn't a
 * plain object, or if any entry is missing the required `signature` +
 * `description` fields. Unknown fields are permitted (forward-compat).
 */
export function validateDocsIndex(
  label: string,
  raw: unknown,
): asserts raw is DocsIndex {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${label}: docs index must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.runtime !== 'string' || r.runtime.length === 0) {
    throw new Error(`${label}: runtime must be a non-empty string`)
  }
  if (!r.docs || typeof r.docs !== 'object') {
    throw new Error(`${label}: docs must be an object`)
  }
  for (const [name, entry] of Object.entries(r.docs)) {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${label}: entry "${name}" is not an object`)
    }
    const e = entry as Record<string, unknown>
    if (typeof e.signature !== 'string') {
      throw new Error(
        `${label}: entry "${name}" is missing string "signature"`,
      )
    }
    if (typeof e.description !== 'string') {
      throw new Error(
        `${label}: entry "${name}" is missing string "description"`,
      )
    }
  }
}
