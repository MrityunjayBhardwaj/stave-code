/**
 * Hold the live transport still for the length of an offline render, and put it
 * back the way it was afterwards (#1627).
 *
 * ⚠ WHY A RENDER HAS TO HOLD THE TRANSPORT. The offline render borrows
 * superdough's module globals: `superdough()` takes no context argument and
 * reads `getAudioContext()` on every call (`superdough.mjs:443-444`), so for the
 * length of a render those globals name the OFFLINE context. Any note the live
 * scheduler triggers in that window is scheduled into the render instead of the
 * speakers. Pausing the scheduler first means nothing live is triggered while
 * the globals are borrowed.
 *
 * ⚠ RESUME ONLY WHAT WAS PLAYING. A render started with the transport stopped
 * (or paused at a breakpoint) must not start playback when it finishes.
 *
 * ⚠ THE USER STILL OWNS THE TRANSPORT DURING A RENDER. A Stop, or a debugger
 * pause, pressed while a render holds the transport cancels the resume, so a
 * finished render never restarts audio the user stopped. A Play pressed during
 * a render is DEFERRED to the end of the render rather than started at once,
 * because starting it would send its notes into the render.
 *
 * ⚠ HOLDS NEST. `renderStems` holds the transport once for the whole set, and
 * each stem's render asks again; only the outermost hold pauses and resumes,
 * so the transport does not stutter back to life between stems.
 *
 * ⚠ A RESUME THAT THROWS IS REPORTED, NOT SWALLOWED, and never replaces the
 * render's own result or error: the render finished, and the caller is owed it.
 *
 * Deliberately free of imports so every step can be driven by fakes: the
 * transport arrives as callbacks.
 */

export interface HoldableTransport {
  /** Is the live scheduler running right now? */
  isPlaying(): boolean
  /** Stop triggering live notes, keeping the position (`scheduler.pause()`). */
  pause(): void
  /** Start triggering live notes again. */
  resume(): void | Promise<void>
  /** Called when `resume` throws, so the failure reaches the user. */
  onResumeError?(error: unknown): void
}

export interface TransportHold {
  /** Run `render` with the transport held; restore it on every exit. */
  hold<T>(render: () => Promise<T>): Promise<T>
  /** True while at least one render holds the transport. */
  isHeld(): boolean
  /**
   * The user pressed Play while held. Returns true when the play was deferred
   * to the end of the hold, in which case the caller must NOT start playback.
   */
  requestPlay(): boolean
  /** The user pressed Stop or paused while held: do not resume afterwards. */
  cancelResume(): void
}

export function createTransportHold(transport: HoldableTransport): TransportHold {
  let depth = 0
  let resumeOnRelease = false

  return {
    async hold(render) {
      if (depth === 0) {
        resumeOnRelease = transport.isPlaying()
        if (resumeOnRelease) transport.pause()
      }
      depth++
      try {
        return await render()
      } finally {
        depth--
        if (depth === 0 && resumeOnRelease) {
          resumeOnRelease = false
          try {
            await transport.resume()
          } catch (error) {
            transport.onResumeError?.(error)
          }
        }
      }
    },
    isHeld: () => depth > 0,
    requestPlay() {
      if (depth === 0) return false
      resumeOnRelease = true
      return true
    },
    cancelResume() {
      resumeOnRelease = false
    },
  }
}
