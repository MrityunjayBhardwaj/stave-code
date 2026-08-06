/**
 * bareCapture — the ONE decision about what a bare document's captured track is.
 *
 * Strudel picks what to play two ways: with at least one `.p()` it stacks the
 * registered patterns, and with none it plays the document's LAST EXPRESSION.
 * Every per-track map the engine publishes is written inside the `.p()` wrapper,
 * so the second branch produced no captured pattern at all — #1094 hit that on
 * the song frame, #1095 fixed that one map, and #1097 named the rest
 * (`capturedPatterns` → `trackSchedulers`, the analyser side-taps, and the inline
 * `.viz()` request/options).
 *
 * The reason this is a module rather than four guards is that the four maps must
 * agree about WHICH track the bare pattern is. Four hooks each with their own
 * idea of that is how the song frame ended up keyed independently of the strip
 * the mixer draws. One decision, four readers.
 *
 * ── WHY THE ID IS NOT SIMPLY `$0` ────────────────────────────────────────────
 *
 * The mixer builds its strips from the PARSED DOCUMENT (`buildStripModels`) and
 * joins them to the engine by `captureId`, numbering unmuted anonymous tracks
 * `$0…$n` in SOURCE ORDER. A document with two bare statements therefore has
 * strips `$0` and `$1` — but strudel plays only the LAST expression, so the one
 * pattern that exists belongs to `$1`, and writing it at `$0` would light the
 * wrong strip's meter. Measured on the real surface: bare and labelled documents
 * produce the same strips with the same captureIds, and only the labelled one
 * ever moves a meter (`_1097-bare-track-maps.spec.ts`).
 *
 * Rather than guess which statement sounded, this refuses the ambiguous case.
 * Exactly one track → the numbering can only have produced `$0`, so the join is
 * correct BY CONSTRUCTION rather than by coincidence, and `bareCapture.test.ts`
 * pins that against `buildStripModels` itself so the two cannot drift apart.
 * More than one → no entry, which leaves today's dark meter rather than a
 * confidently wrong one. Binding a multi-statement bare document to the
 * statement that actually plays is #1096, and when it lands it lands here, once,
 * for all four maps.
 *
 * ⚠ LAYERING. `isTrackChunk` lives in the mixer because that is what first
 * needed it, but it is a document-level predicate, not a mixer concern. It is
 * imported rather than re-implemented deliberately: a second copy of "what
 * counts as a track" is exactly the drift this module exists to prevent — the
 * guard has to be computed from the same rule that assigns the ids it is
 * guarding, not from a parallel one that merely agrees today.
 */
import { detectAllChunks } from '../visualEdit/chunkDetect'
import { isTrackChunk } from '../visualEdit/mixer/stripModel'

/**
 * Capture id for the pattern a document with NO `.p()` call plays (#1094).
 *
 * `$0` is the id an anonymous `$:` in first position would have taken, and that
 * is the whole point: the timeline's hap→lane join maps `$N` onto the positional
 * `d{N+1}`, so haps captured under it land on `d1` — the lane the IR already
 * produces for a bare statement. Picking a fresh name would have made an
 * eval-only lane sitting beside the IR one, which is the shape that duplicates a
 * row.
 */
export const BARE_CAPTURE_ID = '$0'

/**
 * The captureId a bare document's played pattern belongs to, or `null` when the
 * document is not an unambiguous single bare track.
 *
 * Refused, each for a stated reason rather than for tidiness:
 *  - more than one track — strudel plays the last, and which strip that is is
 *    #1096's question, not this one's;
 *  - a LABELLED track (`$:`, `d1:`, or `_$:`) — the `.p()` path owns those. A
 *    `_`-muted one reaches here (its capture is skipped) and must STAY dark:
 *    the mixer keys it `_$<index>`, which is deliberately never a live
 *    scheduler key, so writing an entry would contradict the mute.
 */
export function resolveBareCaptureId(code: string): string | null {
  const tracks = detectAllChunks(code).filter(isTrackChunk)
  if (tracks.length !== 1) return null
  if (tracks[0].label !== null) return null
  return BARE_CAPTURE_ID
}
