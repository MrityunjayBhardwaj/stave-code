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
 * One top-level track the document declares: its `trackId`, plus the source
 * offset of the STATEMENT that declares it when there is one.
 *
 * `offset` is the `$:`/`name:` label's own position — the `Track` wrapper's
 * `loc[0].start`. It is the coordinate the drawn rows also carry (as
 * `labelOffset`/`dollarPos`), which is what lets the two be reconciled
 * positionally when their NAMES disagree (#1101).
 *
 * `undefined` means the statement carries NO LABEL — a bare expression
 * (`s("bd*4")`, `arrange(...)`, `stack(...)`, even `s("bd").p('kick')`, whose
 * `.p()` names the producer without labelling the statement). That absence is
 * load-bearing, not a gap: muting is a PREFIX on the label (`_$:`, `_name:`), so
 * a statement with no label cannot be muted, and every muted track therefore has
 * an offset. Measured across `$:` / `name:` / `_$:` / `_name:` / `_$: …p()` —
 * offset present in all — and bare / bare-`.p()` / bare-`stack` — absent in all.
 */
export interface DeclaredTrack {
  readonly id: string
  readonly offset?: number
}

/**
 * The song's top-level declared tracks, in source order — the ONE walk behind
 * both projections below, so the order and the offsets can never enumerate
 * different track sets.
 *
 * Only the TOP level is walked: a track's inner structure (an `arrange`/`cat`
 * combinator, a nested stack of voices) lives inside ONE lane, so it has no say
 * in lane order and declares no separate row.
 */
export function declaredTracks(ir: PatternIR | null | undefined): readonly DeclaredTrack[] {
  if (!ir) return []
  const roots: readonly PatternIR[] = ir.tag === 'Stack' ? ir.tracks : [ir]
  const out: DeclaredTrack[] = []
  const seen = new Set<string>()
  for (const node of roots) {
    if (node?.tag !== 'Track') continue
    const id = node.trackId
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue
    seen.add(id)
    const start = node.loc?.[0]?.start
    out.push(
      typeof start === 'number' && Number.isFinite(start) ? { id, offset: start } : { id },
    )
  }
  return out
}

/**
 * The `trackId`s of the song's top-level tracks, in source order. `[]` when the
 * IR is absent or carries no identified track (a hand-built IR in a test, an IR
 * whose root is neither a `Track` nor a `Stack` of them) — callers treat that as
 * "no order information" and keep their existing lane order.
 *
 * The ids of `declaredTracks`, projected: ordering needs no offsets, and stating
 * it this way keeps one walk rather than two enumerations that could drift.
 */
export function sourceTrackOrder(ir: PatternIR | null | undefined): readonly string[] {
  return declaredTracks(ir).map((t) => t.id)
}
