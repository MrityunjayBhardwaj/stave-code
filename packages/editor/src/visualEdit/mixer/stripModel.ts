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
import { sampleVoice, VOICE_FALLBACK_COLOR } from '../panels/drumVoices'
import { type GainState, readGainState } from './gain'

/** which surface a strip's pattern belongs to (mirrors `ChunkType` + groups). */
export type StripKind = 'step' | 'roll' | 'group' | 'unknown'

export interface StripModel {
  /** stable id across edits: the `$:`/`d1` label, or `$<index>` when anonymous */
  id: string
  /** position among top-level statements (source order) */
  index: number
  kind: StripKind
  /** the `$:`/`d1` label, or null for an anonymous `$:` */
  label: string | null
  /** display name: label, else the source/head summary */
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
  /** indicator colour (the drum-voice palette, or a neutral fallback) */
  color: string
  /** the full method chain → the expand drawer (S4) */
  chain: ChainCall[]
  /** the pattern expression span, excl. the `$:` label — write anchor */
  exprRange: [number, number]
  /** the whole statement span — the freshness/write anchor */
  statementRange: [number, number]
  /**
   * CANDIDATE join key to the per-track analyser (`StrudelEngine` captureIds:
   * `"d1"` for a named statement, `"$<n>"` for the nth anonymous `$:`). Verified
   * against `getTrackSchedulers()` in S2 (GR1) before any meter reads it.
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

/** first mini token, variant-stripped, for the colour lookup (e.g. `bd:3`→`bd`). */
function firstMiniToken(mini: string | null): string | null {
  if (!mini) return null
  const tok = mini.trim().split(/\s+/)[0]
  if (!tok || tok === '~' || tok === '-') return null
  return tok.replace(/[[\]<>(),].*/, '').split(':', 1)[0] || null
}

/** indicator colour: the drum-voice palette for step patterns, neutral else. */
function stripColor(kind: StripKind, miniString: string | null): string {
  if (kind === 'step') {
    const tok = firstMiniToken(miniString)
    if (tok) return sampleVoice(tok).color
  }
  return VOICE_FALLBACK_COLOR
}

function buildStripModel(chunk: ChunkInfo, index: number, id: string): StripModel {
  const kind = stripKind(chunk)
  const source = readSource(chunk, kind)
  // Display name uses the marker-stripped label (`_d1`→`d1`) so a muted strip
  // reads `d1`, not `_d1`; the muted/muteable flags carry the mute state.
  const name = bareLabel(chunk.label) ?? source ?? chunk.headFn ?? `Track ${index + 1}`
  return {
    id,
    index,
    kind,
    label: bareLabel(chunk.label),
    name,
    headFn: chunk.headFn,
    miniString: chunk.miniString,
    source,
    gain: readGainState(chunk),
    pan: readScalar(chunk, 'pan'),
    panForeign: isForeign(chunk, 'pan'),
    sends: { room: readScalar(chunk, 'room'), delay: readScalar(chunk, 'delay') },
    muted: isMuted(chunk.label),
    muteable: chunk.label != null,
    color: stripColor(kind, chunk.miniString),
    chain: chunk.chain,
    exprRange: chunk.exprRange,
    statementRange: chunk.statementRange,
    // captureId === id: a NAMED strip joins on its bare label (`d1`); a muted
    // track's id never matches a live scheduler key (it's `_$<n>` or a name the
    // engine skipped while muted) → that strip's meter stays dark, exactly the
    // muted behaviour (S2). For an all-unmuted doc this is byte-identical to S2.
    captureId: id,
  }
}

/**
 * Project every detected chunk into a strip, in source order, assigning each a
 * stable, unique id that doubles as the analyser join key (captureId):
 *  - a named statement (`d1:`, or muted `_d1:`) → its bare label `d1` (STABLE
 *    across mute, unique since labels are unique);
 *  - an UNMUTED anonymous `$:` → `$<k>`, k counting only unmuted anonymous
 *    tracks — exactly the engine's `anonIndex` numbering, which also skips
 *    `_`-muted ids (`StrudelEngine.ts:735-739`), so the captureIds of unmuted
 *    siblings stay aligned regardless of how many tracks are muted;
 *  - a MUTED anonymous `_$:` → `_$<index>`, unique by statement index and never
 *    a live scheduler key (the engine skipped it) → a dark meter.
 */
export function buildStripModels(chunks: ChunkInfo[]): StripModel[] {
  let anon = 0
  return chunks.map((chunk, index) => {
    const bare = bareLabel(chunk.label)
    let id: string
    if (bare !== null) id = bare
    else if (isMuted(chunk.label)) id = `_$${index}`
    else id = `$${anon++}`
    return buildStripModel(chunk, index, id)
  })
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
