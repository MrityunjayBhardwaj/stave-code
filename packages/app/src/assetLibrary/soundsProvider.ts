/**
 * Sounds AssetProvider (#820) — the first real provider: a unified browser over
 * the FULL live `soundMap` superset (~1853 entries), the thing the melodic
 * `<select>` never could show.
 *
 * Unlike the Mixer picker's `groupSoundCatalog` (which is melodic-only — it
 * excludes the 1357 drum-machine voices and the audio-in bus by design, for a
 * scannable native `<select>`), the library is the "browse EVERYTHING, searchable"
 * surface, so this provider reads the RAW map and includes drums (grouped by
 * bank). It reuses the app's existing soundMap warm-up + poll (PV164/PV165a) — it
 * does not re-poll; `list()` just reads `globalThis.soundMap` live and the poll
 * calls `notifyAssetProvidersChanged()` when the catalog grows.
 *
 * `preview`/`insert` are dependency-injected so the mapping is unit-testable
 * without the audio graph or the editor: the app wires `startPreview` to
 * `startAudition` (@stave/editor) and `onInsert` to the shell's cursor writer.
 */

import type { Asset, AssetPreviewHandle } from "./types";

/** The minimal shape read off a superdough soundMap entry (mirrors the editor's
 *  `SoundMapEntry`; kept local so the provider doesn't depend on that type). */
interface SoundMapEntry {
  data?: { type?: string; tag?: string };
}
export type SoundMapDict = Record<string, SoundMapEntry>;

export interface SoundsProviderDeps {
  /** Read the live soundMap dict (or null before the engine warms up). */
  readDict: () => SoundMapDict | null;
  /** Start a sustained preview; returns a handle to stop it. */
  startPreview: (sound: string) => AssetPreviewHandle;
  /** Round-trip the sound into code at the cursor (assign or insert). */
  onInsert: (sound: string) => void;
}

/** Title-case a bare id: `sawtooth` → `Sawtooth`. */
function titleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** `gm_alto_sax` → `Alto Sax`. */
function soundfontLabel(name: string): string {
  return name
    .replace(/^gm_/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface Classified {
  group: string;
  label: string;
  tags: string[];
}

/**
 * Group + label a soundMap entry — the #807 taxonomy. Drum-machine voices
 * (`tag: 'drum-machines'`, keys `Bank_voice` like `RolandTR909_bd`) cluster by
 * bank; melodic sounds split by type. Unknown types fall through to "Samples"
 * (include-by-default — never silently drop a new upstream type, the P254 rule).
 */
function classify(name: string, data: SoundMapEntry["data"]): Classified {
  const type = data?.type;
  if (data?.tag === "drum-machines") {
    const i = name.lastIndexOf("_");
    const bank = i > 0 ? name.slice(0, i) : name;
    return { group: `Drums · ${bank}`, label: name, tags: ["drums", "drum-machines", bank, name] };
  }
  switch (type) {
    case "synth":
      return { group: "Synths", label: titleCase(name), tags: ["synth", name] };
    case "soundfont":
      return { group: "Soundfonts", label: soundfontLabel(name), tags: ["soundfont", "gm", name] };
    case "wavetable":
      return { group: "Wavetables", label: titleCase(name), tags: ["wavetable", name] };
    case "sample":
      return { group: "Samples", label: titleCase(name), tags: ["sample", name] };
    default:
      return { group: "Samples", label: titleCase(name), tags: [type ?? "sample", name] };
  }
}

/**
 * Pure mapping: soundMap dict → sorted `Asset[]`. Skips superdough internals
 * (`_`-prefixed) and the audio-in bus (`type: 'input'`). Sorted by (group, label)
 * so related sounds cluster in the shell's flat windowed list. Exported for
 * unit tests.
 */
export function soundMapToAssets(
  dict: SoundMapDict | null | undefined,
  deps: Pick<SoundsProviderDeps, "startPreview" | "onInsert">,
): Asset[] {
  if (!dict) return [];
  const assets: Asset[] = [];
  for (const name of Object.keys(dict)) {
    if (name.startsWith("_")) continue;
    const data = dict[name]?.data;
    if (data?.type === "input") continue;
    const { group, label, tags } = classify(name, data);
    assets.push({
      type: "sound",
      id: name, // the exact string written into s("…") — stable + unique
      name: label,
      source: "built-in",
      group,
      tags,
      preview: () => deps.startPreview(name),
      insert: () => deps.onInsert(name),
    });
  }
  assets.sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.name.localeCompare(b.name));
  return assets;
}

/** Build the Sounds provider. `list()` reads the live soundMap on each call
 *  (cheap; the shell re-lists only on registry ticks), `isLoading()` reports the
 *  pre-warm-up empty state so the shell shows "Loading…". */
export function createSoundsProvider(deps: SoundsProviderDeps) {
  return {
    type: "sound" as const,
    label: "Sounds",
    list: () => soundMapToAssets(deps.readDict(), deps),
    isLoading: () => {
      const d = deps.readDict();
      return !d || Object.keys(d).length === 0;
    },
  };
}
