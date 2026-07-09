import { describe, it, expect } from "vitest";

import { vizThumbnailPlaceholder } from "../vizThumbnail";
import type { VizLibItem } from "../vizLibrary";

const item = (over: Partial<VizLibItem> = {}): VizLibItem => ({
  id: "x",
  name: "X",
  renderer: "glsl",
  files: [],
  ...over,
});

describe("vizThumbnailPlaceholder (#836)", () => {
  it("returns a self-contained inline-SVG data URI", () => {
    const uri = vizThumbnailPlaceholder(item());
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    // Decodes back to well-formed SVG with a gradient-filled tile.
    const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
    expect(svg).toContain("<svg");
    expect(svg).toContain("linearGradient");
    expect(svg).toContain("</svg>");
  });

  it("is deterministic — same package → same URI", () => {
    expect(vizThumbnailPlaceholder(item({ name: "Prism" }))).toBe(
      vizThumbnailPlaceholder(item({ name: "Prism" })),
    );
  });

  it("differs between two same-renderer packages (per-name hue jitter)", () => {
    const prism = vizThumbnailPlaceholder(item({ name: "Prism", renderer: "glsl" }));
    const pulse = vizThumbnailPlaceholder(item({ name: "Pulse Grid", renderer: "glsl" }));
    expect(prism).not.toBe(pulse);
  });

  it("tints by renderer kind (p5 ≠ glsl for the same name)", () => {
    const asP5 = vizThumbnailPlaceholder(item({ renderer: "p5" }));
    const asGlsl = vizThumbnailPlaceholder(item({ renderer: "glsl" }));
    expect(asP5).not.toBe(asGlsl);
  });
});
