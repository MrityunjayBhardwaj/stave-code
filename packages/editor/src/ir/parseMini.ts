/**
 * parseMini — mini-notation string → PatternIR.
 *
 * Parses Strudel's mini-notation DSL (the string inside note("...") or s("...")).
 * Recursive descent parser that handles the Phase F subset:
 *   - Sequences: "c4 e4 g4"
 *   - Rests: "c4 ~ e4"
 *   - Cycles (alternation): "<c4 e4 g4>"
 *   - Sub-sequences: "[c4 e4] g4"
 *   - Repeat: "c4*2"
 *   - Sometimes: "c4?"
 *
 * Not in scope (Phase 19): polymetric {}, Euclidean a(3,8), slice a:2, elongation @
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

      // Check for trailing *n (repeat) or ? (sometimes)
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
      let node: PatternIR = isSample
        ? IR.play(note, 1, { s: note })
        : IR.play(note)
      i++

      // Check for repeat/sometimes modifier following this atom
      if (i < tokens.length) {
        const next = tokens[i]
        if (next.type === 'repeat') {
          node = IR.fast(next.factor, node)
          i++
        } else if (next.type === 'sometimes') {
          node = IR.choice(0.5, node, IR.pure())
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
