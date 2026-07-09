import { describe, it, expect, vi } from "vitest";

import { createVizProvider, vizLibraryToAssets } from "../vizProvider";
import { VIZ_LIBRARY, type VizLibItem } from "../vizLibrary";

const items: VizLibItem[] = [
  {
    id: "aurora",
    name: "Aurora",
    renderer: "p5",
    files: [{ relPath: "Aurora.p5", content: "// aurora", language: "p5js" }],
  },
  {
    id: "prism",
    name: "Prism",
    renderer: "glsl",
    files: [{ relPath: "Prism.glsl", content: "// prism", language: "glsl" }],
  },
];

describe("vizLibraryToAssets (#834)", () => {
  it("maps a package to a viz Asset (id=item.id, code=name, add-to-workspace)", () => {
    const onAdd = vi.fn();
    const [a] = vizLibraryToAssets([items[0]], { onAdd });
    expect(a).toMatchObject({
      type: "viz",
      id: "aurora",
      name: "Aurora",
      code: "Aurora", // the .viz("Aurora") token — diverges from the kebab id
      source: "built-in",
      group: "P5",
      insertLabel: "Add to workspace",
    });
    expect(a.tags).toEqual(["p5"]);
    a.insert?.();
    expect(onAdd).toHaveBeenCalledWith(items[0]); // the whole package, not a name
  });

  it("labels the renderer as the group (→ category chip)", () => {
    const assets = vizLibraryToAssets(items, { onAdd: vi.fn() });
    expect(assets.find((a) => a.id === "prism")?.group).toBe("GLSL");
  });

  it("carries no play/stop preview affordance (viz is visual — the thumbnail is its preview)", () => {
    const [a] = vizLibraryToAssets([items[0]], { onAdd: vi.fn() });
    expect(a.preview).toBeUndefined();
  });

  it("uses the package's baked thumbnail when present", () => {
    const baked = "data:image/png;base64,AAAA";
    const [a] = vizLibraryToAssets([{ ...items[0], thumbnail: baked }], {
      onAdd: vi.fn(),
    });
    expect(a.thumbnail).toBe(baked);
  });

  it("falls back to a renderer-hued placeholder data-URI when a package has no baked thumbnail", () => {
    const [a] = vizLibraryToAssets([items[0]], { onAdd: vi.fn() });
    expect(a.thumbnail).toMatch(/^data:image\/svg\+xml,/);
  });

  it("sorts by (group, name)", () => {
    const assets = vizLibraryToAssets(items, { onAdd: vi.fn() });
    expect(assets.map((a) => `${a.group}/${a.name}`)).toEqual([
      "GLSL/Prism",
      "P5/Aurora",
    ]);
  });

  it("wires mountLivePreview to the injected mountPreview with the primary file's source (#838)", () => {
    const mountPreview = vi.fn(() => ({ disconnect: vi.fn() }));
    const [a] = vizLibraryToAssets([items[1]], { onAdd: vi.fn(), mountPreview });
    const container = {} as HTMLDivElement;
    const handle = a.mountLivePreview!(container, { w: 120, h: 64 });
    expect(mountPreview).toHaveBeenCalledWith(
      container,
      { renderer: "glsl", code: "// prism", name: "Prism" },
      { w: 120, h: 64 },
    );
    expect(handle).not.toBeNull();
  });

  it("picks the PRIMARY file (basename === package name) for the preview source (#838)", () => {
    const mountPreview = vi.fn(() => null);
    const multi: VizLibItem = {
      id: "prism",
      name: "Prism",
      renderer: "glsl",
      files: [
        { relPath: "helper.glsl", content: "// helper", language: "glsl" },
        { relPath: "Prism.glsl", content: "// primary", language: "glsl" },
      ],
    };
    const [a] = vizLibraryToAssets([multi], { onAdd: vi.fn(), mountPreview });
    a.mountLivePreview!({} as HTMLDivElement, { w: 10, h: 10 });
    expect(mountPreview.mock.calls[0][1]).toMatchObject({ code: "// primary" });
  });

  it("omits mountLivePreview when no mountPreview is injected (tests / no worker)", () => {
    const [a] = vizLibraryToAssets([items[0]], { onAdd: vi.fn() });
    expect(a.mountLivePreview).toBeUndefined();
  });
});

describe("createVizProvider (#834)", () => {
  it("is a viz provider that lists the curated library", () => {
    const p = createVizProvider({ onAdd: vi.fn() });
    expect(p.type).toBe("viz");
    expect(p.label).toBe("Viz");
    // Lists the real shelf (Prism + Pulse Grid today).
    expect(p.list().map((a) => a.name)).toEqual(
      expect.arrayContaining(["Prism", "Pulse Grid"]),
    );
  });

  it("every listed item is built-in and offers an add affordance", () => {
    const p = createVizProvider({ onAdd: vi.fn() });
    for (const a of p.list()) {
      expect(a.source).toBe("built-in");
      expect(a.insert).toBeTypeOf("function");
      expect(a.insertLabel).toBe("Add to workspace");
    }
    // The real corpus is non-empty (nothing filtered it to nothing).
    expect(p.list().length).toBe(VIZ_LIBRARY.length);
  });
});
