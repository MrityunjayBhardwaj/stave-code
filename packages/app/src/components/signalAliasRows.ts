/**
 * signalAliasRows — pure build/validate logic for the EditorSettingsModal
 * "Signal Aliases" section (Phase 21 T3).
 *
 * The modal edits a dynamic list of `{ name, sounds }` rows where `sounds` is
 * a comma-separated string. This module converts that editable shape into the
 * persisted `SignalAliasMap` (the FIRST array/map-valued setting in the modal)
 * and reports per-row validation errors — extracted as a pure function so the
 * keystroke→map transform is unit-testable without mounting the component
 * (mirrors collectLeafIrNodeIds.ts).
 *
 * Validation rules (RESEARCH-ALIASES §U4):
 *   - name must match a JS-identifier-ish pattern
 *   - name must NOT collide with a built-in alias (uKick … uTom, uKeyVelocity,
 *     uRms, uBass, uMid, uTreble)
 *   - sounds must be non-empty after comma-split + trim
 * Blank rows (no name AND no sounds) are silently ignored — never persisted as
 * `{'': …}`. Only VALID rows enter the persisted map; on duplicate names, last
 * valid row wins.
 */
import type { SignalAliasMap } from "@stave/editor";

export interface AliasRow {
  name: string;
  /** Comma-separated sound list as typed by the user. */
  sounds: string;
}

/** Built-in alias names a custom row must not override (warn, don't clobber). */
export const BUILTIN_ALIAS_NAMES: ReadonlySet<string> = new Set([
  "uKick",
  "uSnare",
  "uHat",
  "uOpenHat",
  "uClap",
  "uRim",
  "uTom",
  "uKeyVelocity",
  "uRms",
  "uBass",
  "uMid",
  "uTreble",
]);

/** A valid signal name: JS-identifier-ish (letter/_/$ start, then word/$). */
export const ALIAS_NAME_RE = /^[A-Za-z_$][\w$]*$/;

export type AliasRowError = "name" | "sounds" | null;

export interface BuildAliasResult {
  /** Only the VALID rows, ready to persist via setSignalAliases. */
  map: SignalAliasMap;
  /** Per-row error keyed by row index (parallel to the input array). */
  errors: AliasRowError[];
}

/** Split a comma-separated sounds string into trimmed, non-empty members. */
export function splitSounds(sounds: string): string[] {
  return sounds
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Build the persisted SignalAliasMap from editable rows, validating each.
 *
 * - Blank rows (empty name AND empty sounds) → ignored, no error.
 * - Invalid name (bad pattern or built-in collision) → error "name", excluded.
 * - Empty sounds (with a name present) → error "sounds", excluded.
 * - Valid → single member ⇒ `string`, multiple ⇒ `string[]`. Last wins on
 *   duplicate names.
 */
export function buildAliasMap(rows: AliasRow[]): BuildAliasResult {
  const map: SignalAliasMap = {};
  const errors: AliasRowError[] = [];

  for (const row of rows) {
    const name = row.name.trim();
    const members = splitSounds(row.sounds);

    // Fully-blank row: ignored, not an error.
    if (name === "" && members.length === 0) {
      errors.push(null);
      continue;
    }

    if (!ALIAS_NAME_RE.test(name) || BUILTIN_ALIAS_NAMES.has(name)) {
      errors.push("name");
      continue;
    }

    if (members.length === 0) {
      errors.push("sounds");
      continue;
    }

    map[name] = members.length === 1 ? members[0] : members;
    errors.push(null);
  }

  return { map, errors };
}

/** Seed editable rows from the persisted map (string|string[] → CSV). */
export function rowsFromAliasMap(persisted: SignalAliasMap): AliasRow[] {
  return Object.entries(persisted).map(([name, value]) => ({
    name,
    sounds: Array.isArray(value) ? value.join(", ") : value,
  }));
}
