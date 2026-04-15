/**
 * vizLiveToggle — per-file hot-reload on/off flag for viz preview tabs.
 *
 * The viz preview provider's `reload: 'debounced'` policy drives the
 * rebuild-on-every-save cadence. Some users want to freeze a rendering
 * without closing the tab (e.g., long-running GL accumulators) and opt
 * out of hot reload while they keep editing. This store owns that bit.
 *
 * Module-level Map<fileId, boolean> mirrored in localStorage so the
 * setting survives reload. Default is `true` (live on) — same behaviour
 * as before this module existed.
 *
 * Chrome writes + reads; PreviewView reads + subscribes so its reload
 * effect can short-circuit when the user flips the toggle off.
 */

const STORAGE_PREFIX = 'stave:vizLive:'

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    if (typeof window.localStorage?.getItem !== 'function') return null
    return window.localStorage
  } catch {
    return null
  }
}

const values = new Map<string, boolean>()
const listeners = new Map<string, Set<(on: boolean) => void>>()

function keyFor(fileId: string): string {
  return `${STORAGE_PREFIX}${fileId}`
}

export function getVizLive(fileId: string): boolean {
  const cached = values.get(fileId)
  if (cached !== undefined) return cached
  const ls = safeLocalStorage()
  const raw = ls?.getItem(keyFor(fileId))
  // Default true — missing key means live was never toggled off, which
  // matches the pre-existing default behaviour.
  const on = raw === '0' ? false : true
  values.set(fileId, on)
  return on
}

export function setVizLive(fileId: string, on: boolean): void {
  const prev = getVizLive(fileId)
  if (prev === on) return
  values.set(fileId, on)
  safeLocalStorage()?.setItem(keyFor(fileId), on ? '1' : '0')
  const set = listeners.get(fileId)
  if (set) for (const cb of Array.from(set)) cb(on)
}

export function toggleVizLive(fileId: string): void {
  setVizLive(fileId, !getVizLive(fileId))
}

export function onVizLiveChange(
  fileId: string,
  cb: (on: boolean) => void,
): () => void {
  let set = listeners.get(fileId)
  if (!set) {
    set = new Set()
    listeners.set(fileId, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
    if (set!.size === 0) listeners.delete(fileId)
  }
}
