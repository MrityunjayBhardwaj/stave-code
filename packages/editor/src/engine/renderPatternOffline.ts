/**
 * Render a pattern through the REAL superdough graph into an offline context,
 * so samples, soundfonts and effects sound in a bounce exactly as they do live
 * (#1353).
 *
 * This is upstream's `renderPatternAudio` (`@strudel/webaudio/webaudio.mjs:40`)
 * with four things changed, each for a measured reason:
 *
 * 1. ⚠ A HAP THAT FAILS TO SOUND IS COUNTED, NOT SWALLOWED. Upstream wraps each
 *    `superdough()` call in a catch that only logs (`webaudio.mjs:76-78`). An
 *    unknown sound therefore rendered to a full-length file of zeros with no
 *    error at all — measured: `s("nosuchsound*4")`, ok, 0 of 192,000 samples
 *    non-zero. Nor can the count be recovered from Strudel's logger afterwards:
 *    `logger` drops a message identical to the previous one within a second
 *    (`@strudel/core/logger.mjs:15-19`), so four failures read as one. The
 *    loop owns the catch, so the loop owns the count.
 *
 * 2. ⚠ IT RETURNS THE BUFFER. Upstream encodes the WAV itself and hands it to
 *    a browser download, which is why the earlier spike had to stub
 *    `URL.createObjectURL` and `HTMLAnchorElement.prototype.click` to catch it.
 *    Returning the `AudioBuffer` lets the caller encode through `WavEncoder`,
 *    the one place that refuses a silent take (#1402).
 *
 * 3. ⚠ IT NEVER CLOSES ANYTHING. Upstream opens by closing the global context
 *    (`webaudio.mjs:51`), which is the LIVE one (#1400). Here the global is
 *    pointed at the offline context and restored afterwards, so nothing needs
 *    closing and no sacrificial context is built.
 *
 * ⚠ THE GLOBAL SWAP IS THE COUPLING. `superdough()` takes no context argument:
 * it reads `getAudioContext()` and `getSuperdoughAudioController()` on every
 * call (`superdough.mjs:443-444`). So for the duration of the render those
 * module globals name the offline context, and the live ones are restored in a
 * `finally` — including when `initAudio` or rendering throws. The controller is
 * cleared rather than built here: `getSuperdoughAudioController()` builds one on
 * the CURRENT context when none is set (`superdough.mjs:321-326`), which avoids
 * a deep import of a class `superdough` does not export.
 *
 * 4. ⚠ NOTES ARE SCHEDULED A WINDOW AT A TIME, NOT ALL UP FRONT (#1658).
 *    Upstream schedules every note of the song before `startRendering()`, so
 *    every note's nodes exist from the first sample, and each render block walks
 *    all of them. The cost grows with the length SQUARED. Measured on the
 *    starter song through the File menu: 30 s rendered in 1.8 s, 120 s in 38 s,
 *    300 s in 438 s, slower than playing it. Here the render pauses at each
 *    window boundary (`OfflineAudioContext.suspend`), schedules only that
 *    window's notes, and resumes, so the live node count stays near one
 *    window's worth. A context without `suspend` gets the upfront schedule.
 *
 * 5. ⚠ A CANCEL TAKES EFFECT AT THE NEXT PAUSE (#1655). A render cannot be
 *    stopped halfway, but it can stop being fed: once `signal` aborts, no
 *    further window is scheduled, the rest renders with nothing new in it, and
 *    the render rejects with `RenderCancelledError` instead of returning a
 *    buffer. Without pauses the whole song is already scheduled, so a cancel
 *    there is only honoured when the render ends.
 *
 * 6. PROGRESS IS REPORTED FROM THE PAUSES (#1650). An offline render reports
 *    nothing while it runs, but each pause is a point it has provably reached,
 *    so `onProgress` hears the song time of every pause and then the full
 *    length when the render ends. Without pauses it hears only the end.
 *
 * 7. ⚠ THE RENDER WAITS FOR WHAT A WINDOW'S NOTES ASKED FOR (#1675). A reverb's
 *    impulse response is built asynchronously, and its convolver is silent until
 *    it lands. Live that is a few milliseconds; an offline render runs so much
 *    faster than real time that it was seconds of song — measured, the room
 *    arrived 3.95–4.63 s into the render, never at the same point twice, so
 *    every bounce started dry and no two bounces matched. Every window is
 *    scheduled while the render is held (before `startRendering`, or at a
 *    pause), so waiting on `settle` there places anything a window requested
 *    at the render time it was requested, on every run.
 *
 * 8. ⚠ A NOTE THAT RESHAPES ITS ROOM GETS A PAUSE OF ITS OWN (#1676). Each
 *    orbit has ONE reverb, rebuilt whenever a note asks for a different shape
 *    (`superdough` `superdoughoutput.mjs:69-92`). Live, a note is handed to
 *    superdough just before it sounds, so each note gets its own room. A window
 *    hands over all its notes at one pause, so only the last shape asked for in
 *    the window survived and every note in it played through that room. So the
 *    render also pauses just before each note that would rebuild its orbit's
 *    room (`roomChangeTimes`), and schedules from there.
 *
 * Deliberately free of imports so every step can be driven by fakes: the
 * accessors arrive as `deps`.
 */

export interface OfflineGraphDeps {
  getAudioContext(): unknown
  setAudioContext(ctx: unknown): void
  getSuperdoughAudioController(): unknown
  setSuperdoughAudioController(controller: unknown): void
  initAudio(options?: Record<string, unknown>): Promise<unknown>
  superdough(
    value: Record<string, unknown>,
    t: number,
    hapDuration: number,
    cps: number,
    cycle: number
  ): Promise<unknown>
  /**
   * Resolves once everything the notes scheduled so far asked for is in place —
   * a reverb's impulse response, which superdough builds asynchronously (#1675).
   * Awaited after each window is scheduled, while the render is still held.
   */
  settle?(): Promise<unknown>
  /** A stereo offline context of `frames` length — `new OfflineAudioContext(2, frames, sampleRate)`. */
  createContext(frames: number, sampleRate: number): OfflineRenderContext
}

/**
 * The part of `OfflineAudioContext` the render drives. `suspend`/`resume` are
 * optional: without them every note is scheduled before rendering starts.
 */
export interface OfflineRenderContext {
  startRendering(): Promise<AudioBuffer>
  suspend?(suspendTime: number): Promise<void>
  resume?(): Promise<void>
}

/**
 * Seconds of song whose notes are scheduled at each pause (#1658).
 *
 * Small enough that a window's nodes are a small graph; large enough that the
 * pauses themselves (a hop to the main thread and back) stay rare.
 */
export const RENDER_WINDOW_SECONDS = 4

/**
 * How far ahead of its window's first note a pause lands, in seconds.
 *
 * `superdough` drops a note scheduled before `currentTime`, silently apart from
 * a console warning (`superdough.mjs:462`). A browser rounds a suspend time to
 * a render block, and nothing promises it rounds DOWN, so the pause is placed
 * well clear of the first note it schedules rather than exactly on it.
 */
export const RENDER_WINDOW_LEAD_SECONDS = 0.05

/** Sounds the render could not play, grouped by the reason superdough gave. */
export interface SkippedSounds {
  reason: string
  count: number
}

export interface OfflineGraphResult {
  buffer: AudioBuffer
  /** Onset haps in the window. */
  haps: number
  /** Haps whose `superdough()` call resolved. */
  played: number
  /** Haps whose `superdough()` call threw, by reason, in first-seen order. */
  skipped: SkippedSounds[]
}

export interface OfflineGraphOptions {
  cps: number
  /** Seconds. */
  duration: number
  sampleRate: number
  /** Stops scheduling at the next pause; the render then rejects (#1655). */
  signal?: AbortSignal
  /** Seconds of the song rendered so far, at each pause and at the end (#1650). */
  onProgress?: (renderedSeconds: number) => void
}

/** A render whose `signal` aborted. It carries no buffer: nothing was kept. */
export class RenderCancelledError extends Error {
  constructor() {
    super('The render was cancelled.')
    this.name = 'RenderCancelledError'
  }
}

interface RenderableHap {
  hasOnset(): boolean
  whole: { begin: { valueOf(): number } }
  duration: { valueOf(): number }
  value: unknown
  ensureObjectValue?: () => void
}

interface QueryablePattern {
  queryArc(begin: number, end: number, state?: Record<string, unknown>): RenderableHap[]
}

export async function renderPatternOffline(
  pattern: QueryablePattern,
  { cps, duration, sampleRate, signal, onProgress }: OfflineGraphOptions,
  deps: OfflineGraphDeps
): Promise<OfflineGraphResult> {
  // Ascending onset order matters for controls that depend on graph state,
  // such as `cut` (`webaudio.mjs:61-65`).
  const haps = pattern
    .queryArc(0, duration * cps, { _cps: cps })
    .filter((h) => h.hasOnset())
    .sort((a, b) => a.whole.begin.valueOf() - b.whole.begin.valueOf())

  const liveCtx = deps.getAudioContext()
  const liveController = deps.getSuperdoughAudioController()
  const ctx = deps.createContext(Math.ceil(duration * sampleRate), sampleRate)

  let played = 0
  const skipped = new Map<string, number>()

  const schedule = async (window: readonly RenderableHap[]): Promise<void> => {
    for (const hap of window) {
      hap.ensureObjectValue?.()
      const begin = hap.whole.begin.valueOf()
      try {
        await deps.superdough(
          hap.value as Record<string, unknown>,
          begin / cps,
          hap.duration.valueOf() / cps,
          cps,
          begin
        )
        played++
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        skipped.set(reason, (skipped.get(reason) ?? 0) + 1)
      }
    }
  }

  try {
    deps.setAudioContext(ctx)
    deps.setSuperdoughAudioController(null)
    await deps.initAudio({})

    const windows =
      ctx.suspend && ctx.resume
        ? windowsOf(haps, cps, roomChangeTimes(haps, cps), sampleRate)
        : [{ start: 0, haps }]
    await schedule(windows[0]?.haps ?? [])
    await deps.settle?.()

    // Every later window is scheduled from a pause the render reaches on its
    // own. The render is held until `resume`, so a window whose samples are
    // still loading cannot fall behind the audio. `resume` runs even when
    // scheduling throws: a render left paused never resolves.
    const failures: unknown[] = []
    const pauses = windows.slice(1).map((window) => {
      if (window.haps.length === 0) return Promise.resolve()
      const at = window.start - RENDER_WINDOW_LEAD_SECONDS
      return ctx.suspend!(at).then(async () => {
        try {
          onProgress?.(Math.min(duration, window.start))
          if (!signal?.aborted) await schedule(window.haps)
          await deps.settle?.()
        } catch (err) {
          failures.push(err)
        } finally {
          await ctx.resume!()
        }
      })
    })

    const buffer = await ctx.startRendering()
    await Promise.all(pauses)
    if (failures.length > 0) throw failures[0]
    if (signal?.aborted) throw new RenderCancelledError()
    onProgress?.(duration)
    return {
      buffer,
      haps: haps.length,
      played,
      skipped: [...skipped].map(([reason, count]) => ({ reason, count })),
    }
  } finally {
    deps.setAudioContext(liveCtx)
    deps.setSuperdoughAudioController(liveController)
  }
}

/**
 * Haps grouped by the render window their onset falls in, in onset order.
 *
 * A window starts at every multiple of `RENDER_WINDOW_SECONDS` and at every
 * time in `extraStarts` (#1676). A start closer to the one before it than two
 * render blocks is dropped, so two pauses never round onto one block, and so is
 * a start too early to pause ahead of (its notes go in the window before, which
 * is the upfront schedule for the first window). An empty window stays in the
 * list and simply gets no pause.
 */
function windowsOf<H extends RenderableHap>(
  haps: readonly H[],
  cps: number,
  extraStarts: readonly number[],
  sampleRate: number,
): Array<{ start: number; haps: H[] }> {
  const last = haps.length ? haps[haps.length - 1].whole.begin.valueOf() / cps : 0
  const gridEnd = Math.floor(last / RENDER_WINDOW_SECONDS)
  const grid = Array.from({ length: gridEnd }, (_, k) => (k + 1) * RENDER_WINDOW_SECONDS)
  const minGap = (2 * RENDER_BLOCK_FRAMES) / sampleRate
  const starts = [0]
  for (const t of [...grid, ...extraStarts].sort((a, b) => a - b)) {
    if (t - RENDER_WINDOW_LEAD_SECONDS < minGap) continue
    if (t - starts[starts.length - 1] < minGap) continue
    starts.push(t)
  }
  const windows = starts.map((start) => ({ start, haps: [] as H[] }))
  let k = 0
  for (const hap of haps) {
    const at = hap.whole.begin.valueOf() / cps
    while (k + 1 < windows.length && windows[k + 1].start <= at) k++
    windows[k].haps.push(hap)
  }
  return windows
}

/** Frames an audio render advances by at a time; a suspend time rounds to one. */
const RENDER_BLOCK_FRAMES = 128

/**
 * What an orbit's reverb was last built with, as `convolver.generate` stores it:
 * an undefined shape value takes `generate`'s default (`reverb.mjs:41`).
 * `.size()`, `.sz()` and `.rsize()` all write `roomsize` (one control,
 * `@strudel/core` `controls.mjs:2287`).
 */
function builtRoom(v: Record<string, unknown>, ir: string | undefined): Record<string, unknown> {
  return {
    roomsize: v.roomsize ?? 2,
    roomfade: v.roomfade ?? 0.1,
    roomlp: v.roomlp ?? 15000,
    roomdim: v.roomdim ?? 1000,
    irspeed: v.irspeed,
    irbegin: v.irbegin,
    ir,
  }
}

/** The shape values `getReverb` compares, in its order (`superdoughoutput.mjs:77-82`). */
const ROOM_SHAPE_KEYS = ['roomsize', 'roomfade', 'roomlp', 'roomdim', 'irspeed', 'irbegin'] as const

/**
 * Song seconds of every note that would rebuild its orbit's reverb, in onset
 * order (#1676).
 *
 * This replays `getReverb` (`superdoughoutput.mjs:69-92`) over the notes. An
 * orbit's reverb is built by its first note with `room > 0`. A later note
 * rebuilds it when it gives a shape value that is defined and differs from what
 * the reverb was built with (`hasChanged`, `:14`), or a different impulse
 * sample. A rebuild takes ALL its values from that note, so a value the note
 * leaves undefined goes back to its default rather than staying as it was. The
 * first build is not a change: nothing on that orbit sounds through the room
 * before it.
 *
 * ⚠ IT ERRS TOWARD A CHANGE. A predicted rebuild that does not happen costs one
 * spare pause; a missed one is the bug this exists to fix. So the impulse
 * sample is compared by name and index, where superdough compares the loaded
 * buffer.
 */
export function roomChangeTimes(
  haps: readonly { whole: { begin: { valueOf(): number } }; value: unknown }[],
  cps: number,
): number[] {
  const rooms = new Map<unknown, Record<string, unknown>>()
  const times: number[] = []
  for (const hap of haps) {
    const v = hap.value as Record<string, unknown> | null
    if (!v || typeof v !== 'object' || !((v.room as number) > 0)) continue
    const orbit = v.orbit ?? 1
    const ir = v.ir === undefined ? undefined : `${String(v.ir)}:${String(v.i ?? 0)}`
    const room = rooms.get(orbit)
    const changed =
      room !== undefined &&
      (room.ir !== ir || ROOM_SHAPE_KEYS.some((key) => v[key] !== undefined && v[key] !== room[key]))
    if (room === undefined || changed) rooms.set(orbit, builtRoom(v, ir))
    if (changed) times.push(hap.whole.begin.valueOf() / cps)
  }
  return times
}

/** "4 × sound nosuchsound not found! Is it loaded?" — one clause per reason. */
export function describeSkipped(skipped: SkippedSounds[]): string {
  return skipped.map((s) => `${s.count} × ${s.reason}`).join('; ')
}
