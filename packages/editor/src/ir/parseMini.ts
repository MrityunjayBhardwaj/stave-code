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

/**
 * Parse a mini-notation string. Returns Pure for empty input. Never throws.
 *
 * `baseOffset` — character offset of `input[0]` within the user's full
 * source code. Lets the parser attach `loc` to Play nodes so downstream
 * consumers (Inspector click-to-source, Monaco highlighting) can map
 * an event back to the exact span of code that produced it. Caller is
 * responsible for the offset; parseStrudel computes it from the
 * regex match index of the quoted-string content.
 */
export function parseMini(
  input: string,
  isSample = false,
  baseOffset = 0,
): PatternIR {
  if (!input.trim()) return IR.pure()

  try {
    // Tokenize the raw input — NOT a trimmed copy — so atom offsets
    // line up with the actual character positions the caller's
    // baseOffset describes. Internal whitespace is still skipped.
    const tokens = tokenize(input)
    if (tokens.length === 0) return IR.pure()
    const nodes = parseTokens(tokens, isSample, baseOffset)
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
  | { type: 'atom';   value: string; start: number; end: number }
  | { type: 'rest' }
  | { type: 'lbracket' }
  | { type: 'rbracket' }
  | { type: 'langle' }
  | { type: 'rangle' }
  | { type: 'repeat';  factor: number }
  | { type: 'sometimes' }
  | { type: 'slice';   index: number }
  | { type: 'elongate'; factor: number }
  | { type: 'euclid';   hits: number; steps: number; rotation: number }
  | { type: 'lcurly' }
  | { type: 'rcurly' }
  | { type: 'comma' }

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
    if (ch === '{') { tokens.push({ type: 'lcurly' });   i++; continue }
    if (ch === '}') { tokens.push({ type: 'rcurly' });   i++; continue }
    if (ch === ',') { tokens.push({ type: 'comma' });    i++; continue }

    if (ch === '~') {
      tokens.push({ type: 'rest' })
      i++
      continue
    }

    // Read atom (note name or sample name)
    if (/[a-zA-Z0-9#-]/.test(ch)) {
      const atomStart = i
      let atom = ''
      while (i < input.length && /[a-zA-Z0-9#\-_.]/.test(input[i])) {
        atom += input[i++]
      }
      tokens.push({ type: 'atom', value: atom, start: atomStart, end: i })

      // Slice (`a:N`) is parsed as a per-atom modifier so it composes
      // naturally with repeat/sometimes that follow it.
      if (i < input.length && input[i] === ':') {
        i++ // skip :
        let numStr = ''
        while (i < input.length && /[0-9]/.test(input[i])) numStr += input[i++]
        const idx = parseInt(numStr, 10)
        if (!isNaN(idx) && idx >= 0) tokens.push({ type: 'slice', index: idx })
      }

      // Euclidean rhythm `a(hits, steps, rotation?)` — must come
      // before the *n / @n / ? checks because `(` is the marker.
      if (i < input.length && input[i] === '(') {
        i++ // skip (
        const args: number[] = []
        let buf = ''
        while (i < input.length && input[i] !== ')') {
          const c = input[i]
          if (c === ',') {
            const n = parseInt(buf.trim(), 10)
            if (!isNaN(n)) args.push(n)
            buf = ''
          } else {
            buf += c
          }
          i++
        }
        if (buf.trim().length > 0) {
          const n = parseInt(buf.trim(), 10)
          if (!isNaN(n)) args.push(n)
        }
        if (i < input.length && input[i] === ')') i++ // skip )
        if (args.length >= 2 && args[0] >= 0 && args[1] > 0) {
          tokens.push({
            type: 'euclid',
            hits: args[0],
            steps: args[1],
            rotation: args.length >= 3 ? args[2] : 0,
          })
        }
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
// Bjorklund — distribute `hits` evenly across `steps` slots.
// Returns a boolean array of length `steps`; true = onset, false = rest.
// ---------------------------------------------------------------------------

export function bjorklund(hits: number, steps: number): boolean[] {
  if (hits <= 0 || steps <= 0) return new Array(Math.max(steps, 0)).fill(false)
  if (hits >= steps) return new Array(steps).fill(true)

  // Iterative Bjorklund: build groups [[true],[true],...,[false],[false],...],
  // then merge from the tail until at most one "remainder" group remains.
  let groups: boolean[][] = [
    ...Array.from({ length: hits }, () => [true]),
    ...Array.from({ length: steps - hits }, () => [false]),
  ]

  while (true) {
    let firstTail = -1
    for (let i = 1; i < groups.length; i++) {
      if (groups[i][0] !== groups[0][0]) {
        firstTail = i
        break
      }
    }
    if (firstTail === -1) break
    const tailCount = groups.length - firstTail
    if (tailCount <= 1) break
    const merged: boolean[][] = []
    const headCount = firstTail
    const pairs = Math.min(headCount, tailCount)
    for (let i = 0; i < pairs; i++) {
      merged.push([...groups[i], ...groups[firstTail + i]])
    }
    if (headCount > tailCount) {
      for (let i = tailCount; i < headCount; i++) merged.push(groups[i])
    } else if (tailCount > headCount) {
      for (let i = headCount; i < tailCount; i++) merged.push(groups[firstTail + i])
    }
    groups = merged
  }

  return groups.flat()
}

function rotate<T>(arr: T[], by: number): T[] {
  if (arr.length === 0) return arr
  const n = ((by % arr.length) + arr.length) % arr.length
  return [...arr.slice(n), ...arr.slice(0, n)]
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseTokens(tokens: Token[], isSample: boolean, baseOffset = 0): PatternIR[] {
  const nodes: PatternIR[] = []
  let i = 0

  while (i < tokens.length) {
    const tok = tokens[i]

    if (tok.type === 'atom') {
      const note = tok.value
      const atomLoc = [{ start: baseOffset + tok.start, end: baseOffset + tok.end }]
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
      let node: PatternIR = IR.play(note, baseDuration, params, atomLoc)

      // Euclidean modifier — applies to the just-parsed atom and
      // expands to a Seq of Play / Sleep slots. Must come before
      // repeat/sometimes/elongate so those wrap the expanded Seq.
      if (i < tokens.length && tokens[i].type === 'euclid') {
        const e = tokens[i] as { type: 'euclid'; hits: number; steps: number; rotation: number }
        i++
        let pattern = bjorklund(e.hits, e.steps)
        if (e.rotation) pattern = rotate(pattern, e.rotation)
        const restSlot: PatternIR = IR.sleep(1)
        const slots = pattern.map(onset => (onset ? node : restSlot))
        node = slots.length === 1 ? slots[0] : IR.seq(...slots)
      }

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
      const subNodes = parseTokens(subTokens, isSample, baseOffset)
      if (subNodes.length > 0) {
        nodes.push(subNodes.length === 1 ? subNodes[0] : IR.seq(...subNodes))
      }
    } else if (tok.type === 'lcurly') {
      // Polymetric: collect tokens until matching `}`, splitting on
      // top-level commas. Each segment becomes a parallel track in a
      // Stack — Strudel's polymeter semantics (each track stretches /
      // compresses to fit one cycle, regardless of step count).
      i++ // skip {
      const segments: Token[][] = [[]]
      let depth = 1
      while (i < tokens.length && depth > 0) {
        const t = tokens[i]
        if (t.type === 'lcurly') depth++
        if (t.type === 'rcurly') {
          depth--
          if (depth === 0) { i++; break }
        }
        if (depth === 1 && t.type === 'comma') {
          segments.push([])
        } else {
          segments[segments.length - 1].push(t)
        }
        i++
      }
      const trackNodes = segments
        .map(seg => parseTokens(seg, isSample, baseOffset))
        .filter(s => s.length > 0)
        .map(s => (s.length === 1 ? s[0] : IR.seq(...s)))
      if (trackNodes.length === 0) {
        // {} — nothing to play
      } else if (trackNodes.length === 1) {
        nodes.push(trackNodes[0]) // single segment is just a sub-sequence
      } else {
        nodes.push(IR.stack(...trackNodes))
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
      const cycleNodes = parseTokens(cycleTokens, isSample, baseOffset)
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
