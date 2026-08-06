/**
 * stripModel.ts — the channel-strip Mixer's read-model.
 *
 * A `StripModel` is one editable, addressable track projected from one detected
 * chunk: its name, source, gain, pan, sends — everything a strip shows. The
 * whole array is a PURE function of the document (`detectAllChunks` →
 * `buildStripModels`), with no React and no audio, so it unit-tests directly and
 * the strips are a trustworthy projection: close the Mixer, reopen it,
 * re-derive from text → identical (invariant V-mixer-1).
 *
 * S0 is read-only — the model carries the ranges every control will later write
 * to (S1 fader/pan, S3 mute, …), but builds nothing that needs a live engine.
 * The `captureId` join to the analyser map is a CANDIDATE here (the documented
 * numbering rule); it is verified against the engine in S2 (grounding gate GR1)
 * before any meter trusts it.
 */
import { detectAllChunks, type ChunkInfo, type ChainCall } from '../chunkDetect'
import { patternKind } from '../panels/patternKind'
import { readChainMethod } from '../panels/chainMethod'
import { trackIdentity } from '../trackColor'
import { type GainState, readGainState } from './gain'

/** which surface a strip's pattern belongs to (mirrors `ChunkType` + groups). */
export type StripKind = 'step' | 'roll' | 'group' | 'unknown'

export interface StripModel {
  /**
   * STABLE identity across edits: the `$:`/`d1` label, or `#<k>` (position among
   * ALL anonymous tracks, muted included) when anonymous. Unlike `captureId`,
   * this does NOT shift when another track is muted — muting only prefixes a `_`,
   * it never reorders, adds or removes a statement, so the index is invariant.
   * This is the
   * key all non-document UI state hangs on (expand/solo sets, the write-path
   * lookup, the React key, `data-mixer-strip-id`) so that state stays attached to
   * the right strip across a mute toggle (#555). DISTINCT from `captureId`: the
   * engine join must be positional-over-unmuted, this must be stable.
   */
  id: string
  /** position among top-level statements (source order) */
  index: number
  kind: StripKind
  /** the `$:`/`d1` label, or null for an anonymous `$:` */
  label: string | null
  /** display name = the strip's canonical display key (V-track-1, #579): the
   * label (`d1`), else the instrument sample (`hh`) the Song Timeline lanes by,
   * else the head fn / `Track N`. Matches the Timeline lane header for the track. */
  name: string
  /** head function (`s`, `note`, `stack`, …) — drives the source summary line */
  headFn: string | null
  /** the head call's mini-notation string, for the summary line */
  miniString: string | null
  /** the assigned instrument/kit (`.sound`/`.s` for melody, `.bank` for drums) */
  source: string | null
  /** how the fader reads this track's `.gain` (scalar / managed / foreign / absent) */
  gain: GainState
  /** `.pan` scalar (0=L, 0.5=C, 1=R), or null when absent/foreign */
  pan: number | null
  /** true when `.pan` is present but a signal/pattern — the control hands off */
  panForeign: boolean
  /** aux sends — `.room` / `.delay` scalars, or null */
  sends: { room: number | null; delay: number | null }
  /** mute state — true when the statement carries the `_`-prefix mute marker (S3) */
  muted: boolean
  /** whether this strip can be muted — only labelled statements (`$:`/`d1:`) can
   * take the `_` marker; a bare expression statement can't (`_s(...)` would parse
   * as a call to a different identifier), so its mute control is disabled. */
  muteable: boolean
  /** indicator colour — the shared `colorForTrack(id)` (V-track-1, #579), so the
   * strip dot matches the Song Timeline lane for the same track. */
  color: string
  /** the full method chain → the expand drawer (S4) */
  chain: ChainCall[]
  /** the pattern expression span, excl. the `$:` label — write anchor */
  exprRange: [number, number]
  /** the whole statement span — the freshness/write anchor */
  statementRange: [number, number]
  /**
   * Join key to the per-track analyser (`StrudelEngine` captureIds: `"d1"` for a
   * named statement, `"$<n>"` for the nth UNMUTED anonymous `$:`). POSITIONAL by
   * design — it counts only unmuted anonymous tracks, exactly mirroring the
   * engine's `anonIndex` (which skips `_`-muted ids), so it shifts in lockstep
   * with the engine when a sibling is muted and the meter join stays correct.
   * This is why it is DISTINCT from `id` (#555): the engine join must move with
   * the engine; the strip's UI identity must not. Verified against
   * `getTrackSchedulers()` in S2 (GR1).
   */
  captureId: string
}

/**
 * The real name of a statement, or null when it's anonymous. An anonymous
 * Strudel track is written `$: …`, and acorn reports its label as `'$'` (a valid
 * identifier) — NOT null (a bare expression statement has a null label). Both
 * count as anonymous: the strip falls back to a positional id/name and the
 * engine numbers them `$0`, `$1`, … A genuine name (`d1:`, `drums:`) survives.
 */
function namedLabel(label: string | null): string | null {
  return label && label !== '$' ? label : null
}

/** the `_`-prefix mute marker (S3, design §6.4): a statement is muted when its
 * label starts with `_`. Strudel's engine skips `_`-prefixed/-suffixed ids
 * (`StrudelEngine.ts:735`) → no scheduler → silent + a dark meter, all without
 * touching `.gain` (orthogonal to the fader — V-mixer-2). Grounded: acorn parses
 * `_$:`/`_d1:` as labelled statements, so the marker rides on `chunk.label`. */
function isMuted(label: string | null): boolean {
  return label != null && label.startsWith('_')
}

/** the label with the mute marker removed, then resolved to a real name or null
 * (an anonymous `$`/`_$` → null). This is the strip's STABLE identity across a
 * mute toggle: `_d1`→`d1`, `_$`→null, so muting a named track keeps its id. */
function bareLabel(label: string | null): string | null {
  if (label == null) return null
  return namedLabel(isMuted(label) ? label.slice(1) : label)
}

/**
 * Top-level heads that configure global transport / load resources rather than
 * play a track. They return no pattern and never register a scheduler — the
 * engine numbers anonymous `$:` patterns ONLY inside the wrapped `.p()` method
 * (`StrudelEngine.ts:835-839`), which these calls never reach. So they must NOT
 * become strips (#559): a phantom strip shows a dead meter and clutters the
 * console with a track the document does not have.
 *
 * ⚠ TWO CONSEQUENCES THIS COMMENT USED TO CLAIM ARE NO LONGER ITS TO CARRY, and
 * both are worth stating so the list is not defended by hazards it no longer
 * prevents:
 *
 *  - It said a phantom strip would consume a `$<n>` slot and shift every real
 *    track's join by one. That was true, and it was NOT this list's to prevent —
 *    an ordinary unlabelled pattern did it too, with no unknown head involved.
 *    Fixed at the counter instead (#1174, `buildStripModels` below), so a head
 *    missing from this set can no longer misroute a meter.
 *  - It said such a statement would be wrapped in a JS block comment by the solo
 *    overlay, silencing global tempo on any solo. That described an overlay
 *    (`soloOverlay.ts`) which no longer exists: #735 made solo WRITE `_` mute
 *    markers, and it writes them only to `muteable` strips — which unlabelled
 *    statements are not (`_cpm(...)` would parse as a different identifier). So
 *    solo cannot touch a transport call, whether or not it is on this list.
 *
 * What remains is a display concern, which is the right weight for a denylist
 * that is conservative by design.
 */
const NON_TRACK_HEADS = new Set([
  'setcps', 'setCps', 'setcpm', 'setCpm', 'setbpm', 'setBpm',
  'samples', 'hush', 'all',
])

/**
 * Whether a detected chunk is a playable track (→ gets a strip) or a global
 * transport/config statement (→ filtered out, #559). A labelled statement
 * (`$:`, `_$:`, `d1:`) is ALWAYS a track — the user explicitly declared one. An
 * unlabelled bare expression is a track unless its head is a known config call;
 * the denylist is conservative on purpose, so an unknown head still shows a strip
 * (today's behaviour) rather than risk hiding a real track.
 */
export function isTrackChunk(chunk: ChunkInfo): boolean {
  if (chunk.label !== null) return true
  return chunk.headFn === null || !NON_TRACK_HEADS.has(chunk.headFn)
}

/**
 * Capture id for the pattern a document with NO `.p()` call plays (#1094).
 *
 * `$0` is the id an anonymous `$:` in first position would have taken, and that
 * is the whole point: the timeline's hap→lane join maps `$N` onto the positional
 * `d{N+1}`, so haps captured under it land on `d1` — the lane the IR already
 * produces for a bare statement.
 */
export const BARE_CAPTURE_ID = '$0'

/**
 * A captureId no live scheduler can ever be filed under, for an unlabelled
 * statement whose id would be a GUESS (#1174). Indexed by source position so two
 * such statements never collide.
 *
 * The engine writes only user labels and `$<n>`; a `~` prefix is not a legal
 * identifier start, so this can never equal a real key, and the meter simply
 * paints dark — the documented behaviour for a captureId with no scheduler.
 */
function unjoinableId(index: number): string {
  return `~$${index}`
}

/**
 * The captureId an UNLABELLED statement joins the engine on, or null when the
 * document gives no unambiguous answer (#1097).
 *
 * ⚠ THIS IS THE ONLY PLACE THAT DECIDES IT, and the engine reads it from here
 * rather than computing its own. The two used to be derived independently and
 * that is precisely how they drifted: a view's join key and the map key feeding
 * it have to come from one rule, or they agree for a while and then silently
 * stop, with a dead meter as the only symptom.
 *
 * Exactly one track, unlabelled → `$0`, where the numbering can only have
 * produced `$0` and the join therefore holds BY CONSTRUCTION. More than one →
 * null: strudel plays the LAST expression while the strips number from the
 * FIRST, so any id here would be a guess, and a meter on the wrong track is
 * worse than a dark one. Binding the multi-statement case to the statement that
 * actually sounds is #1096.
 */
export function bareCaptureIdFor(tracks: readonly ChunkInfo[]): string | null {
  if (tracks.length !== 1) return null
  if (tracks[0].label !== null) return null
  return BARE_CAPTURE_ID
}

/** the combinator heads whose statement is a group of voices (sub-strips in S6) */
const GROUP_HEADS = new Set(['stack', 'cat', 'layer', 'arrange'])

function stripKind(chunk: ChunkInfo): StripKind {
  const k = patternKind(chunk)
  if (k) return k
  if (chunk.headFn && GROUP_HEADS.has(chunk.headFn)) return 'group'
  return 'unknown'
}

/** the instrument/kit a strip shows — `.sound`/`.s` for melody, `.bank` for drums. */
function readSource(chunk: ChunkInfo, kind: StripKind): string | null {
  if (kind === 'step') return readChainMethod(chunk, ['bank'])?.value ?? null
  if (kind === 'roll') return readChainMethod(chunk, ['sound', 's'])?.value ?? null
  return readChainMethod(chunk, ['sound', 's', 'bank'])?.value ?? null
}

/** a scalar numeric chain method (`.pan(0.3)` → 0.3); null when absent/foreign. */
function readScalar(chunk: ChunkInfo, name: string): number | null {
  const call = chunk.chain.find((c) => c.name === name && c.args.length >= 1)
  const arg = call?.args[0]
  return arg && arg.numeric !== null ? arg.numeric : null
}

/** true when `name` is present in the chain with a non-numeric (signal) first arg. */
function isForeign(chunk: ChunkInfo, name: string): boolean {
  const call = chunk.chain.find((c) => c.name === name && c.args.length >= 1)
  return call !== undefined && call.args[0].numeric === null
}

/**
 * The strip's DISPLAY key (V-track-1, #579) — the ONE canonical key both the
 * strip NAME and the strip COLOUR derive from, chosen to equal what the Song
 * Timeline shows for the same track so the two views never diverge:
 *
 *  - **Named track** (`bass:`, `lead:`) → its label. The user explicitly named
 *    it; honour that. (The Timeline resolves its positional key back to this
 *    label too, so both read `bass`.)
 *  - **Anonymous `$:`** → `d{ordinal}`, its 1-based position among tracks — the
 *    SAME positional id the engine gives the hap (`trackId`) that the Timeline
 *    lanes by. So an unnamed track reads `d1`/`d2`/… identically in both views.
 *
 * `d{ordinal}` is deliberately NOT descriptive — it is the friction that nudges
 * the user to rename the track (write a `name:` label) when they want a
 * meaningful name. The display never mutates the code; renaming is the user's
 * own explicit edit (a later slice). Two same-sample tracks therefore stay
 * distinct (`d1`/`d2`), name AND colour, with no auto-naming.
 *
 * DISTINCT from the strip's stable UI `id` (`#k` for anon, mute-safe per #555)
 * and from the engine-join `captureId` (`$k`): those serve identity/metering;
 * this serves DISPLAY and matches the Timeline.
 */
function displayKey(label: string | null, ordinal: number): string {
  return bareLabel(label) ?? `d${ordinal}`
}

function buildStripModel(
  chunk: ChunkInfo,
  index: number,
  ordinal: number,
  id: string,
  captureId: string,
): StripModel {
  const kind = stripKind(chunk)
  const source = readSource(chunk, kind)
  // Centralized track identity (V-track-1, #579): the strip's NAME and COLOUR
  // both derive from ONE display key via the shared `trackIdentity` resolver, so
  // they can't diverge from each other or from the Song Timeline. A named track
  // keys on its label (`bass`); an anonymous `$:` keys on `d{ordinal}` — the same
  // positional id the engine gives the hap the Timeline lanes by — so an unnamed
  // track reads `d1`/`d2` identically in both views (and stays distinct from a
  // same-sample sibling). The marker-stripped label is still kept for the
  // `label`/muted/muteable fields.
  const identity = trackIdentity(displayKey(chunk.label, ordinal))
  return {
    id,
    index,
    kind,
    label: bareLabel(chunk.label),
    name: identity.name,
    headFn: chunk.headFn,
    miniString: chunk.miniString,
    source,
    gain: readGainState(chunk),
    pan: readScalar(chunk, 'pan'),
    panForeign: isForeign(chunk, 'pan'),
    sends: { room: readScalar(chunk, 'room'), delay: readScalar(chunk, 'delay') },
    muted: isMuted(chunk.label),
    muteable: chunk.label != null,
    color: identity.color,
    chain: chunk.chain,
    exprRange: chunk.exprRange,
    statementRange: chunk.statementRange,
    captureId,
  }
}

/**
 * Project every detected chunk into a strip, in source order, assigning each TWO
 * distinct keys — a stable UI identity (`id`) and a positional engine-join key
 * (`captureId`) — because the two have opposite requirements under a mute (#555):
 *
 *  - **`id` (stable identity):** a named statement → its bare label `d1`; an
 *    anonymous `$:` (muted or not) → `#<index>`, the ABSOLUTE statement position.
 *    Invariant across any mute toggle — muting only prefixes a `_`, it never
 *    reorders/adds/removes a statement — so UI state keyed by `id` (expand/solo
 *    sets, the write lookup, the React key) stays attached to the same strip.
 *
 *  - **`captureId` (engine join):** a named statement → its bare label `d1`; an
 *    UNMUTED anonymous `$:` → `$<k>`, k counting only unmuted anonymous tracks —
 *    exactly the engine's `anonIndex` numbering, which also skips `_`-muted ids
 *    (`StrudelEngine.ts:735-739`); a MUTED anonymous `_$:` → `_$<index>`, never a
 *    live scheduler key (the engine skipped it) → a dark meter. POSITIONAL on
 *    purpose: it shifts in lockstep with the engine so the meter join stays
 *    correct when a sibling is muted.
 *
 * Both are unique: labels are unique; `#<index>` is unique by position and never
 * collides with a name (JS labels can't start with `#`) nor a captureId (`$`/`_$`).
 */
export function buildStripModels(chunks: ChunkInfo[]): StripModel[] {
  let anonAll = 0 // ALL anonymous tracks (muted + unmuted) → the stable id index
  let anonLive = 0 // UNMUTED anonymous `$:` only → the engine captureId index
  let ordinal = 0 // 1-based position among tracks → the `d{N}` display key
  const models: StripModel[] = []
  // The id every UNLABELLED statement shares, decided once for the whole
  // document (#1174) — `$0` when there is exactly one, otherwise unjoinable.
  const bareId = bareCaptureIdFor(chunks.filter(isTrackChunk))
  chunks.forEach((chunk, index) => {
    // Transport/config statements (`setcps`, `samples`, …) are not tracks — skip
    // them BEFORE numbering so the remaining anonymous tracks get `$0…$n` that
    // line up with the engine's anonIndex (#559). `index` stays the true
    // source-order position (preserving its documented meaning).
    if (!isTrackChunk(chunk)) return
    ordinal++ // 1-based, counts every track in source order (config already skipped),
    // matching the engine's `d{N}` hap numbering the Timeline displays.
    const bare = bareLabel(chunk.label)
    // Stable identity: name, else position among ALL anonymous tracks (muted
    // included). Invariant across a mute toggle — muting prefixes a `_` but never
    // adds/removes an anonymous statement, so this index never shifts on mute.
    const id = bare ?? `#${anonAll++}`
    // Positional engine-join key, counting the SAME population the engine's
    // `anonIndex` counts — which is the whole correctness condition here, and
    // what this used to get wrong (#1174).
    //
    // The engine increments only inside the `.p()` wrapper, and only for an id
    // containing `$` that is not `_`-prefixed (`StrudelEngine.ts:835-839`). So:
    //   named label  → `.p("drums")`, no `$`  → no increment. Keyed by name.
    //   muted `_$:`  → refused outright      → no increment. `_$<index>`.
    //   anon `$:`    → `$<anonIndex>`        → increment.
    //   UNLABELLED   → never reaches `.p()`  → NO INCREMENT.
    //
    // That last line is the fix. A bare statement was consuming a slot the
    // engine never assigns, so every track after it joined one slot high and
    // metered its neighbour — measured as a drum strip showing the hi-hat's
    // level while the hi-hat sat dark. It was reachable two ways (a bare
    // statement above a labelled one, and a transport call the head denylist
    // had not heard of), which is why the repair belongs on the counter rather
    // than on the list.
    let captureId: string
    if (bare !== null) captureId = bare
    else if (isMuted(chunk.label)) captureId = `_$${index}`
    else if (chunk.label === null) captureId = bareId ?? unjoinableId(index)
    else captureId = `$${anonLive++}`
    models.push(buildStripModel(chunk, index, ordinal, id, captureId))
  })
  return models
}

/**
 * Char offset of the top-level statement whose instrument (`.sound`/`.s`/
 * `.bank`) is `source`, or null when none matches. Used to LOCATE a per-hap
 * runtime error (e.g. a soundfont out-of-range note) back to its owning track's
 * line when the error's own stack is bundle-only and the hap's `loc` is
 * degenerate (#567). Reuses the strips' own source-extraction so the locate
 * agrees with what the Mixer shows. First match wins (rare: two tracks, one
 * instrument).
 */
export function statementOffsetForSource(doc: string, source: string): number | null {
  const strip = buildStripModels(detectAllChunks(doc)).find((s) => s.source === source)
  return strip ? strip.statementRange[0] : null
}

/**
 * The display names of every track in `doc` EXCEPT the statement starting at
 * `selfStatementStart` — the set a rename checks against to reject a duplicate
 * (#585). Keys off the SAME `buildStripModels` projection the Mixer renders, so
 * the names match exactly what `renameEdit`'s `takenNames` must compare against
 * (and what the colour-override store is keyed by). Used by the Song Timeline
 * rename handler, which has only the code text (the Mixer/Pattern chip pass their
 * already-derived `strips` instead). Excludes the renamed track by its statement
 * offset so renaming an anon `d{N}` to its own positional name isn't a self-
 * collision.
 */
export function otherTrackNames(doc: string, selfStatementStart: number): string[] {
  return buildStripModels(detectAllChunks(doc))
    .filter((s) => s.statementRange[0] !== selfStatementStart)
    .map((s) => s.name)
}

/**
 * The strip that OWNS a given source offset — the top-level statement whose
 * `statementRange` contains `offset`. Strips are one-per-top-level-statement, so
 * this resolves BOTH a top-level active chunk (anchor == the strip's own start)
 * AND a NESTED chunk (a `pickRestart` section / `stack` arm / `arrange` arm,
 * whose `statementRange` is the nested span, `chunkDetect.ts:122-128`) back to
 * its owning track (#727). An exact-start match only handled the top-level case,
 * so the Pattern-tab chip lost the name whenever the cursor sat inside a nested
 * pattern. Statements don't overlap → at most one strip contains any offset.
 */
export function stripContainingOffset(
  strips: StripModel[],
  offset: number,
): StripModel | undefined {
  return strips.find(
    (s) => s.statementRange[0] <= offset && offset < s.statementRange[1],
  )
}
