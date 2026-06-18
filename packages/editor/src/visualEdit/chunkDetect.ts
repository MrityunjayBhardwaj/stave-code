/**
 * chunkDetect — selection → chunk.
 *
 * The parsing half of the visual-editing spine. Strudel programs are plain
 * JS (`$: s("bd")` is a LabeledStatement, bare patterns are
 * ExpressionStatements), so we parse with acorn and break the statement
 * under the cursor into the pieces the visual panels act on: the head call,
 * its mini-notation string, and the method chain with per-argument ranges.
 *
 * Everything here is PURE (string in, plain-object out) — no Monaco, no
 * IndexedDB — so it unit-tests with plain assertions. The companion
 * `writeback.ts` consumes a ChunkInfo's ranges to mutate the document.
 *
 * Range discipline: a chunk's offsets are valid ONLY against the exact doc it
 * was detected from. `isChunkFresh` MUST gate every write — stale offsets
 * corrupt unrelated code.
 */
import { parse } from 'acorn'

// acorn's node types are intentionally loose; we walk untyped nodes here.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Coarse hint for which editor a chunk can open. Panels still read the
 * structured fields below to decide what they can actually edit. */
export type ChunkType = 'step' | 'roll' | 'knobs' | 'unknown'

export interface ChainArg {
  /** source text of the argument expression, verbatim */
  raw: string
  /** numeric value when the arg is a (possibly negated) number literal, else null */
  numeric: number | null
  /** absolute doc offsets of the argument expression */
  range: [number, number]
}

export interface ChainCall {
  name: string
  args: ChainArg[]
  /**
   * For member calls: [dotOffset, callEnd] — replacing/deleting this range
   * removes the call. For the head call: the full call expression range.
   */
  range: [number, number]
}

export interface ChunkInfo {
  /** the whole top-level statement (incl. any `$:` label) */
  statementRange: [number, number]
  /** the statement's exact source when detected — used to verify freshness */
  statementText: string
  /** the pattern expression, excluding the `$:` label — append `.fx()` here */
  exprRange: [number, number]
  /** `$:` label name, or null */
  label: string | null
  /** head function name, e.g. `s`, `note`, `stack` */
  headFn: string | null
  /** contents of the head call's first string literal, quotes excluded */
  miniRange: [number, number] | null
  miniString: string | null
  /** calls in source order, head first */
  chain: ChainCall[]
  type: ChunkType
}

/** Top-level statement nodes, or null when the doc doesn't parse
 * (mid-keystroke syntax error — the caller keeps the last good chunk). */
export function parseTopLevel(doc: string): any[] | null {
  try {
    const program = parse(doc, {
      ecmaVersion: 'latest',
      allowAwaitOutsideFunction: true,
    }) as any
    return program.body
  } catch {
    return null
  }
}

/** Does the doc parse at all? Distinguishes "no statement here" from "broken doc". */
export function docParses(doc: string): boolean {
  return parseTopLevel(doc) !== null
}

/**
 * A chunk's ranges are only valid against the exact doc it was detected from.
 * Every write MUST check this first.
 */
export function isChunkFresh(doc: string, chunk: ChunkInfo): boolean {
  return doc.slice(chunk.statementRange[0], chunk.statementRange[1]) === chunk.statementText
}

/**
 * The innermost editable chunk under `pos`, or null. Descends into combinator
 * arguments — a cursor on a track inside `stack(...)` binds THAT track, not the
 * whole `$: stack(...)` statement (#395). A top-level cursor is unchanged.
 */
export function detectChunk(doc: string, pos: number): ChunkInfo | null {
  const statements = parseTopLevel(doc)
  if (!statements) return null
  for (const node of statements) {
    if (pos >= node.start && pos <= node.end) {
      let label: string | null = null
      let body = node
      if (node.type === 'LabeledStatement') {
        label = node.label.name
        body = node.body
      }
      if (body.type !== 'ExpressionStatement') return null
      const topExpr = body.expression
      const target = innermostChainUnder(doc, topExpr, pos)
      // The top-level statement keeps its full range (incl. the `$:` label) so
      // the freshness guard watches the whole statement; a nested target is
      // anchored to its own expression span and carries no label.
      return target === topExpr
        ? buildChunkFromExpr(doc, topExpr, label, [node.start, node.end])
        : buildChunkFromExpr(doc, target, null, [target.start, target.end])
    }
  }
  return null
}

/** Every editable chunk in the doc, in source order. */
export function detectAllChunks(doc: string): ChunkInfo[] {
  const statements = parseTopLevel(doc)
  if (!statements) return []
  return statements
    .map((node: any) => buildChunk(doc, node))
    .filter((c: ChunkInfo | null): c is ChunkInfo => c !== null)
}

function buildChunk(doc: string, node: any): ChunkInfo | null {
  let label: string | null = null
  let body = node
  if (node.type === 'LabeledStatement') {
    label = node.label.name
    body = node.body
  }
  if (body.type !== 'ExpressionStatement') return null
  return buildChunkFromExpr(doc, body.expression, label, [node.start, node.end])
}

/**
 * Build a ChunkInfo from a pattern expression node. `stmtRange` is the source
 * span the freshness guard watches: the whole statement (incl. `$:`) for a
 * top-level chunk, or just the expression for a nested one (#395).
 */
function buildChunkFromExpr(
  doc: string,
  expr: any,
  label: string | null,
  stmtRange: [number, number],
): ChunkInfo {
  const headNode = { ref: null as any }
  const chain = collectChain(doc, expr, headNode)
  const headFn = chain.length > 0 ? chain[0].name : null

  let miniRange: [number, number] | null = null
  let miniString: string | null = null
  if (headNode.ref) {
    const firstString = headNode.ref.arguments.find(
      (a: any) =>
        (a.type === 'Literal' && typeof a.value === 'string') || a.type === 'TemplateLiteral',
    )
    if (firstString) {
      miniRange = [firstString.start + 1, firstString.end - 1]
      miniString = doc.slice(firstString.start + 1, firstString.end - 1)
    }
  }

  const info: ChunkInfo = {
    statementRange: stmtRange,
    statementText: doc.slice(stmtRange[0], stmtRange[1]),
    exprRange: [expr.start, expr.end],
    label,
    headFn,
    miniRange,
    miniString,
    chain,
    type: 'unknown',
  }
  info.type = classifyChunk(info)
  return info
}

/**
 * Descend to the innermost chain expression containing `pos`. When the cursor
 * sits inside an argument of a combinator (`stack`, `cat`, `layer`, …) that is
 * itself a pattern chain, recurse into that argument; otherwise return `expr`
 * unchanged. This is what lets a panel bind to ONE track inside `stack(...)`
 * rather than the whole statement (#395). Mini-notation strings and numeric
 * args are Literals, not CallExpressions, so a cursor on them keeps the
 * enclosing chain.
 */
function innermostChainUnder(doc: string, expr: any, pos: number): any {
  const headOut = { ref: null as any }
  collectChain(doc, expr, headOut)
  const head = headOut.ref
  if (!head || !Array.isArray(head.arguments)) return expr
  for (const arg of head.arguments) {
    const inner = chainArgUnder(arg, pos)
    if (inner) return innermostChainUnder(doc, inner, pos)
  }
  return expr
}

/**
 * The chain expression to descend into for a combinator argument under `pos`:
 * the arg itself when it's a pattern chain (`stack`/`cat`/`layer` args), OR —
 * for an `arrange([w, pat])` arm — the `pat` CallExpression element inside the
 * `[w, pat]` ArrayExpression (#472). Returns null when `pos` isn't inside a
 * descendable chain arg (e.g. on the weight literal, or a non-chain arg), so the
 * cursor keeps the enclosing combinator chain. Without the array case, an
 * arrange arm leaf never binds a panel — the cursor resolves to the whole
 * `arrange(...)` (head `arrange`, no mini) → standby.
 */
function chainArgUnder(arg: any, pos: number): any {
  if (!arg || typeof arg.start !== 'number' || pos < arg.start || pos > arg.end) return null
  if (arg.type === 'CallExpression') return arg
  if (arg.type === 'ArrayExpression' && Array.isArray(arg.elements)) {
    for (const el of arg.elements) {
      if (
        el &&
        el.type === 'CallExpression' &&
        typeof el.start === 'number' &&
        pos >= el.start &&
        pos <= el.end
      ) {
        return el
      }
    }
  }
  return null
}

/**
 * Walk the callee spine of a chained expression, e.g.
 * `s("bd").bank("x").gain(0.6)` → [s, bank, gain] in source order.
 * Records the innermost (head) call node on `headOut.ref`.
 */
function collectChain(doc: string, expr: any, headOut: { ref: any }): ChainCall[] {
  const calls: ChainCall[] = []
  let node = expr
  while (node) {
    if (node.type === 'CallExpression') {
      const callee = node.callee
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier'
      ) {
        const dot = doc.lastIndexOf('.', callee.property.start)
        calls.push({
          name: callee.property.name,
          args: node.arguments.map((a: any) => toArg(doc, a)),
          range: [dot, node.end],
        })
        node = callee.object
        continue
      }
      if (callee.type === 'Identifier') {
        calls.push({
          name: callee.name,
          args: node.arguments.map((a: any) => toArg(doc, a)),
          range: [node.start, node.end],
        })
        headOut.ref = node
      }
    }
    break
  }
  return calls.reverse()
}

function toArg(doc: string, node: any): ChainArg {
  let numeric: number | null = null
  if (node.type === 'Literal' && typeof node.value === 'number') {
    numeric = node.value
  } else if (
    node.type === 'UnaryExpression' &&
    node.operator === '-' &&
    node.argument.type === 'Literal' &&
    typeof node.argument.value === 'number'
  ) {
    numeric = -node.argument.value
  }
  return { raw: doc.slice(node.start, node.end), numeric, range: [node.start, node.end] }
}

/**
 * Best-guess primary editor for a chunk. Coarse — panels read `chain`/`mini`
 * directly to decide what they can edit. A pattern with a `note`/`n` head and
 * a mini string is roll-shaped; an `s`/`sound` head with a mini string is
 * grid-shaped; anything with a numeric chain literal can at least show knobs.
 */
export function classifyChunk(info: ChunkInfo): ChunkType {
  const head = info.headFn
  if (info.miniString !== null) {
    if (head === 'note' || head === 'n') return 'roll'
    if (head === 's' || head === 'sound') return 'step'
  }
  if (info.chain.some((c) => c.args.some((a) => a.numeric !== null))) return 'knobs'
  return 'unknown'
}
