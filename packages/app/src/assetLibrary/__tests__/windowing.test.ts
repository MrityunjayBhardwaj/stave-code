import { describe, it, expect } from "vitest";
import { computeWindow } from "../windowing";

const RH = 40;
const OV = 6;

describe("computeWindow", () => {
  it("empty list → zero range", () => {
    expect(computeWindow(0, 0, 400, RH, OV)).toEqual({ first: 0, last: 0 });
  });

  it("top of a tall list renders viewport + overscan from 0", () => {
    // viewport 400 → ceil(400/40)=10 + 12 overscan = 22 rows
    const { first, last } = computeWindow(1000, 0, 400, RH, OV);
    expect(first).toBe(0);
    expect(last).toBe(22);
  });

  it("scrolled down renders the surrounding slice", () => {
    // scrollTop 40000 → row 1000; first = 1000-6 = 994
    const { first, last } = computeWindow(2000, 40000, 400, RH, OV);
    expect(first).toBe(994);
    expect(last).toBe(994 + 22);
  });

  it("F2: stale large scrollTop after the list shrinks never yields an empty slice", () => {
    // Was scrolled to row ~1000, then a filter left only 2 matches.
    const { first, last } = computeWindow(2, 40000, 400, RH, OV);
    expect(first).toBe(0);
    expect(last).toBe(2);
    expect(last).toBeGreaterThan(first); // non-empty — the bug was slice(994,2)=[]
  });

  it("clamps first so the last page is fully shown, not scrolled past", () => {
    // total 30, viewport 400 (22 visible). maxFirst = 30-22 = 8.
    const { first, last } = computeWindow(30, 99999, 400, RH, OV);
    expect(first).toBe(8);
    expect(last).toBe(30);
  });

  it("viewportH 0 (not yet measured) still yields a non-empty slice", () => {
    const { first, last } = computeWindow(100, 0, 0, RH, OV);
    expect(first).toBe(0);
    expect(last).toBe(12); // ceil(0/40)=0 + 12 overscan
    expect(last).toBeGreaterThan(first);
  });
});
