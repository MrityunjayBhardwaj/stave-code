/**
 * The grid panels' write, as edits (#409 velocity; moved here from the panels' hook by
 * #1887).
 *
 * A step grid or piano roll writes its mini-notation over the chunk's mini range, and
 * may carry a `.gain("…")` that runs PARALLEL to that mini — per-column velocity. Both
 * go out as ONE edit list, so the mini and its `.gain` are one undo step. This file is
 * the whole of that decision: what the chunk's `.gain` reads as, whether it is one the
 * velocity layer manages, and which bytes change. The hook that calls it keeps the
 * model, the gesture and the writer; it decides nothing about text.
 *
 * We only ever touch a `.gain` whose arg is a scalar number or a string — one the grid
 * could have authored. A signal or any other expression is left byte-identical.
 *
 * This module is pure.
 */
import type { ChunkInfo } from '../chunkDetect'
import type { OffsetEdit } from '../writeback'
import type { ChunkGain, GainWrite } from './model'

/**
 * Read a chunk's `.gain` argument into a normalized `ChunkGain`:
 *   - no `.gain`            → { mini:null, numeric:null, foreign:false }
 *   - scalar `.gain(0.4)`   → { numeric:0.4 }   (a uniform base — velocity reads it)
 *   - string `.gain("…")`   → { mini:inner }    (per-column; applyGain checks alignment)
 *   - any other arg         → { foreign:true }  (a signal/expr — hands off)
 */
export function readChunkGain(chunk: ChunkInfo): ChunkGain {
  const call = chunk.chain.find((c) => c.name === 'gain')
  const arg = call?.args[0]
  if (!call || !arg) return { mini: null, numeric: null, foreign: false }
  if (arg.numeric !== null) return { mini: null, numeric: arg.numeric, foreign: false }
  if (/^["'`]/.test(arg.raw)) return { mini: arg.raw.slice(1, -1), numeric: null, foreign: false }
  return { mini: null, numeric: null, foreign: true } // some other expression
}

/** is the `.gain` arg one velocity manages (a scalar number or a string)? */
function managedGainArg(chunk: ChunkInfo): { call: ChunkInfo['chain'][number]; argRange: [number, number] } | null {
  const call = chunk.chain.find((c) => c.name === 'gain')
  const arg = call?.args[0]
  if (!call || !arg) return null
  if (arg.numeric !== null || /^["'`]/.test(arg.raw)) return { call, argRange: arg.range }
  return null
}

/** the gain edits for one `mutate`, given the model's `GainWrite` intent */
function gainEdits(fresh: ChunkInfo, g: GainWrite): OffsetEdit[] {
  if (g.kind === 'skip') return []
  const managed = managedGainArg(fresh)
  if (g.kind === 'clear') {
    // remove ONLY a `.gain` we manage (scalar/string); absent/foreign → nothing
    return managed ? [{ range: managed.call.range, text: '' }] : []
  }
  const lit = g.quoted ? `"${g.value}"` : g.value
  // replace the whole managed arg in place (swaps scalar↔string as needed)…
  if (managed) return [{ range: managed.argRange, text: lit }]
  // …else append `.gain(…)` after the expression (the Mixer's quick-transform idiom)
  return [{ range: [fresh.exprRange[1], fresh.exprRange[1]], text: `.gain(${lit})` }]
}

/** does prev's gain intent already match the chunk's current `.gain`? */
export function gainUnchanged(g: GainWrite, cur: ChunkGain): boolean {
  if (g.kind === 'skip') return true // not managing it → never force a reseed
  if (g.kind === 'clear') return cur.mini === null && cur.numeric === null
  return g.quoted ? cur.mini === g.value : cur.numeric !== null && cur.numeric === parseFloat(g.value)
}

/**
 * Everything one grid write changes: the mini over its range, and — when the panel
 * carries velocity — the coordinated `.gain` edit beside it. `gain` is the model's
 * intent (`serializeGain`), or null for a panel or a write that does not manage one.
 *
 * Null when the chunk has no mini range to write over: nothing may be written, and
 * that is not the same answer as an empty list.
 */
export function gridWriteEdits(fresh: ChunkInfo, mini: string, gain: GainWrite | null): OffsetEdit[] | null {
  if (!fresh.miniRange) return null
  const edits: OffsetEdit[] = [{ range: fresh.miniRange, text: mini }]
  if (gain) edits.push(...gainEdits(fresh, gain))
  return edits
}
