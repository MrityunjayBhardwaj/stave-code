import type { VizDescriptor } from './types'
import { getVizConfig } from './vizConfig'

/**
 * Resolves a viz ID to a VizDescriptor using the "mode:renderer" convention.
 *
 * Resolution order:
 *   1. Exact match on `descriptor.id`
 *      e.g. "pianoroll:hydra" → "pianoroll:hydra"
 *   2. Default renderer — append `":${defaultRenderer}"` from config and retry
 *      e.g. "pianoroll" + defaultRenderer="hydra" → "pianoroll:hydra"
 *   3. Prefix fallback — bare mode matches first descriptor whose id starts
 *      with `vizId + ":"` (catches renderer variants not matching the default)
 *
 * Returns undefined if no match is found.
 */
export function resolveDescriptor(
  vizId: string,
  descriptors: VizDescriptor[],
): VizDescriptor | undefined {
  // 1. Exact match (handles both "pianoroll" and "pianoroll:hydra")
  const exact = descriptors.find(d => d.id === vizId)
  if (exact) return exact

  // 2. Default renderer — "pianoroll" → "pianoroll:${defaultRenderer}"
  const { defaultRenderer } = getVizConfig()
  const withDefault = `${vizId}:${defaultRenderer}`
  const defaultMatch = descriptors.find(d => d.id === withDefault)
  if (defaultMatch) return defaultMatch

  // 3. Prefix fallback — first descriptor whose id starts with "vizId:"
  const prefix = vizId + ':'
  return descriptors.find(d => d.id.startsWith(prefix))
}
