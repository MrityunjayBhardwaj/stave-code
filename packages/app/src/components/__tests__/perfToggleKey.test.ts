/**
 * Alt+P must survive macOS Option-key composition (#1423).
 *
 * The bug: `e.key` is the character PRODUCED, not the key pressed. On macOS,
 * Option composes — Option+p is `π` — so `e.key === "p"` matched nothing on the
 * platform the shortcut was written for and the overlay could not be opened.
 *
 * ⚠ These arms exist because no browser test can produce this input. Playwright's
 * synthetic keyboard sets `key` from the requested key and does NOT compose, so
 * `page.keyboard.press('Alt+p')` sends `key: "p"`, the overlay toggles, and the
 * arm passes while telling you nothing about a Mac. The composed values below
 * are the input the platform actually delivers, and asserting on them directly
 * is the only instrument that can see this bug.
 */
import { describe, it, expect } from "vitest";
import { isPerfOverlayToggle } from "../perfToggleKey";

const ev = (init: Partial<KeyboardEvent>): KeyboardEvent =>
  ({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, key: "", code: "", ...init }) as KeyboardEvent;

describe("isPerfOverlayToggle — macOS composition (#1423)", () => {
  it("matches macOS Option+p, which arrives as π and never as p", () => {
    expect(isPerfOverlayToggle(ev({ altKey: true, key: "π", code: "KeyP" }))).toBe(true);
  });

  it("matches macOS Option+Shift+P, which arrives as ∏", () => {
    expect(
      isPerfOverlayToggle(ev({ altKey: true, shiftKey: true, key: "∏", code: "KeyP" })),
    ).toBe(true);
  });

  it("still matches the uncomposed p that Windows and Linux send", () => {
    // The CONTROL for the two above: if this ever fails, the predicate is
    // broken outright and their passing would mean nothing.
    expect(isPerfOverlayToggle(ev({ altKey: true, key: "p", code: "KeyP" }))).toBe(true);
    expect(isPerfOverlayToggle(ev({ altKey: true, key: "P", code: "KeyP" }))).toBe(true);
  });
});

describe("isPerfOverlayToggle — what it must NOT claim", () => {
  it("ignores a bare p with no Alt", () => {
    expect(isPerfOverlayToggle(ev({ key: "p", code: "KeyP" }))).toBe(false);
  });

  it("ignores any chord carrying Cmd or Ctrl", () => {
    // ⚠ This is the #1421 lesson as a guard rather than a comment. `mod+p` and
    // `mod+shift+p` are REGISTERED commands (quick open, command palette); a raw
    // handler that also answered to them would be exactly the cross-surface
    // collision that let ⌘⇧D duplicate a clip behind the docs palette.
    expect(isPerfOverlayToggle(ev({ altKey: true, metaKey: true, key: "p", code: "KeyP" }))).toBe(false);
    expect(isPerfOverlayToggle(ev({ altKey: true, ctrlKey: true, key: "p", code: "KeyP" }))).toBe(false);
    expect(isPerfOverlayToggle(ev({ metaKey: true, key: "p", code: "KeyP" }))).toBe(false);
  });

  it("ignores Alt with a different key, by code and by character", () => {
    expect(isPerfOverlayToggle(ev({ altKey: true, key: "q", code: "KeyQ" }))).toBe(false);
    // macOS Option+q is `œ` — a composed character that is not ours. This is
    // the arm that would catch a fix written as "accept any composed char".
    expect(isPerfOverlayToggle(ev({ altKey: true, key: "œ", code: "KeyQ" }))).toBe(false);
  });
});
