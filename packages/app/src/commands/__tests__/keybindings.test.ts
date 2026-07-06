import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { registerCommand } from "../registry";
import {
  setKeybindingOverride,
  getKeybindingFor,
  isKeybindingOverridden,
  resetAllKeybindings,
  hasAnyKeybindingOverride,
  findConflicts,
  conflictsForCommand,
  subscribeKeybindings,
} from "../keybindings";

const STORAGE_KEY = "stave:keybindings";

// This jsdom (opaque about:blank origin) ships no functional localStorage, so
// install a Map-backed stub. The store survives vi.resetModules so the
// "load at module init" fresh-import test can read what we wrote.
const store = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (k) => (store.has(k) ? store.get(k)! : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};
Object.defineProperty(window, "localStorage", { value: localStorageMock, configurable: true, writable: true });

// Register two disposable commands with default bindings for the whole file.
let dispose: Array<() => void> = [];

beforeEach(() => {
  resetAllKeybindings();
  window.localStorage.clear();
  dispose = [
    registerCommand({ id: "test.undo", title: "Undo", category: "Edit", keybinding: "mod+z", run: () => {} }),
    registerCommand({ id: "test.redo", title: "Redo", category: "Edit", keybinding: "mod+shift+z", run: () => {} }),
  ];
});

afterEach(() => {
  dispose.forEach((d) => d());
  resetAllKeybindings();
  window.localStorage.clear();
});

describe("keybinding overrides — persistence", () => {
  it("writes an override through to localStorage", () => {
    setKeybindingOverride("test.undo", "mod+j");
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({ "test.undo": "mod+j" });
  });

  it("getKeybindingFor prefers the override over the declared default", () => {
    setKeybindingOverride("test.undo", "mod+j");
    expect(getKeybindingFor({ id: "test.undo", title: "Undo", keybinding: "mod+z", run: () => {} })).toBe("mod+j");
  });

  it("loads persisted overrides at module init (fresh import)", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ "test.undo": "mod+k" }));
    vi.resetModules();
    const fresh = await import("../keybindings");
    expect(
      fresh.getKeybindingFor({ id: "test.undo", title: "Undo", keybinding: "mod+z", run: () => {} }),
    ).toBe("mod+k");
  });
});

describe("keybinding overrides — reset", () => {
  it("per-binding reset falls back to the declared default", () => {
    setKeybindingOverride("test.undo", "mod+j");
    expect(isKeybindingOverridden("test.undo")).toBe(true);
    setKeybindingOverride("test.undo", null);
    expect(isKeybindingOverridden("test.undo")).toBe(false);
    expect(getKeybindingFor({ id: "test.undo", title: "Undo", keybinding: "mod+z", run: () => {} })).toBe("mod+z");
  });

  it("resetAllKeybindings clears every override", () => {
    setKeybindingOverride("test.undo", "mod+j");
    setKeybindingOverride("test.redo", "mod+y");
    expect(hasAnyKeybindingOverride()).toBe(true);
    resetAllKeybindings();
    expect(hasAnyKeybindingOverride()).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({});
  });
});

describe("findConflicts", () => {
  it("finds a command whose binding matches the chord, excluding self", () => {
    // Rebind redo onto undo's chord.
    setKeybindingOverride("test.redo", "mod+z");
    const hits = findConflicts("mod+z", "test.redo");
    expect(hits.map((c) => c.id)).toContain("test.undo");
    expect(hits.map((c) => c.id)).not.toContain("test.redo");
  });

  it("is modifier-order-insensitive", () => {
    // 'shift+mod+z' should collide with redo's 'mod+shift+z'.
    const hits = findConflicts("shift+mod+z", "test.undo");
    expect(hits.map((c) => c.id)).toContain("test.redo");
  });

  it("returns [] for an empty chord", () => {
    expect(findConflicts("", "test.undo")).toEqual([]);
  });

  it("conflictsForCommand reports the other side of a collision", () => {
    setKeybindingOverride("test.redo", "mod+z");
    expect(conflictsForCommand("test.redo").map((c) => c.id)).toContain("test.undo");
    expect(conflictsForCommand("test.undo").map((c) => c.id)).toContain("test.redo");
  });
});

describe("subscribeKeybindings", () => {
  it("notifies on set and reset", () => {
    const cb = vi.fn();
    const unsub = subscribeKeybindings(cb);
    setKeybindingOverride("test.undo", "mod+j");
    expect(cb).toHaveBeenCalledTimes(1);
    resetAllKeybindings();
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
    setKeybindingOverride("test.undo", "mod+j");
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
