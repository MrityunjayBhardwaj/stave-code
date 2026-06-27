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
 * (`StrudelEngine.ts:735-739`), which these calls never reach. So they must NOT
 * become strips (#559): a phantom strip would (1) show a dead meter, (2) consume
 * a `$<n>` slot and shift every real track's positional `captureId` by one (an
 * off-by-one meter join), and (3) be wrapped in a JS block comment by the solo
 * overlay (`soloOverlay.ts`), silencing the global tempo on any solo.
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
  let anonLive = 0 // UNMUTED anonymous only → the engine captureId index
  let ordinal = 0 // 1-based position among tracks → the `d{N}` display key
  const models: StripModel[] = []
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
    // Positional engine-join key: counts only UNMUTED anonymous tracks, mirroring
    // the engine's anonIndex (which skips `_`-muted ids); a muted anonymous track
    // gets `_$<index>` (never a live scheduler key → dark meter).
    let captureId: string
    if (bare !== null) captureId = bare
    else if (isMuted(chunk.label)) captureId = `_$${index}`
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
