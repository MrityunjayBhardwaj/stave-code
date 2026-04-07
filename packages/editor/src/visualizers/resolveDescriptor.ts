import type { VizDescriptor } from './types'

/**
 * Resolves a viz ID to a VizDescriptor using the "mode:renderer" convention.
 *
 * Resolution order:
 *   1. Exact match on `descriptor.id` (e.g. "pianoroll:hydra" → "pianoroll:hydra")
 *   2. Prefix fallback — bare mode matches first descriptor whose id starts with `vizId + ":"`
 *      (e.g. "pianoroll" matches "pianoroll:hydra" if no bare "pianoroll" exists)
 *
 * Returns undefined if no match is found.
 */
export function resolveDescriptor(
  vizId: string,
  descriptors: VizDescriptor[],
): VizDescriptor | undefined {
  // 1. Exact match
  const exact = descriptors.find(d => d.id === vizId)
  if (exact) return exact

  // 2. Prefix fallback — bare "mode" finds "mode:renderer"
  const prefix = vizId + ':'
  return descriptors.find(d => d.id.startsWith(prefix))
}
