/**
 * IR Inspector — Strudel-vocabulary projection rules.
 *
 * Renders the IR tree using user-typed vocabulary by default
 * (e.g. `.layer(...)` → "layer", not "Stack"). Phase 19-06 (#76).
 *
 * Per CONTEXT D-01..D-03 (locked). Truth-table at RESEARCH §2.
 * Module-private to packages/app per RESEARCH Q10 — no editor barrel
 * exposure.
 *
 * Two pure functions, both exhaustive over PatternIR['tag']:
 * - projectedLabel(node): string | undefined
 *   undefined → row hidden (D-02 fold rule); parent's children list
 *   splices in this node's children.
 * - projectedChildren(node): readonly PatternIR[]
 *   Per-tag projected child list; may differ from raw children() for
 *   desugars (layer/jux/off).
 *
 * The .off() projection uses option (a) from CONTEXT pre-mortem #1 —
 * existing-IR relabel via stripInnerLate(node) recursion. RESEARCH §2.x.
 *
 * Special carve-outs:
 * - Code is whitelisted out of the D-02 hide rule (RESEARCH NEW
 *   pre-mortem #8) — hiding parser-failure-escape-hatch tags swallows
 *   debugging signal.
 * - Pure as Choice.else_ on mini `?` is filtered (RESEARCH NEW
 *   pre-mortem #10) — drops the empty () leaf.
 */
import type { PatternIR } from '@stave/editor'

/**
 * localStorage key for the IR-mode toggle. Colon-prefix convention —
 * matches existing keys `stave:editorTheme`, `stave:sidebar-width`,
 * `stave:autosnapIdleMs` (RESEARCH §5.1-5.2). Exported so the panel
 * and tests can reference one source of truth.
 */
export const LOCALSTORAGE_KEY = 'stave:inspector.irMode'

// D-03 mini-notation symbol mapping (RESEARCH §2.y — symbol-with-value
// for parametric tags Fast/Elongate; symbol-only for arity-zero).
function miniSymbol(node: PatternIR): string {
  switch (node.tag) {
    case 'Sleep':    return '~'
    case 'Cycle':    return '<>'
    case 'Choice':   return '?'   // p always 0.5 from mini ?
    case 'Elongate': return `@${node.factor}`
    case 'Fast':     return `*${node.factor}` // mini *N path
    case 'Stack':    return '{}'
    case 'Seq':      return '[]'
    default:         return node.tag // unreachable; for narrowing
  }
}

export function projectedLabel(node: PatternIR): string | undefined {
  // Tags whose userMethod is set (user-callable) project to that name —
  // covers fast, slow, every, sometimes, sometimesBy, mask/when, gain,
  // pan, room, delay, ..., late, degrade, degradeBy, chunk, ply, pick,
  // struct, swing, shuffle, scramble, chop, layer, jux, off, stack.
  if ('userMethod' in node && node.userMethod !== undefined) {
    return node.userMethod
  }

  // userMethod === undefined or absent. D-02 hide rule + carve-outs.
  switch (node.tag) {
    // Mini-notation symbol tags (D-03)
    case 'Sleep':
    case 'Cycle':
    case 'Choice':
    case 'Elongate':
      return miniSymbol(node)
    // Fast and Stack are dual-origin: from method or from mini.
    // userMethod === undefined here → from mini (parseMini doesn't set it).
    case 'Fast':
      return miniSymbol(node)
    case 'Stack':
      return miniSymbol(node) // mini polymetric `{...}`
    case 'Seq':
      return miniSymbol(node) // mini `[...]` / euclid
    // Code: parser-failure escape hatch — render even when userMethod
    // undefined. RESEARCH NEW pre-mortem #8 — hiding swallows debugging
    // signal.
    case 'Code':
      return 'Code'
    // Play: leaf, no userMethod field per PatternIR.ts:38.
    case 'Play':
      return 'Play'
    // Pure: D-02 hide. Caller filters Pure-as-Choice.else_ explicitly
    // via projectedChildren (RESEARCH NEW pre-mortem #10).
    case 'Pure':
      return undefined
    // Synthetic intermediates that should fold into parent (D-02):
    // - Late from .off() (parseStrudel.ts:585-588)
    // - FX(pan,±1) from .jux() (parseStrudel.ts:514-515)
    // - Ramp (no parser path; defensive)
    // - Loop (no parser path; defensive)
    case 'Late':
    case 'FX':
    case 'Ramp':
    case 'Loop':
      return undefined
    // Tags that always have userMethod when constructed by the parser
    // — fall here only if a future parser path forgets to set it.
    // Fall through to raw tag name as a fail-safe (visible bug, not
    // silent loss).
    case 'Slow':
    case 'When':
    case 'Every':
    case 'Degrade':
    case 'Chunk':
    case 'Ply':
    case 'Pick':
    case 'Struct':
    case 'Swing':
    case 'Shuffle':
    case 'Scramble':
    case 'Chop':
      return node.tag
    default: {
      // Exhaustiveness check — TS error if a tag is missing.
      const _exhaustive: never = node
      return _exhaustive
    }
  }
}

export function projectedChildren(node: PatternIR): readonly PatternIR[] {
  switch (node.tag) {
    case 'Stack': {
      // Per-userMethod dispatch (D-01 children projection rules).
      const m = node.userMethod
      if (m === 'layer') {
        // Raw IR: Stack(f(body), g(body)) — already correct shape.
        return node.tracks
      }
      if (m === 'jux') {
        // Raw IR: Stack(FX(pan=-1, body), FX(pan=+1, transformed))
        // Strip the FX(pan, ±1) wrappers; surface [body, transformed].
        return node.tracks.map((t) => {
          if (t.tag === 'FX' && t.userMethod === undefined) {
            return t.body
          }
          return t
        })
      }
      if (m === 'off') {
        // Raw IR: Stack(body, transformed) where transformed contains
        // a synthetic Late at some descendant body position. Strip the
        // Late; return [body, transformed-without-Late]. RESEARCH §2.x
        // option (a).
        const [body, transformed] = node.tracks
        if (body === undefined || transformed === undefined) {
          return node.tracks
        }
        return [body, stripInnerLate(transformed)]
      }
      // 'stack' (user-typed) and undefined (mini polymetric): tracks verbatim
      return node.tracks
    }
    case 'Seq':   return node.children
    case 'Cycle': return node.items
    case 'Choice': {
      // Filter Pure else_ (RESEARCH NEW pre-mortem #10). Mini `?`
      // constructs Choice(0.5, then, IR.pure()).
      if (node.else_.tag === 'Pure' && node.else_.userMethod === undefined) {
        return [node.then]
      }
      return [node.then, node.else_]
    }
    case 'Every':
      return node.default_ ? [node.body, node.default_] : [node.body]
    case 'When':
      return [node.body]
    case 'FX':
    case 'Ramp':
    case 'Fast':
    case 'Slow':
    case 'Elongate':
    case 'Late':
    case 'Degrade':
    case 'Ply':
    case 'Struct':
    case 'Swing':
    case 'Shuffle':
    case 'Scramble':
    case 'Chop':
    case 'Loop':
      return [node.body]
    case 'Chunk':
      return [node.body, node.transform]
    case 'Pick':
      return [node.selector, ...node.lookup]
    case 'Pure':
    case 'Play':
    case 'Sleep':
    case 'Code':
      return []
    default: {
      const _exhaustive: never = node
      return _exhaustive
    }
  }
}

/**
 * Recursively strip the synthetic Late inserted by .off()'s desugar.
 *
 * Background: .off(t, f) is parsed as Stack(body, f(Late(t, body))).
 * The Late lives at some `body` position inside the transformed sub-IR
 * (parseStrudel.ts:585-588 places it at the leaf-most body of
 * parseTransform's result; chain `.gain(0.5).fast(2)` wraps it in
 * Fast{body: FX{body: lateBody}}).
 *
 * Strategy: traverse single-body chains; replace the synthetic Late
 * (tag === 'Late' && userMethod === undefined) with its body. Stop at
 * non-body-bearing nodes (Pure, Play, Sleep, Code, Stack, Seq, Cycle,
 * Choice, Pick, Chunk) to prevent infinite loops.
 *
 * RESEARCH §2.x — option (a) existing-IR relabel; no virtual node
 * synthesis.
 *
 * Exported for unit testability (T-03 tests it directly).
 */
export function stripInnerLate(node: PatternIR): PatternIR {
  if (node.tag === 'Late' && node.userMethod === undefined) {
    return node.body
  }
  // Single-body wrappers: recurse into body.
  switch (node.tag) {
    case 'FX':
    case 'Ramp':
    case 'Fast':
    case 'Slow':
    case 'Elongate':
    case 'Late':
    case 'Degrade':
    case 'Ply':
    case 'Struct':
    case 'Swing':
    case 'Shuffle':
    case 'Scramble':
    case 'Chop':
    case 'When':
    case 'Loop':
      return { ...node, body: stripInnerLate(node.body) }
    default:
      // Multi-child / leaf nodes (Pure, Play, Sleep, Code, Stack, Seq,
      // Cycle, Choice, Pick, Chunk): stop. .off()'s transform never
      // produces these in current parser paths (parseTransform yields
      // single-body wrappers only).
      return node
  }
}
