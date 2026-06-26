import { describe, it, expect, beforeEach } from "vitest";
import { showToast, getToasts, dismissToast } from "../host";

beforeEach(() => {
  // Module-level state — drain any toasts left by a previous test.
  for (const t of getToasts()) dismissToast(t.id);
});

describe("showToast — visible cap (#565)", () => {
  it("keeps at most 3 toasts, dropping the oldest", () => {
    showToast("a");
    showToast("b");
    showToast("c");
    showToast("d");
    showToast("e");
    const visible = getToasts();
    expect(visible).toHaveLength(3);
    // newest three retained, oldest (a, b) dropped
    expect(visible.map((t) => t.message)).toEqual(["c", "d", "e"]);
  });

  it("coalesces an identical message instead of consuming a slot", () => {
    showToast("dup");
    showToast("dup");
    showToast("dup");
    const visible = getToasts();
    expect(visible).toHaveLength(1);
    expect(visible[0].count).toBe(3);
  });

  it("a repeat of a still-visible message does not evict others under the cap", () => {
    showToast("x");
    showToast("y");
    showToast("x"); // bumps x's count, stays 2 toasts
    const visible = getToasts();
    expect(visible).toHaveLength(2);
    expect(visible.map((t) => t.message)).toEqual(["x", "y"]);
    expect(visible.find((t) => t.message === "x")?.count).toBe(2);
  });

  it("dismissToast removes a specific toast", () => {
    showToast("one");
    showToast("two");
    const id = getToasts()[0].id;
    dismissToast(id);
    expect(getToasts().map((t) => t.message)).toEqual(["two"]);
  });
});
