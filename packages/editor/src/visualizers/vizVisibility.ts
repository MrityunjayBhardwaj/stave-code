/**
 * vizVisibility — Phase C: pause a viz renderer while its container is off-screen
 * or collapsed, or while the browser tab is hidden, and resume it when it's both
 * on-screen AND the tab is visible.
 *
 * Why: a viz in a collapsed pane / scrolled out of view / a background tab runs
 * its WHOLE pipeline for output nobody sees. `WorkerVizRenderer.pause()` stops
 * BOTH the main-thread `sample()`+post rAF and the worker draw loop; `P5VizRenderer`
 * `noLoop()`s; `HydraVizRenderer` cancels its rAF. So pausing reclaims real
 * main-thread + GPU work AND bounds the live worker count (mitigates the WebGL
 * ~16-context cap without a full pool — B-6).
 *
 * Model: each registration gets its own `IntersectionObserver`; a SINGLE shared
 * `visibilitychange` listener fans out to every entry. The renderer runs iff
 * `onScreen && tabVisible`; pause/resume fire only on a state TRANSITION (never
 * every event). No-op where `IntersectionObserver`/`document` are unavailable
 * (SSR / a jsdom without the polyfill) — the renderer simply keeps running, i.e.
 * the pre-Phase-C behaviour.
 *
 * REF: #258 (Phase C), VizRenderer.pause/resume, WorkerVizRenderer.pause (stops
 *      main rAF + worker), FallbackVizRenderer (pause suspends probation), PK24.
 */
import type { VizRenderer } from './types'

type Pausable = Pick<VizRenderer, 'pause' | 'resume'>

interface Entry {
  renderer: Pausable
  onScreen: boolean
  running: boolean
  io: IntersectionObserver | null
}

const entries = new Set<Entry>()
let tabVisible = true
let visibilityWired = false

/** Apply the desired running state to one entry, firing pause/resume only on a
 *  transition. Exported for unit tests that drive entries without real observers. */
function syncEntry(e: Entry): void {
  const desired = e.onScreen && tabVisible
  if (desired === e.running) return
  e.running = desired
  if (desired) e.renderer.resume()
  else e.renderer.pause()
}

function onVisibilityChange(): void {
  tabVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
  entries.forEach(syncEntry)
}

function wireVisibility(): void {
  if (visibilityWired || typeof document === 'undefined') return
  visibilityWired = true
  tabVisible = document.visibilityState !== 'hidden'
  document.addEventListener('visibilitychange', onVisibilityChange)
}

function unwireVisibility(): void {
  if (!visibilityWired || entries.size > 0 || typeof document === 'undefined') return
  visibilityWired = false
  document.removeEventListener('visibilitychange', onVisibilityChange)
}

/**
 * Register `renderer` to be paused/resumed with `container`'s visibility. Returns
 * an unregister function (call it on unmount/destroy). No-op environment → returns
 * a no-op unregister and the renderer keeps running.
 */
export function registerVizVisibility(renderer: Pausable, container: Element): () => void {
  if (typeof IntersectionObserver === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  // Start running + assumed on-screen so the common on-screen mount never flashes
  // pause→resume; the IO's initial callback corrects `onScreen` next frame. The
  // immediate sync below still pauses a viz mounted into an already-hidden tab.
  const entry: Entry = { renderer, onScreen: true, running: true, io: null }
  wireVisibility()
  entries.add(entry)
  syncEntry(entry)

  entry.io = new IntersectionObserver(
    (records) => {
      const last = records[records.length - 1]
      if (last) entry.onScreen = last.isIntersecting
      syncEntry(entry)
    },
    { threshold: 0 },
  )
  entry.io.observe(container)

  return () => {
    entry.io?.disconnect()
    entry.io = null
    entries.delete(entry)
    unwireVisibility()
  }
}
