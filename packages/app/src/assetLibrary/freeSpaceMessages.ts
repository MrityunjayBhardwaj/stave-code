import type { CollectResult, CouldNotCheckReason } from "@stave/editor";

/**
 * What to tell the user after sound bytes were (or were not) freed (#1786,
 * reused by the storage notice in #1787).
 *
 * The collector has three outcomes and each needs a different next step from
 * the user, so they never share a sentence: "freed" is done; "nothing unused"
 * means the audio is still used somewhere, so removing more is the way to make
 * room; "could not check" means nothing was looked at, and the reason says
 * what to change. "Could not check" must never read as "nothing to free".
 */

/** `1536` → `1.5 KB`. Decimal units, as browsers and OS file sizes use. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1000) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1000;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}

const WHY_NOT: Record<CouldNotCheckReason, string> = {
  "other-tab": "another Stave tab is open. Close it and try again",
  "unreadable-project": "one of your projects couldn't be read",
  "no-locks": "this browser can't check what your other projects use",
  "no-database-list": "this browser can't list your other projects",
};

/**
 * The browser would not delete (#1792): Firefox refuses every write, deletes
 * included, once storage is completely full. Deleting a whole project is the
 * one removal it still allows, so that is the way out this names.
 */
export const REFUSED =
  "the browser won't delete anything while storage is completely full. " +
  "Delete a project you don't need (File ▸ Open Project), then try again.";

/** The sentence after a sound was removed and a collection ran. */
export function removedMessage(name: string, result: CollectResult): string {
  switch (result.kind) {
    case "freed":
      return `Removed "${name}" and freed ${formatBytes(result.bytes)}.`;
    case "nothing-unused":
      return `Removed "${name}". Its audio is still used by another sound or project, so no space was freed.`;
    case "could-not-check":
      return `Removed "${name}", but its space wasn't freed: ${WHY_NOT[result.reason]}.`;
    case "refused":
      return `Removed "${name}", but ${REFUSED}`;
  }
}

/**
 * What the storage notice says after "Free space" (#1787). `freed` is not a
 * sentence here: the notice keeps trying to save, and says so itself.
 */
export function freeSpaceMessage(result: Exclude<CollectResult, { kind: "freed" }>): string {
  switch (result.kind) {
    case "nothing-unused":
      return "No unused sounds to free. Remove sounds you don't need in the Library to make room.";
    case "could-not-check":
      return `Couldn't free space: ${WHY_NOT[result.reason]}.`;
    case "refused":
      return `Couldn't free space: ${REFUSED}`;
  }
}

/**
 * Freed, but the browser has not let a save through yet. Chromium removes a
 * deleted blob's file lazily (measured 4–30 s, 2026-09-26), and the room does
 * not count as free until it has.
 */
export function freedNotYetSavedMessage(bytes: number): string {
  return `Freed ${formatBytes(bytes)}, but the browser hasn't released the room yet. Try again in a minute.`;
}

/** The sentence when the collection itself failed. */
export function removedButFailedMessage(name: string): string {
  return `Removed "${name}", but freeing its space failed. See the console for details.`;
}
