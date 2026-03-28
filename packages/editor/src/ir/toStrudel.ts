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
      // Fall back: generate each child and combine
      // If all children produce method chains off the same root, join differently
      // For general case: use explicit sequence (note chaining via Strudel isn't direct)
      // The idiomatic approach is to keep the first as root and show the rest inline
      const parts = ir.children.map(gen)
      return parts.join(' ')
    }

    case 'Stack': {
      if (ir.tracks.length === 0) return '""'
      const parts = ir.tracks.map(gen)
      return `stack(\n  ${parts.join(',\n  ')}\n)`
    }

    case 'Choice': {
      const body = gen(ir.then)
      if (Math.abs(ir.p - 0.5) < 0.001) {
        return `${body}.sometimes(x => x)`
      }
      return `${body}.sometimesBy(${ir.p}, x => x)`
    }

    case 'Every': {
      const body = gen(ir.body)
      return `${body}.every(${ir.n}, fast(2))`
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
      // Map known FX names to method chains
      const fxParams = ir.params
      const paramStr = Object.entries(fxParams)
        .map(([k, v]) => `${body}.${k}(${v})`)
        .join('.')
      // If there are params, generate individual method calls
      if (Object.keys(fxParams).length > 0) {
        let result = body
        for (const [k, v] of Object.entries(fxParams)) {
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
  }
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
