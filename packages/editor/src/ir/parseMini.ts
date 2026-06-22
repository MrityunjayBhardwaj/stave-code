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
    // Top-level implicit Seq spans the entire mini-notation source.
    // 19-05 T-07: literal construction (rest-spread `IR.seq` can't take
    // trailing `meta?`). RESEARCH §11 Q1.
    return {
      tag: 'Seq',
      children: nodes,
      loc: [{ start: baseOffset, end: baseOffset + input.length }],
    }
  } catch {
    // Graceful fallback: return opaque Code node
    return IR.code(input)
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

// 19-05 T-07: every non-atom Token variant carries `start`/`end` cursor
// positions (relative to the parseMini input string). The parser composes
// `start + baseOffset`, `end + baseOffset` into `SourceLocation` arrays and
// attaches them as `loc` on synthetic tags (Sleep/Choice/Elongate/Fast/
// Stack/Cycle/Seq), giving D-09 per-component-loc precision down to the
// mini-notation level. Bracket / curly / angle delimiters carry the
// position of their opening char; the closing position is recovered when
// the matching `r{bracket,curly,angle}` is consumed (so the wrapper tag
// gets the full `[...]` / `{...}` / `<...>` span). RESEARCH §11 Q2.
type Token =
  | { type: 'atom';   value: string; start: number; end: number }
  | { type: 'rest';   start: number; end: number }
  | { type: 'lbracket'; start: number; end: number }
  | { type: 'rbracket'; start: number; end: number }
  | { type: 'langle';   start: number; end: number }
  | { type: 'rangle';   start: number; end: number }
  | { type: 'repeat';  factor: number; start: number; end: number }
  | { type: 'sometimes'; start: number; end: number }
  | { type: 'slice';   index: number; start: number; end: number }
  | { type: 'elongate'; factor: number; start: number; end: number }
  | { type: 'euclid';   hits: number; steps: number; rotation: number; start: number; end: number }
  | { type: 'lcurly';   start: number; end: number }
  | { type: 'rcurly';   start: number; end: number }
  | { type: 'comma';    start: number; end: number }

// Read at most one trailing modifier at `input[i]` — `*n` (repeat), `?`
// (sometimes), or `@n` (elongate) — and push its token. Returns the advanced
// index. Shared by the atom AND rest paths so a rest weights/repeats exactly
// like an atom: `~@4` is a 4-cycle rest, not a rest followed by a bogus atom
// `4` (the `@`/digits would otherwise fall through as "unknown" + an atom).
function readTrailingModifier(input: string, i: number, tokens: Token[]): number {
  if (i < input.length && input[i] === '*') {
    const start = i
    i++ // skip *
    let numStr = ''
    while (i < input.length && /[0-9.]/.test(input[i])) numStr += input[i++]
    const factor = parseFloat(numStr)
    if (!isNaN(factor) && factor > 0) tokens.push({ type: 'repeat', factor, start, end: i })
  } else if (i < input.length && input[i] === '?') {
    const start = i
    i++
    tokens.push({ type: 'sometimes', start, end: i })
  } else if (i < input.length && input[i] === '@') {
    const start = i
    i++ // skip @
    let numStr = ''
    while (i < input.length && /[0-9.]/.test(input[i])) numStr += input[i++]
    const factor = parseFloat(numStr)
    if (!isNaN(factor) && factor > 0) tokens.push({ type: 'elongate', factor, start, end: i })
  }
  return i
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    const ch = input[i]

    if (/\s/.test(ch)) { i++; continue }

    if (ch === '[') { tokens.push({ type: 'lbracket', start: i, end: i + 1 }); i++; continue }
    // A closing delimiter can carry a trailing weight/modifier on the whole
    // group: `[a b]@2`, `<a b>@2`, `{a b}@2`. Read it here so it doesn't fall
    // through as "unknown" + a bogus atom (`<a b>@2` → … + Play("2")).
    if (ch === ']') { tokens.push({ type: 'rbracket', start: i, end: i + 1 }); i++; i = readTrailingModifier(input, i, tokens); continue }
    if (ch === '<') { tokens.push({ type: 'langle',   start: i, end: i + 1 }); i++; continue }
    if (ch === '>') { tokens.push({ type: 'rangle',   start: i, end: i + 1 }); i++; i = readTrailingModifier(input, i, tokens); continue }
    if (ch === '{') { tokens.push({ type: 'lcurly',   start: i, end: i + 1 }); i++; continue }
    if (ch === '}') { tokens.push({ type: 'rcurly',   start: i, end: i + 1 }); i++; i = readTrailingModifier(input, i, tokens); continue }
    if (ch === ',') { tokens.push({ type: 'comma',    start: i, end: i + 1 }); i++; continue }

    if (ch === '~') {
      tokens.push({ type: 'rest', start: i, end: i + 1 })
      i++
      // A rest carries a trailing weight/modifier just like an atom (`~@4` =
      // a 4-cycle rest arm in a slowcat). Without this the `@4` would be
      // dropped and `4` re-read as a bogus atom.
      i = readTrailingModifier(input, i, tokens)
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
        const sliceStart = i
        i++ // skip :
        let numStr = ''
        while (i < input.length && /[0-9]/.test(input[i])) numStr += input[i++]
        const idx = parseInt(numStr, 10)
        if (!isNaN(idx) && idx >= 0) tokens.push({ type: 'slice', index: idx, start: sliceStart, end: i })
      }

      // Euclidean rhythm `a(hits, steps, rotation?)` — must come
      // before the *n / @n / ? checks because `(` is the marker.
      if (i < input.length && input[i] === '(') {
        const euclidStart = i
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
            start: euclidStart,
            end: i,
          })
        }
      }

      // Check for trailing *n (repeat), ? (sometimes), or @n (elongate)
      i = readTrailingModifier(input, i, tokens)
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

// Wrap `node` in the structural tag a trailing modifier token implies — Fast
// for `*n`, Choice for `?`, Elongate for `@n` — consuming that token. Each
// wrapper's loc spans just the modifier token (the body keeps its own loc).
// Shared by the atom and rest paths so `~@4` elongates the Sleep the same way
// `a@4` elongates a Play (without it, `<~@4 …>` would lose the rest's weight).
function applyTrailingModifier(
  node: PatternIR,
  tokens: Token[],
  i: number,
  baseOffset: number,
): { node: PatternIR; i: number } {
  if (i >= tokens.length) return { node, i }
  const next = tokens[i]
  const modLoc = [{ start: baseOffset + next.start, end: baseOffset + next.end }]
  if (next.type === 'repeat') return { node: IR.fast(next.factor, node, { loc: modLoc }), i: i + 1 }
  if (next.type === 'sometimes') return { node: IR.choice(0.5, node, IR.pure(), { loc: modLoc }), i: i + 1 }
  if (next.type === 'elongate') return { node: IR.elongate(next.factor, node, { loc: modLoc }), i: i + 1 }
  return { node, i }
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
      const atomStart = tok.start
      const atomLoc = [{ start: baseOffset + tok.start, end: baseOffset + tok.end }]
      i++

      // Slice modifier (`a:N`) — applies before repeat/sometimes since
      // it changes the Play's params shape, not its structural wrapper.
      let sliceIndex: number | undefined
      if (i < tokens.length && tokens[i].type === 'slice') {
        const sliceTok = tokens[i] as { type: 'slice'; index: number }
        sliceIndex = sliceTok.index
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
        const e = tokens[i] as {
          type: 'euclid'; hits: number; steps: number; rotation: number;
          start: number; end: number
        }
        i++
        let pattern = bjorklund(e.hits, e.steps)
        if (e.rotation) pattern = rotate(pattern, e.rotation)
        const restSlot: PatternIR = IR.sleep(1)
        const slots = pattern.map(onset => (onset ? node : restSlot))
        // Synthetic Seq from euclid spans the atom + `(h,s,r)`.
        // 19-05 T-07: literal construction for rest-spread `IR.seq`.
        if (slots.length === 1) {
          node = slots[0]
        } else {
          node = {
            tag: 'Seq',
            children: slots,
            loc: [{ start: baseOffset + atomStart, end: baseOffset + e.end }],
          }
        }
      }

      // Check for repeat / sometimes / elongate modifier following this atom.
      // 19-05 T-07: each wrapper tag's loc spans just the modifier token
      // (e.g. `*N` for Fast, `?` for Choice, `@N` for Elongate). The wrapped
      // body keeps its own atomLoc — distinct components, distinct ranges.
      ;({ node, i } = applyTrailingModifier(node, tokens, i, baseOffset))

      nodes.push(node)
    } else if (tok.type === 'rest') {
      // 19-05 T-07: Sleep from `~` carries the `~`'s position.
      const restLoc = [{ start: baseOffset + tok.start, end: baseOffset + tok.end }]
      let node: PatternIR = IR.sleep(1, { loc: restLoc })
      i++
      // A trailing `@n`/`*n`/`?` weights/repeats the rest — `~@4` is a
      // 4-cycle rest arm in a slowcat (mirrors the atom path above).
      ;({ node, i } = applyTrailingModifier(node, tokens, i, baseOffset))
      nodes.push(node)
    } else if (tok.type === 'lbracket') {
      // Sub-sequence OR chord: collect tokens until matching `]`, splitting on
      // TOP-LEVEL commas. `[a b c]` (no comma) is a Seq; `[a,b,c]` is a Stack —
      // parallel notes each spanning the full cycle (a chord), mirroring Strudel
      // mini-notation. Without this split a comma-chord parsed identically to a
      // space-sequence, so the structural IR ARPEGGIATED chords (#508). The
      // `{...}` polymeter arm below splits the same way; brackets just never did.
      const openStart = tok.start
      let closeEnd = tok.end // fallback if `]` is missing
      i++ // skip [
      const segments: Token[][] = [[]]
      let depth = 1 // matches the outer `]`
      let group = 0 // nesting inside [] {} <> — split commas only at the top level
      while (i < tokens.length && depth > 0) {
        const t = tokens[i]
        if (t.type === 'lbracket') {
          depth++
          group++
        } else if (t.type === 'rbracket') {
          depth--
          if (depth === 0) {
            closeEnd = t.end
            i++
            break
          }
          group--
        } else if (t.type === 'lcurly' || t.type === 'langle') {
          group++
        } else if (t.type === 'rcurly' || t.type === 'rangle') {
          group--
        }
        if (group === 0 && t.type === 'comma') {
          segments.push([])
        } else {
          segments[segments.length - 1].push(t)
        }
        i++
      }
      // 19-05 T-07: synthetic Seq/Stack from `[...]` spans `[` to `]`.
      const loc = [{ start: baseOffset + openStart, end: baseOffset + closeEnd }]
      if (segments.length > 1) {
        // Chord — each comma segment is a full-cycle sub-sequence; stack them.
        const tracks = segments
          .map(seg => parseTokens(seg, isSample, baseOffset))
          .filter(s => s.length > 0)
          .map(s => (s.length === 1 ? s[0] : IR.seq(...s)))
        if (tracks.length > 0) {
          // Single non-empty segment (e.g. `[a,]`) degrades to that segment.
          let node: PatternIR =
            tracks.length === 1 ? tracks[0] : { tag: 'Stack', tracks, loc }
          // A trailing `@n`/`*n`/`?` weights/repeats the whole chord.
          ;({ node, i } = applyTrailingModifier(node, tokens, i, baseOffset))
          nodes.push(node)
        }
      } else {
        const subNodes = parseTokens(segments[0], isSample, baseOffset)
        if (subNodes.length > 0) {
          // Single-child sub-sequences keep the child node — `[a]` is
          // equivalent to `a`. Don't synthesize a wrapper Seq.
          // Literal construction (rest-spread `IR.seq` can't take meta).
          let node: PatternIR =
            subNodes.length === 1 ? subNodes[0] : { tag: 'Seq', children: subNodes, loc }
          // A trailing `@n`/`*n`/`?` weights/repeats the whole group (`[a b]@2`).
          ;({ node, i } = applyTrailingModifier(node, tokens, i, baseOffset))
          nodes.push(node)
        }
      }
    } else if (tok.type === 'lcurly') {
      // Polymetric: collect tokens until matching `}`, splitting on
      // top-level commas. Each segment becomes a parallel track in a
      // Stack — Strudel's polymeter semantics (each track stretches /
      // compresses to fit one cycle, regardless of step count).
      const openStart = tok.start
      let closeEnd = tok.end // fallback if `}` is missing
      i++ // skip {
      const segments: Token[][] = [[]]
      let depth = 1
      while (i < tokens.length && depth > 0) {
        const t = tokens[i]
        if (t.type === 'lcurly') depth++
        if (t.type === 'rcurly') {
          depth--
          if (depth === 0) {
            closeEnd = t.end
            i++
            break
          }
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
      } else {
        // Single segment is just a sub-sequence; multi-segment is a Stack.
        // 19-05 T-07: synthetic Stack from `{...}` spans `{` to `}`.
        // Literal construction (rest-spread `IR.stack` can't take meta).
        let node: PatternIR =
          trackNodes.length === 1
            ? trackNodes[0]
            : {
                tag: 'Stack',
                tracks: trackNodes,
                loc: [{ start: baseOffset + openStart, end: baseOffset + closeEnd }],
              }
        ;({ node, i } = applyTrailingModifier(node, tokens, i, baseOffset))
        nodes.push(node)
      }
    } else if (tok.type === 'langle') {
      // Cycle (alternation): collect until matching >
      const openStart = tok.start
      let closeEnd = tok.end
      i++ // skip <
      const cycleTokens: Token[] = []
      let depth = 1
      while (i < tokens.length && depth > 0) {
        const t = tokens[i]
        if (t.type === 'langle') depth++
        if (t.type === 'rangle') {
          depth--
          if (depth === 0) {
            closeEnd = t.end
            i++
            break
          }
        }
        cycleTokens.push(t)
        i++
      }
      const cycleNodes = parseTokens(cycleTokens, isSample, baseOffset)
      if (cycleNodes.length > 0) {
        // 19-05 T-07: synthetic Cycle from `<...>` spans `<` to `>`.
        // Literal construction (rest-spread `IR.cycle` can't take meta).
        let node: PatternIR = {
          tag: 'Cycle',
          items: cycleNodes,
          loc: [{ start: baseOffset + openStart, end: baseOffset + closeEnd }],
        }
        // A trailing `@n` weights the whole alternation as one slowcat arm
        // (`<<a b>@2 c>` — the inner `<a b>` occupies 2 cycles per period).
        ;({ node, i } = applyTrailingModifier(node, tokens, i, baseOffset))
        nodes.push(node)
      }
    } else {
      // Skip unknown tokens (rbracket, rangle without matching open, etc.)
      i++
    }
  }

  return nodes
}
