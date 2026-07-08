import { describe, it, expect, beforeEach } from "vitest";
import {
  registerAssetProvider,
  listAssetProviders,
  getAssetProvider,
  subscribeToAssetProviders,
  notifyAssetProvidersChanged,
} from "../registry";
import {
  collectAssets,
  matchesQuery,
  availableTypes,
  availableSources,
  availableCategories,
  assetCategory,
  type AssetFilter,
} from "../filter";
import type { Asset, AssetProvider, AssetType, AssetSource } from "../types";

function asset(
  type: AssetType,
  id: string,
  name: string,
  source: AssetSource,
  tags: string[] = [],
  group?: string,
): Asset {
  return { type, id, name, source, tags, group };
}

function provider(
  type: AssetType,
  assets: Asset[],
  extra: Partial<AssetProvider> = {},
): AssetProvider {
  return { type, label: type, list: () => assets, ...extra };
}

// The registry is a module singleton — clear it between tests.
function clearRegistry() {
  for (const p of listAssetProviders()) {
    // register a throwaway of the same type then unregister to purge; simpler:
    // rely on getAssetProvider identity via a fresh replace + unreg.
    const unreg = registerAssetProvider(p);
    unreg();
  }
}

describe("asset registry", () => {
  beforeEach(clearRegistry);

  it("registers and lists a provider", () => {
    const p = provider("sound", [asset("sound", "a", "a", "built-in")]);
    registerAssetProvider(p);
    expect(getAssetProvider("sound")).toBe(p);
    expect(listAssetProviders()).toContain(p);
  });

  it("one provider per type — re-registering replaces", () => {
    const p1 = provider("sound", []);
    const p2 = provider("sound", []);
    registerAssetProvider(p1);
    registerAssetProvider(p2);
    expect(getAssetProvider("sound")).toBe(p2);
    expect(listAssetProviders().filter((p) => p.type === "sound")).toHaveLength(1);
  });

  it("unregister removes only the still-registered provider", () => {
    const p1 = provider("sound", []);
    const unreg1 = registerAssetProvider(p1);
    const p2 = provider("sound", []);
    registerAssetProvider(p2); // replaces p1
    unreg1(); // stale — must NOT remove p2
    expect(getAssetProvider("sound")).toBe(p2);
  });

  it("notifies subscribers on register, change, and unregister", () => {
    let hits = 0;
    const unsub = subscribeToAssetProviders(() => hits++);
    const unreg = registerAssetProvider(provider("viz", []));
    notifyAssetProvidersChanged();
    unreg();
    unsub();
    expect(hits).toBe(3);
  });
});

describe("matchesQuery", () => {
  const a = asset("sound", "bd", "Bass Drum", "built-in", ["kick", "909"], "Drums");
  it("empty query matches", () => expect(matchesQuery(a, "")).toBe(true));
  it("matches name case-insensitively", () => expect(matchesQuery(a, "bass")).toBe(true));
  it("matches a tag", () => expect(matchesQuery(a, "909")).toBe(true));
  it("matches the group", () => expect(matchesQuery(a, "drum")).toBe(true));
  it("no match returns false", () => expect(matchesQuery(a, "piano")).toBe(false));
});

describe("collectAssets", () => {
  const sounds = provider("sound", [
    asset("sound", "piano", "piano", "built-in", ["keys"]),
    asset("sound", "mysample", "mysample", "user", ["import"]),
  ]);
  const viz = provider("viz", [asset("viz", "scope", "Scope", "built-in", ["wave"])]);
  const providers = [sounds, viz];
  const base: AssetFilter = { query: "", type: null, source: null, category: null };

  it("flattens all providers with no filter", () => {
    expect(collectAssets(providers, base)).toHaveLength(3);
  });

  it("type filter restricts to one provider", () => {
    const r = collectAssets(providers, { ...base, type: "viz" });
    expect(r.map((a) => a.id)).toEqual(["scope"]);
  });

  it("source filter is per-asset across providers", () => {
    const r = collectAssets(providers, { ...base, source: "user" });
    expect(r.map((a) => a.id)).toEqual(["mysample"]);
  });

  it("generic query matches name/tag when provider has no search", () => {
    const r = collectAssets(providers, { ...base, query: "keys" });
    expect(r.map((a) => a.id)).toEqual(["piano"]);
  });

  it("uses a provider's own search when present", () => {
    const searchable = provider(
      "snippet",
      [asset("snippet", "x", "x", "built-in")],
      { search: () => [asset("snippet", "hit", "hit", "built-in")] },
    );
    const r = collectAssets([searchable], { ...base, query: "anything" });
    expect(r.map((a) => a.id)).toEqual(["hit"]);
  });

  it("combines type + source + query", () => {
    const r = collectAssets(providers, { query: "piano", type: "sound", source: "built-in", category: null });
    expect(r.map((a) => a.id)).toEqual(["piano"]);
  });

  it("category filter restricts to one top-level group (#826)", () => {
    const cats = provider("sound", [
      asset("sound", "bd", "Kick", "built-in", [], "Drums · RolandTR909"),
      asset("sound", "vln", "Violin", "built-in", [], "Soundfonts · Strings"),
      asset("sound", "saw", "Saw", "built-in", [], "Synths"),
    ]);
    const r = collectAssets([cats], { ...base, category: "Soundfonts" });
    expect(r.map((a) => a.id)).toEqual(["vln"]);
    const drums = collectAssets([cats], { ...base, category: "Drums" });
    expect(drums.map((a) => a.id)).toEqual(["bd"]);
  });
});

describe("available filter values", () => {
  const providers = [
    provider("sound", [
      asset("sound", "a", "a", "built-in"),
      asset("sound", "b", "b", "user"),
    ]),
    provider("viz", [asset("viz", "v", "v", "community")]),
  ];
  it("availableTypes lists present types", () => {
    expect(availableTypes(providers).sort()).toEqual(["sound", "viz"]);
  });
  it("availableSources lists present sources", () => {
    expect(availableSources(providers).sort()).toEqual([
      "built-in",
      "community",
      "user",
    ]);
  });
});

describe("categories (#826)", () => {
  it("assetCategory takes the group prefix before ` · `, else the whole group, else Other", () => {
    expect(assetCategory(asset("sound", "x", "x", "built-in", [], "Soundfonts · Strings"))).toBe("Soundfonts");
    expect(assetCategory(asset("sound", "x", "x", "built-in", [], "Drums · RolandTR909"))).toBe("Drums");
    expect(assetCategory(asset("sound", "x", "x", "built-in", [], "Synths"))).toBe("Synths");
    expect(assetCategory(asset("sound", "x", "x", "built-in", []))).toBe("Other");
  });

  it("availableCategories counts entries per category, sorted by count desc", () => {
    const p = provider("sound", [
      asset("sound", "bd", "bd", "built-in", [], "Drums · RolandTR909"),
      asset("sound", "sd", "sd", "built-in", [], "Drums · RolandTR808"),
      asset("sound", "vln", "vln", "built-in", [], "Soundfonts · Strings"),
      asset("sound", "saw", "saw", "built-in", [], "Synths"),
    ]);
    expect(availableCategories([p])).toEqual([
      { category: "Drums", count: 2 },
      { category: "Soundfonts", count: 1 },
      { category: "Synths", count: 1 },
    ]);
  });

  it("availableCategories scopes counts to the given type/source", () => {
    const p = provider("sound", [
      asset("sound", "bd", "bd", "built-in", [], "Drums · X"),
      asset("sound", "mine", "mine", "user", [], "Samples"),
    ]);
    expect(availableCategories([p], { source: "user" })).toEqual([
      { category: "Samples", count: 1 },
    ]);
  });
});
