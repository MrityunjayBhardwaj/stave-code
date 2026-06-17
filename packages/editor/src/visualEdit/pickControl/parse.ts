/**
 * pickControl/parse — section-clip detection for the `pick*` family.
 *
 * #463 Stage 2. A `pick`/`pickRestart`/`pickReset` track's CLIPS are the weighted
 * arms of its CONTROL mini-notation `"<~@4 verse@8 chorus@8 …>"` (a weighted
 * slowcat), NOT the `[n, pat]` arms of an `arrange(...)` (that's `arrange/parse`).
 * So the pick family gets its OWN detector here, and `serialize.ts` turns the arm
 * ranges into surgical edits of the `<…@w …>` string.
 *
 * Like `arrange/parse`, everything is PURE and uses acorn for the JS-level node
 * ranges (the method call + its string-literal receiver) — no Monaco, no runtime
 * IR import (P172). The `<…>` arm ranges are scanned from the literal's text.
 *
 * Scope: the receiver must be a bare string literal `"<…>"` (the canonical
 * `"<…>".pickRestart({…})` form). A `mini("<…>")`-wrapped receiver or a non-`<>`
 * control returns null (the caller then no-ops, as today).
 */
import { parse } from 'acorn'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PickMethod = 'pick' | 'pickRestart' | 'pickReset'
const PICK_METHODS: ReadonlySet<string> = new Set(['pick', 'pickRestart', 'pickReset'])

/** One arm of the `<…@w …>` control = one section clip. */
export interface PickControlArm {
  /** Absolute `[start, end)` of the WHOLE arm token (`verse@8`, `~@4`, `[bd,sd]@2`). */
  armRange: [number, number]
  /** Absolute `[start, end)` of the arm's head (the section name / pattern,
   *  without the `@weight`): `verse`, `~`, `[bd,sd]`. */
  headRange: [number, number]
  /** Absolute `[start, end)` of the weight DIGITS after `@` — null when the arm
   *  has no `@` (implicit weight 1, no literal to edit; setWeight inserts one). */
  weightRange: [number, number] | null
  /** Whole-cycle weight (the `n` in `@n`); default 1. */
  weight: number
}

/** A detected `pick*` call and the arms of its `<…@w …>` control string. */
export interface PickControl {
  method: PickMethod
  /** Absolute `[start, end)` of the whole `recv.method(...)` call. */
  callRange: [number, number]
  /** Absolute `[start, end)` of the control string literal, INCLUDING quotes. */
  stringRange: [number, number]
  /** Absolute `[start, end)` of the content BETWEEN `<` and `>` — the region a
   *  duplicate/insert writes into (so a new arm lands inside the brackets). */
  innerRange: [number, number]
  /** Arms in source order; clip order = arm order. */
  arms: PickControlArm[]
}

function parseProgram(doc: string): any | null {
  try {
    return parse(doc, { ecmaVersion: 'latest', allowAwaitOutsideFunction: true }) as any
  } catch {
    return null
  }
}

/** Is this a `….pick|pickRestart|pickReset(...)` method call on a string literal? */
function isPickCall(node: any): boolean {
  return (
    node &&
    node.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    node.callee.property?.type === 'Identifier' &&
    PICK_METHODS.has(node.callee.property.name) &&
    node.callee.object?.type === 'Literal' &&
    typeof node.callee.object.value === 'string'
  )
}

function walk(node: any, visit: (n: any) => void): void {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string' && typeof node.start === 'number') visit(node)
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue
    const child = node[key]
    if (Array.isArray(child)) for (const c of child) walk(c, visit)
    else if (child && typeof child === 'object') walk(child, visit)
  }
}

/**
 * Scan the `<…>` arms of a control string literal. `raw` is the literal's verbatim
 * source (quotes included); `litStart` is its absolute start. Returns the arms
 * with absolute offsets, or null when the literal has no `<…>` block.
 *
 * Arms are space-separated at depth 0 — `[ ] < > { } ( )` nest, so the inner
 * comma/space of `[bd,sd]@2` or a nested `<a b>@2` never splits an arm. The
 * `@weight` is the depth-0 `@` + the following `[0-9.]` run.
 */
function scanControlArms(
  raw: string,
  litStart: number,
): { arms: PickControlArm[]; innerRange: [number, number] } | null {
  const open = raw.indexOf('<')
  if (open < 0) return null
  // Matching `>` for the opening `<` (track angle depth so a nested `<a b>` is
  // skipped over as part of an arm head).
  let depth = 0
  let close = -1
  for (let i = open; i < raw.length; i++) {
    if (raw[i] === '<') depth++
    else if (raw[i] === '>') {
      depth--
      if (depth === 0) { close = i; break }
    }
  }
  if (close < 0) return null
  const inner = raw.slice(open + 1, close)
  const innerBase = litStart + open + 1
  const arms: PickControlArm[] = []

  let i = 0
  const n = inner.length
  while (i < n) {
    // Skip whitespace between arms.
    while (i < n && /\s/.test(inner[i])) i++
    if (i >= n) break
    const armStart = i
    // Read the head up to a depth-0 `@` or a depth-0 space.
    let d = 0
    let atRel = -1
    while (i < n) {
      const c = inner[i]
      if (c === '[' || c === '<' || c === '{' || c === '(') d++
      else if (c === ']' || c === '>' || c === '}' || c === ')') d--
      else if (d === 0 && c === '@') { atRel = i; break }
      else if (d === 0 && /\s/.test(c)) break
      i++
    }
    const headEnd = atRel >= 0 ? atRel : i
    let weightRange: [number, number] | null = null
    let weight = 1
    if (atRel >= 0) {
      // Consume `@` + the digit run.
      i = atRel + 1
      const digitsStart = i
      while (i < n && /[0-9.]/.test(inner[i])) i++
      if (i > digitsStart) {
        weightRange = [innerBase + digitsStart, innerBase + i]
        weight = parseFloat(inner.slice(digitsStart, i)) || 1
      }
      // Skip to the next depth-0 space (any trailing modifier stays in the arm).
      let dd = 0
      while (i < n) {
        const c = inner[i]
        if (c === '[' || c === '<' || c === '{' || c === '(') dd++
        else if (c === ']' || c === '>' || c === '}' || c === ')') dd--
        else if (dd === 0 && /\s/.test(c)) break
        i++
      }
    }
    arms.push({
      armRange: [innerBase + armStart, innerBase + i],
      headRange: [innerBase + armStart, innerBase + headEnd],
      weightRange,
      weight,
    })
  }
  if (arms.length === 0) return null
  return { arms, innerRange: [innerBase, innerBase + inner.length] }
}

function buildControl(doc: string, node: any): PickControl | null {
  const lit = node.callee.object
  const raw = doc.slice(lit.start, lit.end)
  const scanned = scanControlArms(raw, lit.start)
  if (!scanned) return null
  return {
    method: node.callee.property.name as PickMethod,
    callRange: [node.start, node.end],
    stringRange: [lit.start, lit.end],
    innerRange: scanned.innerRange,
    arms: scanned.arms,
  }
}

/**
 * The innermost `pick*` call whose range contains `pos`, or null. `pos` is
 * typically the per-lane control offset the timeline carries (the `<…>` start).
 */
export function detectPickControlAt(doc: string, pos: number): PickControl | null {
  const program = parseProgram(doc)
  if (!program) return null
  let best: any = null
  walk(program, (n) => {
    if (!isPickCall(n)) return
    if (pos < n.start || pos > n.end) return
    if (!best || n.start > best.start) best = n
  })
  return best ? buildControl(doc, best) : null
}

/** Every pick* control in the doc, source order. For tests / sweeps. */
export function detectAllPickControls(doc: string): PickControl[] {
  const program = parseProgram(doc)
  if (!program) return []
  const nodes: any[] = []
  walk(program, (n) => {
    if (isPickCall(n)) nodes.push(n)
  })
  nodes.sort((a, b) => a.start - b.start)
  return nodes.map((n) => buildControl(doc, n)).filter((c): c is PickControl => c !== null)
}
