/**
 * Render a long stretch of song as short consecutive pieces and join them
 * (#1771), for a render whose context cannot pause.
 *
 * `renderPatternOffline` keeps a long render cheap by pausing at every window
 * and scheduling only that window's notes (#1658). Firefox has no
 * `OfflineAudioContext.suspend`, so there every render schedules the whole song
 * up front and its cost grows with the length squared: measured, a 512 s
 * supersaw track took 83.4 s against 6.3 s in Chromium, and a bounce went
 * 2.5 / 7.7 / 29.6 s for 60 / 120 / 240 s. Short pieces bring back the linear
 * cost, because each one is a small up-front render.
 *
 * ⚠ A JOIN CUTS WHAT RINGS ACROSS IT. A piece plays only the notes whose onset
 * falls inside it, so a note from an earlier piece that is still sounding is
 * lost at the join. Each piece therefore starts `leadSeconds` early and plays
 * the notes of that lead-in too, then drops it; whatever rings for longer than
 * the lead-in (a long reverb, a delay's feedback) still stops at the join. That
 * is acceptable for a DRAWN waveform and not for a bounce, which is why only the
 * Song timeline's display render uses this; a bounce keeps the single render.
 *
 * Deliberately free of imports: the render arrives as a function.
 */

/** One piece: render from `from`, keep `[keepFrom, to)`. Song seconds. */
export interface RenderPiece {
  readonly from: number
  readonly keepFrom: number
  readonly to: number
}

/** The pieces covering `[0, duration)`, each keeping `pieceSeconds`, the last shorter. */
export function piecesOf(duration: number, pieceSeconds: number, leadSeconds: number): RenderPiece[] {
  if (!(duration > 0) || !(pieceSeconds > 0)) return []
  const pieces: RenderPiece[] = []
  for (let keepFrom = 0; keepFrom < duration; keepFrom += pieceSeconds) {
    pieces.push({
      from: Math.max(0, keepFrom - Math.max(0, leadSeconds)),
      keepFrom,
      to: Math.min(duration, keepFrom + pieceSeconds),
    })
  }
  return pieces
}

/**
 * Render every piece in order and copy the part each keeps into one set of
 * channels of `ceil(duration * sampleRate)` frames, as a single render would
 * return. `render` gets the piece's start and length in seconds and returns its
 * channels, first sample at `from`. Stops before the next piece once `signal`
 * aborts, rejecting with whatever `render` rejects with, or `aborted()`.
 */
export async function renderInPieces(
  duration: number,
  sampleRate: number,
  pieces: readonly RenderPiece[],
  render: (from: number, seconds: number) => Promise<readonly Float32Array[]>,
  signal?: AbortSignal,
  aborted: () => Error = () => new Error('The render was cancelled.'),
): Promise<Float32Array[]> {
  const frames = Math.ceil(duration * sampleRate)
  const out: Float32Array[] = []
  for (const piece of pieces) {
    if (signal?.aborted) throw aborted()
    const channels = await render(piece.from, piece.to - piece.from)
    while (out.length < channels.length) out.push(new Float32Array(frames))
    // Frame positions come from song seconds on one grid, so neighbouring
    // pieces meet at the same frame: no gap and no overlap at a join.
    const at = Math.round(piece.keepFrom * sampleRate)
    const end = Math.min(frames, Math.round(piece.to * sampleRate))
    const skip = at - Math.round(piece.from * sampleRate)
    channels.forEach((ch, c) => {
      out[c].set(ch.subarray(skip, Math.min(ch.length, skip + (end - at))), at)
    })
  }
  return out
}

/**
 * Can this browser's offline context pause (`OfflineAudioContext.suspend`)?
 * Chromium's can; Firefox 148's cannot. Read at each render, not cached.
 */
export function canPauseOfflineRender(scope: object = globalThis): boolean {
  const ctor = (scope as { OfflineAudioContext?: { prototype?: { suspend?: unknown } } }).OfflineAudioContext
  return typeof ctor?.prototype?.suspend === 'function'
}
