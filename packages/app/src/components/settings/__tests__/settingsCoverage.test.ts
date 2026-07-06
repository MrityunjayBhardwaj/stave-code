import { describe, it, expect, vi } from "vitest";

// Mock the editor barrel (established pattern — see IRInspectorPanel.test):
// importing the real SettingsPanel would pull @stave/editor's runtime, which
// transitively loads the CJS `gifenc` module and fails ESM interop under
// vitest. The adapter functions are never CALLED here — we only read the
// module-level ADAPTER_KEYS — so no-op stubs suffice.
vi.mock("@stave/editor", () => {
  // Explicit stub map — every editor getter/setter SettingsPanel imports.
  // (A Proxy fallback is unsafe here: returning a fn for `then` makes the
  // module namespace look like an unresolvable thenable and vitest hangs.)
  const names = [
    "getEditorFontSize", "setEditorFontSize", "getEditorMinimap", "toggleEditorMinimap",
    "getEditorUiIconSize", "setEditorUiIconSize", "getInlineVizActionSize", "setInlineVizActionSize",
    "getInlineVizResolution", "setInlineVizResolution", "getVizQuality", "setVizQuality",
    "getInlineVizTeardownEnabled", "setInlineVizTeardownEnabled", "getVizInputsLiveValuesEnabled",
    "setVizInputsLiveValuesEnabled", "getMusicalTimelineSubRowHeight", "setMusicalTimelineSubRowHeight",
    "getEditorTheme", "setEditorTheme", "getNoteColorMode", "setNoteColorMode", "getTierFlags",
    "setTierFlag", "listTiers", "getSignalAliases", "setSignalAliases", "getPerfEnabled",
    "setPerfEnabled", "getAdaptivePerfEnabled", "setAdaptivePerfEnabled", "getTrackColourBarsEnabled",
    "setTrackColourBarsEnabled",
  ];
  const mod: Record<string, unknown> = {};
  for (const n of names) mod[n] = () => undefined;
  return mod;
});

import { SETTING_FIELD_KEYS, SECTION_DEFS } from "../settingsSections";
import { ADAPTER_KEYS } from "../SettingsPanel";

/**
 * A3 coverage guard (#742). The Settings surface is data-driven: SECTION_DEFS
 * declares the UI rows, and SettingsPanel's ADAPTERS wire each to an
 * editorRegistry getter/setter. This test asserts the two sides cover each
 * other EXACTLY ONCE — the same schema-vs-UI honesty the tier UI enforces via
 * `assertTierSchemaCoverage`.
 *
 * Fail-without: drop a field from SECTION_DEFS (or an adapter) and the sets
 * diverge → this fails. That's the point: a regroup can't silently drop or
 * double-render a setting.
 */
describe("settings coverage", () => {
  it("has no duplicate field keys in SECTION_DEFS", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const key of SETTING_FIELD_KEYS) {
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });

  it("every declared field has exactly one adapter, and vice-versa", () => {
    const fields = new Set(SETTING_FIELD_KEYS);
    const adapters = new Set(ADAPTER_KEYS);

    const missingAdapter = [...fields].filter((k) => !adapters.has(k));
    const orphanAdapter = [...adapters].filter((k) => !fields.has(k));

    expect(missingAdapter, "fields with no adapter wiring").toEqual([]);
    expect(orphanAdapter, "adapters with no UI row").toEqual([]);
    expect(fields.size).toBe(adapters.size);
  });

  it("every simple field belongs to a section that declares fields (not custom)", () => {
    for (const sec of SECTION_DEFS) {
      if (sec.custom) {
        expect(sec.fields, `custom section ${sec.id} must not declare simple fields`).toBeUndefined();
      } else {
        expect(sec.fields, `section ${sec.id} must declare fields`).toBeDefined();
        expect(sec.fields!.length).toBeGreaterThan(0);
      }
    }
  });
});
