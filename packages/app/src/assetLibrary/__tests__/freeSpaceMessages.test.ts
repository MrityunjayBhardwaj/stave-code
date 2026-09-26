import { describe, expect, it } from "vitest";

import { formatBytes, removedMessage } from "../freeSpaceMessages";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [999, "999 B"],
    [1_000, "1.0 KB"],
    [1_536, "1.5 KB"],
    [705_644, "706 KB"],
    [1_500_000, "1.5 MB"],
    [12_300_000, "12 MB"],
    [2_000_000_000, "2.0 GB"],
  ])("%d → %s", (n, text) => {
    expect(formatBytes(n)).toBe(text);
  });
});

describe("what a removal says, per collector outcome", () => {
  it("freed names the bytes", () => {
    expect(removedMessage("kick", { kind: "freed", bytes: 1_500_000, count: 1 })).toBe(
      'Removed "kick" and freed 1.5 MB.',
    );
  });

  it("nothing unused says no space was freed, and why", () => {
    expect(removedMessage("kick", { kind: "nothing-unused" })).toMatch(/still used .* no space was freed/);
  });

  it("could not check never reads as freed or as nothing to free", () => {
    const text = removedMessage("kick", { kind: "could-not-check", reason: "other-tab" });
    expect({ freed: /freed \d/.test(text), wasnt: /wasn't freed: another Stave tab is open/.test(text) }).toEqual({
      freed: false,
      wasnt: true,
    });
  });

  it("every could-not-check reason has its own sentence", () => {
    const reasons = ["other-tab", "unreadable-project", "no-locks", "no-database-list"] as const;
    const texts = reasons.map((reason) => removedMessage("k", { kind: "could-not-check", reason }));
    expect(new Set(texts).size).toBe(reasons.length);
  });

  it("refused (#1792) names the one removal that still works, and never says freed", () => {
    const text = removedMessage("kick", { kind: "refused", bytes: 0, count: 0 });
    expect({ freed: /and freed/.test(text), way: /Delete a project you don't need/.test(text) }).toEqual({
      freed: false,
      way: true,
    });
  });
});
