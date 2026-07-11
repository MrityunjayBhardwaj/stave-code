import { describe, it, expect } from "vitest";
import { healthClass, healthBars } from "../transportLcdHealth";

// The health meter's whole point (#859): a high fps must NOT read green when a
// real main-thread stall or a slow viz cadence is present. These lock the
// layered classification so the "blindly green" regression can't come back.
describe("healthClass", () => {
  it("is good only when fps is high AND nothing is stalling", () => {
    expect(healthClass(60, false, 0)).toBe("good");
    expect(healthClass(120, false, 0)).toBe("good");
    expect(healthClass(55, false, 0)).toBe("good");
  });

  it("warns on a middling fps", () => {
    expect(healthClass(54, false, 0)).toBe("warn");
    expect(healthClass(31, false, 0)).toBe("warn");
  });

  it("crits below 30fps", () => {
    expect(healthClass(29, false, 0)).toBe("crit");
    expect(healthClass(1, false, 0)).toBe("crit");
  });

  it("a recent main-thread stall pulls it down even at high fps (the fix)", () => {
    expect(healthClass(120, false, 1)).toBe("warn"); // any stall → not green
    expect(healthClass(120, false, 60)).toBe("warn");
    expect(healthClass(120, false, 120)).toBe("crit"); // a big block → crit
    expect(healthClass(120, false, 300)).toBe("crit");
  });

  it("a uniformly-slow viz (profiler slowFrames) crits regardless of fps", () => {
    expect(healthClass(60, true, 0)).toBe("crit");
  });
});

describe("healthBars", () => {
  it("crit lights one bar, warn three, good scales with fps", () => {
    expect(healthBars("crit", 120)).toBe(1);
    expect(healthBars("warn", 120)).toBe(3);
    expect(healthBars("good", 60)).toBe(5);
    expect(healthBars("good", 30)).toBe(3); // 30/60*5 = 2.5 → 3
    expect(healthBars("good", 12)).toBe(1);
  });
});
