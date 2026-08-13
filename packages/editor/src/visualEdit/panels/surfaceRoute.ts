/**
 * surfaceRoute — which grid a chunk's CONTENT belongs to (#1240).
 *
 * ── WHY THIS IS NOT IN `patternKind.ts` ──────────────────────────────────
 * It was, for about an hour, and the editor suite said no. `patternKind` is
 * imported by `mixer/stripModel.ts`, which the engine reaches through
 * `bareCapture.ts` — so putting the roll's content check there dragged
 * `notation/parse.ts`, and with it `@strudel/mini`'s krill parser, into
 * `StrudelEngine`'s module graph. That test file mocks `@strudel/mini` with a
 * factory closing over a top-level variable, and the earlier load turned it into
 * `Cannot access 'MockPattern' before initialization`: the whole 37-test suite
 * died AT LOAD, four modules from anything this change is about. Both package
 * typechecks stayed at their exact baselines throughout.
 *
 * The split is not a workaround for that failure, it is what the failure
 * revealed. There are two questions here and they were one question only while
 * the head was the sole signal:
 *
 *   1. WHAT KIND OF HEAD IS THIS?  Pure, cheap, no notation parsing.
 *      `patternKind` — and the mixer, the engine's graph, wants only this.
 *   2. WHICH SURFACE SHOULD THIS CONTENT OPEN?  Needs the content parsed,
 *      because a resolver-supplied span sits on a head that says nothing.
 *
 * Question 2 legitimately depends on the notation layer; question 1 must not.
 * The dependency line IS the boundary, so the modules are split along it.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────
 * Head first, and only where the head is silent, ask the ROLL — never the grid.
 *
 * The grid has no WORD vocabulary: every word-like token is a sound name, which
 * is correct for a drum grid where sample names are arbitrary. So it opens for
 * `"bd sd hh cp"`, `"<Gsus G7 Em7 D7>"` and `"lorem ipsum dolor sit"` alike, and
 * cannot tell a drum kit from a chord chart from prose. Asking it "is this
 * yours?" about any word pattern returns yes, so "ask both and take whichever
 * opens" is not a routing rule but the absence of one (#1238).
 *
 * ⚠ IT IS NOT A UNIVERSAL ACCEPTOR, and the earlier claim that it "never returns
 * `wrong-surface`" was measured only on word-like tokens. It DOES decline
 * NUMERICS — `"0 1 2"` and `"1*1, 2*2, 3*3"` come back `wrong-surface`, "the
 * pattern plays numbers, which the piano roll shows". Two consequences, both
 * load-bearing: the grid's silence is uninformative only ACROSS WORD PATTERNS,
 * which is still exactly the chord-vs-drums case this rule turns on; and the
 * grid arm below can REFUSE, so reaching it is not a promise that a view opens.
 * `"bd 3 hh"` is declined by both surfaces and correctly gets no editor.
 *
 * A chord progression drawn as a lane-per-chord-name grid IS a real editable
 * surface and counts as one — it parses, serialises, and a delete on a chord
 * lane really does remove that chord. What it lacks is chrome saying so, which
 * is a labelling gap tracked separately, not a routing one.
 */
import type { ChunkInfo } from '../chunkDetect'
import { parsePianoRoll } from '../notation/parse'
import { patternKind, type PatternKind } from './patternKind'

/** A decided surface. `routeSurface` always reaches one, so it never returns null. */
export type Surface = Exclude<PatternKind, null>

/**
 * Which surface a mini string belongs to, given the head that carries it.
 *
 * Exported so the coverage harness scores exactly what the panel mounts — a
 * second copy of a routing rule answers confidently and diverges silently.
 */
export function routeSurface(headFn: string | null, mini: string): Surface {
  if (headFn === 's' || headFn === 'sound') return 'step'
  if (headFn === 'note' || headFn === 'n') return 'roll'
  // The head is silent — ask the surface that can discriminate word patterns.
  // `step` here means "the grid is the right place to ASK", not "the grid will
  // open": it declines numerics itself, and a pattern both refuse (`"bd 3 hh"`)
  // correctly ends up with no editor and a named gate.
  return parsePianoRoll(mini).ok ? 'roll' : 'step'
}

/**
 * The surface for a chunk, or null when it has no editable content.
 *
 * Head-routed chunks answer exactly as they always did. A chunk whose span the
 * RESOLVER named is the new case: pre-#1240 a mini string on a non-content head
 * could not exist, so `patternKind` returned null and the user got code.
 *
 * Scoped to `miniVia === 'resolver'` deliberately. A head-call literal on a
 * non-content head (`lpf("0 1 2")`) has always landed in standby, and moving it
 * is a separate decision with its own measurement — this is the wiring of
 * admission, not a re-route of everything that owns a string.
 */
export function chunkSurface(chunk: ChunkInfo | null): PatternKind {
  const byHead = patternKind(chunk)
  if (byHead || !chunk || chunk.miniString === null) return byHead
  return chunk.miniVia === 'resolver' ? routeSurface(chunk.headFn, chunk.miniString) : null
}

/**
 * Does this chunk belong to the step grid / to the piano roll?
 *
 * ⚠ THESE EXIST BECAUSE ONE DECISION WAS DERIVED TWICE, AND THE SECOND
 * DERIVATION QUIETLY WON (#1250). `PatternPanel` routed with `chunkSurface`
 * above — content-aware since #1240 — and then each grid re-decided with the
 * HEAD-ONLY `isStepChunk`/`isRollChunk`. For every silent head the panel mounted
 * the right grid and `useGridModel` immediately nulled the model, so the surface
 * half of #1240 reached no user: the page rendered "Click a drum pattern to edit
 * it as a step grid" to someone already sitting on one.
 *
 * Both sides were tested and the SEAM was not — `chunkSurface`'s only production
 * caller is `PatternPanel`, which no vitest arm mounts, and the coverage harness
 * calls `routeSurface` directly. It is also why #1240's break B5 reddened
 * nothing: the resolver scoping cannot matter while the grid refuses these
 * patterns regardless.
 *
 * So the grids ask the SAME function the panel routed with. Two derivations of
 * one decision is the defect; a second predicate that merely agrees today would
 * reintroduce it. `isStepChunk`/`isRollChunk` stay for the callers that really do
 * want the head alone (the mixer strip, sound assignment).
 *
 * No behaviour change for a literal chunk: `s("bd sd")` answers `step` either
 * way, and a literal on a silent head (`lpf("0 1 2")`) is excluded by
 * `chunkSurface`'s `miniVia` scoping exactly as `isStepChunk` excluded it. The
 * delta is precisely the resolver-named silent-head population.
 */
export function opensStepGrid(chunk: ChunkInfo): boolean {
  return chunkSurface(chunk) === 'step'
}

/** Sibling of `opensStepGrid` — see its header for why these exist. */
export function opensPianoRoll(chunk: ChunkInfo): boolean {
  return chunkSurface(chunk) === 'roll'
}
