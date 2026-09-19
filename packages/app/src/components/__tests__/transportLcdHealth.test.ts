import { describe, it, expect } from "vitest";
import {
  healthClass,
  healthBars,
  audioHealthReading,
  AUDIO_HEALTH_WINDOW_MS,
  type AudioHealthSample,
} from "../transportLcdHealth";

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

// #1348 — the audio cell reads the last few seconds of the engine's running
// counts: late notes (dropped by superdough) and underruns (audio glitches).
describe("audioHealthReading", () => {
  const W = AUDIO_HEALTH_WINDOW_MS;
  const at = (t: number, lateNotes: number, underruns: number | null = 0): AudioHealthSample => ({ at: t, lateNotes, underruns });

  it("is ok while the counts stand still, however high they are", () => {
    const h: AudioHealthSample[] = [];
    audioHealthReading(h, at(0, 40, 7));
    expect(audioHealthReading(h, at(1000, 40, 7))).toEqual({ cls: "ok", late: 0, glitches: 0 });
  });

  it("reports late notes within the window, then forgets them", () => {
    const h: AudioHealthSample[] = [];
    audioHealthReading(h, at(0, 0));
    expect(audioHealthReading(h, at(500, 3))).toEqual({ cls: "late", late: 3, glitches: 0 });
    audioHealthReading(h, at(W, 3));
    expect(audioHealthReading(h, at(W + 600, 3)).cls).toBe("ok");
  });

  it("a glitch outranks late notes", () => {
    const h: AudioHealthSample[] = [];
    audioHealthReading(h, at(0, 0, 0));
    expect(audioHealthReading(h, at(500, 5, 2))).toEqual({ cls: "glitch", late: 5, glitches: 2 });
  });

  it("where the browser reports no underruns, only late notes count", () => {
    const h: AudioHealthSample[] = [];
    audioHealthReading(h, at(0, 0, null));
    expect(audioHealthReading(h, at(500, 1, null))).toEqual({ cls: "late", late: 1, glitches: 0 });
  });

  it("a count that went down means a new engine: start again, never negative", () => {
    const h: AudioHealthSample[] = [];
    audioHealthReading(h, at(0, 50, 9));
    expect(audioHealthReading(h, at(500, 0, 0))).toEqual({ cls: "ok", late: 0, glitches: 0 });
    expect(audioHealthReading(h, at(900, 2, 0))).toEqual({ cls: "late", late: 2, glitches: 0 });
  });

  it("keeps only one reading older than the window", () => {
    const h: AudioHealthSample[] = [];
    for (let t = 0; t <= 3 * W; t += 250) audioHealthReading(h, at(t, 0));
    expect(h[0].at).toBeLessThanOrEqual(3 * W - W);
    expect(h[1].at).toBeGreaterThan(3 * W - W);
  });
});
