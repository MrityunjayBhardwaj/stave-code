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
import type { ChunkInfo, ChainCall } from '../chunkDetect'
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
  /** aux sends — `.room` / `.delay` scalars, or null */
  sends: { room: number | null; delay: number | null }
  /** mute state — always false in S0 (the mute idiom lands in S3) */
  muted: boolean
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

function buildStripModel(chunk: ChunkInfo, index: number, anonIndex: number): StripModel {
  const kind = stripKind(chunk)
  const source = readSource(chunk, kind)
  const named = namedLabel(chunk.label)
  const id = named ?? `$${index}`
  const name = named ?? source ?? chunk.headFn ?? `Track ${index + 1}`
  return {
    id,
    index,
    kind,
    label: named,
    name,
    headFn: chunk.headFn,
    miniString: chunk.miniString,
    source,
    gain: readGainState(chunk),
    pan: readScalar(chunk, 'pan'),
    sends: { room: readScalar(chunk, 'room'), delay: readScalar(chunk, 'delay') },
    muted: false,
    color: stripColor(kind, chunk.miniString),
    chain: chunk.chain,
    exprRange: chunk.exprRange,
    statementRange: chunk.statementRange,
    captureId: named ?? `$${anonIndex}`,
  }
}

/**
 * Project every detected chunk into a strip, in source order. Anonymous tracks
 * (`$:` or a bare expression) are numbered separately for the captureId
 * candidate (§5.5, `$0`/`$1`/…) while the strip `index` counts all statements.
 */
export function buildStripModels(chunks: ChunkInfo[]): StripModel[] {
  let anon = 0
  return chunks.map((chunk, index) => {
    const isAnon = namedLabel(chunk.label) === null
    return buildStripModel(chunk, index, isAnon ? anon++ : anon)
  })
}
