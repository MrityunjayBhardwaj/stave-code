/**
 * toStrudel — PatternIR → Strudel code string interpreter.
 *
 * Generates valid Strudel code from a PatternIR tree.
 * The generated code should be evaluatable by StrudelEngine.
 *
 * Design decision: Simple Seq nodes where all children are Play nodes
 * collapse into mini-notation ("c4 e4 g4") for idiomatic Strudel output.
 * Any Seq with non-Play children uses explicit method chains.
 */

import type { PatternIR, PlayParams } from './PatternIR'

/** Generate Strudel code from a PatternIR tree. */
export function toStrudel(ir: PatternIR): string {
  return gen(ir)
}

function gen(ir: PatternIR): string {
  switch (ir.tag) {
    case 'Pure':
      return '""'

    case 'Code':
      // Identity — opaque fragment, return as-is
      return ir.code

    case 'Play':
      return genPlay(ir.note, ir.params)

    case 'Sleep':
      // Sleep is absorbed into Seq as mini-notation "~" (rest)
      return '~'

    case 'Seq': {
      if (ir.children.length === 0) return '""'
      // Try to collapse to mini-notation if all children are simple
      if (canCollapse(ir.children)) {
        return collapseToMini(ir.children)
      }
      // Non-collapsible: use Strudel's cat() for sequential composition
      const parts = ir.children.map(gen)
      return `cat(${parts.join(', ')})`
    }

    case 'Stack': {
      // TODO(layer round-trip — Phase 19-04 T-01): if all tracks are
      // non-trivial transforms applied to the same body skeleton, this
      // is a `.layer(...)` shape. Recogniser ordering must be:
      //   jux-shape   FIRST  (most specific — 2 tracks, both FX(pan, ±1))
      //   off-shape   SECOND (2 tracks, second is Late wrapping body)
      //   layer-shape THIRD  (general N-track, each track is f(body))
      //   plain stack LAST   (heterogeneous tracks)
      // v1 emits the structural stack(...) form — matches the soft target
      // for jux/off from 19-03. Belongs with the bidirectional-editing
      // follow-up (#8). RESEARCH §1.1 §B4.
      if (ir.tracks.length === 0) return '""'
      const parts = ir.tracks.map(gen)
      return `stack(\n  ${parts.join(',\n  ')}\n)`
    }

    case 'Choice': {
      const thenCode = gen(ir.then)
      if (ir.else_.tag === 'Pure') {
        // Simple case: pattern plays with probability p (per-cycle,
        // matching Choice's actual semantic — the whole pattern fires
        // or doesn't on each cycle). `.sometimesBy(retain, x => x)` is
        // the Strudel method whose semantic matches: per-cycle binary
        // choice of identity-vs-empty.
        //
        // We emit `sometimesBy(p, x => x)` — applies the identity
        // transform with probability p (i.e., keeps the pattern). The
        // per-event `.degradeBy()` round-trip target now belongs to the
        // `Degrade` tag introduced in Tier 4 (Phase 19-03). Keeping
        // `.degradeBy()` here would collide on round-trip.
        const p = +ir.p.toFixed(4)
        return `${thenCode}.sometimesBy(${p}, x => x)`
      }
      // General case: both branches with complementary probabilities.
      // sometimesBy keeps the per-cycle granularity; the original
      // .degradeBy() emit was per-event, mismatched with Choice's
      // per-cycle semantic. Keep the stack shape but use sometimesBy.
      const elseCode = gen(ir.else_)
      const pThen = +ir.p.toFixed(4)
      const pElse = +(1 - ir.p).toFixed(4)
      return `stack(\n  ${thenCode}.sometimesBy(${pThen}, x => x),\n  ${elseCode}.sometimesBy(${pElse}, x => x)\n)`
    }

    case 'Every': {
      // Reconstruct the Strudel transform from the stored body + default_
      const base = ir.default_
      const baseCode = base ? gen(base) : gen(ir.body)
      const transformStr = base ? extractTransform(ir.body, base) : '() => rev'
      return `${baseCode}.every(${ir.n}, ${transformStr})`
    }

    case 'Cycle': {
      if (ir.items.length === 0) return '""'
      // Cycle → mini-notation angle bracket alternation
      const notes = ir.items.map(item => {
        if (item.tag === 'Play') return String(item.note)
        if (item.tag === 'Sleep') return '~'
        return gen(item)
      })
      // If all items are simple notes, use mini-notation
      const allSimple = ir.items.every(item => item.tag === 'Play' || item.tag === 'Sleep')
      if (allSimple) {
        // Determine whether note or s pattern
        const firstPlay = ir.items.find(i => i.tag === 'Play')
        if (firstPlay && firstPlay.tag === 'Play' && firstPlay.params.s) {
          return `s("<${notes.join(' ')}>")`
        }
        return `note("<${notes.join(' ')}>")`
      }
      return `note("<${notes.join(' ')}>")`
    }

    case 'When': {
      const body = gen(ir.body)
      return `${body}.mask("${ir.gate}")`
    }

    case 'FX': {
      const body = gen(ir.body)
      if (Object.keys(ir.params).length > 0) {
        // Each param key becomes a method call: .room(0.8), .delay(0.5), etc.
        let result = body
        for (const [k, v] of Object.entries(ir.params)) {
          result = `${result}.${k}(${v})`
        }
        return result
      }
      return `${body}.${ir.name}()`
    }

    case 'Ramp': {
      const body = gen(ir.body)
      return `${body}.${ir.param}(slow(${ir.cycles}, saw))`
    }

    case 'Fast': {
      const body = gen(ir.body)
      return `${body}.fast(${ir.factor})`
    }

    case 'Slow': {
      const body = gen(ir.body)
      return `${body}.slow(${ir.factor})`
    }

    case 'Loop':
      // All Strudel patterns loop implicitly
      return gen(ir.body)

    case 'Elongate':
      // Mini-notation `a@N` only renders inside a Seq context. As a
      // standalone, the factor is informationally lost when going
      // back to Strudel — emit the inner body unchanged. Round-trip
      // fidelity for elongation in seqs is handled where the parent
      // Seq emits its mini-notation string (Tier 3 work).
      return gen(ir.body)

    case 'Late':
      // Tier 4 — `late(offset)` shifts events forward by `offset` cycles
      // while preserving cycle length (pattern.mjs:2081-2089).
      return `${gen(ir.body)}.late(${ir.offset})`

    case 'Degrade': {
      // Tier 4 — `Degrade.p` is the per-event RETENTION probability.
      // Round-trip: `.degrade()` when p === 0.5 (the Strudel shorthand,
      // signal.mjs:720); `.degradeBy(1 - p)` otherwise (signal.mjs:699-706
      // — Strudel's amount is the DROP probability).
      const body = gen(ir.body)
      if (ir.p === 0.5) return `${body}.degrade()`
      const dropAmount = +(1 - ir.p).toFixed(4)
      return `${body}.degradeBy(${dropAmount})`
    }

    case 'Chunk': {
      // Tier 4 — `chunk(n, f)` (pattern.mjs:2569-2578). The IR stores
      // `transform` as the body with the user's transform pre-applied
      // (extracted at parse time), so we recover the transform string
      // the same way `Every` does — via `extractTransform`.
      const baseCode = gen(ir.body)
      const transformStr = extractTransform(ir.transform, ir.body)
      return `${baseCode}.chunk(${ir.n}, ${transformStr})`
    }

    case 'Ply': {
      // Tier 4 — `ply(n)` (pattern.mjs:1905-1911). 1:1 method↔tag mapping,
      // so the round-trip is direct: emit `.ply(n)` over the body.
      return `${gen(ir.body)}.ply(${ir.n})`
    }

    case 'Pick': {
      // Tier 4 (Phase 19-04 T-02) — `pick(lookup)` (pick.mjs:44-54).
      // 1:1 method↔tag mapping, so the round-trip is direct: emit
      // `.pick([...])` with each lookup entry's gen output.
      const sel = gen(ir.selector)
      const elems = ir.lookup.map(p => gen(p))
      return `${sel}.pick([${elems.join(', ')}])`
    }

    case 'Struct': {
      // Tier 4 (Phase 19-04 T-03) — `struct(mask)` (pattern.mjs:1161-1163).
      // 1:1 method↔tag mapping with mask carried as a raw string (matches
      // When.gate precedent). Direct round-trip.
      return `${gen(ir.body)}.struct("${ir.mask}")`
    }
  }
}

/** Deep structural equality for PatternIR nodes (plain objects). */
function nodesEqual(a: PatternIR, b: PatternIR): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Recover the Strudel transform string from Every's body + default_.
 * e.g. Every(4, Fast(2, base), base) → "fast(2)"
 */
function extractTransform(body: PatternIR, base: PatternIR): string {
  if (body.tag === 'Fast' && nodesEqual(body.body, base)) return `fast(${body.factor})`
  if (body.tag === 'Slow' && nodesEqual(body.body, base)) return `slow(${body.factor})`
  if (body.tag === 'FX' && nodesEqual(body.body, base)) {
    const params = Object.entries(body.params).map(([k, v]) => `.${k}(${v})`).join('')
    return `x => x${params}`
  }
  // Generic fallback: inline arrow returning the body expression
  return `() => ${gen(body)}`
}

/** Generate code for a Play node. */
function genPlay(note: string | number, params: PlayParams): string {
  if (params.s) {
    return `s("${params.s}")`
  }
  return `note("${note}")`
}

/**
 * Returns true if all children can be collapsed to a simple mini-notation string.
 * Collapse is safe when: all children are Play (with no complex params) or Sleep.
 */
function canCollapse(children: PatternIR[]): boolean {
  return children.every(child => {
    if (child.tag === 'Sleep') return true
    if (child.tag === 'Play') {
      // Only collapse if no FX params beyond s/gain/velocity
      const { s, gain, velocity, color, ...rest } = child.params
      return Object.keys(rest).length === 0
    }
    return false
  })
}

/**
 * Collapse a list of Play/Sleep children into mini-notation.
 * e.g. [Play('c4'), Play('e4'), Play('g4')] → note("c4 e4 g4")
 */
function collapseToMini(children: PatternIR[]): string {
  // Determine if this is a sample pattern (any Play has .s)
  const hasSample = children.some(c => c.tag === 'Play' && c.params.s)

  const tokens = children.map(child => {
    if (child.tag === 'Sleep') return '~'
    if (child.tag === 'Play') {
      if (hasSample) return String(child.params.s ?? child.note)
      return String(child.note)
    }
    return '~'
  })

  const notation = tokens.join(' ')
  if (hasSample) return `s("${notation}")`
  return `note("${notation}")`
}
