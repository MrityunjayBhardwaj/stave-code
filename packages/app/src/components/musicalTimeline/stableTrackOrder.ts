/**
 * stableTrackOrder — pure helper that maintains a stable row-order map
 * across re-evals (Trap 5).
 *
 * D-04 says: "first-seen insertion order, stable across snapshots — a
 * track that disappears from one eval to the next keeps its row reserved
 * (empty visual placeholder)." This helper enforces that:
 *
 *   - Tracks present in `prev` keep their slot index.
 *   - New track ids in `currentTrackIds` (not in `prev`) are appended at
 *     the next available slot (max + 1, or 0 if `prev` is empty).
 *   - Track ids in `prev` but absent from `currentTrackIds` ARE
 *     PRESERVED — their row stays reserved so the layout doesn't reflow.
 *
 * Returns a fresh `Map` per call (PV34) so the calling component can
 * write the ref back without identity collisions.
 *
 * Phase 20-01 PR-B (T-02, DB-03).
 */

/**
 * Build the next slot map preserving `prev`'s slots and appending new
 * ids. Returns a fresh Map.
 *
 * @param prev - previous trackId → slotIndex map; never mutated.
 * @param currentTrackIds - track ids in the current snapshot (deduped
 *                         is the caller's responsibility, but duplicates
 *                         here are harmless — `Map.set` is idempotent).
 */
export function stableTrackOrder(
  prev: ReadonlyMap<string, number>,
  currentTrackIds: ReadonlyArray<string>,
): Map<string, number> {
  const next = new Map(prev) // start from prev → reserves disappeared rows
  let nextSlot = 0
  if (next.size > 0) {
    let max = -1
    for (const slot of next.values()) {
      if (slot > max) max = slot
    }
    nextSlot = max + 1
  }
  for (const id of currentTrackIds) {
    if (!next.has(id)) {
      next.set(id, nextSlot++)
    }
  }
  return next
}
