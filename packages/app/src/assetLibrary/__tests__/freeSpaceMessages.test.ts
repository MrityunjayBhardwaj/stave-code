import { describe, expect, it } from "vitest";

import { formatBytes, freeSpaceMessage, freedNotYetSavedMessage, removedMessage } from "../freeSpaceMessages";

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

describe("what Free space on the storage notice says (#1787)", () => {
  it("each outcome has its own sentence: could-not-check and refused never read as nothing to free", () => {
    const texts = [
      freeSpaceMessage({ kind: "nothing-unused" }),
      freeSpaceMessage({ kind: "refused", bytes: 0, count: 0 }),
      freeSpaceMessage({ kind: "could-not-check", reason: "other-tab" }),
    ];
    expect({
      distinct: new Set(texts).size,
      onlyFirstSaysNoUnused: texts.map((t) => /No unused sounds/.test(t)),
    }).toEqual({ distinct: 3, onlyFirstSaysNoUnused: [true, false, false] });
  });

  it("freed but not yet released names the bytes and what to do", () => {
    expect(freedNotYetSavedMessage(1_500_000)).toBe(
      "Freed 1.5 MB, but the browser hasn't released the room yet. Try again in a minute.",
    );
  });
});

