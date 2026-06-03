/**
 * signalAliasRows — build/validate the editable alias rows into a persisted
 * SignalAliasMap (Phase 21 T3). Pure-logic unit tests for the keystroke→map
 * transform that the EditorSettingsModal "Signal Aliases" section persists.
 */
import { describe, it, expect } from "vitest";
import {
  buildAliasMap,
  rowsFromAliasMap,
  splitSounds,
  BUILTIN_ALIAS_NAMES,
} from "../signalAliasRows";

describe("buildAliasMap", () => {
  it("multi-sound CSV row → string[]", () => {
    const { map, errors } = buildAliasMap([{ name: "kick", sounds: "bd, kick9" }]);
    expect(map).toEqual({ kick: ["bd", "kick9"] });
    expect(errors).toEqual([null]);
  });

  it("single-sound row → string (not array)", () => {
    const { map, errors } = buildAliasMap([{ name: "lead", sounds: "sawtooth" }]);
    expect(map).toEqual({ lead: "sawtooth" });
    expect(errors).toEqual([null]);
  });

  it("trims members and drops empties from the CSV", () => {
    const { map } = buildAliasMap([{ name: "kick", sounds: " bd ,, kick9 , " }]);
    expect(map).toEqual({ kick: ["bd", "kick9"] });
  });

  it("ignores a fully-blank row without error or persistence", () => {
    const { map, errors } = buildAliasMap([{ name: "", sounds: "" }]);
    expect(map).toEqual({});
    expect(errors).toEqual([null]);
  });

  it("excludes an invalid name and flags a 'name' error", () => {
    const { map, errors } = buildAliasMap([{ name: "1bad name", sounds: "bd" }]);
    expect(map).toEqual({});
    expect(errors).toEqual(["name"]);
  });

  it.each(["uKick", "uTom", "uRms", "uKeyVelocity", "uTreble"])(
    "rejects built-in collision %s",
    (builtin) => {
      const { map, errors } = buildAliasMap([{ name: builtin, sounds: "bd" }]);
      expect(map).toEqual({});
      expect(errors).toEqual(["name"]);
    },
  );

  it("flags a 'sounds' error when a named row has no sounds", () => {
    const { map, errors } = buildAliasMap([{ name: "kick", sounds: "  " }]);
    expect(map).toEqual({});
    expect(errors).toEqual(["sounds"]);
  });

  it("persists only the valid rows in a mixed list", () => {
    const { map, errors } = buildAliasMap([
      { name: "kick", sounds: "bd, kick9" }, // valid array
      { name: "uKick", sounds: "bd" }, // built-in collision
      { name: "", sounds: "" }, // blank, ignored
      { name: "lead", sounds: "sawtooth" }, // valid single
    ]);
    expect(map).toEqual({ kick: ["bd", "kick9"], lead: "sawtooth" });
    // index 0 valid, 1 built-in collision, 2 blank (ignored), 3 valid.
    expect(errors).toEqual([null, "name", null, null]);
  });

  it("last valid row wins on a duplicate name", () => {
    const { map } = buildAliasMap([
      { name: "kick", sounds: "bd" },
      { name: "kick", sounds: "kick9, bd" },
    ]);
    expect(map).toEqual({ kick: ["kick9", "bd"] });
  });

  it("accepts $ / _ leading names", () => {
    const { map } = buildAliasMap([
      { name: "$fx", sounds: "rim" },
      { name: "_lo", sounds: "lt, mt" },
    ]);
    expect(map).toEqual({ $fx: "rim", _lo: ["lt", "mt"] });
  });
});

describe("rowsFromAliasMap", () => {
  it("round-trips a persisted map back to editable CSV rows", () => {
    const rows = rowsFromAliasMap({ kick: ["bd", "kick9"], lead: "sawtooth" });
    expect(rows).toEqual([
      { name: "kick", sounds: "bd, kick9" },
      { name: "lead", sounds: "sawtooth" },
    ]);
  });

  it("seeded rows rebuild to the original map", () => {
    const original = { kick: ["bd", "kick9"], lead: "sawtooth" };
    const { map } = buildAliasMap(rowsFromAliasMap(original));
    expect(map).toEqual(original);
  });
});

describe("splitSounds / built-ins", () => {
  it("splits, trims, and drops empty members", () => {
    expect(splitSounds(" bd , , kick9 ,")).toEqual(["bd", "kick9"]);
  });

  it("covers every built-in alias the renderer injects", () => {
    expect(BUILTIN_ALIAS_NAMES.has("uKick")).toBe(true);
    expect(BUILTIN_ALIAS_NAMES.has("uKeyVelocity")).toBe(true);
    expect(BUILTIN_ALIAS_NAMES.size).toBe(12);
  });
});
