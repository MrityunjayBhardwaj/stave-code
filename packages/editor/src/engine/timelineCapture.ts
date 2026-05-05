/**
 * timelineCapture — fixed-size FIFO ring buffer of IRSnapshot captures.
 *
 * Fed by publishIRSnapshot's capture fan-out (irInspector.ts) on every
 * successful eval. Default capacity 30 entries; configurable via
 * setCaptureCapacity (the chrome trace-length input persists capacity in
 * localStorage — entry storage itself is in-memory per CONTEXT D-06).
 *
 * Pin-by-reference contract: UI consumers hold the snapshot reference in
 * React state. FIFO eviction does NOT invalidate the held reference (JS
 * GC keeps it alive as long as the React state holds it). Trap #5
 * mitigation per RESEARCH §7.
 *
 * Defensive immutability: Object.freeze(snap) + Object.freeze(snap.passes)
 * applied at push time (RESEARCH §7 trap #1 mitigation). Shallow only
 * — the IR tree itself is NOT deep-frozen due to recursion cost on
 * large trees.
 *
 * Phase 19-08 (#85). PR-A.
 */

import type { IRSnapshot } from './irInspector'

/**
 * Single entry in the capture buffer. `cycleCount` is captured from
 * `runtime.getCurrentCycle()` at publish time and lives on the entry
 * (not on `IRSnapshot`) so PV27's per-snapshot alias contract stays
 * untouched and snapshots remain wire-shaped.
 */
export type TimelineCaptureEntry = Readonly<{
  snapshot: IRSnapshot
  ts: number
  cycleCount: number | null
}>

type Listener = () => void

const DEFAULT_CAPACITY = 30

let entries: TimelineCaptureEntry[] = []
let capacity = DEFAULT_CAPACITY
const listeners = new Set<Listener>()

function fanOut(): void {
  // Listener errors do NOT block other listeners — mirrors irInspector.ts
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* swallow */
    }
  }
}

/**
 * Push a snapshot into the buffer. Defensive freeze at the snapshot
 * top-level + passes array prevents future code paths from mutating
 * captured state. FIFO eviction drops the oldest entry when capacity
 * is exceeded.
 */
export function captureSnapshot(
  snap: IRSnapshot,
  meta: { ts?: number; cycleCount?: number | null } = {},
): void {
  // Defensive shallow freeze — RESEARCH §7 trap #1.
  // Already-frozen snapshots no-op silently in non-strict mode and
  // throw in strict; the try/catch keeps both behaviors safe.
  try {
    Object.freeze(snap)
    Object.freeze(snap.passes)
  } catch {
    /* already frozen */
  }
  const entry: TimelineCaptureEntry = Object.freeze({
    snapshot: snap,
    ts: meta.ts ?? snap.ts ?? Date.now(),
    cycleCount: meta.cycleCount ?? null,
  })
  entries.push(entry)
  // FIFO eviction — drop oldest when over capacity.
  while (entries.length > capacity) {
    entries.shift()
  }
  fanOut()
}

/** Read-only view of the current buffer. Most recent entry is last. */
export function getCaptureBuffer(): readonly TimelineCaptureEntry[] {
  return entries
}

/**
 * Subscribe to buffer changes (push, clear, capacity clamp). Listener
 * fires with no arguments — consumers re-read `getCaptureBuffer()`.
 */
export function subscribeCapture(l: Listener): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Empty the buffer; notify subscribers. */
export function clearCapture(): void {
  entries = []
  fanOut()
}

/** Current configured capacity (default 30). */
export function getCaptureCapacity(): number {
  return capacity
}

/**
 * Set capacity. Clamps existing entries from the oldest if the new
 * capacity is smaller. No-op for non-finite or sub-1 values.
 */
export function setCaptureCapacity(n: number): void {
  if (!Number.isFinite(n) || n < 1) return
  capacity = Math.floor(n)
  if (entries.length > capacity) {
    entries = entries.slice(-capacity)
  }
  fanOut()
}

/**
 * Test-only: reset all module state. Mirrors clearIRSnapshot's role in
 * `irInspector.test.ts`. NOT exported via the top-level barrel — tests
 * import directly from this module path.
 */
export function __resetCaptureForTest(): void {
  entries = []
  capacity = DEFAULT_CAPACITY
  listeners.clear()
}
