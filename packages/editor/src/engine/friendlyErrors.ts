/**
 * Turns a raw runtime error into a user-friendly `LogEntry` body.
 *
 * Inspired by p5.js's Friendly Error System (FES). We have a structural
 * advantage — every runtime ships its `DocsIndex` (the same one hover /
 * completion consume), so fuzzy-matching a misspelled identifier back
 * to a real symbol with its docs URL is a lookup, not a hard-coded
 * dictionary.
 *
 * Scope today:
 *   - Extract the offending identifier from a ReferenceError.
 *   - Fuzzy-match it (Levenshtein) against DocsIndex keys.
 *   - Format a friendly message + suggestion record.
 *
 * Not in scope yet:
 *   - Parsing TypeError arg-type mismatches (needs real signature parsing).
 *   - Parsing Sonic Pi's Ruby error format (different error surface).
 *   - Cross-runtime suggestions (*"stack is a Strudel fn; you're in Hydra"*).
 */

import type { CommonMistake, DocsIndex, RuntimeDoc } from '../monaco/docs/types'
import type { LogSuggestion, RuntimeId } from './engineLog'

export interface FriendlyErrorParts {
  /** Short sentence surfacing in toast + console row + Monaco marker. */
  message: string
  /** Populated when we found a confident fuzzy match in DocsIndex. */
  suggestion?: LogSuggestion
  /** Underlying stack, copied through so the Console panel can fold it. */
  stack?: string
  /**
   * 1-based source line parsed from a V8 / Firefox / Safari stack
   * trace when one was present. Feeds the engineLog → Monaco marker
   * bridge — entries without a line get no inline squiggle.
   */
  line?: number
  /** 1-based column, paired with `line`. */
  column?: number
}

/**
 * Parse the first user-code line/column out of an error's stack.
 *
 * We only trust frames that clearly originate from a runtime eval
 * path — `<anonymous>` for `new Function` / direct eval, or an
 * explicit `eval at` chain. Matching any `:LINE:COL` pair we see
 * would false-positive on bundled paths (e.g. a stack containing
 * `.../@stave/editor/dist/index.js:1234:56`) and hand back a line
 * number that has nothing to do with the user's file — the
 * downstream marker then clamps to full-document range and the user
 * sees the whole sketch underlined.
 *
 * Returns `null` when the stack only contains compiled-bundle or
 * framework frames. Caller should treat that as "line unknown" and
 * skip the inline marker rather than painting the whole file.
 */
export function parseStackLocation(
  err: unknown,
): { line: number; column: number } | null {
  const stack =
    typeof err === 'object' && err !== null && 'stack' in err
      ? String((err as { stack: unknown }).stack ?? '')
      : ''
  if (!stack) return null
  // V8: "at eval (<anonymous>:LINE:COL)" — user code in direct eval.
  const v8Eval = stack.match(/at eval[^(]*\(<anonymous>:(\d+):(\d+)\)/)
  if (v8Eval)
    return { line: parseInt(v8Eval[1], 10), column: parseInt(v8Eval[2], 10) }
  // V8: "at <FuncName> (<anonymous>:LINE:COL)" — a named user function
  // (setup / draw / a user helper) declared inside a `new Function`
  // body, throwing mid-execution. The `<anonymous>` token is the safe
  // anchor — it can't appear in a real bundled filename — so we don't
  // need line-start anchoring here.
  const v8Named = stack.match(/at\s+\S+\s+\(<anonymous>:(\d+):(\d+)\)/)
  if (v8Named)
    return { line: parseInt(v8Named[1], 10), column: parseInt(v8Named[2], 10) }
  // V8: bare "at <anonymous>:LINE:COL" frame — typical for code run
  // through `new Function(body)` when the parser points at the body
  // position. Anchored to line start so we don't match the tail of a
  // bundled filename.
  const v8Anon = stack.match(/^\s*at\s+<anonymous>:(\d+):(\d+)/m)
  if (v8Anon)
    return { line: parseInt(v8Anon[1], 10), column: parseInt(v8Anon[2], 10) }
  // Firefox: "name@<anonymous>:LINE:COL" or "@debugger eval:LINE:COL".
  // The alternation right after `@` keeps `@scope/package` npm paths
  // out — `@stave/editor` doesn't match any of the three tokens, so
  // the bundled-path false-positive is structural, not position-based.
  const ff = stack.match(
    /@(?:<anonymous>|debugger eval|eval):(\d+):(\d+)/,
  )
  if (ff) return { line: parseInt(ff[1], 10), column: parseInt(ff[2], 10) }
  return null
}

/**
 * Levenshtein edit distance. Small implementation — fine for runs of up
 * to a few thousand words, which is the order of magnitude of the
 * combined DocsIndex keys (~935).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const la = a.length
  const lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la

  let prev = new Array<number>(lb + 1)
  let curr = new Array<number>(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j

  for (let i = 1; i <= la; i++) {
    curr[0] = i
    const ac = a.charCodeAt(i - 1)
    for (let j = 1; j <= lb; j++) {
      const cost = ac === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1, // insert
        prev[j] + 1, // delete
        prev[j - 1] + cost, // substitute
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[lb]
}

export interface FuzzyMatch {
  name: string
  distance: number
}

/**
 * Return the closest identifiers to `word` from a corpus, sorted by
 * distance. `maxDistance` filters out anything beyond the threshold;
 * defaults to `Math.max(2, ceil(word.length / 3))` — generous for short
 * words, stricter for long ones. `limit` caps the returned list.
 */
export function fuzzyMatch(
  word: string,
  corpus: readonly string[],
  options: { maxDistance?: number; limit?: number } = {},
): FuzzyMatch[] {
  if (!word) return []
  const lower = word.toLowerCase()
  const threshold =
    options.maxDistance ??
    Math.max(2, Math.ceil(word.length / 3))
  const limit = options.limit ?? 5
  const hits: FuzzyMatch[] = []
  for (const candidate of corpus) {
    const d = levenshtein(lower, candidate.toLowerCase())
    if (d <= threshold) hits.push({ name: candidate, distance: d })
  }
  hits.sort(
    (a, b) =>
      a.distance - b.distance ||
      // Prefer case-matching names on ties (e.g. PI over Pi).
      (a.name === word ? -1 : b.name === word ? 1 : 0) ||
      a.name.localeCompare(b.name),
  )
  return hits.slice(0, limit)
}

const REFERENCE_ERROR_PATTERNS = [
  // Chrome / Edge / Node: "foo is not defined"
  /^(\w+) is not defined$/,
  // Firefox: "foo is not defined"
  /^ReferenceError: (\w+) is not defined$/,
  // Safari: "Can't find variable: foo"
  /^Can't find variable: (\w+)$/,
]

/**
 * Extract the undefined identifier from a ReferenceError's message.
 * Returns `null` when the error isn't a reference-miss we recognise.
 */
export function extractReferenceIdentifier(err: unknown): string | null {
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err)
  if (!message) return null
  // Some engines prefix with "Uncaught " — strip for matching.
  const trimmed = message.replace(/^Uncaught\s+/, '').trim()
  for (const re of REFERENCE_ERROR_PATTERNS) {
    const m = re.exec(trimmed)
    if (m && m[1]) return m[1]
  }
  return null
}

export interface FormatOptions {
  /** DocsIndex for the runtime the code was running in. */
  index?: DocsIndex
  /** Override the base URL pattern used for suggestion.docsUrl. */
  docsUrlFor?: (runtime: RuntimeId, name: string) => string
  /**
   * A window of user source code around the throw — typically the line
   * the error happened on plus a couple of neighbours. Used by
   * `CommonMistake` detectors of `kind: 'code'` to recognise wrong-shape
   * idioms (`chord(C)` vs `chord("C")`) without needing a full parse.
   * Caller is free to omit it; `kind: 'code'` detectors simply won't fire.
   */
  codeContext?: string
}

/**
 * Coerce a string|RegExp `match` into a RegExp. Strings ship through
 * JSON-serialised DocsIndexes; we treat them as case-insensitive regex
 * sources so authors can write either `"chord\\(\\s*[A-G][^\"]*\\)"`
 * literally or use a runtime-constructed RegExp.
 */
function asRegExp(match: string | RegExp): RegExp {
  return match instanceof RegExp ? match : new RegExp(match, 'i')
}

interface MistakeHit {
  mistake: CommonMistake
  /** Specificity rank: higher beats lower when weights tie. */
  specificity: 3 | 2 | 1
  /** DocsIndex order — lower index wins on full ties (stable). */
  order: number
  /** Symbol the hint was attached to, if any. Used for the suggestion record. */
  symbol?: { name: string; doc: RuntimeDoc }
}

function evalMistake(
  mistake: CommonMistake,
  ctx: { rawMessage: string; identifier: string | null; codeContext?: string },
): boolean {
  const { detect } = mistake
  if (detect.kind === 'message') {
    return asRegExp(detect.match).test(ctx.rawMessage)
  }
  if (detect.kind === 'code') {
    if (!ctx.codeContext) return false
    return asRegExp(detect.match).test(ctx.codeContext)
  }
  // identifier
  return ctx.identifier !== null && ctx.identifier === detect.alias
}

const SPECIFICITY: Record<CommonMistake['detect']['kind'], 3 | 2 | 1> = {
  message: 3,
  code: 2,
  identifier: 1,
}

function rankHits(hits: MistakeHit[]): MistakeHit | null {
  if (hits.length === 0) return null
  hits.sort((a, b) => {
    const wa = a.mistake.weight ?? 1
    const wb = b.mistake.weight ?? 1
    if (wa !== wb) return wb - wa
    if (a.specificity !== b.specificity) return b.specificity - a.specificity
    return a.order - b.order
  })
  return hits[0]
}

function collectMistakes(
  index: DocsIndex,
  ctx: { rawMessage: string; identifier: string | null; codeContext?: string },
): MistakeHit | null {
  const hits: MistakeHit[] = []
  let order = 0
  // Per-symbol — prefer the symbol the user explicitly named when we
  // have one (right name, wrong shape); otherwise scan all symbols for
  // identifier-aliases and message detectors that key off other clues.
  if (ctx.identifier && index.docs[ctx.identifier]) {
    const doc = index.docs[ctx.identifier]
    for (const m of doc.commonMistakes ?? []) {
      if (evalMistake(m, ctx)) {
        hits.push({
          mistake: m,
          specificity: SPECIFICITY[m.detect.kind],
          order: order++,
          symbol: { name: ctx.identifier, doc },
        })
      }
    }
  }
  for (const [name, doc] of Object.entries(index.docs)) {
    if (name === ctx.identifier) continue // already scanned
    for (const m of doc.commonMistakes ?? []) {
      if (evalMistake(m, ctx)) {
        hits.push({
          mistake: m,
          specificity: SPECIFICITY[m.detect.kind],
          order: order++,
          symbol: { name, doc },
        })
      }
    }
  }
  for (const m of index.globalMistakes ?? []) {
    if (evalMistake(m, ctx)) {
      hits.push({
        mistake: m,
        specificity: SPECIFICITY[m.detect.kind],
        order: order++,
      })
    }
  }
  return rankHits(hits)
}

function defaultDocsUrl(runtime: RuntimeId, name: string): string {
  return `/docs/reference/${runtime}/#${name.toLowerCase()}`
}

/**
 * Build a FriendlyErrorParts from a raw thrown value. When `index` is
 * provided and the error is a ReferenceError, attempts a fuzzy-match
 * against the index and attaches the best suggestion.
 */
export function formatFriendlyError(
  err: unknown,
  runtime: RuntimeId,
  options: FormatOptions = {},
): FriendlyErrorParts {
  const rawMessage =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err)
  const stack =
    typeof err === 'object' &&
    err !== null &&
    'stack' in err &&
    typeof (err as { stack: unknown }).stack === 'string'
      ? ((err as { stack: string }).stack)
      : undefined

  const loc = parseStackLocation(err)
  const identifier = extractReferenceIdentifier(err)

  // 1. Curated hints (commonMistakes + globalMistakes) — fire first.
  //    Higher specificity than algorithmic fuzzy match: when the author
  //    has hand-written the right hint for this case, it beats the
  //    Levenshtein neighbour every time.
  if (options.index) {
    const hit = collectMistakes(options.index, {
      rawMessage,
      identifier,
      codeContext: options.codeContext,
    })
    if (hit) {
      const suggestion: LogSuggestion | undefined = hit.symbol
        ? {
            name: hit.symbol.name,
            docsUrl: (options.docsUrlFor ?? defaultDocsUrl)(
              runtime,
              hit.symbol.name,
            ),
            example: hit.mistake.example ?? hit.symbol.doc.example,
            description: hit.symbol.doc.description,
          }
        : hit.mistake.example
        ? {
            // Global mistake without a symbol — synthesise a minimal
            // suggestion so downstream UI still surfaces the example.
            name: '',
            docsUrl: '',
            example: hit.mistake.example,
          }
        : undefined
      return {
        message: hit.mistake.hint,
        suggestion,
        stack,
        line: loc?.line,
        column: loc?.column,
      }
    }
  }

  // 2. ReferenceError fuzzy fallback (today's behaviour).
  if (identifier && options.index) {
    const matches = fuzzyMatch(
      identifier,
      Object.keys(options.index.docs),
    )
    if (matches.length > 0) {
      const hit = options.index.docs[matches[0].name]
      const docsUrl = (options.docsUrlFor ?? defaultDocsUrl)(
        runtime,
        matches[0].name,
      )
      const suggestion: LogSuggestion = {
        name: matches[0].name,
        docsUrl,
        example: hit?.example,
        description: hit?.description,
      }
      return {
        message: `\`${identifier}\` is not defined. Did you mean \`${matches[0].name}\`?`,
        suggestion,
        stack,
        line: loc?.line,
        column: loc?.column,
      }
    }
    return {
      message: `\`${identifier}\` is not defined.`,
      stack,
      line: loc?.line,
      column: loc?.column,
    }
  }

  // 3. Non-reference, no curated hint — raw message.
  return {
    message: rawMessage || 'Unknown error',
    stack,
    line: loc?.line,
    column: loc?.column,
  }
}
