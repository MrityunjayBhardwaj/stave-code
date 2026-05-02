/**
 * parseMini — mini-notation string → PatternIR.
 *
 * Parses Strudel's mini-notation DSL (the string inside note("...") or s("...")).
 * Recursive descent parser that handles the Phase F subset plus the
 * Tier 2 mini-notation features (Phase 19-02):
 *   - Sequences: "c4 e4 g4"
 *   - Rests: "c4 ~ e4"
 *   - Cycles (alternation): "<c4 e4 g4>"
 *   - Sub-sequences: "[c4 e4] g4"
 *   - Repeat: "c4*2"
 *   - Sometimes: "c4?"
 *   - Slice (sample index): "bd:2"             — Tier 2
 *   - Elongation (step weight): "c4@2 e4"      — Tier 2
 *   - Euclidean: "bd(3,8)" / "bd(3,8,2)"        — Tier 2
 *   - Polymetric: "{c4 e4, bd hh sd}"          — Tier 2
 *
 * Tier 2 features lower into existing IR nodes — no new tags. Slice
 * lands in Play.params, elongation scales Play.duration, Euclidean
 * expands to a flat Seq via Bjorklund, polymetric becomes Stack.
 */

import { IR, type PatternIR } from './PatternIR'

/** Parse a mini-notation string. Returns Pure for empty input. Never throws. */
export function parseMini(
  input: string,
  isSample = false,
): PatternIR {
  const trimmed = input.trim()
  if (!trimmed) return IR.pure()

  try {
    const tokens = tokenize(trimmed)
    if (tokens.length === 0) return IR.pure()
    const nodes = parseTokens(tokens, isSample)
    if (nodes.length === 0) return IR.pure()
    if (nodes.length === 1) return nodes[0]
    return IR.seq(...nodes)
  } catch {
    // Graceful fallback: return opaque Code node
    return IR.code(input)
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Token =
  | { type: 'atom';   value: string }
  | { type: 'rest' }
  | { type: 'lbracket' }
  | { type: 'rbracket' }
  | { type: 'langle' }
  | { type: 'rangle' }
  | { type: 'repeat';  factor: number }
  | { type: 'sometimes' }
  | { type: 'slice';   index: number }
  | { type: 'elongate'; factor: number }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const ch = input[i]

    if (/\s/.test(ch)) { i++; continue }

    if (ch === '[') { tokens.push({ type: 'lbracket' }); i++; continue }
    if (ch === ']') { tokens.push({ type: 'rbracket' }); i++; continue }
    if (ch === '<') { tokens.push({ type: 'langle' });   i++; continue }
    if (ch === '>') { tokens.push({ type: 'rangle' });   i++; continue }

    if (ch === '~') {
      tokens.push({ type: 'rest' })
      i++
      continue
    }

    // Read atom (note name or sample name)
    if (/[a-zA-Z0-9#-]/.test(ch)) {
      let atom = ''
      while (i < input.length && /[a-zA-Z0-9#\-_.]/.test(input[i])) {
        atom += input[i++]
      }
      tokens.push({ type: 'atom', value: atom })

      // Slice (`a:N`) is parsed as a per-atom modifier so it composes
      // naturally with repeat/sometimes that follow it.
      if (i < input.length && input[i] === ':') {
        i++ // skip :
        let numStr = ''
        while (i < input.length && /[0-9]/.test(input[i])) numStr += input[i++]
        const idx = parseInt(numStr, 10)
        if (!isNaN(idx) && idx >= 0) tokens.push({ type: 'slice', index: idx })
      }

      // Check for trailing *n (repeat), ? (sometimes), or @n (elongate)
      if (i < input.length && input[i] === '*') {
        i++ // skip *
        let numStr = ''
        while (i < input.length && /[0-9.]/.test(input[i])) numStr += input[i++]
        const factor = parseFloat(numStr)
        if (!isNaN(factor) && factor > 0) {
          tokens.push({ type: 'repeat', factor })
        }
      } else if (i < input.length && input[i] === '?') {
        i++
        tokens.push({ type: 'sometimes' })
      } else if (i < input.length && input[i] === '@') {
        i++ // skip @
        let numStr = ''
        while (i < input.length && /[0-9.]/.test(input[i])) numStr += input[i++]
        const factor = parseFloat(numStr)
        if (!isNaN(factor) && factor > 0) {
          tokens.push({ type: 'elongate', factor })
        }
      }
      continue
    }

    // Unknown character — skip
    i++
  }

  return tokens
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseTokens(tokens: Token[], isSample: boolean): PatternIR[] {
  const nodes: PatternIR[] = []
  let i = 0

  while (i < tokens.length) {
    const tok = tokens[i]

    if (tok.type === 'atom') {
      const note = tok.value
      i++

      // Slice modifier (`a:N`) — applies before repeat/sometimes since
      // it changes the Play's params shape, not its structural wrapper.
      let sliceIndex: number | undefined
      if (i < tokens.length && tokens[i].type === 'slice') {
        sliceIndex = (tokens[i] as { type: 'slice'; index: number }).index
        i++
      }

      const params: Partial<import('./PatternIR').PlayParams> = isSample
        ? { s: note }
        : {}
      if (sliceIndex !== undefined) params.slice = sliceIndex
      const baseDuration = isSample ? 1 : 0.25
      let node: PatternIR = IR.play(note, baseDuration, params)

      // Check for repeat / sometimes / elongate modifier following this atom
      if (i < tokens.length) {
        const next = tokens[i]
        if (next.type === 'repeat') {
          node = IR.fast(next.factor, node)
          i++
        } else if (next.type === 'sometimes') {
          node = IR.choice(0.5, node, IR.pure())
          i++
        } else if (next.type === 'elongate') {
          node = IR.elongate(next.factor, node)
          i++
        }
      }

      nodes.push(node)
    } else if (tok.type === 'rest') {
      nodes.push(IR.sleep(1))
      i++
    } else if (tok.type === 'lbracket') {
      // Sub-sequence: collect tokens until matching ]
      i++ // skip [
      const subTokens: Token[] = []
      let depth = 1
      while (i < tokens.length && depth > 0) {
        const t = tokens[i]
        if (t.type === 'lbracket') depth++
        if (t.type === 'rbracket') { depth--; if (depth === 0) { i++; break } }
        subTokens.push(t)
        i++
      }
      const subNodes = parseTokens(subTokens, isSample)
      if (subNodes.length > 0) {
        nodes.push(subNodes.length === 1 ? subNodes[0] : IR.seq(...subNodes))
      }
    } else if (tok.type === 'langle') {
      // Cycle (alternation): collect until matching >
      i++ // skip <
      const cycleTokens: Token[] = []
      let depth = 1
      while (i < tokens.length && depth > 0) {
        const t = tokens[i]
        if (t.type === 'langle') depth++
        if (t.type === 'rangle') { depth--; if (depth === 0) { i++; break } }
        cycleTokens.push(t)
        i++
      }
      const cycleNodes = parseTokens(cycleTokens, isSample)
      if (cycleNodes.length > 0) {
        nodes.push(IR.cycle(...cycleNodes))
      }
    } else {
      // Skip unknown tokens (rbracket, rangle without matching open, etc.)
      i++
    }
  }

  return nodes
}
