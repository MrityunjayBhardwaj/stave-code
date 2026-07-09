/**
 * Viz AssetProvider (#834) — the curated viz *library*. Unlike Sounds (which
 * mirrors the whole soundMap) this lists a small, hand-picked shelf of
 * non-default viz *packages* ({@link ./vizLibrary}), NOT the bundled default
 * presets. Each row's primary action is **Add to workspace**, not insert: `+`
 * materialises the package under `viz_lib/<Name>/` and registers it as a named
 * viz so `.viz("<Name>")` resolves.
 *
 * The `onAdd` handler is dependency-injected (it needs `@stave/editor`'s
 * workspace + viz-registration APIs), so this module stays free of a runtime
 * editor import and its tests stay hermetic — the same pattern the Sounds
 * provider uses.
 */

import type { Asset } from "./types";
import { VIZ_LIBRARY, type VizLibItem } from "./vizLibrary";
import { vizThumbnailPlaceholder } from "./vizThumbnail";

export interface VizProviderDeps {
  /** Add a package to the workspace (materialise its files + register the
   *  named viz). Wired in `StaveApp`. */
  onAdd: (item: VizLibItem) => void;
}

/** Display label for a renderer — also the asset `group` and category chip. */
const RENDERER_LABELS: Record<VizLibItem["renderer"], string> = {
  hydra: "Hydra",
  p5: "P5",
  glsl: "GLSL",
};

/**
 * Pure mapping: curated packages → sorted `Asset[]`. Sorted by (group, name)
 * so packages cluster by renderer in the shell's flat list. Exported for tests.
 */
export function vizLibraryToAssets(
  items: readonly VizLibItem[],
  deps: VizProviderDeps,
): Asset[] {
  const assets = items.map((item): Asset => ({
    type: "viz",
    id: item.id,
    name: item.name,
    // The string you'd type in `.viz("…")` — what Copy copies and what the
    // added file registers under. Diverges from `id` (a kebab library key).
    code: item.name,
    source: "built-in",
    group: RENDERER_LABELS[item.renderer] ?? item.renderer,
    tags: [item.renderer],
    // A baked frame of the running shader, or a renderer-hued placeholder when a
    // package ships none — so every viz row has a consistent leading tile.
    thumbnail: item.thumbnail ?? vizThumbnailPlaceholder(item),
    // `+` adds the package to the workspace (see the row's `insertLabel`).
    insert: () => deps.onAdd(item),
    insertLabel: "Add to workspace",
    // no `preview` — viz is visual, not audible; the thumbnail is its preview.
  }));
  assets.sort(
    (a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.name.localeCompare(b.name),
  );
  return assets;
}

/**
 * Build the Viz provider. The shelf is a static in-module corpus, so `list()`
 * maps it on every call (a handful of items — no memoisation, no async load).
 */
export function createVizProvider(deps: VizProviderDeps) {
  return {
    type: "viz" as const,
    label: "Viz",
    list: () => vizLibraryToAssets(VIZ_LIBRARY, deps),
  };
}
