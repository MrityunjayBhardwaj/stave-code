/**
 * parseStrudel — Strudel code string → PatternIR.
 *
 * Structural pattern matcher (not a full JS parser).
 * Handles the most common Strudel patterns by regex extraction.
 *
 * Strategy:
 * 1. Split code by $: lines → extract track blocks
 * 2. For each track: identify root function (note/s/stack)
 * 3. Parse mini-notation string argument
 * 4. Walk the method chain (.fast/.slow/.every/etc.)
 * 5. Combine tracks into Stack
 *
 * Unsupported fragments fall back to Code nodes (never throws).
 */

import { IR, type PatternIR } from './PatternIR'
import type { SourceLocation } from './IREvent'
import { parseMini } from './parseMini'

/**
 * Build the optional `meta` payload for a non-Play smart constructor or
 * literal-construction site (19-05 / #74).
 *
 * - `method` is the user-typed method name (exact token, D-08 — e.g.
 *   `'degradeBy'` ≠ `'degrade'`, `'jux'` ≠ `'layer'`). Sites that pass
 *   the live `method` variable from `applyMethod` automatically satisfy
 *   D-08; desugar / root sites that hard-code a method string must match
 *   the user's vocabulary.
 * - `callSiteRange` is the absolute source range of the method-call
 *   substring (e.g., `.fast(2)`'s start..end in the user's full code).
 *
 * Returns the shape every smart constructor / literal-construction site
 * accepts. Loc is single-element here — multi-element only arises in
 * mini-notation `!N` repetition (not implemented today). RESEARCH §10 #12
 * for the load-bearing arithmetic gotcha (consumed = remaining - rest).
 */
export function tagMeta(
  method: string,
  callSiteRange: [number, number],
): { loc: SourceLocation[]; userMethod: string } {
  const [start, end] = callSiteRange
  return {
    loc: [{ start, end }],
    userMethod: method,
  }
}

/**
 * Phase 20-04 (PV37 / PK13 step 2 / D-01..D-03).
 *
 * Wrap a receiver pattern as an opaque Code-with-via node carrying the
 * full source range of the .method(args) call site. Used by:
 *   - applyMethod's default arm (any unrecognised method — DV-06)
 *   - typed arms' parse-failure branches (D-03 — e.g. .fast("<2 3>"))
 *
 * The wrapper preserves the typed source for round-trip (toStrudel re-emits
 * via.method/args verbatim per D-02) AND for collect (walks via.inner;
 * threads loc per D-01 via withWrapperLoc, which lands in 20-03).
 *
 * `args` MUST be passed RAW (untrimmed) — D-02 byte-fidelity contract.
 * `code: ''` is unused on the wrapper path (`toStrudel` branches on `via`).
 *
 * Known v1 limitation (Trap 5): argless unrecognised methods round-trip
 * with empty parens — `note("c").nudge` becomes `note("c").nudge()`.
 * Documented in PR description; fixtures avoid argless probes.
 *
 * @param inner Receiver IR (required — D-01 walks it).
 * @param method Raw method name as the user typed it.
 * @param args Raw arg string between parens (whitespace preserved).
 * @param callSiteRange Absolute source range of the entire .method(args) substring.
 */
function wrapAsOpaque(
  inner: PatternIR,
  method: string,
  args: string,
  callSiteRange: [number, number],
): PatternIR {
  return {
    tag: 'Code',
    code: '',                                // unused on wrapper path; toStrudel branches on via
    lang: 'strudel',
    loc: [{ start: callSiteRange[0], end: callSiteRange[1] }],
    via: { method, args, callSiteRange, inner },
  }
}

/** Test-only re-export of the module-private wrapAsOpaque helper. Mirrors
 *  the `__resetParseTransformDebug` convention below; not part of the
 *  public API. Consumed by PatternIR.test.ts wave-α probes. */
export const __test_wrapAsOpaque = wrapAsOpaque

/**
 * Phase 20-14 parser-gap fix — strip a "prelude" from non-`$:` Strudel
 * programs so the musical expression that follows parses to a structured
 * IR instead of the Code() fallback.
 *
 * A prelude is the sequence of leading lines that are either:
 *   - blank
 *   - a `// …` line comment (whole-line; inline `// …` after expression
 *     code is untouched)
 *   - a TOP-LEVEL call to a recognised boot-side-effect function:
 *     `samples(…)`, `useRNG(…)`, `setcps(…)`, `setVoicingRange(…)`,
 *     `initAudio(…)`, `aliasBank(…)`, and the tempo-setter family
 *     `setcpm(…)` / `setCpm(…)` / `setCps(…)` (#135 / 20-15 G2). The call
 *     may span multiple lines
 *     (multi-line `samples({ … })` is the common case); we track paren /
 *     brace / bracket depth across newlines and consume the whole call
 *     as one unit. The call ends at the line whose end-of-line depth is
 *     zero AND whose final non-whitespace char is `)` (allowing a
 *     trailing `;` per `bassFuge.strudel`).
 *
 * Returns the substring from the first non-prelude line plus the absolute
 * char offset where that substring starts in the ORIGINAL `code`. Callers
 * thread `offset` into `parseExpression` so every `loc.start` derived from
 * the parser is still a valid index into the user-typed source.
 *
 * Forms NOT skipped (fall through to existing Code() fallback at the
 * call site, same shape as today):
 *   - `let` / `const` / `var` bindings
 *   - `await` / arbitrary statements
 *   - any function we haven't enumerated here
 * If a corpus tune surfaces another prelude form, add it to the regex
 * below — explicit list is intentional, not an open-ended skip.
 */
export function stripParserPrelude(code: string): { body: string; offset: number } {
  // Top-level boot-side-effect calls we recognise. Exact tokens — D-08
  // (no aliasing). Anchored to the start of the trimmed line.
  //
  // SETTER FAMILY PROVENANCE (#135 / 20-15 G2) — HAND-MAINTAINED LIST.
  // Upstream source audited: `packages/core/repl.mjs` (uzu/strudel) at
  // pinned Codeberg SHA f73b395648645aabe699f91ba0989f35a6fd8a3c
  // (the same SHA pinned in
  // packages/app/tests/parity-corpus/CORPUS-SOURCE.md).
  //   - repl.mjs:284-287  `setCps  = (cps) => { scheduler.setCps(unpure(cps)); return silence }`
  //   - repl.mjs:301-303  `setCpm  = (cpm) => { scheduler.setCps(unpure(cpm)/60); return silence }`
  //   - repl.mjs:393-400  `evalScope({ ... setCps, setcps: setCps, setCpm, setcpm: setCpm })`
  // i.e. the top-level tempo-setter family is exactly
  // {setcps, setCps, setcpm, setCpm} — all pure no-return side effects
  // (they mutate the scheduler tempo and return `silence`, which the user
  // discards at statement level — identical class to the already-present
  // `setcps`). Tokens ADDED by 20-15 G2 beyond the existing `setcps`:
  // `setcpm`, `setCpm`, `setCps`. No other `set*` in core's evalScope
  // (all/each/hush/cpm) is a top-level pure setter — `cpm` is a chain
  // method (`register('cpm',…)`), `all`/`each` take pattern transforms,
  // `hush` is a silence control — NONE are prelude boot calls.
  //
  // There is NO programmatic cross-ref: the upstream setter export list
  // is NOT vendored in this repo, so this regex is hand-maintained. The
  // anti-drift mechanism is (a) this comment's file:line + SHA citation
  // and (b) one CI fixture per setter (task V-3). #135's premise that the
  // 20-14 α-6 `settingPatterns` audit is the authoritative source is a
  // MISREAD: α-6 covers strudel.cc UI setters {theme,fontFamily,fontSize}
  // (20-14-OBSERVATIONS.md:13-71) — those are CHAIN methods
  // (`$: theme("dracula")`), UI-only (`onTrigger(...,false)` = no audio),
  // NOT top-level tempo boot calls. α-6 is therefore NOT the source for
  // THIS list; the @strudel/core repl.mjs audit above is.
  const PRELUDE_CALL_RE =
    /^[ \t]*(?:samples|useRNG|setcps|setCps|setcpm|setCpm|setVoicingRange|initAudio|aliasBank)\s*\(/

  let i = 0
  while (i < code.length) {
    // Walk to end of current line (exclusive of '\n').
    let lineEnd = code.indexOf('\n', i)
    if (lineEnd === -1) lineEnd = code.length
    const line = code.slice(i, lineEnd)
    const trimmed = line.trim()

    // 1. Blank line — skip and advance past the newline.
    if (trimmed === '') {
      i = lineEnd + 1
      continue
    }

    // 2. Whole-line comment — skip.
    if (trimmed.startsWith('//')) {
      i = lineEnd + 1
      continue
    }

    // 3. Top-level recognised prelude call — possibly multi-line.
    if (PRELUDE_CALL_RE.test(line)) {
      // Track paren/brace/bracket depth + string state from the line start,
      // advancing across newlines until depth returns to zero AT THE END
      // OF A LINE whose final non-ws char is `)` (allow trailing `;`).
      let j = i
      let depth = 0
      let inString = false
      let stringChar = ''
      let escaped = false
      let sawOpenParen = false
      while (j < code.length) {
        const ch = code[j]
        if (escaped) {
          escaped = false
          j++
          continue
        }
        if (inString) {
          if (ch === '\\') {
            escaped = true
          } else if (ch === stringChar) {
            inString = false
          }
          j++
          continue
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          inString = true
          stringChar = ch
          j++
          continue
        }
        if (ch === '(' || ch === '[' || ch === '{') {
          depth++
          if (ch === '(') sawOpenParen = true
          j++
          continue
        }
        if (ch === ')' || ch === ']' || ch === '}') {
          depth--
          j++
          // When depth returns to zero AFTER seeing at least one '(', the
          // call body is closed. Consume any trailing `;`, then advance to
          // the next line and resume prelude scan.
          if (depth === 0 && sawOpenParen) {
            // Allow optional `;` + horizontal whitespace before EOL.
            while (j < code.length && (code[j] === ' ' || code[j] === '\t' || code[j] === ';')) {
              j++
            }
            // Advance past the newline (if any) so the outer loop
            // starts at the next line.
            if (j < code.length && code[j] === '\n') j++
            break
          }
          continue
        }
        if (ch === '\n') {
          j++
          continue
        }
        j++
      }
      // Defensive: if depth never closed (malformed source), stop the
      // prelude scan here and let the body parser handle whatever remains.
      // We do NOT consume the malformed call.
      if (depth !== 0) break
      i = j
      continue
    }

    // 4. Anything else — first body line. Stop here.
    break
  }

  return { body: code.slice(i), offset: i }
}

/**
 * 20-15 G1 (#134 / D-02) — minimal single-assignment binding map.
 *
 * NEW PK16(b) stage 0.5 — runs AFTER prelude-strip (stage 1; prelude still
 * does NOT skip let/const, pS:~127) and BEFORE splitRootAndChain (stage 2).
 *
 * Scope (D-02, the matcher-not-interpreter line — DO NOT cross it):
 *   - ONLY `let/const/var x = <pattern>` where `x` is a SINGLE identifier
 *     (destructuring `{a}=`/`[a]=` does not match `[A-Za-z_$]` → returns
 *     null → caller falls back to whole-program Code).
 *   - Each name defined EXACTLY ONCE (reassignment/shadowing → null).
 *   - No use-before-def is enforced at the SUBSTITUTION site (a ref whose
 *     name is not yet in the map when its arg is resolved → not
 *     substituted → that arg parses as a bare ident → bare Code → the
 *     stack arm's existing fallback → whole expression Code; topology
 *     preserved, never a crash).
 *   - The RHS is parsed via `parseExpression` and KEEPS its definition-site
 *     source offsets (R6 — click-to-source lands on the DEFINITION).
 *   - RHS that itself parses to bare Code → null (the binding is opaque;
 *     do not pretend it is structured).
 *
 * Returns:
 *   - `null` when the body is NOT a clean "N bindings then one final
 *     expression" shape, or any D-02 violation → caller MUST fall back to
 *     the existing whole-program `IR.code(code)` (topology-preserving, one
 *     Code node — NEVER a throw; the parseStrudel try/catch stays the last
 *     resort, not the mechanism).
 *   - `{ bindings, finalExpr, finalOffset }` on success; `bindings` is the
 *     resolved subtree map, `finalExpr`/`finalOffset` the trailing
 *     non-binding expression + its absolute offset into ORIGINAL source.
 */
function splitTopLevelStatements(
  body: string,
  baseOffset: number,
): { text: string; offset: number }[] {
  // Split on `;` or newline at depth 0, string/comment aware. REUSE the
  // lexStateAt walker discipline inline (PV49 spirit) — a statement
  // boundary is a `;`/`\n` that is at brace/paren/bracket depth 0 and not
  // inside a string/template/`//` comment.
  const out: { text: string; offset: number }[] = []
  let depth = 0
  let inString = false
  let stringChar = ''
  let escaped = false
  let segStart = 0
  let i = 0
  const flush = (end: number): void => {
    const raw = body.slice(segStart, end)
    if (raw.trim().length > 0) {
      const lead = raw.length - raw.trimStart().length
      out.push({ text: raw.trim(), offset: baseOffset + segStart + lead })
    }
    segStart = end + 1
  }
  while (i < body.length) {
    const ch = body[i]
    if (escaped) {
      escaped = false
      i++
      continue
    }
    if (inString) {
      if (ch === '\\') escaped = true
      else if (ch === stringChar) inString = false
      i++
      continue
    }
    if (ch === '/' && body[i + 1] === '/') {
      while (i < body.length && body[i] !== '\n') i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true
      stringChar = ch
      i++
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++
      i++
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      i++
      continue
    }
    if (depth === 0 && (ch === ';' || ch === '\n')) {
      flush(i)
      i++
      continue
    }
    i++
  }
  flush(body.length)
  return out
}

const BINDING_RE = /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/

function buildBindingMap(
  body: string,
  baseOffset: number,
):
  | { bindings: ReadonlyMap<string, PatternIR>; finalExpr: string; finalOffset: number }
  | null {
  const stmts = splitTopLevelStatements(body, baseOffset)
  if (stmts.length < 2) return null // need ≥1 binding + 1 final expr

  const bindings = new Map<string, PatternIR>()
  let finalIdx = -1
  for (let s = 0; s < stmts.length; s++) {
    const { text, offset } = stmts[s]
    const bm = text.match(BINDING_RE)
    if (!bm) {
      // First non-binding statement is the final expression. Anything
      // AFTER it (a trailing binding) makes this not a clean
      // "bindings then expr" shape → D-02 fallback.
      finalIdx = s
      break
    }
    const name = bm[1]
    const rhs = bm[2].trim()
    // D-02: reassignment / shadowing (duplicate name) → fallback.
    if (bindings.has(name)) return null
    // RHS absolute offset = statement offset + (where rhs starts in text).
    const rhsStartInText = text.length - rhs.length // bm[2] was end-anchored, then trimmed
    const rhsOffset = offset + rhsStartInText
    const rhsIR = parseExpression(rhs, rhsOffset)
    const rhsIsBareCode =
      rhsIR.tag === 'Code' && (rhsIR as { via?: unknown }).via === undefined
    // D-02: an RHS that itself parses to bare Code is opaque — do not
    // pretend the binding is structured. Whole-program fallback.
    if (rhsIsBareCode) return null
    bindings.set(name, rhsIR)
  }
  if (finalIdx === -1) return null // all statements were bindings, no final expr
  // Everything AFTER finalIdx must NOT exist (no trailing bindings /
  // multiple final expressions — keep the shape strictly "bindings*, expr").
  if (finalIdx !== stmts.length - 1) return null
  return {
    bindings,
    finalExpr: stmts[finalIdx].text,
    finalOffset: stmts[finalIdx].offset,
  }
}

/** Parse a Strudel code string. Always returns a tree (Code node for unsupported). */
export function parseStrudel(code: string): PatternIR {
  if (!code.trim()) return IR.pure()

  try {
    // Split into track blocks ($: lines). Each carries the absolute
    // char offset of `expr[0]` within `code` so parseMini can attach
    // `loc` (source ranges) to Play nodes.
    const tracks = extractTracks(code)
    if (tracks.length === 0) {
      // No $: prefix — parse as a single expression and wrap in a
      // synthetic Track('d1', ...). 20-11 D-04 option (a): every parseStrudel
      // result whose root is the user's musical expression carries a
      // trackId, even when the source has no `$:` block. The wrap has
      // NO `loc` (no $: line to point at) and NO userMethod (synthetic,
      // distinguishes from `.p("d1")`). toStrudel's β-2 Track arm strips
      // synthetic-d1 (userMethod === undefined) on round-trip so the
      // input → IR → string identity is preserved for non-$: sources.
      //
      // Phase 20-14 parser-gap fix — strip any leading prelude (whole-line
      // comments, blank lines, recognised boot-side-effect calls) before
      // parsing. Real upstream tunes start with a license comment block +
      // `samples(...)` / `useRNG(...)` invocations; without this strip,
      // `splitRootAndChain` reads the comment text as the root and the
      // whole tune falls through to the Code() fallback at line 270.
      //
      // The strip applies ONLY to the no-`$:` branch. The multi-track
      // path keeps reading the original `code` so a `$:` line appearing
      // before the prelude (uncommon but legal) still produces tracks.
      const stripped = stripParserPrelude(code)
      if (!stripped.body.trim()) {
        // Source is ENTIRELY prelude (no musical body). Return an
        // empty-body Track wrapper so downstream consumers still get
        // the synthetic-d1 shape. PV37 wrap-never-drop preserved.
        return IR.track('d1', IR.pure())
      }
      const bodyTrimStart = stripped.body.search(/\S/)
      const innerOffset = stripped.offset + (bodyTrimStart >= 0 ? bodyTrimStart : 0)
      // 20-15 G1 (#134 / D-02) — NEW PK16(b) stage 0.5: try the minimal
      // single-assignment binding map. Only the clean
      // `let p1=… / let p2=… / stack(p1,p2)` shape (R4 partial — the
      // measured 2/10 Bakery case). buildBindingMap returns null on ANY
      // D-02 violation (reassignment / shadowing / opaque RHS / not a
      // "bindings* then one expr" shape) → fall through to the existing
      // whole-program parse below (topology-preserving; use-before-def is
      // handled at the substitution site, never a throw).
      const bound = buildBindingMap(stripped.body, stripped.offset)
      if (bound) {
        const inner = parseExpression(bound.finalExpr, bound.finalOffset, undefined, bound.bindings)
        // P67: if the final expression resolved to bare Code (the binding
        // map did not help — e.g. a non-stack final expr), keep the
        // existing whole-program fallback shape rather than wrapping a
        // bare-Code body in a Track. Otherwise the substituted subtrees
        // are real structured IR flowing through the pS:~620 chokepoint.
        const innerIsBareCode =
          inner.tag === 'Code' && (inner as { via?: unknown }).via === undefined
        if (!innerIsBareCode) {
          return IR.track('d1', inner)
        }
        // else: fall through to the plain parse (whole-program Code).
      }
      const inner = parseExpression(stripped.body.trim(), innerOffset)
      return IR.track('d1', inner)
    }
    if (tracks.length === 1) {
      // Single `$:` block — Track('d1', expr) without an enclosing Stack.
      // loc covers the `$:` line range (PV36 / D-02). Synthetic-from-$:
      // form: no userMethod (toStrudel β-2 distinguishes from `.p()` form
      // via `userMethod === 'p'`).
      //
      // Phase 20-12.1 follow-up — commented `$:` lines produce an
      // empty-body Track wrapper so d{N} numbering stays stable when
      // the user toggles a line's comment prefix.
      const t = tracks[0]
      const body = t.commented ? IR.pure() : parseExpression(t.expr, t.offset)
      // 20-15 G5 (#138 / D-01) — a named label becomes the trackId so the
      // label IS the timeline row name (no `.p()` needed). `$` (the legacy
      // `$:` marker) keeps the synthetic `d1` numbering — byte-identical to
      // pre-G5. dollarStart = label-line start → collect.ts:447-450
      // OUTER-WINS dollarPos → MusicalTimeline `$${pos}` source-anchored
      // slot (PV47 / #119 substrate). Same mechanism `$:` uses, NOT a
      // parallel path.
      const trackId0 = t.label && t.label !== '$' ? t.label : 'd1'
      return IR.track(trackId0, body, {
        loc: [{ start: t.dollarStart, end: t.end }],
      })
    }
    // Two+ `$:` blocks — Stack(Track('d1', ...), Track('d2', ...), ...).
    // Each Track carries its own `$:` line range as loc. The outer Stack
    // is synthetic (no loc / no userMethod) — same shape as today.
    // Commented `$:` lines get Track wrappers with IR.pure() bodies so
    // they keep their slot in the numbering.
    return IR.stack(
      ...tracks.map((t, i) => {
        const body = t.commented ? IR.pure() : parseExpression(t.expr, t.offset)
        // 20-15 G5 (#138 / D-01) — labelled tracks carry trackId = label;
        // legacy `$:` (label === '$') keeps `d{i+1}` so existing multi-$:
        // tunes are byte-identical. dollarStart (label-line start) is the
        // source-anchored slot identity for BOTH forms — mixed `$:` +
        // `name:` interleave correctly because the unified regex matches
        // both in one scan and dollarStart is always line-start.
        const trackId = t.label && t.label !== '$' ? t.label : `d${i + 1}`
        return IR.track(trackId, body, {
          loc: [{ start: t.dollarStart, end: t.end }],
        })
      }),
    )
  } catch {
    return IR.code(code)
  }
}

// ---------------------------------------------------------------------------
// Track extraction
// ---------------------------------------------------------------------------

/**
 * Split code by $: lines.
 * Returns each track's expression body (without the $: prefix) plus
 * the absolute char offset of the body within the original code, so
 * downstream parsing can attach source-range information.
 *
 * Slices preserve original whitespace + newlines (no .trim()) so an
 * offset within the slice is also a valid offset within `code`.
 * Returns [] if no $: lines found (caller handles single-expression case).
 */
/**
 * 20-15 G5 (#138) — scan `code[0 .. idx)` and report the lexical state at
 * `idx`: paren/brace/bracket nesting depth + whether `idx` is inside a
 * string / template literal or a `//` line comment.
 *
 * REUSE of the `stripParserPrelude` depth-walker discipline (pS:~192-243):
 * same string/escape/`//`-comment handling, same depth bookkeeping. It is
 * lifted here as a small shared scanner (PV49 spirit — do not hand-roll a
 * second divergent walker) so the generalized label matcher can reject a
 * `name:` that is actually an object-literal key (`{ a: 1 }` multi-line),
 * a colon inside a string/template (`` s(`bd:3`) ``), or a comment.
 *
 * The γ-1 probe proved single-line false-positives are already rejected by
 * the label regex shape itself; this guard is load-bearing for the
 * MULTI-LINE forms where the colon-bearing token sits at a physical line
 * start (matrix in 20-15-OBSERVATIONS.md).
 */
function lexStateAt(code: string, idx: number): { depth: number; inString: boolean } {
  let depth = 0
  let inString = false
  let stringChar = ''
  let escaped = false
  let i = 0
  while (i < idx) {
    const ch = code[i]
    if (escaped) {
      escaped = false
      i++
      continue
    }
    if (inString) {
      if (ch === '\\') escaped = true
      else if (ch === stringChar) inString = false
      i++
      continue
    }
    // `//` line comment (only outside strings) — consume to EOL. The
    // newline itself is left for the outer loop (depth/string unchanged).
    if (ch === '/' && code[i + 1] === '/') {
      while (i < idx && code[i] !== '\n') i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true
      stringChar = ch
      i++
      continue
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++
      i++
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      i++
      continue
    }
    i++
  }
  return { depth, inString }
}

// 20-15 G5 (#138) — reserved identifiers that the generalized `name:`
// matcher must NOT treat as a track label. `let/const/var` would be a
// binding (G1, γ-3 / D-02); `default/case` are statement-label keywords.
// Strudel has no `switch`, so these only appear as false-positives.
const RESERVED_LABEL_IDENTS = new Set(['let', 'const', 'var', 'default', 'case'])

export function extractTracks(
  code: string,
): {
  expr: string
  offset: number
  dollarStart: number
  end: number
  commented: boolean
  label?: string
}[] {
  // Phase 20-11 α-2 — return shape additively widened. `dollarStart` (start
  // of the literal `$:` token) and `end` (exclusive end of the track body
  // slice — either the next `$:` line start or `code.length`) are exposed
  // so α-3's parseStrudel main path can attach a loc covering the `$:` line
  // range to each Track wrapper. Existing callers (parseStrudel main +
  // parseStrudelStages.runRawStage) consume only `expr`/`offset` and are
  // forward-compatible.
  //
  // Phase 20-12.1 follow-up — commented `$:` lines (// $:) are now matched
  // and emitted as `commented: true`. parseStrudel maps these to empty-body
  // Tracks, so d{N} numbering stays stable when the user comments out a $:
  // line during live editing. Without this, the IR renumbers (commenting
  // line 4 of a 6-line fixture shifts d5/d6 down to d4/d5, leaving a
  // disconnected d6 ghost from the slot map).
  const tracks: {
    expr: string
    offset: number
    dollarStart: number
    end: number
    commented: boolean
    label?: string
  }[] = []
  // 20-15 G5 (#138) — generalized from the literal `$:` matcher to a
  // named-label matcher. Group 1 = optional `//` line-comment prefix
  // (→ `commented`); group 2 = the label identifier. `$` ∈ `[A-Za-z_$]`
  // so `$:` STILL matches with label === '$' — exact pre-G5 behavior is
  // preserved (the `$` label falls back to the synthetic `d{N}` numbering
  // in parseStrudel, so `$:` tracks are byte-identical to before).
  // `\s*:` (not `[ \t]*:`) tolerates the rare `name :` spacing; the γ-1
  // probe proved this does not introduce false-positives (ternary `?`
  // breaks the `\s*:` adjacency before any `:` is reached).
  const dollarRe = /^[ \t]*(\/\/[ \t]*)?([A-Za-z_$][\w$]*)\s*:/gm
  const starts: {
    dollarStart: number
    bodyStart: number
    commented: boolean
    label: string
  }[] = []
  let m: RegExpExecArray | null
  while ((m = dollarRe.exec(code))) {
    const label = m[2]
    // γ-1-validated guard: reject a match that is NOT a real top-level
    // track label — inside `{}`/`()`/`[]`, inside a string/template/
    // comment, or a reserved non-track keyword. lexStateAt REUSES the
    // stripParserPrelude depth-walker discipline (PV49 spirit). `$:` is
    // never reserved and is virtually always depth-0, so its behavior is
    // unchanged. A `//`-commented label sits at line start; the `//` is
    // captured by group 1 (not consumed by the lexState `//` rule because
    // we scan UP TO m.index, which is the line start BEFORE the `//`).
    const st = lexStateAt(code, m.index)
    if (st.depth > 0 || st.inString || RESERVED_LABEL_IDENTS.has(label)) {
      continue
    }
    // bodyStart points after the matched prefix (`[ws][//]label:`) and any
    // post-colon whitespace on the same physical line. Tracks may continue
    // on subsequent lines.
    const after = m.index + m[0].length
    let bodyStart = after
    while (bodyStart < code.length && (code[bodyStart] === ' ' || code[bodyStart] === '\t')) {
      bodyStart++
    }
    const commented = !!m[1]
    // dollarStart anchors at the LINE START (m.index) — consistent across
    // commented vs uncommented forms since the regex matches from `^`.
    // This keeps slice boundaries clean (`end` of one entry == line start
    // of the next entry) regardless of comment toggling, AND makes the
    // label-line start the source-anchored slot identity (PV47 / D-01).
    starts.push({ dollarStart: m.index, bodyStart, commented, label })
  }
  if (starts.length === 0) return []

  for (let i = 0; i < starts.length; i++) {
    const { dollarStart, bodyStart, commented, label } = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1].dollarStart : code.length
    if (commented) {
      // Commented `$:` / `// name:` — emit an empty-body track. Body extent
      // is irrelevant (we don't parse it), but slot-map identity for this
      // position is preserved so the timeline shows a ghost row in place.
      tracks.push({ expr: '', offset: bodyStart, dollarStart, end, commented: true, label })
      continue
    }
    const slice = code.slice(bodyStart, end)
    // Trailing whitespace can stay — parseExpression handles it. We
    // keep the leading slice intact so offsets line up.
    tracks.push({ expr: slice, offset: bodyStart, dollarStart, end, commented: false, label })
  }
  return tracks
}

// ---------------------------------------------------------------------------
// Expression parser
// ---------------------------------------------------------------------------

/**
 * PV49 shared inter-token skip primitive (20-15 α substrate).
 *
 * Returns the ABSOLUTE index into `src` after any run of whitespace
 * (incl. `\n`) and whole-line / inline `// …` comments starting at
 * `pos`. Offset-additive: a caller threads it as
 * `base += skipWhitespaceAndLineComments(src, pos) - pos`.
 *
 * Behaviour MUST exactly mirror the reference regex used by the
 * already-tolerant chain walker, `applyChain`'s
 * `INTER_METHOD_SEP = /^(?:\s+|\/\/[^\n]*\n?)+/`: it consumes runs of
 * `\s` (newlines included) and `//`-to-end-of-line where the trailing
 * `\n` is ALSO consumed (matching the regex's `\n?`), looping until
 * neither whitespace nor a `//` comment starts at the cursor.
 *
 * `${` is NOT whitespace (it is real JS template interpolation) and is
 * NEVER consumed — PV49 scope explicitly excludes it (D-04). A `/` that
 * is not followed by a second `/` (e.g. a division operator) is also
 * not consumed.
 *
 * Pure: no state, no engine (PV50 N/A). The three genuine inter-token
 * consumers (applyChain — α-3 reference; splitArgsWithOffsets — #137/G4;
 * extractTracks label scan — #138/G5) own their additive arithmetic.
 * `stripParserPrelude`'s whole-line classifier is a structurally
 * distinct concern (R1) and is intentionally NOT migrated onto this.
 */
export function skipWhitespaceAndLineComments(src: string, pos: number): number {
  let i = pos
  for (;;) {
    // 1. Whitespace run (includes \n) — same as the regex's `\s+`.
    while (i < src.length && /\s/.test(src[i])) i++
    // 2. A `//` line comment: consume up to and INCLUDING the trailing
    //    `\n` (mirrors `\/\/[^\n]*\n?`). At EOF with no newline the
    //    `\n?` matches empty — consume to end of string.
    if (src[i] === '/' && src[i + 1] === '/') {
      i += 2
      while (i < src.length && src[i] !== '\n') i++
      if (i < src.length && src[i] === '\n') i++
      continue
    }
    // Neither whitespace nor a `//` comment at the cursor — done.
    // (`${`, `/x`, and any non-ws char fall here and are NOT consumed.)
    break
  }
  return i
}

/**
 * Parse a single Strudel expression (with optional method chain).
 * `baseOffset` is the absolute char offset of `expr[0]` within the
 * user's full code, so leaf parsers can attach `loc` to Play nodes.
 *
 * e.g. 'note("c4 e4").fast(2).every(4, fast(2))'
 */
export function parseExpression(
  expr: string,
  baseOffset = 0,
  // #132 (β-2) — when set, threads the caller's s-vs-note context into
  // the inner bare-string root. β-1 probe proved `s(...)` inner bare
  // strings MUST parse with isSampleKey=true (params.s + duration:1 are
  // lost otherwise); note/n/mini stay false. `undefined` = unchanged
  // pre-β-2 behavior (the bare-string arm's own default of false).
  isSampleKey?: boolean,
  // 20-15 G1 (#134 / D-02) — when set, a bare-identifier stack arg that
  // matches a key is substituted with the bound (definition-site) subtree.
  // `undefined` = no binding map (every call site except the no-`$:`
  // G1 entry). Threaded ONLY parseExpression → parseRoot → stack-arg.
  bindings?: ReadonlyMap<string, PatternIR>,
): PatternIR {
  if (!expr.trim()) return IR.pure()

  // 20-15 G1 — if the WHOLE expression is a bare identifier bound in the
  // map, substitute its subtree directly (covers the single-arg
  // `stack(p1)` path which unwraps to one arg before reaching here, and
  // any bare-ident root). Definition-site loc preserved (R6).
  if (bindings) {
    const bareId = expr.trim()
    if (/^[A-Za-z_$][\w$]*$/.test(bareId) && bindings.has(bareId)) {
      return bindings.get(bareId) as PatternIR
    }
  }

  try {
    // Compute the offset of `expr.trim()[0]` within `code` so the
    // root parser can locate the inner mini-notation string accurately.
    const leadingWs = expr.length - expr.trimStart().length
    const trimmedOffset = baseOffset + leadingWs

    // Extract root function call and remaining method chain
    const { root, chain } = splitRootAndChain(expr.trim())

    // Parse the root — if it can't be parsed, fall back to full expression as Code.
    //
    // Phase 20-14 parser-gap fix — discriminate "pure Code fallback" from
    // "structural Code-with-via wrapper". wrapAsOpaque returns tag: 'Code'
    // for any unrecognised method arg (PV37 wrap-never-drop), but the
    // `.via` field carries the structured chain. Checking tag alone treated
    // those wrappers as opaque and discarded the entire structure — surfaces
    // for `stack(single-arg-with-unmapped-pattern-chain)` shapes such as
    // `stack(s("bd").delay("<0 .5>")...).sometimes(...)` in delay.strudel.
    const rootIR = parseRoot(root, trimmedOffset, isSampleKey, bindings)
    const rootIsBareCode =
      rootIR.tag === 'Code' && (rootIR as { via?: unknown }).via === undefined
    if (rootIsBareCode && !chain.trim()) {
      // Entire expression is opaque — preserve full original expression
      return IR.code(expr)
    }
    if (rootIsBareCode) {
      return IR.code(expr)
    }

    // Walk the method chain, wrapping ir.
    // Compute absolute offset of chain[0] in the user's full code so that
    // parseTransform calls inside applyChain receive non-zero baseOffsets
    // for transform-arg positions (P39 / PRE-01 precursor — signature-
    // level threading only; loc attribution to non-Play nodes deferred).
    const chainOffset = trimmedOffset + root.length
    const ir = applyChain(rootIR, chain, chainOffset)

    return ir
  } catch {
    return IR.code(expr)
  }
}

// ---------------------------------------------------------------------------
// Root parser
// ---------------------------------------------------------------------------

/**
 * Parse the root function call: note("..."), s("..."), stack(...), or bare expression.
 * `baseOffset` is the absolute char offset of `root[0]` within the user's code.
 */
export function parseRoot(
  root: string,
  baseOffset = 0,
  // #132 (β-2) — caller's s-vs-note context for the bare-string root
  // arm. `undefined` keeps the pre-β-2 default (false). Threaded from
  // the loose recursive arm so `s("bd".jux(rev))`'s inner `"bd"` parses
  // with sample semantics (β-1 probe resolution).
  isSampleKey?: boolean,
  // 20-15 G1 (#134 / D-02) — binding map threaded to the stack-arg loop
  // so a bare-identifier arg matching a key substitutes the bound subtree
  // (the cleanest hook per research R4). `undefined` everywhere except the
  // no-`$:` G1 entry.
  bindings?: ReadonlyMap<string, PatternIR>,
): PatternIR {
  const trimmed = root.trim()
  const leadingWs = root.length - root.trimStart().length

  // 20-15 G3 (#136) — a captured backtick inner that contains a `${`
  // interpolation is REAL JS evaluation (D-04): the matcher must NOT
  // attempt parseMini — return the canonical bare IR.code fallback
  // (via===undefined, the pS:~414 shape). Clean branch, never a throw
  // (PV37 wrap-never-drop; the outer try/catch stays a backstop only).
  const backtickInnerToIR = (
    inner: string,
    isSample: boolean,
    innerOffset: number,
  ): PatternIR => {
    if (inner.includes('${')) return IR.code(trimmed)
    return parseMini(inner, isSample, innerOffset)
  }

  // note("...") or n("...") — plus G3 backtick `` `…` `` (multi-line ok).
  const noteMatch = trimmed.match(/^(?:note|n)\s*\(\s*"([^"]*)"\s*\)/)
  if (noteMatch) {
    // Position of the opening quote within `trimmed`, then +1 to skip it.
    const quoteIdx = noteMatch[0].indexOf('"')
    const innerOffset = baseOffset + leadingWs + quoteIdx + 1
    return parseMini(noteMatch[1], false, innerOffset)
  }
  const noteBtMatch = trimmed.match(/^(?:note|n)\s*\(\s*`([^`]*)`\s*\)/)
  if (noteBtMatch) {
    const btIdx = noteBtMatch[0].indexOf('`')
    const innerOffset = baseOffset + leadingWs + btIdx + 1
    return backtickInnerToIR(noteBtMatch[1], false, innerOffset)
  }

  // s("...") / sound("...") — sample pattern — plus G3 backtick.
  // `sound` is Strudel's documented alias of `s` (upstream controls.mjs
  // registers `sound` as an alias of the `s` control). 20-15 V-2 surfaced
  // it: issue #136's literal repro is `sound(`…`)`, and `sound` was never
  // a recognised root form (every `sound(...)` shape — dq, bare, backtick
  // — fell to bare Code while the `s(...)` equivalents parsed). It threads
  // isSampleKey=true identically to `s` (sets params.s + duration:1).
  const sMatch = trimmed.match(/^(?:s|sound)\s*\(\s*"([^"]*)"\s*\)/)
  if (sMatch) {
    const quoteIdx = sMatch[0].indexOf('"')
    const innerOffset = baseOffset + leadingWs + quoteIdx + 1
    return parseMini(sMatch[1], true, innerOffset)
  }
  const sBtMatch = trimmed.match(/^(?:s|sound)\s*\(\s*`([^`]*)`\s*\)/)
  if (sBtMatch) {
    const btIdx = sBtMatch[0].indexOf('`')
    const innerOffset = baseOffset + leadingWs + btIdx + 1
    return backtickInnerToIR(sBtMatch[1], true, innerOffset)
  }

  // mini("...") — raw mini-notation pattern producing values (not notes/samples).
  // Added for Phase 19-04 T-02 (Pick) — the only Strudel form that produces a
  // numeric-index Pattern usable as a pick selector in our test environment
  // (String.prototype.pick is not registered server-side; note("<0 1 2>")
  // converts numeric strings to MIDI notes which pick can't index by).
  // RESEARCH §1.4 (pre-mortem #10).
  const miniMatch = trimmed.match(/^mini\s*\(\s*"([^"]*)"\s*\)/)
  if (miniMatch) {
    const quoteIdx = miniMatch[0].indexOf('"')
    const innerOffset = baseOffset + leadingWs + quoteIdx + 1
    return parseMini(miniMatch[1], false, innerOffset)
  }
  const miniBtMatch = trimmed.match(/^mini\s*\(\s*`([^`]*)`\s*\)/)
  if (miniBtMatch) {
    const btIdx = miniBtMatch[0].indexOf('`')
    const innerOffset = baseOffset + leadingWs + btIdx + 1
    return backtickInnerToIR(miniBtMatch[1], false, innerOffset)
  }

  // #132 (β-2) — LOOSE recursive arm for note/n/s/mini args that carry
  // an inner method chain, e.g. `n("[0,3]".fast(3).lastOf(4, fast(2)))`.
  // Fires ONLY after the strict `"…"\)` fast-paths above (so the common
  // single-string case keeps its exact 20-14 snapshot), and ONLY when
  // the inner is NOT a plain `"…"` / `` `…` `` (those belong to the
  // strict/backtick arms). The inner is delegated to parseExpression —
  // there is NO IR.note(parsed) constructor (research conflict); the
  // inner ROOT is a mini string and the rest is a CHAIN, exactly what
  // parseExpression already decomposes (split-root/chain + parseMini +
  // applyChain). The β-1 probe proved the s-vs-note `isSampleKey`
  // context is NOT inert and MUST be threaded (s→true, note/n/mini→
  // false). P67: if the recursion returns BARE Code
  // (tag==='Code' && via===undefined), fall THROUGH to the existing
  // IR.code(trimmed) fallback below — never emit a half-wrapped node to
  // a via-expecting consumer.
  const looseMatch = trimmed.match(/^(note|n|s|sound|mini)\s*\(/)
  if (looseMatch) {
    const fnName = looseMatch[1]
    const openParenIdx = trimmed.indexOf('(', looseMatch[0].length - 1)
    const closeIdx =
      openParenIdx >= 0 ? findMatchingParen(trimmed, openParenIdx) : -1
    if (closeIdx > openParenIdx) {
      const inner = trimmed.slice(openParenIdx + 1, closeIdx)
      const innerTrimmed = inner.trim()
      // Let the strict regexes (above) own the plain single-string case
      // — both `"…"` and backtick `` `…` `` (β-3) — to avoid churn on
      // the 15 structured tunes. Only enter for chained / non-plain
      // inners (the actual #132 shape).
      const isPlainQuoted = /^"[^"]*"$/.test(innerTrimmed)
      const isPlainBacktick = /^`[^`]*`$/.test(innerTrimmed)
      if (!isPlainQuoted && !isPlainBacktick && innerTrimmed.length > 0) {
        // Absolute offset of inner[0] within the user's full source:
        // baseOffset + leadingWs already points at trimmed[0]; the inner
        // starts at openParenIdx+1 within `trimmed` (additive — same
        // shape as the stack arm).
        const innerLeadingWs = inner.length - inner.trimStart().length
        const innerAbsOffset =
          baseOffset + leadingWs + openParenIdx + 1 + innerLeadingWs
        // β-1 resolution: thread the caller's sample context.
        const callerIsSample = fnName === 's' || fnName === 'sound'
        const innerIR = parseExpression(
          innerTrimmed,
          innerAbsOffset,
          callerIsSample,
        )
        const innerIsBareCode =
          innerIR.tag === 'Code' &&
          (innerIR as { via?: unknown }).via === undefined
        // P67: bare-Code inner → DO NOT wrap; fall through to the
        // canonical IR.code(trimmed) fallback at the bottom of parseRoot
        // (single bare-Code shape, via===undefined). Only a structured
        // (or via-wrapped) inner is accepted here.
        if (!innerIsBareCode) {
          return innerIR
        }
        // else: fall through to the opaque fallback below.
      }
    }
  }

  // stack(a, b, c) — parallel composition. Issue #107 — each arg's
  // absolute file offset is now threaded into parseExpression so
  // inner atoms resolve to real file positions. Without this,
  // `stack(s("hh*8"), s("bd"))` produced events whose `loc[0]`
  // pointed inside the file's first line (typically a comment),
  // collapsing click-to-source for any sample-track event.
  const stackMatch = trimmed.match(/^stack\s*\(/)
  if (stackMatch) {
    const inner = extractParenContent(trimmed, 'stack(')
    if (inner !== null) {
      // Position of `inner` within `trimmed`: `extractParenContent`
      // returns content from after `stack(` up to the matching `)`.
      // The `(` lives at `trimmed.indexOf('stack(') + 'stack('.length - 1`,
      // so inner[0] sits at openIdx+1 within trimmed. Absolute file
      // offset of inner[0] = baseOffset + leadingWs + (openIdx + 1).
      const stackKwIdx = trimmed.indexOf('stack(')
      const innerStartInTrimmed = stackKwIdx + 'stack('.length
      const innerAbsOffset = baseOffset + leadingWs + innerStartInTrimmed
      const argsWithOffsets = splitArgsWithOffsets(inner)
      // 20-15 G1 (#134 / D-02) — thread the binding map so a bare-ident
      // arg (`stack(p1, p2)`) substitutes the bound subtree at THIS
      // insertion point (the cleanest hook per R4). A ref whose name is
      // NOT in the map (use-before-def, undefined ident) is NOT
      // substituted → parses as a bare ident → bare Code → the
      // whole-expression Code fallback (D-02 topology-preserving, no
      // throw). Substituted subtrees keep definition-site loc (R6).
      const tracks = argsWithOffsets.map((a) =>
        parseExpression(a.value, innerAbsOffset + a.offset, undefined, bindings),
      )
      if (tracks.length === 0) return IR.pure()
      if (tracks.length === 1) return tracks[0]
      // 19-05 / #74: root-level `stack(...)` outer Stack carries the call-
      // site range + userMethod: 'stack' (D-08 exact-token — distinct from
      // `'layer'` at T-04 even though both produce Stack tags). Literal
      // construction — IR.stack is rest-spread (RESEARCH §11 Q1).
      // The whole `stack(...)` substring spans from `trimmed[0]` (whose
      // absolute position is `baseOffset + leadingWs`) through the closing
      // paren matched by extractParenContent.
      const trimmedAbs = baseOffset + leadingWs
      const openIdx = trimmed.indexOf('(')
      const closeIdx = openIdx >= 0 ? findMatchingParen(trimmed, openIdx) : -1
      const fullMatchLen = closeIdx >= 0 ? closeIdx + 1 : trimmed.length
      return {
        tag: 'Stack' as const,
        tracks,
        loc: [{ start: trimmedAbs, end: trimmedAbs + fullMatchLen }],
        userMethod: 'stack',
      }
    }
  }

  // Phase 20-14 parser-gap fix (cluster A) — bare-string-as-pattern.
  // Strudel's transpiler auto-promotes top-level string literals to
  // mini-patterns. Mirrors mini("...") semantically — produces values,
  // not notes/samples. Fired AFTER all named-function arms so this is a
  // fallback for "expression starts with a bare string" (e.g.,
  // `"0,2,[7 6]".add(...)` from barryHarris / holyflute).
  // Single-line string only (mini-notation never spans newlines).
  const bareStringMatch = trimmed.match(/^"([^"]*)"$/)
  if (bareStringMatch) {
    // innerOffset points at the FIRST char inside the quotes.
    const innerOffset = baseOffset + leadingWs + 1
    // #132 (β-2): when the loose recursive arm threaded the caller's
    // s-vs-note context, honour it here; otherwise keep the pre-β-2
    // default of `false` (snapshot-preserving for the 15 tunes).
    return parseMini(bareStringMatch[1], isSampleKey ?? false, innerOffset)
  }
  // 20-15 G3 (#136) — bare backtick `` `…` `` template-literal root.
  // `[^`]*` spans newlines (multi-line mini-notation, e.g.
  // `` `<bd hh>\n<sn ~>`.cpm(2) ``). `${}` → graceful Code (D-04).
  const bareBtMatch = trimmed.match(/^`([^`]*)`$/)
  if (bareBtMatch) {
    const innerOffset = baseOffset + leadingWs + 1
    return backtickInnerToIR(bareBtMatch[1], isSampleKey ?? false, innerOffset)
  }

  // Fallback: treat as opaque
  return IR.code(trimmed)
}

// ---------------------------------------------------------------------------
// Method chain walker
// ---------------------------------------------------------------------------

/**
 * Apply a sequence of method calls to an IR node.
 * Each method wraps the current node.
 *
 * `baseOffset` is the absolute char offset of `chain[0]` in the user's
 * full code. Used to thread method-arg positions through parseTransform
 * (PRE-01 precursor — P39 / PV25 signature-level threading).
 */
export function applyChain(ir: PatternIR, chain: string, baseOffset = 0): PatternIR {
  if (!chain.trim()) return ir

  const leadingWs = chain.length - chain.trimStart().length
  let remaining = chain.trim()
  let remainingOffset = baseOffset + leadingWs
  let current = ir

  // Phase 20-14 parser-gap fix (cluster B) — multi-line chain tolerance.
  // Strudel programs commonly format long chains across newlines + indent
  // (e.g., `s("bd").delay(.5)\n    .delaytime(.16)\n    .delayfeedback(.6)`)
  // and tolerate inline `// comment` between methods. The pre-fix walker
  // only progressed while `remaining.startsWith('.')` after a single
  // initial `.trim()` — so the first newline between methods exited the
  // loop and every subsequent method was silently dropped to Code-fallback.
  //
  // 20-15 α-3: the inter-method separator skip is now the shared PV49
  // `skipWhitespaceAndLineComments` primitive (was the inline
  // `INTER_METHOD_SEP = /^(?:\s+|\/\/[^\n]*\n?)+/` regex, now removed —
  // it was referenced ONLY here). The primitive is byte-equivalent to
  // that regex (asserted by skipWhitespaceAndLineComments.test.ts), so
  // this reroute is the PV49 EQUIVALENCE ORACLE: applyChain is already
  // fully tolerant, therefore the 16 corpus IR-shape snapshots, the
  // loc-fidelity snapshot, and the 1551 editor tests MUST all stay
  // byte-for-byte unchanged — that three-way invariance is the proof the
  // primitive matches the reference before any GAP fix builds on it.
  // The offset arithmetic is unchanged and stays owned by applyChain:
  // `remaining` is a 0-based working buffer, so the absolute index the
  // primitive returns IS the consumed length (== the old `sep[0].length`).
  while (true) {
    // Skip inter-method separator (whitespace + line comments) via the
    // shared primitive — same additive shape as the old regex head-match.
    const consumedSep = skipWhitespaceAndLineComments(remaining, 0)
    if (consumedSep > 0) {
      remainingOffset += consumedSep
      remaining = remaining.slice(consumedSep)
    }
    if (!remaining.startsWith('.')) break
    const { method, args, rest, argsOffset } = extractNextMethod(remaining)
    if (!method) break

    // Pre-compute the call-site range BEFORE applyMethod runs (19-05 / #74).
    //   remainingOffset = position of leading '.' in user's full code.
    //   consumed        = the substring length applyMethod is about to handle
    //                     (RESEARCH §10 #12: must compute from
    //                     remaining.length - rest.length BEFORE the
    //                     advance below; off-by-one on the leading '.' is
    //                     the silent trap).
    const consumed = remaining.length - rest.length
    const callSiteRange: [number, number] = [
      remainingOffset,
      remainingOffset + consumed,
    ]

    // argsOffset is -1 when the method has no parens. We pass 0-args
    // calls through with baseOffset = remainingOffset (still > 0 for any
    // non-leading method) so the precursor test's "non-zero" assertion
    // holds even on chains that mix paren-less and paren-ful methods.
    const argsAbsoluteOffset = argsOffset >= 0 ? remainingOffset + argsOffset : remainingOffset
    current = applyMethod(current, method, args, argsAbsoluteOffset, callSiteRange)

    // Advance remainingOffset by the consumed length (same arithmetic as
    // before — just split across the call to make callSiteRange available).
    remainingOffset += consumed
    remaining = rest
  }

  return current
}

/**
 * Apply a single method call to an IR node.
 * `baseOffset` is the absolute char offset of `args[0]` in the user's
 * full code (or of the method name itself for paren-less methods),
 * threaded forward to any parseTransform calls.
 * `callSiteRange` is the absolute source range of the whole method-call
 * substring (e.g., `.fast(2)` start..end) — passed to `tagMeta` for
 * `loc` + `userMethod` population on the constructed non-Play tag
 * (19-05 / #74). Default `[0, 0]` preserves backward-compat for any
 * potential non-applyChain caller (none exist today).
 */
function applyMethod(
  ir: PatternIR,
  method: string,
  args: string,
  baseOffset = 0,
  callSiteRange: [number, number] = [0, 0],
): PatternIR {
  switch (method) {
    case 'fast': {
      const n = parseFloat(args.trim())
      if (!isNaN(n)) return IR.fast(n, ir, tagMeta(method, callSiteRange))
      return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
    }

    case 'slow': {
      const n = parseFloat(args.trim())
      if (!isNaN(n)) return IR.slow(n, ir, tagMeta(method, callSiteRange))
      return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
    }

    case 'every': {
      // .every(n, transform)
      const [nStr, transformStr] = splitFirstArg(args)
      const n = parseInt(nStr.trim(), 10)
      if (isNaN(n)) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      const transformOffset = transformStr ? offsetOfSubArg(args, transformStr, baseOffset) : baseOffset
      const transform = transformStr ? parseTransform(transformStr.trim(), ir, transformOffset) : ir
      return IR.every(n, transform, ir, tagMeta(method, callSiteRange))
    }

    case 'sometimes': {
      // .sometimes(transform) → Choice(0.5, transform(body), body)
      const transform = args.trim()
        ? parseTransform(args.trim(), ir, baseOffset + (args.length - args.trimStart().length))
        : ir
      return IR.choice(0.5, transform, ir, tagMeta(method, callSiteRange))
    }

    case 'sometimesBy': {
      // .sometimesBy(p, transform)
      const [pStr, transformStr] = splitFirstArg(args)
      const p = parseFloat(pStr.trim())
      if (isNaN(p)) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      const transformOffset = transformStr ? offsetOfSubArg(args, transformStr, baseOffset) : baseOffset
      const transform = transformStr ? parseTransform(transformStr.trim(), ir, transformOffset) : ir
      return IR.choice(p, transform, ir, tagMeta(method, callSiteRange))
    }

    case 'mask': {
      // .mask("gate") → When
      const gateMatch = args.trim().match(/^"([^"]*)"$/)
      if (gateMatch) return IR.when(gateMatch[1], ir, tagMeta(method, callSiteRange))
      return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
    }

    case 'layer': {
      // Tier 4 (Phase 19-04 Task T-01). `.layer(...funcs)` desugars per
      // pattern.mjs:796-798 — `stack(...funcs.map(f => f(this)))`. Each
      // func is applied to the body; the original body is NOT included
      // (contrast superimpose at pattern.mjs:810-812 which does include
      // the original via this.stack(...)).
      //
      // We split the comma-separated arg list with the existing splitArgs
      // helper (respects nested parens / strings), parse each func string
      // with parseTransform threading the absolute baseOffset of that
      // func within the user's code, then construct Stack(...transformed).
      //
      // Round-trip: toStrudel currently emits the structural stack(...)
      // form for v1 — the layer-shape recogniser is a follow-up for the
      // bidirectional editing pass (#8). Same soft-target stance taken
      // for jux/off in 19-03. RESEARCH §1.1; CONTEXT round-trip discipline.
      const argList = splitArgs(args)
      if (argList.length === 0) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      const tracks: PatternIR[] = []
      for (const funcStr of argList) {
        const trimmed = funcStr.trim()
        if (!trimmed) {
          tracks.push(ir)
          continue
        }
        const transformOffset = offsetOfSubArg(args, trimmed, baseOffset)
        tracks.push(parseTransform(trimmed, ir, transformOffset))
      }
      // 19-05 / #74: outer Stack carries .layer(...)'s call-site range +
      // userMethod: 'layer' (D-09 desugar metadata). Literal construction —
      // IR.stack is rest-spread and cannot accept a trailing meta? param
      // (RESEARCH §2 / §11 Q1). Inner transformed funcs inherit metadata
      // through W5's parseTransform (recursive applyChain).
      const [layerStart, layerEnd] = callSiteRange
      return {
        tag: 'Stack' as const,
        tracks,
        loc: [{ start: layerStart, end: layerEnd }],
        userMethod: method, // 'layer' — D-08 exact-token from the switch label
      }
    }

    case 'chunk': {
      // Tier 4 (Phase 19-03 Task 09). `.chunk(n, transform)` desugars
      // (pattern.mjs:2569-2578):
      //   binary = [true, false × (n-1)]
      //   binary_pat = _iter(n, sequence(binary), true)
      //   pat = pat.repeatCycles(n)
      //   return pat.when(binary_pat, transform)
      //
      // Because `repeatCycles(n)` slows the body to span n outer cycles,
      // each outer cycle plays only one slot of the body. Combined with
      // the rotated binary, the transform is applied to ALL events the
      // chunk emits in any given outer cycle.
      //
      // Our IR's Chunk tag stores `transform` as the body with the user
      // transform pre-applied (parseTransform), so the slot-replacement
      // logic in collect can take events directly from `transform`. This
      // mirrors the existing Every shape (Every.body = transformed,
      // Every.default_ = base).
      //
      // v1 limitation (pre-mortem #3): single-cycle bodies only.
      // Multi-cycle bodies would require modelling repeatCycles' source
      // rolling, deferred to a follow-up. parseTransform doesn't thread
      // baseOffset through (P39 / pre-mortem #10), so loc on transformed
      // events points back to the body — PV24 presence holds, value
      // precision is the existing limitation.
      const [nStr, transformStr] = splitFirstArg(args)
      const n = parseInt(nStr.trim(), 10)
      if (isNaN(n) || n < 1) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      const transformOffset = transformStr ? offsetOfSubArg(args, transformStr, baseOffset) : baseOffset
      const transform = transformStr ? parseTransform(transformStr.trim(), ir, transformOffset) : ir
      return IR.chunk(n, transform, ir, tagMeta(method, callSiteRange))
    }

    case 'degrade': {
      // Tier 4 (Phase 19-03 Task 07). `.degrade()` shorthand for
      // `.degradeBy(0.5)` (signal.mjs:720). Our Degrade.p is the
      // retention probability; 50% drop ⇒ 50% retain ⇒ p = 0.5.
      return IR.degrade(0.5, ir, tagMeta(method, callSiteRange))
    }

    case 'degradeBy': {
      // Tier 4 (Phase 19-03 Task 07). `.degradeBy(amount)` filters each
      // event with drop probability `amount` (signal.mjs:686-706 — keeps
      // events where `rand > amount`). Our Degrade.p is the RETENTION
      // probability — translate via p = 1 - amount.
      //
      // Off-by-one trap (CONTEXT pre-mortem #2 / RESEARCH §3.4): the
      // direction of the inversion silently inverts user intent, so two
      // boundary tests below land at degradeBy(0) (full retain) and
      // degradeBy(1) (full drop) plus an asymmetric probe at
      // degradeBy(0.8) that distinguishes p=0.2 from the wrong p=0.8.
      const amount = parseFloat(args.trim())
      if (isNaN(amount)) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      // D-08 exact-token: userMethod is `'degradeBy'`, NOT `'degrade'`. The
      // tag is Degrade (canonical) but `method` here is the user's literal
      // `'degradeBy'` from the switch — pass it through, don't substitute.
      return IR.degrade(1 - amount, ir, tagMeta(method, callSiteRange))
    }

    case 'late': {
      // Tier 4 (Phase 19-03 Task 03). `.late(t)` shifts events forward by
      // `t` cycles while preserving cycle length (pattern.mjs:2081-2089).
      // Modeled as the Late IR tag (Task 02). Decimal literals only —
      // fraction literals like `.late(1/8)` fall back to identity (same
      // limitation `.fast()` has today).
      const t = parseFloat(args.trim())
      if (isNaN(t)) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      return IR.late(t, ir, tagMeta(method, callSiteRange))
    }

    case 'jux': {
      // Tier 4 (Phase 19-03 Task 05). `.jux(f)` desugars per
      //   pattern.mjs:2379-2381: jux(func, pat) = pat._juxBy(1, func, pat)
      //   pattern.mjs:2356-2368: juxBy halves the `by` arg, then
      //     left  = pat.withValue(v => { pan: (v.pan ?? 0.5) - by/2 })
      //     right = func(pat.withValue(v => { pan: (v.pan ?? 0.5) + by/2 }))
      //     return stack(left, right)
      // For `jux(f)` with by=1: by/2 = 0.5 → left pan = 0.0 (full left),
      // right pan = 1.0 (full right) in Strudel's [0,1] convention.
      //
      // Our IR's pan convention is [-1, 1] centered at 0 (PatternIR.ts:23
      // PlayParams). Mapping: Strudel 0.0 → ours -1; Strudel 1.0 → ours +1.
      // The parity harness applies `normalizeStrudelPan` (p*2-1) to the
      // Strudel side before diff so both sides land in [-1, 1].
      //
      // Round-trip: no Jux tag exists by design — the desugar is exact.
      // toStrudel emits the structural Stack(FX(pan,…), FX(pan,…))
      // form (no `.jux(...)` recovery in this wave). Accepted soft target
      // per CONTEXT round-trip discipline.
      //
      // PRE-01 (PR #70): parseTransform now receives a non-zero
      // baseOffset for the transform-arg position; loc-attribution to
      // non-Play nodes still deferred per RESEARCH §2 Subtlety C.
      const transformed = args.trim()
        ? parseTransform(args.trim(), ir, baseOffset + (args.length - args.trimStart().length))
        : ir
      // 19-05 / #74: outer Stack carries .jux(...)'s call-site range +
      // userMethod: 'jux' (D-09). Inner FX(pan, ±1) nodes are SYNTHETIC —
      // no metadata (setting loc would mislead click-to-source into thinking
      // the user typed `.pan(...)`; RESEARCH §7). The `transformed` body
      // keeps its own Play.loc and inherited tag-level locs from the inner
      // applyChain recursion.
      const leftPan = IR.fx('pan', { pan: -1 }, ir)
      const rightPan = IR.fx('pan', { pan: 1 }, transformed)
      const [juxStart, juxEnd] = callSiteRange
      return {
        tag: 'Stack' as const,
        tracks: [leftPan, rightPan],
        loc: [{ start: juxStart, end: juxEnd }],
        userMethod: method, // 'jux'
      }
    }

    case 'ply': {
      // Tier 4 (Phase 19-03 Task 10). `.ply(n)` repeats each event of the
      // body `n` times within its own slot (pattern.mjs:1905-1911):
      //   ply(factor, pat) = pat.fmap(x => pure(x)._fast(factor)).squeezeJoin()
      //
      // Originally the plan called for desugaring to `Fast(n, Seq(body × n))`,
      // but a probe (W4 T10) showed our Fast scales `ctx.speed` rather than
      // re-playing the body, so the desugar compresses events into [0, 1/n)
      // instead of spreading them across [0, 1). With Fast unable to model
      // ply's per-event multiplication, we promoted Ply to a forced new IR
      // tag (D-02 rule). Round-trip is then direct: toStrudel emits `.ply(n)`
      // (no shape recogniser needed).
      //
      // Non-integer factors (e.g. `.ply(2.5)`, `.ply("<2 3 4>")`) fall
      // through silently — same default-branch behaviour the parser uses for
      // any unrecognised method-arg shape today. Documented as a known
      // limitation; matches CONTEXT D-02's "non-integer falls through to
      // Code fallback in v1; revisit in 19-04 if needed."
      const trimmed = args.trim()
      const n = Number(trimmed)
      // Phase 20-04 T-05 (D-03 / P33 / PV37): wrap on parse failure.
      if (!Number.isInteger(n) || n < 1) return wrapAsOpaque(ir, method, args, callSiteRange)
      // Phase 20-04 T-05 Trap 2: ply(1) is a VALID no-op per CONTEXT D-02
      // from 19-03 — leave UNCHANGED. Wrapping here would change the IR
      // shape (Code-with-via{ inner: Play(c) } instead of bare Play(c))
      // and break existing parity tests asserting `ply(1) === ir`.
      if (n === 1) return ir
      return IR.ply(n, ir, tagMeta(method, callSiteRange))
    }

    case 'off': {
      // Tier 4 (Phase 19-03 Task 04). `.off(t, f)` literally desugars to
      //   stack(pat, func(pat.late(time_pat)))     [pattern.mjs:2236-2238]
      // i.e., the user-supplied transform is applied to `pat.late(t)` —
      // late is computed FIRST, then the transform wraps that. So our
      // mirror is Stack(body, transform(Late(t, body))).
      //
      // Order matters. The plan-task draft used Stack(body, Late(t,
      // transform(body))) — that puts transform inside Late, not outside,
      // which produces a different event stream when the transform
      // re-times (e.g., `fast(2)`: applying fast AFTER late differs from
      // applying late AFTER fast — the latter is what Strudel does).
      // This was caught by parity diff and corrected; the desugar below
      // is the one Ground Truth supports.
      //
      // Round-trip: no Off tag exists by design — the desugar is exact.
      // For now toStrudel emits the structural Stack (no recovery); a
      // future bidirectional-editing pass (#8) can shape-match and
      // re-emit `.off(t, …)`. Accepted soft target per CONTEXT round-trip
      // discipline (which applies fully only to 1:1 method↔tag mappings,
      // not desugars).
      //
      // PRE-01 (PR #70): parseTransform now receives the transform-arg
      // baseOffset; loc-attribution to non-Play nodes still deferred per
      // RESEARCH §2 Subtlety C — parity asserts loc PRESENCE, not value.
      const [tStr, transformStr] = splitFirstArg(args)
      const t = parseFloat(tStr.trim())
      if (isNaN(t)) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      // 19-05 / #74 D-09: inner Late carries tStr's range (the `0.125` arg
      // position). userMethod intentionally omitted — Late from .off() is a
      // synthetic intermediate, not directly authored. Reuse the existing
      // offsetOfSubArg helper (lines below) — same P39-aware whitespace
      // handling already used for transformOffset.
      const tStartAbs = offsetOfSubArg(args, tStr.trim(), baseOffset)
      const tEndAbs = tStartAbs + tStr.trim().length
      const lateBody = IR.late(t, ir, {
        loc: [{ start: tStartAbs, end: tEndAbs }],
        // userMethod intentionally undefined — synthetic intermediate (D-09).
      })
      const transformOffset = transformStr ? offsetOfSubArg(args, transformStr, baseOffset) : baseOffset
      const transformed = transformStr ? parseTransform(transformStr.trim(), lateBody, transformOffset) : lateBody
      // Outer Stack carries .off(...)'s call-site range + userMethod: 'off'.
      // Literal construction — rest-spread escape hatch (RESEARCH §11 Q1).
      const [offStart, offEnd] = callSiteRange
      return {
        tag: 'Stack' as const,
        tracks: [ir, transformed],
        loc: [{ start: offStart, end: offEnd }],
        userMethod: method, // 'off'
      }
    }

    case 'room':
    case 'delay':
    case 'reverb':
    case 'crush':
    case 'distort':
    case 'vowel':
    case 'begin':
    case 'end':
    case 'cut':
    case 'cutoff':
    case 'resonance':
    case 'lpf':
    case 'hpf': {
      // FX group — 13 arms after Phase 20-10 migrated `speed` to Param.
      const val = parseFloat(args.trim())
      if (!isNaN(val)) return IR.fx(method, { [method]: val }, ir, tagMeta(method, callSiteRange))
      return wrapAsOpaque(ir, method, args, callSiteRange)
    }

    case 'pick': {
      // Tier 4 (Phase 19-04 Task T-02). `.pick(lookup)` per pick.mjs:44-54:
      //   pat.fmap(i => lookup[clamp(round(i), 0, len-1)]).innerJoin()
      // For each event of the receiver (`ir`, the selector pattern), the
      // value (cast to int + clamp) selects a sub-pattern from the lookup
      // array; that sub-pattern plays at the selector event's time slot.
      //
      // First IR shape that takes a list of sub-patterns as data (not a
      // transform function) — Pick is the prototype for the family
      // (inhabit, pickF, pickmod, pickRestart, pickReset, pickOut).
      // RESEARCH §1.4.
      //
      // v1 limitation: array-form lookup only; object/named-key form
      // (Strudel's `pick({a: ..., b: ...})`) deferred to a follow-up.
      const inner = args.trim()
      if (!(inner.startsWith('[') && inner.endsWith(']'))) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      const arrayBody = inner.slice(1, -1)
      const elements = splitArgs(arrayBody)
      if (elements.length === 0) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      // Compute the absolute baseOffset of the array body within the
      // user's full code (skip the opening '[' inside args).
      const arrayBodyOffsetInArgs = args.indexOf('[') + 1
      const arrayBodyOffset = arrayBodyOffsetInArgs >= 1
        ? baseOffset + arrayBodyOffsetInArgs
        : baseOffset
      const lookup = elements.map(e => {
        const elemOffset = offsetOfSubArg(arrayBody, e.trim(), arrayBodyOffset)
        return parseArrayLiteralElement(e, 'note', elemOffset)
      })
      return IR.pick(ir, lookup, tagMeta(method, callSiteRange))
    }

    case 'struct': {
      // Tier 4 (Phase 19-04 Task T-03). `.struct(mask)` per pattern.mjs:1161:
      //   struct(mask) = this.keepif.out(mask)
      // _opOut is "structure from mask, values from this" — RE-TIMES this
      // pattern's value-stream to mask onsets. Distinct from `.mask("…")`
      // (When tag) which only GATES events through. RESEARCH §1.2; P43
      // (documented spec ≠ source — keepif.out is the implementation truth).
      //
      // mask is a quoted mini-notation string; we carry it raw on the IR
      // (matches When.gate precedent — sub-IR form deferred per RESEARCH §8.2).
      const gateMatch = args.trim().match(/^"([^"]*)"$/)
      if (gateMatch) return IR.struct(gateMatch[1], ir, tagMeta(method, callSiteRange))
      return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
    }

    case 'swing': {
      // Tier 4 (Phase 19-04 Task T-04). `.swing(n)` per pattern.mjs:2193:
      //   swing(n, pat) = pat.swingBy(1/3, n)
      //                 = pat.inside(n, late(seq(0, 1/6)))   (pattern.mjs:2184)
      //
      // Narrow tag per D-03 — we model swing directly via slot-index
      // lateness in the collect arm, NOT through an Inside primitive
      // (which would warrant its own phase with outside/zoom/compress
      // siblings). When Inside lands, the Swing collect arm rewrites
      // (~10 lines); the IR shape `{ n; body }` is locked to keep that
      // migration cheap. RESEARCH §1.3.
      const n = parseInt(args.trim(), 10)
      if (isNaN(n) || n < 1) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      return IR.swing(n, ir, tagMeta(method, callSiteRange))
    }

    case 'shuffle': {
      // Tier 4 (Phase 19-04 Task T-06). `.shuffle(n)` per signal.mjs:
      // 392-394:
      //   shuffle(n, pat) = _rearrangeWith(randrun(n), n, pat)
      // Slices pat into n parts, plays them in a random per-cycle
      // PERMUTATION (each part exactly once). Forced tag per PV28 (named
      // after the user-typed method); collect arm + shared helper landed
      // in T-05. Parity test in T-07. RESEARCH §1.5; PK11 step 5.
      const n = parseInt(args.trim(), 10)
      if (isNaN(n) || n < 1) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      return IR.shuffle(n, ir, tagMeta(method, callSiteRange))
    }

    case 'scramble': {
      // Tier 4 (Phase 19-04 Task T-06). `.scramble(n)` per signal.mjs:
      // 405-407:
      //   scramble(n, pat) = _rearrangeWith(_irand(n)._segment(n), n, pat)
      // Slices pat into n parts and INDEPENDENTLY samples each slot's
      // source — parts may repeat or not appear at all per cycle. Forced
      // tag per PV28; collect arm + shared helper landed in T-05. Parity
      // test in T-07. RESEARCH §1.6; PK11 step 5.
      const n = parseInt(args.trim(), 10)
      if (isNaN(n) || n < 1) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      return IR.scramble(n, ir, tagMeta(method, callSiteRange))
    }

    case 'chop': {
      // Tier 4 (Phase 19-04 Task T-08). `.chop(n)` per pattern.mjs:
      // 3291-3306:
      //   chop(n, pat) = pat.squeezeBind(o => sequence(slice_objects.map(s => merge(o, s))))
      // Per-event sample-range slicing: each source event becomes n
      // sub-events whose time and `begin`/`end` controls carve up the
      // original event. D-04: pattern-level only — audio buffer slicing
      // is axis-5 work, deferred to phase 22. Forced tag per PV28
      // (squeezeBind has no Fast equivalent; same trap as Ply). RESEARCH
      // §1.7; PK11 step 5.
      const n = parseInt(args.trim(), 10)
      if (isNaN(n) || n < 1) return wrapAsOpaque(ir, method, args, callSiteRange)   // D-03 (P33 / PV37)
      return IR.chop(n, ir, tagMeta(method, callSiteRange))
    }

    case 'p': {
      // Phase 20-11 D-01/D-02 — `.p("name")` overrides auto `d{N}` from $:.
      // The 20-04 Chesterton (`return ir`) was correct under the PV37
      // REPRESENTATION model but the musician-track-identity model (PV35)
      // needs the SEMANTICS pair — mirror Param's promotion (20-10).
      //
      // Single decision (P50 — no fallback ladders): `args` is a content-
      // bearing string literal (with surrounding quotes after the parser's
      // arg extraction) → Track wrap. Anything else (no args, non-string,
      // empty string, mini-syntax inside the literal) falls back to
      // wrapAsOpaque (PV37 preserved; round-trip via toStrudel `.via.method/
      // args` still emits `.p(...)` byte-for-byte).
      //
      // Identifier-only quoted string with optional spaces / `:.-_`. Brackets,
      // angle-brackets, star, tilde, pipe excluded — anything mini-syntax
      // routes through wrapAsOpaque so the user's intent is preserved as a
      // typed source fragment.
      // Phase 20-11 wave-δ — accept BOTH single and double-quoted string
      // literals. Strudel's transpiler converts double-quoted strings
      // to mini-notation Patterns at runtime, so `.p("name")` will
      // CRASH at eval time (Strudel's .p calls `id.includes("$")` on
      // the resulting Pattern object). The working idiom is single
      // quotes: `.p('name')`. We accept both at the IR level so the
      // Track wrap still happens even if the user types double quotes
      // (the timeline shows the right row; the runtime fails
      // separately and we no-op in the StrudelEngine wrapper).
      const trimmed = args.trim()
      const strMatch = trimmed.match(
        /^(?:"([a-zA-Z0-9_\-][a-zA-Z0-9_:.\- ]*?)"|'([a-zA-Z0-9_\-][a-zA-Z0-9_:.\- ]*?)')$/,
      )
      const name = strMatch?.[1] ?? strMatch?.[2]
      if (!name) {
        // Empty / mini-syntax / non-string / no args / backtick mini —
        // preserve PV37.
        return wrapAsOpaque(ir, method, args, callSiteRange)
      }
      return IR.track(name, ir, tagMeta(method, callSiteRange))
    }

    case 's':
    case 'n':
    case 'note':
    case 'bank':
    case 'scale':
    case 'color':
    case 'freq':
    case 'gain':
    case 'velocity':
    case 'pan':
    case 'speed': {
      // Phase 20-10 — Param tag promotion. Whitelist closes the SEMANTICS
      // gap that 20-04 left open for REPRESENTATION. PV37 still governs
      // everything outside this whitelist (default arm wraps as opaque).
      //
      // Phase 20-12 D-06 — `freq` added so chrome's Y-as-pitch can read
      // `evt.params.freq` (β-4 extractPitch). Pre-20-12 `.freq(440)`
      // wrapped as opaque Code via the default arm and `evt.params.freq`
      // was always undefined. Numeric → Param; non-numeric / pattern args
      // fall through parseParamArg's null-return → wrapAsOpaque (PV37
      // wrap-never-drop preserved; P50 single-decision — no third path).
      //
      // Phase 20-12 wave-δ — `freq` is numeric-only. `parseParamArg` arms
      // 2 + 3 (literal-string / mini-pattern) accept quoted args for
      // pattern-friendly Params (`.s("<bd cp>")` etc.) but `.freq(...)`
      // is fundamentally a Hz literal: a pattern-arg `.freq("<200 880>")`
      // resolves to a per-cycle number that chrome's `extractPitch` then
      // Y-staircases — which would silently violate PV37 (chrome reading
      // pitch from a wrap-as-opaque shape). Gate freq to numeric here so
      // pattern-arg freq lands in `wrapAsOpaque` like any other unmodelled
      // call. P50 single-decision preserved; PV37 wrap-never-drop intact.
      const isSampleKey = method === 's' || method === 'bank' || method === 'scale'
      const parsed = parseParamArg(args, isSampleKey, baseOffset)
      if (!parsed) {
        // Unrecognised arg shape — preserve PV37 (wrap-never-drop, REPRESENTATION).
        return wrapAsOpaque(ir, method, args, callSiteRange)
      }
      if (method === 'freq' && typeof parsed.value !== 'number') {
        // Pattern-arg freq is wrap-as-opaque per PV37; chrome must not see
        // pattern-resolved Hz on `evt.params.freq`. See 20-δ rationale above.
        return wrapAsOpaque(ir, method, args, callSiteRange)
      }
      return IR.param(method, parsed.value, args, ir, tagMeta(method, callSiteRange))
    }

    default:
      // Phase 20-04 T-04 / DV-06 (D-03 / P33 / PV37): unrecognised method —
      // wrap as opaque Code carrying the call site. PV37 wrap-never-drop;
      // round-trip via toStrudel (D-02); collect walks via.inner via
      // withWrapperLoc (20-03 wave ε / D-01).
      return wrapAsOpaque(ir, method, args, callSiteRange)
  }
}

// ---------------------------------------------------------------------------
// Test hook (PRE-01 / PR #70): record the most recent baseOffset received
// by parseTransform so a parity-harness probe can assert that multi-arg
// methods thread non-zero offsets through the call chain. Internal — not
// part of the public API. Reset between tests via __resetParseTransformDebug.
// ---------------------------------------------------------------------------
let __lastParseTransformBaseOffset = -1
let __parseTransformCallCount = 0
export function __resetParseTransformDebug(): void {
  __lastParseTransformBaseOffset = -1
  __parseTransformCallCount = 0
}
export function __getLastParseTransformBaseOffset(): number {
  return __lastParseTransformBaseOffset
}
export function __getParseTransformCallCount(): number {
  return __parseTransformCallCount
}

/**
 * Parse a transform function used in .every() / .sometimes() / .off() / .jux() / .chunk().
 * e.g. "fast(2)", "rev", "x => x.fast(2)"
 *
 * `baseOffset` is the absolute char offset of `transformStr[0]` in the
 * user's full code (PRE-01 precursor — signature-level threading; loc
 * attribution to non-Play nodes is deferred per RESEARCH §2 Subtlety C).
 */
function parseTransform(transformStr: string, defaultIr: PatternIR, baseOffset = 0): PatternIR {
  __lastParseTransformBaseOffset = baseOffset
  __parseTransformCallCount++

  const str = transformStr.trim()

  // 19-05 / #74 D-10: callSiteRange covers the whole bare-form expression
  // (`fast(2)` / `slow(2)`). For arrow paths, the recursive applyChain
  // computes per-method callSiteRange — this outer range is unused there.
  const trimmedStart = baseOffset + (transformStr.length - transformStr.trimStart().length)
  const callSiteRange: [number, number] = [trimmedStart, trimmedStart + str.length]

  // fast(n)
  const fastMatch = str.match(/^fast\s*\(\s*([0-9.]+)\s*\)$/)
  if (fastMatch) {
    const n = parseFloat(fastMatch[1])
    if (!isNaN(n)) return IR.fast(n, defaultIr, tagMeta('fast', callSiteRange))
  }

  // slow(n)
  const slowMatch = str.match(/^slow\s*\(\s*([0-9.]+)\s*\)$/)
  if (slowMatch) {
    const n = parseFloat(slowMatch[1])
    if (!isNaN(n)) return IR.slow(n, defaultIr, tagMeta('slow', callSiteRange))
  }

  // Arrow function like "x => x.fast(2)" — recurse with the chain offset
  // adjusted to the position of `.fast(...)` inside the arrow body.
  const arrowMatch = str.match(/^[a-z]\s*=>\s*[a-z]\s*\.(.+)$/)
  if (arrowMatch) {
    const dotIdx = str.indexOf('.', str.indexOf('=>'))
    const chainStartInTrimmed = dotIdx >= 0 ? dotIdx : 0
    const leadingWs = transformStr.length - transformStr.trimStart().length
    const chainOffset = baseOffset + leadingWs + chainStartInTrimmed
    return applyChain(defaultIr, '.' + arrowMatch[1], chainOffset)
  }

  return defaultIr
}

/**
 * Phase 20-10 — recognise the arg shape for a whitelisted Param method.
 * Returns null when the shape doesn't match; caller wraps as opaque
 * (preserves PV37). Shapes:
 *   - literal-number:  gain(0.3) / pan(-0.5)         → { value: 0.3 }
 *   - literal-string:  s("sawtooth") / bank("RolandTR909")  → { value: "sawtooth" }
 *   - mini-pattern:    s("<bd cp>") / gain("0.3 0.7")  → { value: PatternIR (sub-IR) }
 *
 * Boundary: any quoted string with internal whitespace OR mini-syntax
 * characters (`<`, `>`, `[`, `]`, `*`, `?`, `~`) goes to the mini-pattern
 * path. Strudel runtime parses it as mini at that point too. Identifier-
 * only quoted strings (`/^"[a-zA-Z0-9#_:-]*?"$/`) take the literal path.
 *
 * baseOffset threading: when a quoted string parses as mini, the inner
 * string's offset (for click-to-source on inner atoms — PV25 / PV36)
 * is `argsOffsetAbs + args.indexOf('"') + 1`. Same convention parseRoot
 * uses for `s(...)` at root (parseStrudel.ts:223-224).
 */
function parseParamArg(
  args: string,
  isSampleKey: boolean,
  argsOffsetAbs: number,
): { value: string | number | PatternIR } | null {
  const trimmed = args.trim()
  // 1. literal-number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { value: parseFloat(trimmed) }
  }
  // 2. literal-string (identifier-only — no spaces, no mini-syntax)
  const strMatch = trimmed.match(/^"([a-zA-Z0-9#_:-]*?)"$/)
  if (strMatch) return { value: strMatch[1] }
  // 3. mini-pattern (anything else inside quotes)
  const miniMatch = trimmed.match(/^"([^"]*)"$/)
  if (miniMatch) {
    const innerStr = miniMatch[1]
    const quoteIdx = args.indexOf('"')
    const innerOffsetAbs = quoteIdx >= 0 ? argsOffsetAbs + quoteIdx + 1 : argsOffsetAbs
    return { value: parseMini(innerStr, isSampleKey, innerOffsetAbs) }
  }
  return null   // unknown shape — caller wraps as opaque
}

/**
 * Parse a single element of an array-literal arg (used by `.pick([...])`).
 *
 * Three shapes are recognised:
 *   1. Bare quoted-string: `"g a"` or `'c'` — wrapped per receiver context
 *      (defaults to `note(...)`). This handles the docstring shape from
 *      pick.mjs:35-37 — `pick(["g a", "e f", ...])` — where bare strings
 *      need to become miniNotation patterns. Per RESEARCH §1.4 / pre-mortem
 *      #10: receiver-context detection is v1-limited to a fixed default.
 *   2. Bare numeric literal: `0`, `1.5` — wrapped as `note(...)` so the
 *      element produces a Play with that note value.
 *   3. Already a full Strudel expression: `note("c")`, `s("bd")`,
 *      `mini("...")` — parsed directly via parseExpression.
 *
 * `baseOffset` is the absolute char offset of `elem[0]` within the user's
 * full code (PV25 — parser preserves offsets at every hop).
 */
function parseArrayLiteralElement(
  elem: string,
  receiverContext: 'note' | 's',
  baseOffset = 0,
): PatternIR {
  const trimmed = elem.trim()
  const leadingWs = elem.length - elem.trimStart().length
  if (!trimmed) return IR.pure()

  // Bare quoted-string: wrap in receiver context to give parseExpression
  // a parseable shape. Adjust baseOffset to point at the wrapper's quote
  // — internally parseRoot computes the inner mini's offset from the
  // wrapper, but the user's code has just `"..."`, so the inner offset
  // relative to the wrapper compensates by `(receiverContext.length + 1)`
  // chars (e.g. `note(` = 5 chars). This keeps Play.loc on the actual
  // user-source positions.
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const wrapped = `${receiverContext}(${trimmed})`
    // The wrapper adds `note(` (5 chars) before the quote. parseExpression
    // → parseRoot parses `note("...")` and reads inner mini at offset
    // `quoteIdx + 1`. quoteIdx within the wrapper is `receiverContext.length + 1`.
    // To compensate, pass a baseOffset that's behind by `receiverContext.length + 1`
    // chars so the absolute innerOffset lands at the user's actual quote+1.
    const wrapperPrefix = receiverContext.length + 1
    return parseExpression(wrapped, baseOffset + leadingWs - wrapperPrefix)
  }

  // Bare numeric literal: wrap in note(...) so it parses as a Play.
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const wrapped = `${receiverContext}("${trimmed}")`
    const wrapperPrefix = receiverContext.length + 1 + 1  // note( + opening quote
    return parseExpression(wrapped, baseOffset + leadingWs - wrapperPrefix)
  }

  // Full expression — parse as-is.
  return parseExpression(trimmed, baseOffset + leadingWs)
}

/**
 * Compute the absolute baseOffset of `subArg` within `args`, given that
 * `args` itself starts at `argsBaseOffset` in the user's full code.
 * Falls back to argsBaseOffset if subArg can't be located (defensive —
 * shouldn't happen since splitFirstArg returns substrings).
 */
function offsetOfSubArg(args: string, subArg: string, argsBaseOffset: number): number {
  const trimmedSub = subArg.trim()
  if (!trimmedSub) return argsBaseOffset
  const idx = args.indexOf(trimmedSub)
  return idx >= 0 ? argsBaseOffset + idx : argsBaseOffset
}

// ---------------------------------------------------------------------------
// String manipulation utilities
// ---------------------------------------------------------------------------

/**
 * Split expression into root function call and method chain.
 * e.g. 'note("c4").fast(2).slow(3)' → { root: 'note("c4")', chain: '.fast(2).slow(3)' }
 *
 * Phase 20-14 parser-gap fix (cluster A) — bare-string-as-pattern.
 * Strudel's transpiler auto-promotes top-level string literals to
 * mini-patterns (e.g., `"0,2,[7 6]".add(...)`). When `expr[0]` is `"`,
 * the root is the quoted string (escapes respected) and the chain
 * starts at the char immediately after the closing quote.
 */
export function splitRootAndChain(expr: string): { root: string; chain: string } {
  let i = 0

  if (expr[0] === '"') {
    // Bare-string root — scan to matching closing quote (escape-aware,
    // single-line: mini-strings never span newlines in the corpus).
    i = 1
    while (i < expr.length && expr[i] !== '"') {
      if (expr[i] === '\\' && i + 1 < expr.length) {
        i += 2
        continue
      }
      i++
    }
    if (i < expr.length) i++ // consume closing quote
  } else if (expr[0] === '`') {
    // 20-15 G3 (#136) — backtick template-literal root. Mirrors the `"`
    // scan but DELIBERATELY allows `\n` inside: backtick mini-notation
    // strings legitimately span multiple lines (the single-line note on
    // the `"` arm above does NOT apply to backticks). Escape-aware for
    // `` \` ``. `${` is NOT special here — splitRootAndChain only finds
    // the root *boundary*; the `${}` → Code-fallback decision (D-04) is
    // made later in parseRoot where the captured inner is inspected.
    i = 1
    while (i < expr.length && expr[i] !== '`') {
      if (expr[i] === '\\' && i + 1 < expr.length) {
        i += 2
        continue
      }
      i++
    }
    if (i < expr.length) i++ // consume closing backtick
  } else {
    // Skip identifier
    while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) i++

    // If there's an opening paren, find the matching close
    if (i < expr.length && expr[i] === '(') {
      const closeIdx = findMatchingParen(expr, i)
      if (closeIdx !== -1) {
        i = closeIdx + 1
      }
    }
  }

  return {
    root: expr.slice(0, i),
    chain: expr.slice(i),
  }
}

/**
 * Extract the next .method(args) from a chain string.
 * Returns { method, args, rest, argsOffset } where rest is the remaining
 * chain and argsOffset is the position of args[0] within the input chain
 * (i.e., right after the opening paren). argsOffset is -1 when the method
 * has no parens.
 */
function extractNextMethod(chain: string): { method: string; args: string; rest: string; argsOffset: number } {
  // Must start with .
  if (!chain.startsWith('.')) return { method: '', args: '', rest: chain, argsOffset: -1 }

  let i = 1
  // Read method name
  let method = ''
  while (i < chain.length && /[a-zA-Z0-9_$]/.test(chain[i])) {
    method += chain[i++]
  }

  if (!method) return { method: '', args: '', rest: chain, argsOffset: -1 }

  // Read optional args in parens
  let args = ''
  let rest = chain.slice(i)
  let argsOffset = -1

  if (rest.startsWith('(')) {
    const closeIdx = findMatchingParen(rest, 0)
    if (closeIdx !== -1) {
      args = rest.slice(1, closeIdx)
      argsOffset = i + 1 // position of args[0] in chain (skip the open paren)
      rest = rest.slice(closeIdx + 1)
    }
  }

  return { method, args, rest, argsOffset }
}

/**
 * Find the index of the closing paren matching the open paren at startIdx.
 */
function findMatchingParen(str: string, startIdx: number): number {
  let depth = 0
  let inString = false
  let stringChar = ''

  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i]

    if (inString) {
      if (ch === stringChar && str[i - 1] !== '\\') inString = false
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      // 20-15 G3 (#136): backtick is a string delimiter too — without
      // this a `` ` `` inside args (e.g. `stack(s(`bd hh`))`) would not
      // suppress paren/bracket counting and the matcher mis-depths.
      inString = true
      stringChar = ch
      continue
    }

    if (ch === '(' || ch === '[' || ch === '{') depth++
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }

  return -1
}

/**
 * Extract the content inside the first balanced parens of a function call.
 * e.g. 'stack(a, b)' with prefix 'stack(' → 'a, b'
 */
function extractParenContent(expr: string, prefix: string): string | null {
  const start = expr.indexOf(prefix)
  if (start === -1) return null
  const parenStart = start + prefix.length - 1
  const closeIdx = findMatchingParen(expr, parenStart)
  if (closeIdx === -1) return null
  return expr.slice(parenStart + 1, closeIdx)
}

/**
 * Split comma-separated arguments, respecting balanced parens and strings.
 */
function splitArgs(argsStr: string): string[] {
  return splitArgsWithOffsets(argsStr).map((a) => a.value)
}

/**
 * Issue #107 — position-aware sibling of `splitArgs`. For each
 * comma-separated arg, returns the *trimmed* value AND the byte offset
 * of the trimmed arg's first character within `argsStr`. Callers thread
 * the offset down to `parseExpression(value, baseOffset + offset)` so
 * inner atom `loc` ranges resolve to absolute file positions.
 *
 * Without this, `stack(s("hh*8"), s("bd"))` parses each child at offset
 * 0 within its own slice — atom positions on the resulting events
 * collide with the file's first line (typically a comment), and
 * click-to-source navigates to the wrong place. The original `splitArgs`
 * comment in the stack arm ("Argument offsets are dropped here for v0")
 * was the explicit deferral; this is the v1 lift.
 */
function splitArgsWithOffsets(
  argsStr: string,
): Array<{ value: string; offset: number }> {
  const args: Array<{ value: string; offset: number }> = []
  let depth = 0
  let current = ''
  let currentStart = 0 // index in argsStr where `current` began
  let inString = false
  let stringChar = ''

  const pushCurrent = (): void => {
    if (current.trim().length === 0) return
    // 20-15 α-4 / #137 (G4): generalise the per-arg leading scan from
    // whitespace-only to the shared PV49 primitive so a leading
    // `// comment\n` (a whole-line comment between `stack()` args, OR a
    // comment after a `,` that the comma branch folded into the next
    // arg's leading region) is treated as consumed prefix — not as the
    // arg's first real char. Without this the arg substring begins with
    // `/`, `splitRootAndChain` reads `/` as the root, and the arg falls
    // to Code() (`Stack[Code,Code]` instead of `Stack[Play,Play]`).
    //
    // OFFSET CONTRACT (the α-4 pre-mortem mitigation): `consumed` is the
    // SINGLE source of truth — the trimmed value is sliced FROM
    // `consumed` and the offset is computed FROM the same `consumed`, so
    // they can never drift apart by the comment length. For the
    // no-comment case `consumed` === the old leading-`\s` count exactly
    // (the primitive consumes `\s` runs identically), so every existing
    // corpus snapshot + loc-fidelity entry is byte-for-byte unchanged.
    // Trailing whitespace is still trimmed (parity with the old
    // `current.trim()`); trailing trim never moves the START offset.
    const consumed = skipWhitespaceAndLineComments(current, 0)
    args.push({
      value: current.slice(consumed).trimEnd(),
      offset: currentStart + consumed,
    })
  }

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i]

    if (inString) {
      current += ch
      if (ch === stringChar && argsStr[i - 1] !== '\\') inString = false
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      // 20-15 G3 (#136): backtick is a string delimiter — a `,` inside a
      // `` `…` `` arg must NOT split it (e.g. `stack(s(`bd, hh`))`), and
      // a backtick inside an arg must not let comma-splitting see commas
      // that belong to the template literal.
      inString = true
      stringChar = ch
      if (current.length === 0) currentStart = i
      current += ch
      continue
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      depth++
      if (current.length === 0) currentStart = i
      current += ch
      continue
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--
      if (current.length === 0) currentStart = i
      current += ch
      continue
    }

    if (ch === ',' && depth === 0) {
      pushCurrent()
      current = ''
      currentStart = i + 1
    } else {
      if (current.length === 0) currentStart = i
      current += ch
    }
  }

  pushCurrent()
  return args
}

/**
 * Split "n, rest..." into [n, rest].
 * Respects balanced parens for the rest part.
 */
function splitFirstArg(argsStr: string): [string, string] {
  const parts = splitArgs(argsStr)
  if (parts.length === 0) return ['', '']
  if (parts.length === 1) return [parts[0], '']
  return [parts[0], parts.slice(1).join(', ')]
}
