import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RulerUnitsButton } from "../RulerUnitsButton";
import {
  getRulerUnits,
  setRulerUnits,
  toggleRulerUnits,
  subscribeRulerUnits,
} from "../../state/rulerUnits";

beforeEach(() => setRulerUnits("cycles"));
afterEach(() => {
  cleanup();
  setRulerUnits("cycles");
});

describe("rulerUnits store", () => {
  it("toggles and notifies subscribers", () => {
    const cb = vi.fn();
    const unsub = subscribeRulerUnits(cb);
    expect(getRulerUnits()).toBe("cycles");
    toggleRulerUnits();
    expect(getRulerUnits()).toBe("bars");
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    toggleRulerUnits();
    expect(cb).toHaveBeenCalledTimes(1); // unsubscribed
  });

  it("no-ops (no notify) when set to the current value", () => {
    const cb = vi.fn();
    subscribeRulerUnits(cb);
    setRulerUnits("cycles"); // already cycles
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("RulerUnitsButton", () => {
  it("shows the current units and flips the shared store on click", () => {
    render(<RulerUnitsButton />);
    const btn = screen.getByTestId("strudel-chrome-units-toggle");
    expect(btn.textContent).toBe("CYCLES");
    fireEvent.click(btn);
    expect(getRulerUnits()).toBe("bars");
    expect(btn.textContent).toBe("BARS");
  });

  it("two instances stay in sync via the shared store", () => {
    render(
      <>
        <RulerUnitsButton />
        <RulerUnitsButton />
      </>,
    );
    const btns = screen.getAllByTestId("strudel-chrome-units-toggle");
    fireEvent.click(btns[0]);
    expect(btns[0].textContent).toBe("BARS");
    expect(btns[1].textContent).toBe("BARS"); // second reflects the shared change
  });
});
