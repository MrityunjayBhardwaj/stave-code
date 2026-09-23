/**
 * The page's ONE superdough graph, and who may borrow it for an offline render
 * (#1733).
 *
 * An offline render points superdough's module-level audio context and
 * controller at an `OfflineAudioContext` for as long as it runs
 * (`renderPatternOffline.ts`). Those globals are one per PAGE, not one per
 * engine: every file's runtime has its own `StrudelEngine`, and every one of
 * them, and every audition, reads the same two globals. So the rules that keep
 * a render honest live here, at page scope:
 *
 * ⚠ ONE OFFLINE RENDER AT A TIME, ACROSS ENGINES. `withOfflineGraph` queues
 * every render, a bounce or a background waveform render (#1731), behind the
 * one before it. Two engines each keep their own renders in order
 * (`renderStemsInOrder`, `trackEnvelopes.ts`) but cannot see each other's.
 *
 * ⚠ A LIVE SOUND FIRST, A BACKGROUND RENDER SECOND. An audition (the
 * instrument picker's ▶, a piano-roll key) calls `superdough()` directly, so
 * during a render it would play into the render: silent to the user, and drawn
 * into the waveform. `onLiveGraph` interrupts every background render, waits
 * for it to hand the globals back — at most one render window — and only then
 * plays. When nothing is rendering it plays at once, in the same call.
 *
 * Not covered, on purpose: a USER's render (a bounce) is not interrupted by an
 * audition. The bounce is what the user asked for; an audition during one still
 * reaches the bounce's context, as it did before this module existed.
 *
 * Deliberately free of imports: the renders and interrupts arrive as functions.
 */

let queue: Promise<void> = Promise.resolve()
let held = 0

/** Run `render` once every earlier offline render has let go of the graph. */
export function withOfflineGraph<T>(render: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    held++
    try {
      return await render()
    } finally {
      held--
    }
  })
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Is an offline render borrowing the graph right now? */
export function offlineGraphBusy(): boolean {
  return held > 0
}

/**
 * Background renders that can be asked to stop. Each returns a promise that
 * settles once its render has handed the graph back, or null when it has
 * nothing in flight.
 */
const interrupts = new Set<() => Promise<void> | null>()

/** Register a background renderer's interrupt; returns its removal. */
export function registerBackgroundRender(interrupt: () => Promise<void> | null): () => void {
  interrupts.add(interrupt)
  return () => {
    interrupts.delete(interrupt)
  }
}

/**
 * Interrupt every background render. Null when none was in flight, so a caller
 * can act at once; otherwise settles when all of them have let go.
 */
export function interruptBackgroundRenders(): Promise<void> | null {
  const waits: Promise<void>[] = []
  for (const interrupt of interrupts) {
    const wait = interrupt()
    if (wait) waits.push(wait)
  }
  return waits.length === 0 ? null : Promise.all(waits).then(() => undefined)
}

/**
 * Run `play` against the LIVE graph: at once when no background render is in
 * flight, else as soon as every one has let go. For anything that calls
 * `superdough()` outside the scheduler, which is what an audition does.
 */
export function onLiveGraph(play: () => void): void {
  const wait = interruptBackgroundRenders()
  if (wait == null) {
    play()
    return
  }
  void wait.then(play, play)
}
