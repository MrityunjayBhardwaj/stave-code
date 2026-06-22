/**
 * chainMethod.ts — read a string-valued chain method (`.sound`/`.s`/`.bank`)
 * off a detected chunk, for the sound-assignment pickers (#514/#515).
 *
 * The WRITE side lives in the panel (it needs `applyEdit`/`Writeback`): when the
 * method is present, replace its arg range; otherwise insert `.method('value')`
 * at `exprRange[1]` (the same idiom as the Mixer's `addTransform`). This pure
 * reader is the READ side — current value + the arg range to overwrite.
 *
 * Single-quoted literals are emitted on write (PV44/P62 — the transpiler reifies
 * double-quoted strings to mini Patterns; a single-quoted id is left alone).
 */
import type { ChunkInfo } from '../chunkDetect'

export interface ChainMethodValue {
  /** the method name that matched (e.g. `sound` or `s`) */
  name: string
  /** the unquoted argument value (e.g. `sawtooth`, `RolandTR909`) */
  value: string
  /** source range of the argument literal, for in-place replacement */
  range: [number, number]
}

/**
 * Find the first chain call whose name is in `names` and whose first argument is
 * a string literal, returning its unquoted value and arg range. Returns null
 * when no such call exists (the method is absent → insert path) or the first arg
 * isn't a plain string literal (a signal/expression → hands off).
 */
export function readChainMethod(chunk: ChunkInfo, names: readonly string[]): ChainMethodValue | null {
  const call = chunk.chain.find((c) => names.includes(c.name) && c.args.length >= 1)
  const arg = call?.args[0]
  if (!call || !arg) return null
  const q = arg.raw[0]
  if ((q === '"' || q === "'" || q === '`') && arg.raw[arg.raw.length - 1] === q) {
    return { name: call.name, value: arg.raw.slice(1, -1), range: arg.range }
  }
  return null // bare identifier / signal / expression — not a plain string id
}
