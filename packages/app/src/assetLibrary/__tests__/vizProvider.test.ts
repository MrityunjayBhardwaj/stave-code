import { describe, it, expect, vi } from "vitest";

import {
  createVizProvider,
  vizPresetsToAssets,
  type VizPresetLike,
} from "../vizProvider";

const presets: VizPresetLike[] = [
  { id: "aurora_p5_v1", name: "Aurora", renderer: "p5", requires: ["audio"] },
  { id: "__bundled_pianoroll_p5__", name: "Piano Roll", renderer: "p5" },
  { id: "kaleido_hydra_v1", name: "Kaleido", renderer: "hydra" },
];

// A preset id counts as bundled iff it carries the reserved prefix (mirrors the
// editor's isBundledPresetId without importing it).
const isBundled = (id: string) => id.startsWith("__bundled_");

describe("vizPresetsToAssets (#832)", () => {
  it("maps a preset to a viz Asset with id=preset.id and code/insert=preset.name", () => {
    const onInsert = vi.fn();
    const [a] = vizPresetsToAssets([presets[0]], { isBundled, onInsert });
    expect(a).toMatchObject({
      type: "viz",
      id: "aurora_p5_v1",
      name: "Aurora",
      code: "Aurora", // .viz("Aurora") resolves by name, not the id
      source: "user",
      group: "P5",
    });
    expect(a.tags).toEqual(["p5", "audio"]);
    a.insert?.();
    expect(onInsert).toHaveBeenCalledWith("Aurora"); // the NAME, not the id
  });

  it("tags bundled presets as built-in, user presets as user", () => {
    const assets = vizPresetsToAssets(presets, { isBundled, onInsert: vi.fn() });
    const byId = Object.fromEntries(assets.map((a) => [a.id, a.source]));
    expect(byId["__bundled_pianoroll_p5__"]).toBe("built-in");
    expect(byId["aurora_p5_v1"]).toBe("user");
  });

  it("labels the renderer as the group (→ category chip)", () => {
    const assets = vizPresetsToAssets(presets, { isBundled, onInsert: vi.fn() });
    expect(assets.find((a) => a.id === "kaleido_hydra_v1")?.group).toBe("Hydra");
  });

  it("carries no preview affordance (MVP — thumbnail is a follow-up)", () => {
    const [a] = vizPresetsToAssets([presets[0]], { isBundled, onInsert: vi.fn() });
    expect(a.preview).toBeUndefined();
  });

  it("sorts by (group, name)", () => {
    const assets = vizPresetsToAssets(presets, { isBundled, onInsert: vi.fn() });
    expect(assets.map((a) => `${a.group}/${a.name}`)).toEqual([
      "Hydra/Kaleido",
      "P5/Aurora",
      "P5/Piano Roll",
    ]);
  });

  it("returns [] for a null (not-yet-loaded) preset list", () => {
    expect(vizPresetsToAssets(null, { isBundled, onInsert: vi.fn() })).toEqual([]);
  });
});

describe("createVizProvider (#832)", () => {
  it("is a viz provider that lists from the injected cache", () => {
    const p = createVizProvider({
      readPresets: () => presets,
      isBundled,
      onInsert: vi.fn(),
    });
    expect(p.type).toBe("viz");
    expect(p.label).toBe("Viz");
    expect(p.list().map((a) => a.id)).toContain("aurora_p5_v1");
  });

  it("isLoading is true only before the load resolves (null), not when empty", () => {
    expect(createVizProvider({ readPresets: () => null, isBundled, onInsert: vi.fn() }).isLoading()).toBe(true);
    expect(createVizProvider({ readPresets: () => [], isBundled, onInsert: vi.fn() }).isLoading()).toBe(false);
  });
});
