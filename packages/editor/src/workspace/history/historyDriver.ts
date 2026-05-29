/**
 * historyDriver — auto-commit cadence for the project commit store (Phase F,
 * #196, Task 6). Replaces the 60s full-doc auto-snapshot effect that lived in
 * StaveApp (StaveApp.tsx:368-400). Extracted into the editor package so the
 * cadence is wired in one testable place rather than a React effect.
 *
 * Triggers (RESEARCH §1):
 *  - idle: 5s after the last LOCAL doc mutation, significance-gated.
 *  - unload: visibilitychange→hidden / pagehide, significance-gated (narrows
 *    the lost-debounce-window on reload).
 *  - per-eval: NOT here — `onEvaluateSuccess` lives on the runtime instance in
 *    the app, which calls commitWorkspace('auto', {gate:false}) directly.
 *
 * `initHistory(projectId)` must have run before starting the driver.
 */

import { subscribeToDocUpdate } from '../projectDoc'
import { commitWorkspace } from './historyService'

const DEFAULT_IDLE_MS = 5_000

function resolveIdleMs(): number {
  if (typeof window === 'undefined') return DEFAULT_IDLE_MS
  const raw = window.localStorage.getItem('stave:autosnapIdleMs')
  const override = raw !== null ? parseInt(raw, 10) : NaN
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_IDLE_MS
}

/**
 * Wire the idle + unload auto-commit triggers. Returns a teardown function.
 * Each fire is significance-gated (idle/unload commit only meaningful change).
 */
export function startHistoryDriver(): () => void {
  const idleMs = resolveIdleMs()
  let timer: ReturnType<typeof setTimeout> | null = null

  const fire = (): void => {
    void commitWorkspace('auto', { gate: true }).catch((err) =>
      console.warn('[stave] auto-commit failed:', err),
    )
  }

  const unsubscribe = subscribeToDocUpdate(
    () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(fire, idleMs)
    },
    { localOnly: true },
  )

  const onHidden = (): void => {
    if (typeof document === 'undefined' || document.visibilityState === 'hidden') {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      fire()
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onHidden)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onHidden)
  }

  return () => {
    if (timer) clearTimeout(timer)
    unsubscribe()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onHidden)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', onHidden)
    }
  }
}
