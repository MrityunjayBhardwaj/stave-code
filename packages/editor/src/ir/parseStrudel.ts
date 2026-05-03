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

    // Walk the method chain, wrapping ir
    const ir = applyChain(rootIR, chain)

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
 */
function applyChain(ir: PatternIR, chain: string): PatternIR {
  if (!chain.trim()) return ir

  let remaining = chain.trim()
  let current = ir

  while (remaining.startsWith('.')) {
    const { method, args, rest } = extractNextMethod(remaining)
    if (!method) break

    current = applyMethod(current, method, args)
    remaining = rest
  }

  return current
}

/** Apply a single method call to an IR node. */
function applyMethod(ir: PatternIR, method: string, args: string): PatternIR {
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
      const transform = transformStr ? parseTransform(transformStr.trim(), ir) : ir
      return IR.every(n, transform, ir)
    }

    case 'sometimes': {
      // .sometimes(transform) → Choice(0.5, transform(body), body)
      const transform = args.trim() ? parseTransform(args.trim(), ir) : ir
      return IR.choice(0.5, transform, ir)
    }

    case 'sometimesBy': {
      // .sometimesBy(p, transform)
      const [pStr, transformStr] = splitFirstArg(args)
      const p = parseFloat(pStr.trim())
      if (isNaN(p)) return ir
      const transform = transformStr ? parseTransform(transformStr.trim(), ir) : ir
      return IR.choice(p, transform, ir)
    }

    case 'mask': {
      // .mask("gate") → When
      const gateMatch = args.trim().match(/^"([^"]*)"$/)
      if (gateMatch) return IR.when(gateMatch[1], ir)
      return ir
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

    case 'p':
      // .p("trackId") — track assignment, pass through
      return ir

    default:
      // Unsupported method — wrap in Code fallback with original ir preserved
      return ir
  }
}

/**
 * Parse a transform function used in .every() / .sometimes().
 * e.g. "fast(2)", "rev", "x => x.fast(2)"
 */
function parseTransform(transformStr: string, defaultIr: PatternIR): PatternIR {
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

  // Arrow function like "x => x.fast(2)"
  const arrowMatch = str.match(/^[a-z]\s*=>\s*[a-z]\s*\.(.+)$/)
  if (arrowMatch) {
    return applyChain(defaultIr, '.' + arrowMatch[1])
  }

  return defaultIr
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
 * Returns { method, args, rest } where rest is the remaining chain.
 */
function extractNextMethod(chain: string): { method: string; args: string; rest: string } {
  // Must start with .
  if (!chain.startsWith('.')) return { method: '', args: '', rest: chain }

  let i = 1
  // Read method name
  let method = ''
  while (i < chain.length && /[a-zA-Z0-9_$]/.test(chain[i])) {
    method += chain[i++]
  }

  if (!method) return { method: '', args: '', rest: chain }

  // Read optional args in parens
  let args = ''
  let rest = chain.slice(i)

  if (rest.startsWith('(')) {
    const closeIdx = findMatchingParen(rest, 0)
    if (closeIdx !== -1) {
      args = rest.slice(1, closeIdx)
      rest = rest.slice(closeIdx + 1)
    }
  }

  return { method, args, rest }
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
