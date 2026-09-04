/**
 * The bounce progress readout's NUMBERS (#1429).
 *
 * A song's length is `cycles / cps`, and that is usually a repeating decimal:
 * a 40-cycle song at `setcps(0.55)` is 72.72727272727272 seconds. The chooser
 * card and the explanatory copy both run that through `formatDuration` and say
 * "1:13"; the recording line interpolated the raw `state.seconds` and put
 * fifteen digits on screen — during the one phase where the user is sitting and
 * watching the number, for as long as the song lasts.
 *
 * Found by bouncing a real song end-to-end, not by reading the file. Nothing
 * asserted this text, which is exactly why it shipped.
 *
 * What is pinned here is that BOTH sides of the readout are formatted, and that
 * the recording line agrees with the chooser about the same song. The float is
 * pinned by its own arm rather than only by the formatted expectation, so a
 * regression names itself instead of arriving as a generic text mismatch.
 *
 * ⚠ Plain `textContent` assertions on purpose — this package does not install
 * jest-dom, and a lone file reaching for `toHaveTextContent` would be the only
 * one that needed it.
 */

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { BounceModal, type BounceState } from "../BounceModal";

afterEach(cleanup);

/** 40 cycles at 0.55 cps — the song the end-to-end pass actually bounced. */
const CYCLES = 40;
const CPS = 0.55;
const REPEATING = CYCLES / CPS; // 72.72727272727272

const noop = () => {};

function renderAt(state: BounceState, cycles = CYCLES, cps = CPS) {
  return render(
    <BounceModal
      open
      state={state}
      sizing={{ length: { kind: "arranged", cycles }, cps }}
      onClose={noop}
      onStart={noop}
      onStop={noop}
    />,
  );
}

/** The recording line, as text. */
function progressLine(): string {
  const el = [...document.querySelectorAll("div")].find((d) =>
    /^Recording —/.test((d.textContent ?? "").trim()),
  );
  if (!el) throw new Error("no recording line rendered");
  return (el.textContent ?? "").trim();
}

describe("bounce progress readout (#1429)", () => {
  it("formats the total instead of printing the raw float", () => {
    renderAt({ phase: "recording", elapsed: 2, seconds: REPEATING });

    // Named directly, so a regression reports the defect rather than just a
    // text mismatch.
    expect(document.body.textContent).not.toContain("72.72727272727272");
    expect(progressLine()).toContain("1:13");
  });

  it("formats the elapsed side too, so both halves read in one unit", () => {
    renderAt({ phase: "recording", elapsed: 2, seconds: REPEATING });
    // `0:02 of 1:13`, not `2s of 1:13`.
    expect(progressLine()).toContain("0:02");
  });

  it("still reads sensibly for a whole-second length", () => {
    renderAt({ phase: "recording", elapsed: 9, seconds: 30 }, 30, 1);
    const line = progressLine();
    expect(line).toContain("0:09");
    expect(line).toContain("0:30");
  });

  it("crosses the minute boundary on both sides", () => {
    renderAt({ phase: "recording", elapsed: 65, seconds: 125 }, 125, 1);
    const line = progressLine();
    expect(line).toContain("1:05");
    expect(line).toContain("2:05");
  });

  /**
   * The SECOND site, and the reason it survived the first pass (#1429).
   *
   * `:187` reads `selected < 60 ? \`${selected} seconds\` : formatDuration(...)`.
   * The song this was found with runs 72.7s, so it took the `formatDuration`
   * branch and looked correct — the raw float only shows for a song UNDER a
   * minute. A fix verified against one song length is verified against one
   * branch. 40 cycles at cps 3 is 13.333333333333334s and takes the other.
   */
  it("does not print a raw float in the explanatory copy, under a minute", () => {
    renderAt({ phase: "choosing" }, 40, 3); // 13.333333333333334s

    const body = document.body.textContent ?? "";
    expect(body).not.toContain("13.333333333333334");
    expect(body).toContain("13 seconds");
  });

  it("keeps whole-number fixed picks reading naturally", () => {
    // The `< 60` branch says "8 seconds" rather than "0:08" on purpose; rounding
    // must not disturb the picks, which are integers already.
    renderAt({ phase: "choosing" }, 40, 5); // 8s exactly
    expect(document.body.textContent).toContain("8 seconds");
  });

  it("agrees with the chooser about the same song", () => {
    // The chooser is where "1:13" was already correct. Pinning both against one
    // `sizing` is what stops the two halves of the modal drifting apart again.
    const { unmount } = renderAt({ phase: "choosing" });
    expect(document.body.textContent).toContain("1:13");
    expect(document.body.textContent).not.toContain("72.72727272727272");
    unmount();

    renderAt({ phase: "recording", elapsed: 0, seconds: REPEATING });
    expect(progressLine()).toContain("1:13");
  });
});
