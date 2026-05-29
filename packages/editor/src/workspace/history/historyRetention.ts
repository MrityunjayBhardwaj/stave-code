/**
 * historyRetention — tiered pruning for the project commit store (Phase F,
 * #196, RESEARCH §2). Pure; takes `now` explicitly so it is deterministic.
 *
 * Tiers (auto-commits only):
 *   age ≤ 24h         → keep all
 *   24h < age ≤ 30d   → keep the latest per day bucket
 *   age > 30d         → keep the latest per month bucket
 *
 * Always kept (never pruned): seed / manual / fork commits, and every branch
 * head.
 *
 * keep-if-sole-writer (PV61): because commits store only-changed-files, a
 * displayed commit's `getFileContentAt` may read a file from an OLDER commit
 * that itself fell outside the display tier. Deleting that older commit would
 * corrupt the displayed view. So we KEEP it as a `pinned` commit — present on
 * the storage chain (back-walk traverses it) but hidden from the display
 * lineage. Only commits that NO displayed commit reads as a nearest-writer are
 * actually deleted. Deleted commits are spliced out by re-linking parents.
 */

import {
  type ProjectHistory,
  type Commit,
  filesAliveAt,
  nearestWriter,
} from './historyGraph'

const DAY_MS = 86_400_000

export interface RetentionOpts {
  /** commits at/under this age are all kept (default 24h). */
  readonly recentMs?: number
  /** commits at/under this age keep one per day; beyond, one per month (default 30d). */
  readonly dailyMs?: number
  /** day bucket width (default 24h). */
  readonly dayBucketMs?: number
  /** month bucket width (default 30d). */
  readonly monthBucketMs?: number
  /**
   * Hard cap on auto-commits kept for display, regardless of tier (default
   * 500). Bounds the whole-row storage cost (#202): without it the 24h
   * "keep-all" tier could grow unbounded under heavy editing. When exceeded,
   * the oldest display autos are dropped (still subject to keep-if-sole-writer
   * pinning, so no content is lost). Protected kinds + branch heads never
   * count against / fall to the cap.
   */
  readonly maxAutoCommits?: number
}

/**
 * Prune `h` as of `now`. Returns a new history (same object if nothing pruned).
 */
export function prune(
  h: ProjectHistory,
  now: number,
  opts: RetentionOpts = {},
): ProjectHistory {
  const recentMs = opts.recentMs ?? DAY_MS
  const dailyMs = opts.dailyMs ?? 30 * DAY_MS
  const dayBucket = opts.dayBucketMs ?? DAY_MS
  const monthBucket = opts.monthBucketMs ?? 30 * DAY_MS
  const maxAutoCommits = opts.maxAutoCommits ?? 500

  const all = Object.values(h.commits)
  const heads = new Set(Object.values(h.branches).map((b) => b.head))

  // ── 1. display set D ─────────────────────────────────────────────────
  const display = new Set<string>()
  for (const c of all) {
    if (c.kind !== 'auto' || heads.has(c.id)) display.add(c.id) // protected + heads
  }
  // tier the remaining autos
  const recentAutos: Commit[] = []
  const dailyBuckets = new Map<number, Commit>() // bucket → latest
  const monthlyBuckets = new Map<number, Commit>()
  for (const c of all) {
    if (c.kind !== 'auto' || heads.has(c.id)) continue
    const age = now - c.createdAt
    if (age <= recentMs) {
      recentAutos.push(c)
    } else if (age <= dailyMs) {
      const k = Math.floor(c.createdAt / dayBucket)
      const cur = dailyBuckets.get(k)
      if (!cur || c.createdAt > cur.createdAt) dailyBuckets.set(k, c)
    } else {
      const k = Math.floor(c.createdAt / monthBucket)
      const cur = monthlyBuckets.get(k)
      if (!cur || c.createdAt > cur.createdAt) monthlyBuckets.set(k, c)
    }
  }
  for (const c of recentAutos) display.add(c.id)
  for (const c of dailyBuckets.values()) display.add(c.id)
  for (const c of monthlyBuckets.values()) display.add(c.id)

  // Hard cap (#202): if more than maxAutoCommits auto-commits survived the
  // tiers for display, keep only the newest and drop the oldest from display
  // (they become deletable, still sole-writer-pinned if load-bearing). Heads
  // are never dropped (they were added as protected above).
  const displayAutos = [...recentAutos, ...dailyBuckets.values(), ...monthlyBuckets.values()]
    .filter((c) => !heads.has(c.id))
    .sort((a, b) => b.createdAt - a.createdAt)
  if (displayAutos.length > maxAutoCommits) {
    for (const c of displayAutos.slice(maxAutoCommits)) display.delete(c.id)
  }

  // ── 2. keep-if-sole-writer: pin nearest-writers of every displayed view ──
  const needed = new Set<string>()
  for (const id of display) {
    for (const f of filesAliveAt(h, id)) {
      const w = nearestWriter(h, id, f)
      if (w) needed.add(w)
    }
  }
  const keep = new Set<string>([...display, ...needed])

  // ── 3. re-link parents over deleted commits, set pinned flags ──────────
  // A commit kept only as a nearest-writer (in `keep` but not `display`) is
  // `pinned`: on the storage chain, hidden from display. Note this can happen
  // even when NOTHING is deleted, so we can't short-circuit on size alone.
  const nearestKeptAncestor = (start: string | null): string | null => {
    let walk = start
    while (walk !== null && !keep.has(walk)) walk = h.commits[walk]?.parent ?? null
    return walk
  }

  let mutated = keep.size !== all.length // any deletion?
  const commits: Record<string, Commit> = {}
  for (const c of all) {
    if (!keep.has(c.id)) continue
    const newParent = nearestKeptAncestor(c.parent)
    const isPinned = !display.has(c.id) // kept only as a writer → hidden
    if (newParent !== c.parent || isPinned !== !!c.pinned) mutated = true
    const next: Commit = {
      ...c,
      parent: newParent,
      ...(isPinned ? { pinned: true as const } : {}),
    }
    if (!isPinned) delete (next as { pinned?: boolean }).pinned
    commits[c.id] = next
  }

  if (!mutated) return h

  // ── 4. rebuild fileIndex (drop deleted commit ids) ─────────────────────
  const fileIndex: Record<string, string[]> = {}
  for (const [f, ids] of Object.entries(h.fileIndex)) {
    const surviving = ids.filter((id) => keep.has(id))
    if (surviving.length > 0) fileIndex[f] = surviving
  }

  return { ...h, commits, fileIndex }
}
