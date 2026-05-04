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
import { parseMini } from './parseMini'

/** Parse a Strudel code string. Always returns a tree (Code node for unsupported). */
export function parseStrudel(code: string): PatternIR {
  if (!code.trim()) return IR.pure()

  try {
    // Split into track blocks ($: lines). Each carries the absolute
    // char offset of `expr[0]` within `code` so parseMini can attach
    // `loc` (source ranges) to Play nodes.
    const tracks = extractTracks(code)
    if (tracks.length === 0) {
      // No $: prefix — try parsing as a single expression at offset 0
      const trimStart = code.search(/\S/)
      return parseExpression(code.trim(), trimStart >= 0 ? trimStart : 0)
    }
    if (tracks.length === 1) {
      return parseExpression(tracks[0].expr, tracks[0].offset)
    }
    return IR.stack(...tracks.map(t => parseExpression(t.expr, t.offset)))
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
function extractTracks(code: string): { expr: string; offset: number }[] {
  const tracks: { expr: string; offset: number }[] = []
  // Match `$:` at the start of a line (allowing leading whitespace).
  const dollarRe = /^[ \t]*\$:/gm
  const starts: { dollarStart: number; bodyStart: number }[] = []
  let m: RegExpExecArray | null
  while ((m = dollarRe.exec(code))) {
    // bodyStart points after `$:` and any post-colon whitespace on the
    // same physical line. Tracks may continue on subsequent lines.
    const after = m.index + m[0].length
    let bodyStart = after
    while (bodyStart < code.length && (code[bodyStart] === ' ' || code[bodyStart] === '\t')) {
      bodyStart++
    }
    starts.push({ dollarStart: m.index, bodyStart })
  }
  if (starts.length === 0) return []

  for (let i = 0; i < starts.length; i++) {
    const { bodyStart } = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1].dollarStart : code.length
    const slice = code.slice(bodyStart, end)
    // Trailing whitespace can stay — parseExpression handles it. We
    // keep the leading slice intact so offsets line up.
    tracks.push({ expr: slice, offset: bodyStart })
  }
  return tracks
}

// ---------------------------------------------------------------------------
// Expression parser
// ---------------------------------------------------------------------------

/**
 * Parse a single Strudel expression (with optional method chain).
 * `baseOffset` is the absolute char offset of `expr[0]` within the
 * user's full code, so leaf parsers can attach `loc` to Play nodes.
 *
 * e.g. 'note("c4 e4").fast(2).every(4, fast(2))'
 */
function parseExpression(expr: string, baseOffset = 0): PatternIR {
  if (!expr.trim()) return IR.pure()

  try {
    // Compute the offset of `expr.trim()[0]` within `code` so the
    // root parser can locate the inner mini-notation string accurately.
    const leadingWs = expr.length - expr.trimStart().length
    const trimmedOffset = baseOffset + leadingWs

    // Extract root function call and remaining method chain
    const { root, chain } = splitRootAndChain(expr.trim())

    // Parse the root — if it can't be parsed, fall back to full expression as Code
    const rootIR = parseRoot(root, trimmedOffset)
    if (rootIR.tag === 'Code' && !chain.trim()) {
      // Entire expression is opaque — preserve full original expression
      return IR.code(expr)
    }
    if (rootIR.tag === 'Code') {
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
function parseRoot(root: string, baseOffset = 0): PatternIR {
  const trimmed = root.trim()
  const leadingWs = root.length - root.trimStart().length

  // note("...") or n("...")
  const noteMatch = trimmed.match(/^(?:note|n)\s*\(\s*"([^"]*)"\s*\)/)
  if (noteMatch) {
    // Position of the opening quote within `trimmed`, then +1 to skip it.
    const quoteIdx = noteMatch[0].indexOf('"')
    const innerOffset = baseOffset + leadingWs + quoteIdx + 1
    return parseMini(noteMatch[1], false, innerOffset)
  }

  // s("...") — sample pattern
  const sMatch = trimmed.match(/^s\s*\(\s*"([^"]*)"\s*\)/)
  if (sMatch) {
    const quoteIdx = sMatch[0].indexOf('"')
    const innerOffset = baseOffset + leadingWs + quoteIdx + 1
    return parseMini(sMatch[1], true, innerOffset)
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

  // stack(a, b, c) — parallel composition. Argument offsets are
  // dropped here for v0 — when a future consumer needs loc through
  // stack(), splitArgs would need to return slice positions too.
  const stackMatch = trimmed.match(/^stack\s*\(/)
  if (stackMatch) {
    const inner = extractParenContent(trimmed, 'stack(')
    if (inner !== null) {
      const args = splitArgs(inner)
      const tracks = args.map(a => parseExpression(a.trim()))
      if (tracks.length === 0) return IR.pure()
      if (tracks.length === 1) return tracks[0]
      return IR.stack(...tracks)
    }
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
function applyChain(ir: PatternIR, chain: string, baseOffset = 0): PatternIR {
  if (!chain.trim()) return ir

  const leadingWs = chain.length - chain.trimStart().length
  let remaining = chain.trim()
  let remainingOffset = baseOffset + leadingWs
  let current = ir

  while (remaining.startsWith('.')) {
    const { method, args, rest, argsOffset } = extractNextMethod(remaining)
    if (!method) break

    // argsOffset is -1 when the method has no parens. We pass 0-args
    // calls through with baseOffset = remainingOffset (still > 0 for any
    // non-leading method) so the precursor test's "non-zero" assertion
    // holds even on chains that mix paren-less and paren-ful methods.
    const argsAbsoluteOffset = argsOffset >= 0 ? remainingOffset + argsOffset : remainingOffset
    current = applyMethod(current, method, args, argsAbsoluteOffset)

    // Advance remainingOffset by however many chars `extractNextMethod`
    // consumed from `remaining` (i.e., remaining.length - rest.length).
    remainingOffset += remaining.length - rest.length
    remaining = rest
  }

  return current
}

/**
 * Apply a single method call to an IR node.
 * `baseOffset` is the absolute char offset of `args[0]` in the user's
 * full code (or of the method name itself for paren-less methods),
 * threaded forward to any parseTransform calls.
 */
function applyMethod(ir: PatternIR, method: string, args: string, baseOffset = 0): PatternIR {
  switch (method) {
    case 'fast': {
      const n = parseFloat(args.trim())
      if (!isNaN(n)) return IR.fast(n, ir)
      return ir
    }

    case 'slow': {
      const n = parseFloat(args.trim())
      if (!isNaN(n)) return IR.slow(n, ir)
      return ir
    }

    case 'every': {
      // .every(n, transform)
      const [nStr, transformStr] = splitFirstArg(args)
      const n = parseInt(nStr.trim(), 10)
      if (isNaN(n)) return ir
      const transformOffset = transformStr ? offsetOfSubArg(args, transformStr, baseOffset) : baseOffset
      const transform = transformStr ? parseTransform(transformStr.trim(), ir, transformOffset) : ir
      return IR.every(n, transform, ir)
    }

    case 'sometimes': {
      // .sometimes(transform) → Choice(0.5, transform(body), body)
      const transform = args.trim()
        ? parseTransform(args.trim(), ir, baseOffset + (args.length - args.trimStart().length))
        : ir
      return IR.choice(0.5, transform, ir)
    }

    case 'sometimesBy': {
      // .sometimesBy(p, transform)
      const [pStr, transformStr] = splitFirstArg(args)
      const p = parseFloat(pStr.trim())
      if (isNaN(p)) return ir
      const transformOffset = transformStr ? offsetOfSubArg(args, transformStr, baseOffset) : baseOffset
      const transform = transformStr ? parseTransform(transformStr.trim(), ir, transformOffset) : ir
      return IR.choice(p, transform, ir)
    }

    case 'mask': {
      // .mask("gate") → When
      const gateMatch = args.trim().match(/^"([^"]*)"$/)
      if (gateMatch) return IR.when(gateMatch[1], ir)
      return ir
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
      if (argList.length === 0) return ir
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
      return IR.stack(...tracks)
    }

    case 'gain': {
      const val = parseFloat(args.trim())
      if (!isNaN(val)) return IR.fx('gain', { gain: val }, ir)
      return ir
    }

    case 'pan': {
      const val = parseFloat(args.trim())
      if (!isNaN(val)) return IR.fx('pan', { pan: val }, ir)
      return ir
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
      if (isNaN(n) || n < 1) return ir
      const transformOffset = transformStr ? offsetOfSubArg(args, transformStr, baseOffset) : baseOffset
      const transform = transformStr ? parseTransform(transformStr.trim(), ir, transformOffset) : ir
      return IR.chunk(n, transform, ir)
    }

    case 'degrade': {
      // Tier 4 (Phase 19-03 Task 07). `.degrade()` shorthand for
      // `.degradeBy(0.5)` (signal.mjs:720). Our Degrade.p is the
      // retention probability; 50% drop ⇒ 50% retain ⇒ p = 0.5.
      return IR.degrade(0.5, ir)
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
      if (isNaN(amount)) return ir
      return IR.degrade(1 - amount, ir)
    }

    case 'late': {
      // Tier 4 (Phase 19-03 Task 03). `.late(t)` shifts events forward by
      // `t` cycles while preserving cycle length (pattern.mjs:2081-2089).
      // Modeled as the Late IR tag (Task 02). Decimal literals only —
      // fraction literals like `.late(1/8)` fall back to identity (same
      // limitation `.fast()` has today).
      const t = parseFloat(args.trim())
      if (isNaN(t)) return ir
      return IR.late(t, ir)
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
      return IR.stack(
        IR.fx('pan', { pan: -1 }, ir),
        IR.fx('pan', { pan: 1 }, transformed),
      )
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
      if (!Number.isInteger(n) || n < 1) return ir
      if (n === 1) return ir
      return IR.ply(n, ir)
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
      if (isNaN(t)) return ir
      const lateBody = IR.late(t, ir)
      const transformOffset = transformStr ? offsetOfSubArg(args, transformStr, baseOffset) : baseOffset
      const transformed = transformStr ? parseTransform(transformStr.trim(), lateBody, transformOffset) : lateBody
      return IR.stack(ir, transformed)
    }

    case 'room':
    case 'delay':
    case 'reverb':
    case 'crush':
    case 'distort':
    case 'vowel':
    case 'speed':
    case 'begin':
    case 'end':
    case 'cut':
    case 'cutoff':
    case 'resonance':
    case 'lpf':
    case 'hpf': {
      const val = parseFloat(args.trim())
      if (!isNaN(val)) return IR.fx(method, { [method]: val }, ir)
      return ir
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
      if (!(inner.startsWith('[') && inner.endsWith(']'))) return ir
      const arrayBody = inner.slice(1, -1)
      const elements = splitArgs(arrayBody)
      if (elements.length === 0) return ir
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
      return IR.pick(ir, lookup)
    }

    case 'p':
      // .p("trackId") — track assignment, pass through
      return ir

    default:
      // Unsupported method — wrap in Code fallback with original ir preserved
      return ir
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

  // fast(n)
  const fastMatch = str.match(/^fast\s*\(\s*([0-9.]+)\s*\)$/)
  if (fastMatch) {
    const n = parseFloat(fastMatch[1])
    if (!isNaN(n)) return IR.fast(n, defaultIr)
  }

  // slow(n)
  const slowMatch = str.match(/^slow\s*\(\s*([0-9.]+)\s*\)$/)
  if (slowMatch) {
    const n = parseFloat(slowMatch[1])
    if (!isNaN(n)) return IR.slow(n, defaultIr)
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
 */
function splitRootAndChain(expr: string): { root: string; chain: string } {
  // Find the end of the first balanced function call
  let i = 0

  // Skip identifier
  while (i < expr.length && /[a-zA-Z0-9_$]/.test(expr[i])) i++

  // If there's an opening paren, find the matching close
  if (i < expr.length && expr[i] === '(') {
    const closeIdx = findMatchingParen(expr, i)
    if (closeIdx !== -1) {
      i = closeIdx + 1
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

    if (ch === '"' || ch === "'") {
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
  const args: string[] = []
  let depth = 0
  let current = ''
  let inString = false
  let stringChar = ''

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i]

    if (inString) {
      current += ch
      if (ch === stringChar && argsStr[i - 1] !== '\\') inString = false
      continue
    }

    if (ch === '"' || ch === "'") {
      inString = true
      stringChar = ch
      current += ch
      continue
    }

    if (ch === '(' || ch === '[' || ch === '{') { depth++; current += ch; continue }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; current += ch; continue }

    if (ch === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }

  if (current.trim()) args.push(current.trim())
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
