/**
 * Global error floor — the structural safety net under every
 * per-runtime bridge.
 *
 * The observe-then-patch pattern (fix the Strudel path, then p5, then
 * Hydra, then the factory swallow, then the p5 `hitCriticalError`
 * halt…) happens because each runtime has its own wrapping and its
 * own error-eating paths. Bridging each one catches errors we already
 * know about; it doesn't stop the next unknown swallow.
 *
 * This module installs two listeners on `window` that catch whatever
 * escapes any bridge:
 *
 *   - `error`              — every uncaught synchronous throw.
 *   - `unhandledrejection` — every rejected promise with no handler.
 *
 * Both forward into `emitLog` so the Console panel, toast,
 * status-bar chip, and Monaco squiggle (when a line + source is
 * known) surface the error. The bridges remain useful — they
 * enrich the message with friendly hints, attribute the right
 * source, and translate wrapper line offsets — but they are no
 * longer the ONLY way an error becomes visible. If we miss a
 * runtime-specific hint, the user still sees a raw entry.
 *
 * Dedupe: the underlying `emitLog` already collapses consecutive
 * identical entries, so a tight per-frame flood from a draw-loop
 * throw becomes one Console row + one counting toast.
 */

import { emitLog } from './engineLog'
import {
  formatFriendlyError,
  parseStackLocation,
} from './friendlyErrors'

let installed = false

/**
 * Attach the global listeners. Idempotent; safe to call on every
 * editor mount. No-op on non-browser environments so SSR / test
 * graphs don't trip.
 */
export function installGlobalErrorCatch(): void {
  if (installed) return
  if (typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event: ErrorEvent) => {
    // Ignore resource-load errors (image 404, script parse in a
    // sandboxed iframe, etc.) — those surface through their own
    // channels and would bury the Console in noise.
    if (!event.error && !event.message) return
    const err =
      event.error instanceof Error
        ? event.error
        : new Error(event.message || 'Uncaught error')
    emitFromGlobal(err, 'uncaught')
  })

  window.addEventListener(
    'unhandledrejection',
    (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const err =
        reason instanceof Error
          ? reason
          : new Error(
              typeof reason === 'string'
                ? reason
                : 'Unhandled promise rejection',
            )
      emitFromGlobal(err, 'unhandled-rejection')
    },
  )
}

function emitFromGlobal(err: Error, _kind: string): void {
  // No DocsIndex supplied — the global catch-all has no way to know
  // which runtime threw (the stack is often bundled past recognition).
  // formatFriendlyError still extracts a clean message + stack; the
  // per-runtime bridges are the ones that attach "Did you mean?"
  // suggestions with source attribution.
  const parts = formatFriendlyError(err, 'stave')
  const loc = parseStackLocation(err)
  emitLog({
    level: 'error',
    runtime: 'stave',
    message: parts.message,
    stack: parts.stack,
    line: loc?.line,
    column: loc?.column,
  })
}

/** TESTING ONLY — reset so a fresh install() call re-attaches. */
export function __resetGlobalErrorCatchForTests(): void {
  installed = false
}
