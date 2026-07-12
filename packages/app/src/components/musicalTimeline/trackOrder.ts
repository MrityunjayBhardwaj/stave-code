/**
 * Source order of a song's tracks, read off the static IR (#871).
 *
 * The timeline's lane ORDER is structure, and structure is IR-owned — the IR
 * carries a `Track` node per `$:`/`name:` statement, in source order, keyed by
 * the SAME `trackId` the lanes key on (`d{N}` for an anonymous track, the label
 * for a named one). Crucially it carries that node even for a track that emits
 * NO static-IR events (a sampled signal, a bare-ref `$: beat`) — those tracks
 * are absent from `analyzeSong`'s lanes (which accumulate over EVENTS) and get
 * their marks from the evaluated haps instead (#865). Without this order the
 * scene could only append them after the IR lanes, so a signal written FIRST
 * rendered below a drum track written second.
 *
 * Pure and structural: no eval, no source scanning — the IR already knows.
 */
import type { PatternIR } from '@stave/editor'

/**
 * The `trackId`s of the song's top-level tracks, in source order. `[]` when the
 * IR is absent or carries no identified track (a hand-built IR in a test, an IR
 * whose root is neither a `Track` nor a `Stack` of them) — callers treat that as
 * "no order information" and keep their existing lane order.
 *
 * Only the TOP level is walked: a track's inner structure (an `arrange`/`cat`
 * combinator, a nested stack of voices) lives inside ONE lane, so it has no say
 * in lane order.
 */
export function sourceTrackOrder(ir: PatternIR | null | undefined): readonly string[] {
  if (!ir) return []
  const roots: readonly PatternIR[] = ir.tag === 'Stack' ? ir.tracks : [ir]
  const out: string[] = []
  const seen = new Set<string>()
  for (const node of roots) {
    if (node?.tag !== 'Track') continue
    const id = node.trackId
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
