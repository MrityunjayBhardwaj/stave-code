/**
 * historyRetention — tiered pruning + keep-if-sole-writer (PV61) unit tests
 * (Phase F, #196). Deterministic: all timestamps explicit, `now` passed in.
 */
import { describe, it, expect } from 'vitest'
import { prune } from '../historyRetention'
import {
  seedHistory,
  commitOnto,
  listCommits,
  getFileContentAt,
  type ProjectHistory,
  type CommitKind,
} from '../historyGraph'

const DAY = 86_400_000

/** Build a history by replaying (changed, kind, id, ageDaysAgo) onto a seed. */
function build(
  seedFiles: Record<string, string>,
  seedAge: number,
  now: number,
  steps: Array<{ files: Record<string, string>; kind: CommitKind; id: string; ageDays: number }>,
): ProjectHistory {
  let h = seedHistory('p', seedFiles, undefined, 'c0', now - seedAge * DAY)
  for (const s of steps) {
    h = commitOnto(h, s.files, { kind: s.kind, id: s.id, createdAt: now - s.ageDays * DAY })
  }
  return h
}

describe('prune — tiers', () => {
  it('keeps all auto-commits ≤24h old', () => {
    const now = 100 * DAY
    const h = build({ f1: 'a0' }, 100, now, [
      { files: { f1: 'a1' }, kind: 'auto', id: 'c1', ageDays: 0.1 },
      { files: { f1: 'a2' }, kind: 'auto', id: 'c2', ageDays: 0.5 },
    ])
    const p = prune(h, now)
    expect(listCommits(p).map((c) => c.id).sort()).toEqual(['c0', 'c1', 'c2'])
  })

  it('keeps one auto per day bucket in the 24h–30d window', () => {
    const now = 100 * DAY
    // three autos all in the SAME day bucket (~10 days ago); only the latest survives display
    const h = build({ f1: 'a0' }, 100, now, [
      { files: { f1: 'a1' }, kind: 'auto', id: 'd1', ageDays: 10.9 },
      { files: { f1: 'a2' }, kind: 'auto', id: 'd2', ageDays: 10.5 },
      { files: { f1: 'a3' }, kind: 'auto', id: 'd3', ageDays: 10.1 }, // latest in bucket
      // a recent head so d3 isn't the head (head is always kept)
      { files: { f1: 'a4' }, kind: 'auto', id: 'head', ageDays: 0.1 },
    ])
    const ids = listCommits(prune(h, now)).map((c) => c.id)
    expect(ids).toContain('head')
    expect(ids).toContain('d3') // latest in the day bucket
    expect(ids).not.toContain('d1')
    expect(ids).not.toContain('d2')
  })
})

describe('prune — protected kinds + heads', () => {
  it('never prunes seed / manual / fork, even if old and bucket-redundant', () => {
    const now = 100 * DAY
    let h = seedHistory('p', { f1: 'a0' }, undefined, 'c0', now - 90 * DAY)
    h = commitOnto(h, { f1: 'm1' }, { kind: 'manual', id: 'man', createdAt: now - 80 * DAY, label: 'milestone' })
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'head', createdAt: now - 0.1 * DAY })
    const ids = listCommits(prune(h, now)).map((c) => c.id)
    expect(ids).toContain('man') // manual survives forever
    expect(ids).toContain('c0') // seed survives
  })

  it('never prunes a branch head', () => {
    const now = 100 * DAY
    // an old auto that is a branch head must survive
    let h = build({ f1: 'a0' }, 100, now, [
      { files: { f1: 'a1' }, kind: 'auto', id: 'oldhead', ageDays: 50 },
    ])
    const p = prune(h, now)
    expect(listCommits(p).map((c) => c.id)).toContain('oldhead')
  })
})

describe('prune — keep-if-sole-writer (PV61)', () => {
  it('pins (keeps but hides) an out-of-tier commit holding a file’s only copy, preserving getFileContentAt', () => {
    const now = 100 * DAY
    // chain: c0(seed,f1) ← c1(f2, sole writer) ← cX(f3) ← c2(f1, head).
    // c1 + cX share a month bucket (>30d); cX (newer) wins the bucket so c1
    // drops from display. But f2 is alive at the head and c1 is its only
    // writer → c1 must be PINNED (kept on the storage chain, hidden from
    // display), preserving the head's view of f2.
    let h = seedHistory('p', { f1: 'a0' }, undefined, 'c0', now - 95 * DAY)
    h = commitOnto(h, { f2: 'only-here' }, { kind: 'auto', id: 'c1', createdAt: now - 60 * DAY })
    h = commitOnto(h, { f3: 'other' }, { kind: 'auto', id: 'cX', createdAt: now - 58 * DAY })
    h = commitOnto(h, { f1: 'a1' }, { kind: 'auto', id: 'c2', createdAt: now - 0.1 * DAY })
    const p = prune(h, now, { dayBucketMs: DAY, monthBucketMs: 30 * DAY })

    // c1 is hidden from the display lineage…
    const displayed = listCommits(p).map((c) => c.id)
    expect(displayed).not.toContain('c1')
    expect(displayed).toEqual(['c2', 'cX', 'c0'])
    // …but still present in storage, flagged pinned…
    expect(p.commits.c1).toBeDefined()
    expect(p.commits.c1.pinned).toBe(true)
    // …so the head's view of f2 is still correct (no data loss).
    expect(getFileContentAt(p, 'f2', 'c2')).toBe('only-here')
    expect(getFileContentAt(p, 'f1', 'c2')).toBe('a1')
  })

  it('DELETES a fully-shadowed redundant commit and re-links parents', () => {
    const now = 100 * DAY
    // chain: c0(seed,f1) ← cA(f1) ← cMid(f1) ← cB(f1, head).
    // cA + cMid share a month bucket; cMid (newer) wins it so cA drops from
    // display. f1 is shadowed at every displayed view (c0/cMid/cB each write
    // f1 closer than cA), so cA is needed by nobody → DELETED, and cMid's
    // parent re-links over it to the seed.
    let h = seedHistory('p', { f1: 'a0' }, undefined, 'c0', now - 95 * DAY)
    h = commitOnto(h, { f1: 'x' }, { kind: 'auto', id: 'cA', createdAt: now - 60 * DAY })
    h = commitOnto(h, { f1: 'z' }, { kind: 'auto', id: 'cMid', createdAt: now - 58 * DAY })
    h = commitOnto(h, { f1: 'y' }, { kind: 'auto', id: 'cB', createdAt: now - 0.1 * DAY })
    const p = prune(h, now, { dayBucketMs: DAY, monthBucketMs: 30 * DAY })

    expect(p.commits.cA).toBeUndefined() // truly deleted, not pinned
    expect(p.commits.cMid.parent).toBe('c0') // re-linked over the deleted cA
    expect(getFileContentAt(p, 'f1', 'cB')).toBe('y')
    expect(p.fileIndex.f1).toEqual(['c0', 'cMid', 'cB']) // cA dropped from index
    expect(listCommits(p).map((c) => c.id)).toEqual(['cB', 'cMid', 'c0'])
  })
})

describe('prune — maxAutoCommits cap (#202)', () => {
  it('drops the oldest display autos beyond the cap, even within 24h', () => {
    const now = 100 * DAY
    // 5 recent autos (all <24h), each rewriting f1 so older ones are shadowed.
    const h = build({ f1: 'a0' }, 100, now, [
      { files: { f1: 'a1' }, kind: 'auto', id: 'c1', ageDays: 0.5 },
      { files: { f1: 'a2' }, kind: 'auto', id: 'c2', ageDays: 0.4 },
      { files: { f1: 'a3' }, kind: 'auto', id: 'c3', ageDays: 0.3 },
      { files: { f1: 'a4' }, kind: 'auto', id: 'c4', ageDays: 0.2 },
      { files: { f1: 'a5' }, kind: 'auto', id: 'c5', ageDays: 0.1 }, // newest = head
    ])
    const p = prune(h, now, { maxAutoCommits: 2 })
    const ids = listCommits(p).map((c) => c.id)
    // head (c5) always kept; cap keeps the newest 2 non-head display autos.
    expect(ids).toContain('c5') // head
    // oldest beyond cap dropped from display
    expect(ids).not.toContain('c1')
    expect(ids).not.toContain('c2')
    // seed always kept; HEAD view still correct (f1 shadowed forward)
    expect(ids).toContain('c0')
    expect(getFileContentAt(p, 'f1', 'c5')).toBe('a5')
  })
})

describe('prune — no-op', () => {
  it('returns the same history when nothing is prunable', () => {
    const now = 100 * DAY
    const h = build({ f1: 'a0' }, 0.5, now, [
      { files: { f1: 'a1' }, kind: 'auto', id: 'c1', ageDays: 0.1 },
    ])
    expect(prune(h, now)).toBe(h)
  })
})
