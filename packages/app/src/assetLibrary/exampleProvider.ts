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

import {
  registerAssetProvider,
  notifyAssetProvidersChanged,
} from "./registry";
import type { Asset, AssetProvider, AssetSource, AssetType } from "./types";

const FLAG = "stave.assetLibrary.demo";
/** `stave.assetLibrary.demoLazy` — start the sound provider empty + loading,
 *  then fill after a tick, to exercise the loading→loaded transition (F1). */
const LAZY_FLAG = "stave.assetLibrary.demoLazy";

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

/** Pad the sound bucket up to `count` synthetic rows so the list is long
 *  enough to scroll (needed to exercise the windowing paths). */
function soundAssets(count: number): Asset[] {
  const base = DEMO_ASSETS.filter((a) => a.type === "sound");
  if (count <= base.length) return base;
  const extra: Asset[] = [];
  for (let i = base.length; i < count; i++) {
    extra.push(
      makeAsset("sound", `gen${i}`, `sound ${i}`, "built-in", "Generated", ["gen"]),
    );
  }
  return [...base, ...extra];
}

const TYPE_LABEL: Record<AssetType, string> = {
  sound: "Sounds",
  viz: "Viz",
  snippet: "Snippets",
  sample: "Samples",
};

/**
 * Register the demo provider(s) when the flag is set. Returns an unregister fn
 * (no-op when the flag is off). One provider per type (the registry is keyed by
 * type), which mirrors the real model. Dev knobs on the flag VALUE:
 *  - a positive integer N → pad the Sounds provider to N rows (scroll testing).
 *  - `stave.assetLibrary.demoLazy` set → the Sounds provider starts empty +
 *    loading, then fills on the next tick (loading→loaded transition).
 */
export function registerDemoAssetProviders(): () => void {
  if (typeof window === "undefined") return () => {};
  let raw: string | null = null;
  let lazy = false;
  try {
    raw = window.localStorage.getItem(FLAG);
    lazy = window.localStorage.getItem(LAZY_FLAG) != null;
  } catch {
    return () => {};
  }
  if (raw == null) return () => {};

  const count = Math.max(0, Number.parseInt(raw, 10) || 0);
  const fullSounds = soundAssets(count);

  // Lazy sound provider: empty + loading until `filled` flips on a timer, then
  // notify so the panel re-lists — the exact shape of the real sound catalog
  // warming up after engine init.
  let filled = !lazy;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (lazy) {
    // The lazy-flag VALUE is the fill delay in ms (default 1000) so a test can
    // open the panel BEFORE the fill and observe the loading→loaded transition.
    let delayMs = 1000;
    try {
      const v = Number.parseInt(window.localStorage.getItem(LAZY_FLAG) ?? "", 10);
      if (Number.isFinite(v) && v > 0) delayMs = v;
    } catch {
      /* keep default */
    }
    timer = setTimeout(() => {
      filled = true;
      notifyAssetProvidersChanged();
    }, delayMs);
  }
  const soundProvider: AssetProvider = {
    type: "sound",
    label: TYPE_LABEL.sound,
    list: () => (filled ? fullSounds : []),
    isLoading: () => !filled,
  };

  // In lazy mode register ONLY the (empty+loading) sound provider so the panel
  // opens genuinely empty — the strict loading→loaded condition F1 fixes. The
  // other types have data immediately and would otherwise keep total>0.
  const otherTypes: AssetType[] = lazy ? [] : ["viz", "snippet", "sample"];
  const unregs = [
    registerAssetProvider(soundProvider),
    ...otherTypes.map((t) =>
      registerAssetProvider({
        type: t,
        label: TYPE_LABEL[t],
        list: () => DEMO_ASSETS.filter((a) => a.type === t),
      }),
    ),
  ];
  return () => {
    if (timer) clearTimeout(timer);
    unregs.forEach((u) => u());
  };
}
