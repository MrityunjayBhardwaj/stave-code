/**
 * Viz AssetProvider (#832) — saved visualization presets as a browsable asset
 * type alongside Sounds. Reads the user's `VizPreset`s (built-in + saved), maps
 * each to an {@link Asset}, and inserts `.viz("name")` onto the pattern under the
 * cursor.
 *
 * Two things differ from Sounds:
 *  - `.viz()` resolves by preset NAME (`registerNamedViz(preset.name,…)`), while
 *    the row needs a unique key. So `id` = `preset.id` (unique) but `code`/insert
 *    use `preset.name`. For sounds these are the same string; here they diverge.
 *  - No `preview`: a viz is visual, and the 40px row has no thumbnail slot yet
 *    (a deliberate follow-up). Insert + Copy are the affordances.
 *
 * Like Sounds, the preset list + `isBundled` + `onInsert` are dependency-injected
 * so the pure mapping stays editor-free and unit-testable (importing the editor
 * barrel would drag its viz/`gifenc` deps into this provider's tests).
 */

import type { Asset } from "./types";

/** The minimal shape read off a `VizPreset` (mirrors `@stave/editor`'s type;
 *  kept local so the provider doesn't depend on that module). */
export interface VizPresetLike {
  id: string;
  name: string;
  renderer: "hydra" | "p5" | "glsl";
  requires?: readonly string[];
}

export interface VizProviderDeps {
  /** The known presets (built-in + user), or `null` before the IDB load resolves. */
  readPresets: () => readonly VizPresetLike[] | null;
  /** Whether this id was app-bundled (→ `built-in`) vs user-saved (→ `user`). */
  isBundled: (id: string) => boolean;
  /** Attach `.viz("name")` at the cursor. */
  onInsert: (name: string) => void;
}

/** Display label for a renderer — also the asset `group` and category chip. */
const RENDERER_LABELS: Record<VizPresetLike["renderer"], string> = {
  hydra: "Hydra",
  p5: "P5",
  glsl: "GLSL",
};

/**
 * Pure mapping: presets → sorted `Asset[]`. Sorted by (group, name) so presets
 * cluster by renderer in the shell's flat windowed list. Exported for unit tests.
 */
export function vizPresetsToAssets(
  presets: readonly VizPresetLike[] | null | undefined,
  deps: Pick<VizProviderDeps, "isBundled" | "onInsert">,
): Asset[] {
  if (!presets) return [];
  const assets = presets.map((p): Asset => {
    const group = RENDERER_LABELS[p.renderer] ?? p.renderer;
    return {
      type: "viz",
      id: p.id, // unique row key
      name: p.name,
      code: p.name, // the string written into `.viz("…")` and copied
      source: deps.isBundled(p.id) ? "built-in" : "user",
      group,
      tags: [p.renderer, ...(p.requires ?? [])],
      insert: () => deps.onInsert(p.name),
      // no `preview` — thumbnail is a follow-up
    };
  });
  assets.sort(
    (a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.name.localeCompare(b.name),
  );
  return assets;
}

/**
 * Build the Viz provider. Presets are few (dozens), so `list()` maps on every
 * call — no memoisation needed (unlike the 1851-entry Sounds provider). `list()`
 * reads the injected cache synchronously; the app refreshes it (async IDB read)
 * and calls `notifyAssetProvidersChanged()` so the shell re-lists.
 */
export function createVizProvider(deps: VizProviderDeps) {
  return {
    type: "viz" as const,
    label: "Viz",
    list: () => vizPresetsToAssets(deps.readPresets(), deps),
    // `null` = still fetching from IDB; `[]` = fetched, user has no presets.
    isLoading: () => deps.readPresets() === null,
  };
}
