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
  /**
   * The statement's label is COMMENTED OUT (`// $:`) — the row exists so the
   * numbering holds still while a line is toggled, but nothing can ever play
   * it (#1696). Absent rather than `false` when the label is live, mirroring
   * the IR field it reads.
   */
  readonly commented?: true
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
    const ghost = node.commented === true ? ({ commented: true } as const) : undefined
    out.push(
      typeof start === 'number' && Number.isFinite(start)
        ? { id, offset: start, ...ghost }
        : { id, ...ghost },
    )
  }
  return out
}

/**
 * The declared lanes an ENGINE producer id (`$N`) indexes, in source order —
 * every declared track except the commented-out ones (#1696).
 *
 * ── WHY THIS IS NOT JUST `declaredTracks` ───────────────────────────────────
 * `$N` and `d{M}` count different populations. `$N` is the engine's: the
 * statements strudel actually ran. `d{M}` is the document's: one row per
 * statement the parser found, INCLUDING a `// $:` whose row exists only to
 * hold its number still while the line is toggled (#1686). Strudel never sees
 * a comment, so with a ghost among the rows the two populations differ, and
 * the arithmetic `$N -> d{N+1}` that assumed they were the same is off by the
 * ghosts before it.
 *
 * This is the same off-by-a-population bug as #1174, where a strip joined on a
 * key the engine never wrote. The rule there is the rule here: count the SAME
 * statements the engine counts.
 *
 * A MUTED track stays in — `_$:` is a statement strudel runs (it returns
 * silence without registering), and both sides number it. Only a comment is
 * invisible to the engine.
 *
 * Positional, so it is meaningful only while both sides agree on what a
 * statement is. That is the standing condition on every `$N` join here
 * (PV175), not something this function adds.
 */
export function captureLaneOrder(ir: PatternIR | null | undefined): readonly string[] {
  const out: string[] = []
  for (const t of declaredTracks(ir)) if (t.commented !== true) out.push(t.id)
  return out
}
