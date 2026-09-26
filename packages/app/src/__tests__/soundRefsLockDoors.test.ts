import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #1785 — every door that writes a sound record holds the sound-refs lock.
 *
 * Adding a sound is "store the bytes, then write the record", and between the
 * two the bytes look unused to a collection. The collector takes the same lock
 * for its whole run, so a door without it can lose the bytes it just stored.
 * The door set is DERIVED from the source rather than listed, so a new door
 * added later without the lock fails here instead of in a user's library.
 */

const root = join(__dirname, "..", "..", "..");
const EXEMPT: Record<string, string> = {
  // The e2e probe's `docAdd` writes a record for a spec that stores its own
  // bytes; it never runs in a real build (compiled out in production).
  "app/src/e2e/assetProbe.ts": "e2e instrument",
  // The definition, not a caller.
  "editor/src/workspace/assetDoc.ts": "defines addAssetRecord",
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") sourceFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("every door that writes a sound record holds the lock", () => {
  const files = [
    ...sourceFiles(join(root, "app", "src")),
    ...sourceFiles(join(root, "editor", "src")),
  ].map((f) => ({ path: relative(root, f), text: readFileSync(f, "utf8") }));
  const doors = files.filter((f) => /\baddAssetRecord\(/.test(f.text) && !(f.path in EXEMPT));

  it("finds the doors it knows about (the walk reached them)", () => {
    expect(doors.map((d) => d.path).sort()).toEqual([
      "app/src/audio/saveTake.ts",
      "app/src/importProject.ts",
    ]);
  });

  it("each of them takes the lock", () => {
    expect(doors.filter((d) => !/\bwithSoundRefsLock\(/.test(d.text)).map((d) => d.path)).toEqual([]);
  });
});
