/**
 * Demo stub provider — exercises the shell (#819) before the real Sounds
 * provider (#820) exists. Registered ONLY when the `stave.assetLibrary.demo`
 * localStorage flag is set (matches the `stave.viz.*` dev-flag convention), so
 * production is clean and #820 removes this file.
 *
 * It supplies a handful of assets across types + sources so type/source filters
 * have something to filter, and a fake sustained preview (returns a stop handle)
 * to verify single-active-preview + the play/stop toggle.
 */

import { registerAssetProvider } from "./registry";
import type { Asset, AssetProvider, AssetSource, AssetType } from "./types";

const FLAG = "stave.assetLibrary.demo";

function makeAsset(
  type: AssetType,
  id: string,
  name: string,
  source: AssetSource,
  group: string,
  tags: string[],
): Asset {
  return {
    type,
    id,
    name,
    source,
    group,
    tags,
    preview: () => {
      // Fake a sustained preview: log start, return a stop handle. Real
      // providers start audio here; the shell only needs the handle contract.
      // eslint-disable-next-line no-console
      console.log(`[asset-demo] preview ▶ ${name}`);
      return {
        stop: () => {
          // eslint-disable-next-line no-console
          console.log(`[asset-demo] preview ⏹ ${name}`);
        },
      };
    },
    insert: () => {
      // eslint-disable-next-line no-console
      console.log(`[asset-demo] insert ＋ ${name}`);
    },
  };
}

const DEMO_ASSETS: Asset[] = [
  makeAsset("sound", "piano", "piano", "built-in", "Keys", ["melodic", "gm"]),
  makeAsset("sound", "bd", "bd", "built-in", "Drums", ["kit", "percussion"]),
  makeAsset("sound", "sawtooth", "sawtooth", "built-in", "Synths", ["synth"]),
  makeAsset("sound", "mysample", "mysample", "user", "Imported", ["user"]),
  makeAsset("viz", "pianoroll", "Piano Roll", "built-in", "p5", ["notes"]),
  makeAsset("viz", "scope", "Scope", "built-in", "p5", ["waveform"]),
  makeAsset("snippet", "fourfloor", "Four on the floor", "built-in", "Beats", ["drum"]),
  makeAsset("sample", "kick909", "kick909.wav", "user", "Imported", ["kick"]),
  makeAsset("sound", "storepad", "Store Pad", "community", "Marketplace", ["pad"]),
];

const demoProvider: AssetProvider = {
  type: "sound",
  label: "Demo",
  // A single stub stands in for every type; the shell filters it by type, so
  // list() returns all demo assets and the type filter narrows them.
  list: () => DEMO_ASSETS,
};

/**
 * Register the demo provider(s) when the flag is set. Returns an unregister fn
 * (no-op when the flag is off). The stub covers 4 types, so we register one
 * provider per distinct type it contains (the registry is keyed by type).
 */
export function registerDemoAssetProviders(): () => void {
  if (typeof window === "undefined") return () => {};
  let on = false;
  try {
    on = window.localStorage.getItem(FLAG) != null;
  } catch {
    on = false;
  }
  if (!on) return () => {};

  const types: AssetType[] = ["sound", "viz", "snippet", "sample"];
  const unregs = types.map((t) =>
    registerAssetProvider({
      type: t,
      label: { sound: "Sounds", viz: "Viz", snippet: "Snippets", sample: "Samples" }[t],
      list: () => DEMO_ASSETS.filter((a) => a.type === t),
    }),
  );
  // Keep the aggregate provider referenced so tree-shaking doesn't drop it and
  // future manual testing can import it directly.
  void demoProvider;
  return () => unregs.forEach((u) => u());
}
