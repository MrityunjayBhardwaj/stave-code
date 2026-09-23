/**
 * Draw a synth track's loudness on the Song timeline from its own render (#1731).
 *
 * A track that plays a file has a shape the timeline can read straight off the
 * decoded file (#1506, #1730). A synth track has no file: its sound exists only
 * once the audio graph makes it. So this renders each wanted track offline,
 * through the same real graph a bounce uses, reduces the audio to a min/max
 * envelope, and keeps it for the timeline to draw.
 *
 * ⚠ ONLY WHILE THE TRANSPORT IS STOPPED. An offline render borrows superdough's
 * module globals, so the live transport is held for as long as it runs
 * (`transportHold.ts`): a render taken while playing would stop the music. So a
 * render is only ever STARTED while stopped, a Play pressed during one aborts it
 * (the render stops being fed at its next pause and the deferred Play starts
 * then), and a stop schedules the next one.
 *
 * ⚠ ONE RENDER AT A TIME, AND A USER'S RENDER FIRST. Two renders at once would
 * each overwrite the other's globals (`renderStemsInOrder.ts`). A bounce, a stems
 * export or an evaluate calls `exclusive`, which aborts this scheduler's render,
 * waits for it to let go, and holds further display renders off until it ends.
 * An evaluate is on that list because it reads the globals too: the per-track
 * analysers are rebuilt against whatever controller `getSuperdoughAudioController`
 * returns, which during a render is the offline one.
 *
 * ⚠ STALE IS PER TRACK, BY WHAT THE TRACK PLAYS. Each render is stamped with a
 * fingerprint of the track's events over the rendered span (plus tempo and
 * span). After an evaluate the fingerprint is taken again; an envelope whose
 * track now plays something else is reported `stale` until it is re-rendered,
 * and a track whose events did not change keeps its envelope without a render.
 * An edit made while playing therefore marks exactly the edited tracks.
 *
 * ⚠ A TRACK THAT CANNOT BE RENDERED DRAWS NOTHING. A silent render, a failed
 * one, or a track past the budget has no envelope, rather than a guessed one or
 * the one from before. The same fingerprint is not retried until it changes.
 *
 * ⚠ THE BUDGET IS IN SECONDS OF AUDIO, summed over the tracks in request order.
 * Render cost grows with song length × tracks; a track that would take the sum
 * past `capSeconds` is not rendered and is listed in `status().overCap`, so the
 * caller can say so rather than leave a silent gap.
 *
 * Deliberately free of imports so every step can be driven by fakes: the engine
 * arrives as `deps`, the same shape as `transportHold.ts`.
 */

/** A track's rendered loudness: interleaved `[min0, max0, min1, max1, …]`. */
export interface TrackEnvelope {
  readonly data: Float32Array
  /** Number of min/max pairs; `data.length === 2 * columns`. */
  readonly columns: number
  /** The song span the columns cover, from cycle 0. */
  readonly cycles: number
}

export interface TrackEnvelopeView extends TrackEnvelope {
  /** The track plays something else now than when this was rendered. */
  readonly stale: boolean
}

export interface TrackEnvelopeStatus {
  /** The track being rendered right now, if any. */
  readonly rendering: string | null
  /** Wanted tracks the budget left out, in request order. */
  readonly overCap: readonly string[]
}

/**
 * What a runtime hands the Song timeline (#1731): one object, so the four calls
 * always reach the same engine and cannot be threaded from different ones.
 */
export interface TrackEnvelopeAccess {
  /** The tracks the timeline wants drawn, and the song span it shows. */
  request(trackIds: readonly string[], cycles: number): void
  get(trackId: string): TrackEnvelopeView | null
  status(): TrackEnvelopeStatus
  /** Called whenever an envelope, a stale flag or the status changes. */
  subscribe(listener: () => void): () => void
}

export interface TrackEnvelopeDeps {
  /** Is the live transport running? A render never starts while it is. */
  isPlaying(): boolean
  /** Tempo, cycles per second, to turn the budget's seconds into cycles. */
  cps(): number
  /** What the track plays over `[0, cycles)`, as a comparable string; null when
   *  there is no such track. */
  fingerprint(trackId: string, cycles: number): string | null
  /** Render the track over `[0, cycles)` and reduce it; null when it is silent.
   *  Rejects when `signal` aborts (`isCancel` recognises it) or the render fails. */
  render(trackId: string, cycles: number, signal: AbortSignal): Promise<TrackEnvelope | null>
  /** Run `fn` after `ms`; returns a cancel. */
  schedule(fn: () => void, ms: number): () => void
  /** Called whenever an envelope, a stale flag or the status changes. */
  onChange(): void
  /** Settle-time after the last evaluate, request or stop before rendering. */
  debounceMs: number
  /** Seconds of audio one pass may render, summed over tracks. */
  capSeconds: number
}

export interface TrackEnvelopeScheduler {
  /** The tracks the timeline wants drawn, and the span it shows. */
  request(trackIds: readonly string[], cycles: number): void
  /** A new document was loaded: re-fingerprint, and render what changed. */
  evaluated(): void
  /** Play was pressed: abort the render in flight and schedule nothing. */
  playing(): void
  /** The transport stopped: render what is missing or stale. */
  stopped(): void
  /** Run `fn` with no display render in flight or starting (see header). */
  exclusive<T>(fn: () => Promise<T>): Promise<T>
  get(trackId: string): TrackEnvelopeView | null
  status(): TrackEnvelopeStatus
  dispose(): void
}

interface Stored extends TrackEnvelope {
  readonly fingerprint: string
}

export function createTrackEnvelopeScheduler(deps: TrackEnvelopeDeps): TrackEnvelopeScheduler {
  let wanted: string[] = []
  let cycles = 0
  const envelopes = new Map<string, Stored>()
  /** Fingerprint a render of this track came back silent or failed at. */
  const refused = new Map<string, string>()
  /** The latest fingerprint of each wanted track. */
  const current = new Map<string, string | null>()
  let overCap: string[] = []
  let rendering: string | null = null
  let cancelTimer: (() => void) | null = null
  let inFlight: { controller: AbortController; done: Promise<void> } | null = null
  let suspended = 0
  /** Play was pressed and no stop has followed. Not `deps.isPlaying()` alone:
   *  a Play pressed during a render is DEFERRED to the render's end
   *  (`transportHold.requestPlay`), so the scheduler reads as stopped then. */
  let playRequested = false
  let disposed = false

  /** Bumped by every new fingerprint pass; an older pass stops at its next step. */
  let fingerprintPass = 0
  let fingerprinting = false

  /**
   * Take every wanted track's fingerprint again, ONE TRACK PER TASK. A
   * fingerprint queries the track over the whole song — measured at ~30 ms for
   * a dense 256-cycle track — and an evaluate made while playing must not
   * block the main thread for tracks × that, or the live scheduler's notes
   * arrive late. Each track keeps its previous answer until its new one lands,
   * so an unchanged track never flickers stale; no render starts until the
   * pass ends (`kick` refuses while it runs, and the pass kicks when done).
   */
  const refingerprint = (): void => {
    const pass = ++fingerprintPass
    fingerprinting = true
    const ids = [...wanted]
    let i = 0
    const step = (): void => {
      if (disposed || pass !== fingerprintPass) return
      if (i >= ids.length) {
        fingerprinting = false
        kick()
        return
      }
      const id = ids[i++]
      let fp: string | null
      try {
        fp = deps.fingerprint(id, cycles)
      } catch {
        fp = null
      }
      if (wanted.includes(id) && current.get(id) !== fp) {
        current.set(id, fp)
        deps.onChange()
      }
      deps.schedule(step, 0)
    }
    deps.schedule(step, 0)
  }

  const abortInFlight = (): void => {
    inFlight?.controller.abort()
  }

  const kick = (): void => {
    cancelTimer?.()
    cancelTimer = null
    if (disposed || suspended > 0 || fingerprinting || playRequested || deps.isPlaying()) return
    cancelTimer = deps.schedule(() => {
      cancelTimer = null
      void run()
    }, deps.debounceMs)
  }

  /** The wanted tracks whose envelope is missing or no longer matches. */
  const plan = (): { todo: string[]; over: string[] } => {
    const todo: string[] = []
    const over: string[] = []
    const cps = deps.cps()
    const seconds = cps > 0 ? cycles / cps : Infinity
    let spent = 0
    for (const id of wanted) {
      const fp = current.get(id)
      if (fp == null) continue
      if (spent + seconds > deps.capSeconds) {
        over.push(id)
        continue
      }
      spent += seconds
      if (envelopes.get(id)?.fingerprint === fp) continue
      if (refused.get(id) === fp) continue
      todo.push(id)
    }
    return { todo, over }
  }

  const run = async (): Promise<void> => {
    // `kick` already refused while suspended or playing; the timer it set is
    // cancelled by both, so only a render still in flight can be found here.
    if (disposed || inFlight) return
    const controller = new AbortController()
    let finish!: () => void
    inFlight = { controller, done: new Promise<void>((r) => (finish = r)) }
    try {
      const { todo, over } = plan()
      if (over.join('\u0000') !== overCap.join('\u0000')) {
        overCap = over
        deps.onChange()
      }
      // Budget-cut tracks keep nothing: an envelope from a shorter span would
      // draw a shape that stops partway through the song.
      for (const id of over) if (envelopes.delete(id)) deps.onChange()
      for (const id of todo) {
        // Play and every user render abort the signal; nothing else stops a pass.
        if (controller.signal.aborted) break
        // A changed span or a fresh evaluate aborts this render (`request`,
        // `evaluated`), so what it returns always matches `fp` and `cycles`.
        const fp = current.get(id)
        if (fp == null) continue
        rendering = id
        deps.onChange()
        let result: TrackEnvelope | null = null
        let failed = false
        try {
          result = await deps.render(id, cycles, controller.signal)
        } catch {
          failed = true
        }
        rendering = null
        if (controller.signal.aborted) {
          deps.onChange()
          break
        }
        if (failed || result == null) {
          refused.set(id, fp)
          envelopes.delete(id)
        } else {
          envelopes.set(id, { ...result, fingerprint: fp })
          refused.delete(id)
        }
        deps.onChange()
      }
    } finally {
      rendering = null
      inFlight = null
      finish()
    }
    // Anything that changed while this ran (an evaluate, a new request) set
    // `current` again, and its own `kick` may have fired while this was still
    // unwinding and found it in flight. One more pass picks it up; `kick`
    // refuses while playing or suspended, and the pass costs nothing when the
    // plan is empty.
    if (plan().todo.length > 0) kick()
  }

  return {
    request(trackIds, span) {
      const nextWanted = [...trackIds]
      const same =
        span === cycles &&
        nextWanted.length === wanted.length &&
        nextWanted.every((id, i) => id === wanted[i])
      if (same) return
      if (span !== cycles) abortInFlight()
      wanted = nextWanted
      cycles = span
      for (const id of [...current.keys()]) if (!wanted.includes(id)) current.delete(id)
      deps.onChange()
      refingerprint()
    },
    evaluated() {
      abortInFlight()
      refingerprint()
    },
    playing() {
      playRequested = true
      cancelTimer?.()
      cancelTimer = null
      abortInFlight()
    },
    stopped() {
      playRequested = false
      kick()
    },
    async exclusive(fn) {
      suspended++
      cancelTimer?.()
      cancelTimer = null
      const pending = inFlight
      pending?.controller.abort()
      try {
        if (pending) await pending.done
        return await fn()
      } finally {
        suspended--
        kick()
      }
    },
    get(trackId) {
      const env = envelopes.get(trackId)
      if (!env) return null
      return {
        data: env.data,
        columns: env.columns,
        cycles: env.cycles,
        stale: current.get(trackId) !== env.fingerprint,
      }
    },
    status: () => ({ rendering, overCap }),
    dispose() {
      disposed = true
      cancelTimer?.()
      cancelTimer = null
      abortInFlight()
    },
  }
}

/**
 * Reduce rendered audio to `columns` min/max pairs over both channels.
 * Returns null when every sample is zero: silence has no shape to draw.
 */
export function envelopeFromChannels(
  channels: readonly Float32Array[],
  columns: number,
): { data: Float32Array; columns: number } | null {
  const length = channels[0]?.length ?? 0
  if (length === 0 || columns <= 0) return null
  const data = new Float32Array(columns * 2)
  let any = false
  for (let c = 0; c < columns; c++) {
    const from = Math.floor((c * length) / columns)
    const to = Math.max(from + 1, Math.floor(((c + 1) * length) / columns))
    let min = 0
    let max = 0
    for (const ch of channels) {
      for (let i = from; i < to && i < length; i++) {
        const v = ch[i]
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    if (min !== 0 || max !== 0) any = true
    data[2 * c] = min
    data[2 * c + 1] = max
  }
  return any ? { data, columns } : null
}

/** A short, stable digest of a string (two 32-bit FNV-1a variants + length). */
export function digest(text: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0
  }
  return `${text.length.toString(36)}-${a.toString(36)}-${b.toString(36)}`
}
