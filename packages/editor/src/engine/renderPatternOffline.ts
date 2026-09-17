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
  { cps, duration, sampleRate }: OfflineGraphOptions,
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

    const windows = ctx.suspend && ctx.resume ? windowsOf(haps, cps) : [haps]
    await schedule(windows[0] ?? [])

    // Every later window is scheduled from a pause the render reaches on its
    // own. The render is held until `resume`, so a window whose samples are
    // still loading cannot fall behind the audio. `resume` runs even when
    // scheduling throws: a render left paused never resolves.
    const failures: unknown[] = []
    const pauses = windows.slice(1).map((window, i) => {
      if (window.length === 0) return Promise.resolve()
      const at = (i + 1) * RENDER_WINDOW_SECONDS - RENDER_WINDOW_LEAD_SECONDS
      return ctx.suspend!(at).then(async () => {
        try {
          await schedule(window)
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
 * Index `k` covers song seconds `[k·W, (k+1)·W)`; an empty window stays in
 * place so an index is always its time.
 */
function windowsOf<H extends RenderableHap>(haps: readonly H[], cps: number): H[][] {
  const windows: H[][] = []
  for (const hap of haps) {
    const k = Math.max(0, Math.floor(hap.whole.begin.valueOf() / cps / RENDER_WINDOW_SECONDS))
    while (windows.length <= k) windows.push([])
    windows[k].push(hap)
  }
  return windows
}

/** "4 × sound nosuchsound not found! Is it loaded?" — one clause per reason. */
export function describeSkipped(skipped: SkippedSounds[]): string {
  return skipped.map((s) => `${s.count} × ${s.reason}`).join('; ')
}
