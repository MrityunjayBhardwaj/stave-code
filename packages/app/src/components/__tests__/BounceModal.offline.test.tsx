/**
 * The Bounce modal on the OFFLINE path (#1631).
 *
 * A bounce now renders the document offline whenever the file's engine can,
 * which is faster than the song plays and reports no progress. The modal had
 * only ever described the live capture: "it takes as long as it plays", a
 * progress bar driven by a wall clock, and a Stop that keeps a shorter take.
 * None of that is true of a render, and a modal that says it would be telling
 * the user to wait for something that is not happening.
 *
 * Pinned both ways, because each copy is a branch: the live path must keep
 * saying what it costs, and the offline path must stop saying it.
 *
 * ⚠ Plain `textContent` assertions, like the progress test beside this one —
 * this package does not install jest-dom.
 */

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { BounceModal, type BounceState } from "../BounceModal";

afterEach(cleanup);

const noop = () => {};

function renderAt(state: BounceState, offline: boolean) {
  return render(
    <BounceModal
      open
      state={state}
      // 40 cycles at 0.55 cps: 72.7s, so the length reads "1:13".
      sizing={{ length: { kind: "arranged", cycles: 40 }, cps: 0.55 }}
      offline={offline}
      onClose={noop}
      onStart={noop}
      onStop={noop}
    />,
  );
}

const body = () => document.body.textContent ?? "";
const buttonLabels = () => [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());

describe("bounce modal copy, offline vs live (#1631)", () => {
  it("an offline bounce is described as faster than real time", () => {
    renderAt({ phase: "choosing" }, true);
    expect(body()).toContain("faster than real time");
    expect(body()).not.toContain("takes as long as it plays");
  });

  it("a live bounce still says it takes as long as it plays", () => {
    renderAt({ phase: "choosing" }, false);
    expect(body()).toContain("takes as long as it plays");
    expect(body()).not.toContain("faster than real time");
  });
});

describe("the rendering phase (#1631)", () => {
  it("names how much audio is rendering, formatted", () => {
    renderAt({ phase: "rendering", seconds: 40 / 0.55 }, true);
    expect(body()).toContain("Rendering 1:13 of audio");
    expect(body()).not.toContain("72.72727272727272");
  });

  it("shows no progress bar, because a render reports no progress", () => {
    renderAt({ phase: "rendering", seconds: 30 }, true);
    expect(document.querySelector('[role="progressbar"]')).toBeNull();
  });

  it("offers Cancel, not Stop — a render keeps nothing from a cancel", () => {
    renderAt({ phase: "rendering", seconds: 30 }, true);
    expect(buttonLabels()).toContain("Cancel");
    expect(buttonLabels()).not.toContain("Stop");
  });

  it("#1649 — once cancelled it says so, and the button cannot be pressed again", () => {
    renderAt({ phase: "rendering", seconds: 30, cancelling: true }, true);
    expect(body()).toContain("Cancelling…");
    expect(body()).not.toContain("Rendering");
    const cancel = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Cancel");
    expect(cancel?.disabled).toBe(true);
  });

  it("#1649 CONTROL — before Cancel is pressed the button is live", () => {
    renderAt({ phase: "rendering", seconds: 30 }, true);
    expect(body()).not.toContain("Cancelling");
    const cancel = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Cancel");
    expect(cancel?.disabled).toBe(false);
  });

  it("CONTROL — a live take still offers Stop beside its progress bar", () => {
    renderAt({ phase: "recording", seconds: 30, elapsed: 3 }, false);
    expect(document.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(buttonLabels()).toContain("Stop");
  });
});
