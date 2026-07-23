/**
 * timelineMarks — note-mark collection for the canvas Song timeline (#419).
 *
 * Split from `timelineScene.ts` because it needs the RUNTIME `collectCycles` /
 * `laneKeyOf` from `@stave/editor` — importing those values pulls the whole
 * editor bundle (and its CJS `gifenc` dep) into vitest, which breaks the loader.
 * Keeping this in its own file lets `timelineScene.ts` (the pure builder) stay
 * unit-testable without mocking. The real collection path is covered by the
 * Playwright spec against a real evaluated song.
 */

import type { IREvent, PatternIR } from '@stave/editor'
import { collectCycles, laneKeyOf, structuralWalk } from '@stave/editor'
import { extractPitch } from './pitch'
import {
  downsampleMarksToCap,
  EMPTY_MARKS,
  type CollectedMarks,
  type SceneClip,
  type SceneNote,
} from './timelineScene'

/** Per-lane mini-note-mark cap, so a long/dense song can't retain unbounded
 *  marks. Density (per-cycle counts) always covers the full span regardless. */
export const NOTE_MARK_CAP_PER_LANE = 2000

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * Every DECLARED top-level track's containment anchor `(laneKey → $:-line start)`,
 * read straight from the IR Track wrappers — NOT from `collectCycles` events.
 *
 * #927 (P1b): a track whose note value is a signal (`n(run(8)).s(…)`,
 * `n(irand(8))…`) emits NO static-IR events, so the event-driven anchor build
 * below never registers its lane. Its eval haps, however, DO carry a `loc` (the
 * `.s("piano")` mini-string), so `irLaneFor` resolves them to the largest anchor
 * ≤ that offset — the PREVIOUS track's lane — and the signal track silently folds
 * into its neighbour (one lane where there should be two). Seeding the anchor map
 * from the declared Track wrappers (which exist and carry `trackId` + a `$:`-line
 * `loc` even with zero events) gives every declared track its own anchor, so a
 * located hap lands on its OWN lane and the eval-lane append (timelineScene) then
 * renders it. Loc-less haps (`note(sine…)`) are unaffected — they still fall
 * through to `evalTrackIdToLaneKey`. Only the TOP-LEVEL wrappers matter: a stack's
 * inner voices share their track's `trackId` (one lane), so no recursion.
 */
function declaredTrackAnchors(ir: PatternIR): Array<[string, number]> {
  const tracks = ir.tag === 'Stack' ? ir.tracks : [ir]
  const out: Array<[string, number]> = []
  for (const t of tracks) {
    if (t.tag !== 'Track') continue
    const start = t.loc?.[0]?.start
    if (typeof t.trackId === 'string' && typeof start === 'number' && Number.isFinite(start)) {
      out.push([t.trackId, start])
    }
  }
  return out
}

/**
 * Collect read-only mini-note marks for the display span by querying the IR
 * directly (`collectCycles`), grouped by the SAME `laneKeyOf` identity the
 * analysis lanes use, capped per lane. `null` IR / non-positive span → empty.
 *
 * Deterministic for a given IR. Returns marks keyed by lane so the pure scene
 * builder can merge them onto the matching analysis lanes.
 */
export function collectNoteMarks(
  events: IREvent[] | null,
  ir: PatternIR | null,
  displayCycles: number,
  capPerLane: number = NOTE_MARK_CAP_PER_LANE,
): CollectedMarks {
  if (!ir || !Number.isFinite(displayCycles) || displayCycles <= 0) return EMPTY_MARKS
  // Display fidelity requires the EVAL path when it's available: an evaluated
  // hap carries the RESOLVED note (`n("0 2 4").scale("C:major")` → "C3"/"E3"/"G3"
  // — Strudel applies the scale at query time) plus `context.locations`, while
  // the static IR carries the raw source token ("0") and drops `.scale` to an
  // unused param, so IR-read pitch is a flat/wrong-pitch bar for any degree/
  // scale pattern (PV174 / P274). So: STRUCTURE (lanes/clips/source anchors)
  // always comes from the IR walk below; MARKS come from `events` when present
  // (attributed to IR lanes by source containment) and fall back to the IR only
  // pre-eval — correct there for note-names + percussion, and the only source
  // before the first eval. `events` present ⇒ skip the IR mark build (discarded).
  const useEval = Array.isArray(events) && events.length > 0
  // IR-derived note marks — the pre-eval fallback. Left empty when `useEval`.
  const marksByLane = new Map<string, SceneNote[]>()
  // Per-lane representative source offset for expand-to-bind: the innermost
  // content anchor `structuralWalk` records (first-wins on the first leaf of the
  // lane that carries a `loc`; char offsets into the evaluated source). The bind
  // maps this → editor cursor → the Pattern panel rebinds (#422). First-wins so
  // the anchor is stable. Populated from the walk's `sourceOffset` below.
  const sourceByLane = new Map<string, number>()
  // Per-lane OUTERMOST combinator offset for clip gestures (#451). A lane's loc
  // set is ordered leaf→…→outermost wrappers, but the LAST entry can be a non-
  // combinator suffix (`.p('x')`, `.gain(…)`), so `structuralWalk` takes the
  // MINIMUM start: the outermost `arrange`/`cat` call begins earliest in the
  // source, while leaves, inner combinators and suffix methods all start later.
  // `detectArrangeAt(min)` then resolves the OUTER combinator (that offset lies
  // only inside it, not the inner one) so a nested combinator arm edits as one
  // outer clip. `sourceByLane` keeps the innermost (content) anchor for
  // expand→bind. This is the primary anchor the clip write-back targets (see
  // STRUCTURE-WRITEBACK-PROVENANCE.md).
  //
  // #456 — in a MULTI-track (`$:`) file, the walk layers a Track-WRAPPER loc
  // (`withWrapperLoc`) spanning the whole `$:` line, whose start is the line
  // start = `dollarPos` — STRICTLY before the combinator (which sits after the
  // `$: ` prefix). The raw minimum would pick that wrapper offset, which lies
  // OUTSIDE every combinator, so `detectArrangeAt` would resolve null and the clip
  // op silently no-ops (selection still works — it's display-side). A single-track
  // lane has no wrapper loc, which is why standalone arranges wrote back fine. So
  // `structuralWalk` EXCLUDES the wrapper loc (`start === dollarPos`) from the
  // minimum; the combinator start always exceeds `dollarPos`, so this never drops
  // a real combinator and is a no-op when `dollarPos` is absent (hand-built IR).
  const arrangeByLane = new Map<string, number>()
  // Per-lane statement (label) offset for the display NAME (#579 STEP 2). The
  // live engine drops the JS label and keys the track positionally as `d{N}`;
  // `dollarPos` is the `$:`/`bass:` STATEMENT offset, so the label is recoverable
  // from the source there. First-wins (one Track = one dollarPos; a stack's
  // voices share it). ALSO the containment index eval haps are attributed to
  // (`collectHapMarks`). The pure scene builder reads the source at this offset
  // to resolve a named track's label (`resolveLaneName`).
  const labelOffsetByLane = new Map<string, number>()
  // Clip derivation (#386): per lane, the active arrange-arm index for each
  // integer SONG cycle, from `structuralWalk`'s per-cycle arm selection (an arm
  // spans whole cycles). Run-length-encoded into clips below. Only lanes reached
  // under an arrangement combinator (an `armIndex`) appear here; bare tracks get
  // an implicit clip from the pure builder. `label` = the arm's first-reached
  // sample/note (`armLabels`), kept out of the pure scene module (editor bundle —
  // P172). Feeds the `armIndex` clip gestures write back (provenance doc).
  const nCycles = Math.ceil(displayCycles)
  const armByCycleByLane = new Map<string, Array<number | undefined>>()
  const armLabelByLane = new Map<string, Map<number, string>>()
  let capped = false
  // STRUCTURE — lane anchors from the resilient structural walk (#945/#974), NOT reduced from
  // `collectCycles` events. The walk derives the SAME anchors from source structure — proven
  // byte-identical to collect over the corpus (structuralWalk.test.ts, then the equivalence
  // gate collectNoteMarks.structuralWalk.test.ts) — but survives mid-edit / semantically-
  // invalid code where an eval-backed producer throws: a bad sub-node blanks only its own lane,
  // so the timeline keeps its skeleton (PV212). Marks then JOIN to these lanes from haps
  // (below). `sourceByLane`/`arrangeByLane`/`labelOffsetByLane`/`clipsByLane` only ANNOTATE
  // rows by key (timelineScene builds rows from `analysis.lanes` + eval-mark keys), so an extra
  // resilience lane the walk reaches — collect never does on valid code — cannot add a phantom
  // row; it simply has no annotation consumer until a hap lands in it.
  for (const lane of structuralWalk(ir, nCycles)) {
    const key = lane.laneKey
    if (lane.sourceOffset !== undefined) sourceByLane.set(key, lane.sourceOffset)
    if (lane.dollarPos !== undefined) labelOffsetByLane.set(key, lane.dollarPos)
    if (lane.arrangeOffset !== undefined) arrangeByLane.set(key, lane.arrangeOffset)
    if (lane.armByCycle) armByCycleByLane.set(key, lane.armByCycle)
    if (lane.armLabels) armLabelByLane.set(key, lane.armLabels)
  }
  // MARKS — pre-eval fallback only. Per-onset IR marks (pitch/gain/voice) are BEHAVIOUR the
  // structural walk does not compute, so they still come from `collectCycles` — correct pre-
  // eval for note-names + percussion, and the only source before the first eval. Skipped
  // entirely when eval haps are present (`useEval` → `collectHapMarks` supplies display-
  // faithful resolved marks, PV174), so the common post-play path calls neither `collectCycles`
  // nor this loop. `voice` = the sample name (`ev.s`), the per-voice partition key that recovers
  // a drum stack's bd/sd/hh as sub-rows (#424); reading it here keeps the pure scene module out
  // of the editor bundle (P172). The per-lane cap is a span-preserving downsample applied AFTER
  // the walk (capping in cycle order would truncate a dense lane's clip mid-song, #714).
  if (!useEval) {
    for (const ev of collectCycles(ir, 0, nCycles)) {
      const cycle = ev.begin
      if (!Number.isFinite(cycle) || cycle < 0 || cycle >= displayCycles) continue
      const key = laneKeyOf(ev)
      let arr = marksByLane.get(key)
      if (!arr) {
        arr = []
        marksByLane.set(key, arr)
      }
      const end = Number.isFinite(ev.end) && ev.end > cycle ? ev.end : cycle
      arr.push({
        cycle,
        end,
        pitch: extractPitch(ev)?.midi ?? null,
        gain: clamp01(ev.gain ?? 1),
        voice: ev.s ?? null,
      })
    }
  }
  // #927 — seed containment anchors for DECLARED tracks the event walk missed
  // (a signal-valued track emits zero static-IR events, so it never appeared
  // above). Additive + `!has`-guarded: event-producing tracks keep their
  // event-derived `dollarPos`; only zero-event tracks gain an anchor, so a
  // located hap in their span lands on their OWN lane instead of folding into
  // the previous one. Only meaningful for the eval path (haps carry `loc`).
  if (useEval && ir.tag === 'Stack') {
    for (const [key, start] of declaredTrackAnchors(ir)) {
      if (!labelOffsetByLane.has(key)) labelOffsetByLane.set(key, start)
    }
  }
  // When eval events are present, derive the marks from them instead of the IR
  // (display fidelity — PV174). Attributed to the IR lanes by source containment
  // (NOT trackId equality, which diverges for anon `$:` — PV175). Structure
  // (source/arrange/label offsets, clips) stays IR-owned above.
  const activeMarksByLane = useEval
    ? collectHapMarks(events as IREvent[], displayCycles, labelOffsetByLane)
    : marksByLane
  // Bound each lane to `capPerLane` marks by downsampling ACROSS its span (keep
  // every Nth), not by dropping the tail. A dense lane (e.g. a drum stack at
  // ~35 onsets/cycle) keeps its full clip extent with uniformly thinner ticks
  // instead of being cut off at cycle ~57 (#714). Sparse lanes (≤ cap) are
  // untouched (same array reference).
  for (const [key, arr] of activeMarksByLane) {
    const ds = downsampleMarksToCap(arr, capPerLane)
    if (ds.capped) {
      activeMarksByLane.set(key, ds.marks)
      capped = true
    }
  }
  // Run-length-encode each lane's per-cycle arm index into contiguous clips.
  // A change in arm index (or a silent cycle) closes the current clip; this
  // yields one clip per arm-occurrence per period (so a song shown over
  // multiple periods repeats its clips, matching the timeline). Silent cycles
  // inside an arm split it — acceptable for read-only display this PR.
  const clipsByLane = new Map<string, SceneClip[]>()
  for (const [key, byCycle] of armByCycleByLane) {
    const labels = armLabelByLane.get(key)
    const clips: SceneClip[] = []
    let runArm: number | undefined
    let runStart = 0
    const flush = (endCycle: number): void => {
      if (runArm !== undefined) {
        clips.push({
          armIndex: runArm,
          startCycle: runStart,
          endCycle,
          label: labels?.get(runArm) ?? null,
        })
      }
    }
    for (let c = 0; c < nCycles; c++) {
      const arm = byCycle[c]
      if (arm !== runArm) {
        flush(c)
        runArm = arm
        runStart = c
      }
    }
    flush(nCycles)
    if (clips.length > 0) clipsByLane.set(key, clips)
  }
  return { marksByLane: activeMarksByLane, sourceByLane, arrangeByLane, labelOffsetByLane, clipsByLane, capped }
}

/**
 * Lane key for an eval hap that has no IR lane — a signal (`.segment`) or
 * bare-ref track the static IR never emitted events for (#864 / P1b). Mirrors
 * `trackIdFromLabel`: an anonymous `$:` producer id (`$N`, source-ordered) → the
 * positional `d{N+1}`; a named track keeps its name. This aligns eval-only lane
 * identity with the IR convention (a signal at source position 1 reads `d2`, not
 * `$1`) and keeps eval lanes disjoint from IR lanes (which exist only for
 * event-producing tracks). Absent trackId (hand-built haps) → a single `d1`.
 */
function evalTrackIdToLaneKey(trackId: string | undefined): string {
  if (!trackId) return 'd1'
  const m = /^\$(\d+)$/.exec(trackId)
  return m ? `d${Number(m[1]) + 1}` : trackId
}

/**
 * Derive note marks from EVALUATED haps (#861), attributed to a lane by SOURCE
 * CONTAINMENT when possible, else to an EVAL-BACKED lane (#864 / P1b).
 *
 * Containment: the IR lane whose `$:`/`name:` statement offset (`dollarPos`, in
 * `labelOffsetByLane`) is the LARGEST one ≤ the hap's `loc[0].start`. NOT
 * `laneKeyOf(hap)` string equality — the IR lane key for an anon `$:` is `d{N}`
 * while the eval hap trackId is `$N`, so equality would SPLIT them (PV175).
 * Containment aligns them via the source offsets both sides already carry.
 *
 * When a hap has no `loc` (a sampled signal), or its `loc` lands before every IR
 * lane's statement (a bare-ref whose `loc` points at the `const` definition), it
 * belongs to a track the static IR produced no lane for. It is routed to an EVAL
 * lane keyed by its own `trackId` (`evalTrackIdToLaneKey`); `buildTimelineScene`
 * renders those keys as their own rows (#864). This surfaces signal/bare-ref
 * tracks AND stops their marks polluting an unrelated IR lane (the prior
 * default-lane behaviour).
 *
 * Pitch comes from `extractPitch` — the hap's `note` is already the RESOLVED
 * name/number ("C3", or a fractional MIDI for a sampled signal).
 */
function collectHapMarks(
  events: readonly IREvent[],
  displayCycles: number,
  labelOffsetByLane: ReadonlyMap<string, number>,
): Map<string, SceneNote[]> {
  const out = new Map<string, SceneNote[]>()
  // (laneKey, dollarPos) pairs ascending by dollarPos — the containment index.
  const anchors = [...labelOffsetByLane].sort((a, b) => a[1] - b[1])
  // Containment hit (an IR lane), or undefined when the hap's source start lands
  // before every lane's statement (or it has no `loc`).
  const irLaneFor = (start: number | undefined): string | undefined => {
    if (typeof start !== 'number' || !Number.isFinite(start)) return undefined
    let hit: string | undefined
    for (const [key, pos] of anchors) {
      if (pos <= start) hit = key
      else break // ascending → no later anchor can be ≤ start
    }
    return hit
  }
  for (const ev of events) {
    const cycle = ev.begin
    if (!Number.isFinite(cycle) || cycle < 0 || cycle >= displayCycles) continue
    // Containment first (keeps a hap on its named/positional IR lane); else an
    // eval-backed lane keyed by the hap's own producer id (#864 / P1b).
    const key = irLaneFor(ev.loc?.[0]?.start) ?? evalTrackIdToLaneKey(ev.trackId)
    let arr = out.get(key)
    if (!arr) {
      arr = []
      out.set(key, arr)
    }
    const end = Number.isFinite(ev.end) && ev.end > cycle ? ev.end : cycle
    arr.push({
      cycle,
      end,
      pitch: extractPitch(ev)?.midi ?? null,
      gain: clamp01(ev.gain ?? 1),
      voice: ev.s ?? null,
    })
  }
  return out
}
