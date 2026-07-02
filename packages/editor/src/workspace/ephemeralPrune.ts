/**
 * Ephemeral-session cleanup (#688).
 *
 * When boot falls back to an in-memory ephemeral session ("Continue without
 * saving"), the synthetic project id is `ephemeral-<uuid>` and no registry
 * entry exists. If IndexedDB recovers mid-session (e.g. the blocking tab
 * closes), a background write — an auto-commit/snapshot or a `touchProject` —
 * could leave a phantom row for a project that has no real metadata or doc.
 *
 * The invariant "an ephemeral session never persists" spans three stores
 * (registry, snapshots, history), so cleanup is reconciled in one place rather
 * than gated at every write site (miss one and the phantom returns). On the
 * next successful persistent boot, prune every row tagged with the ephemeral
 * id prefix. Each store prune is bounded (routes through `openIdbWithTimeout`)
 * and independent — `allSettled` so a single blocked store doesn't stop the
 * others, and the whole thing can't hang the boot it fires after.
 */

import { pruneEphemeralProjects } from './projectRegistry'
import { pruneEphemeralSnapshots } from './snapshotStore'
import { pruneEphemeralHistory } from './history/historyStore'

export async function pruneEphemeralArtifacts(): Promise<void> {
  await Promise.allSettled([
    pruneEphemeralProjects(),
    pruneEphemeralSnapshots(),
    pruneEphemeralHistory(),
  ])
}
