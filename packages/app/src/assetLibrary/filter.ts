/**
 * Pure filtering over the union of all providers' assets. Kept separate from
 * the panel component so the search/type/source logic is unit-testable without
 * React. The panel calls {@link collectAssets} on every registry tick + filter
 * change; the result is what the windowed list renders.
 */

import type { Asset, AssetProvider, AssetSource, AssetType } from "./types";

export interface AssetFilter {
  /** Trimmed search query; empty string matches everything. */
  query: string;
  /** null = all types; otherwise restrict to this one. */
  type: AssetType | null;
  /** null = all sources; otherwise restrict to this one. */
  source: AssetSource | null;
}

/** Generic name/tag/group substring match — the fallback when a provider has no
 *  own `search`. Case-insensitive, whitespace-trimmed. */
export function matchesQuery(asset: Asset, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (asset.name.toLowerCase().includes(q)) return true;
  if (asset.group && asset.group.toLowerCase().includes(q)) return true;
  return asset.tags.some((t) => t.toLowerCase().includes(q));
}

/**
 * Flatten every provider's assets into one list under the given filter.
 * Type filter is applied at the provider level (skip whole providers) so a
 * lazily-filling provider of another type isn't even enumerated; source and
 * query are applied per-asset. A provider's own `search` wins over the generic
 * matcher when a query is present.
 */
export function collectAssets(
  providers: readonly AssetProvider[],
  filter: AssetFilter,
): Asset[] {
  const q = filter.query.trim();
  const out: Asset[] = [];
  for (const provider of providers) {
    if (filter.type && provider.type !== filter.type) continue;
    const base = q && provider.search ? provider.search(q) : provider.list();
    for (const asset of base) {
      if (filter.source && asset.source !== filter.source) continue;
      // Provider `search` already applied the query; only the generic path
      // needs the substring gate here.
      if (q && !provider.search && !matchesQuery(asset, q)) continue;
      out.push(asset);
    }
  }
  return out;
}

/** The set of types actually present across the providers — drives which type
 *  filter chips are shown (no empty chips). */
export function availableTypes(providers: readonly AssetProvider[]): AssetType[] {
  const seen = new Set<AssetType>();
  for (const p of providers) seen.add(p.type);
  return Array.from(seen);
}

/** The set of sources actually present across all listed assets — drives which
 *  source filter chips are shown. */
export function availableSources(providers: readonly AssetProvider[]): AssetSource[] {
  const seen = new Set<AssetSource>();
  for (const p of providers) {
    for (const a of p.list()) seen.add(a.source);
  }
  return Array.from(seen);
}
