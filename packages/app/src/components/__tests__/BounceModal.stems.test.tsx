/**
 * #1648 — the Mix / Stems choice. Stems render offline only, so the choice is
 * shown only on that path, and Start says which one was picked.
 *
 * ⚠ Plain DOM assertions on purpose — this package does not install jest-dom.
 */

import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { BounceModal } from "../BounceModal";
import type { BounceSizing } from "../songLength";

afterEach(cleanup);

const noop = () => {};

function renderModal(props: {
  offline: boolean;
  stemTracks: number;
  sizing?: BounceSizing | null;
  onStart?: (s: number, stems: boolean) => void;
}) {
  return render(
    <BounceModal
      open
      state={{ phase: "choosing" }}
      sizing={props.sizing ?? null}
      offline={props.offline}
      stemTracks={props.stemTracks}
      onClose={noop}
      onStart={props.onStart ?? noop}
      onStop={noop}
    />,
  );
}

const button = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === name);

/**
 * A song-offer card, matched on its head.
 *
 * ⚠ NOT `button()`. An offer card prints its label AND its duration, so its
 * textContent is "Whole song40:00" and an exact match finds nothing — which
 * makes the presence assertion fail and, worse, makes the ABSENCE assertion
 * pass without the feature existing at all.
 */
const offer = (label: string) =>
  [...document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").trim().startsWith(label),
  );

describe("BounceModal — Mix / Stems (#1648)", () => {
  it("offers the choice on the offline path, and Start passes Stems through", () => {
    const onStart = vi.fn();
    renderModal({ offline: true, stemTracks: 4, onStart });
    expect(document.querySelector('[data-testid="bounce-export-kind"]')).not.toBeNull();
    fireEvent.click(button("16s")!);
    fireEvent.click(button("Stems")!);
    expect(document.body.textContent).toMatch(/one WAV per track in a zip/);
    fireEvent.click(button("Start Bounce")!);
    expect(onStart).toHaveBeenCalledWith(16, true);
  });

  it("defaults to Mix", () => {
    const onStart = vi.fn();
    renderModal({ offline: true, stemTracks: 4, onStart });
    fireEvent.click(button("Start Bounce")!);
    expect(onStart).toHaveBeenCalledWith(8, false);
  });

  it("hides the choice on the live path, even when the runtime could split", () => {
    renderModal({ offline: false, stemTracks: 4 });
    expect(document.querySelector('[data-testid="bounce-export-kind"]')).toBeNull();
  });

  it("hides the choice when the file cannot export stems", () => {
    renderModal({ offline: true, stemTracks: 0 });
    expect(document.querySelector('[data-testid="bounce-export-kind"]')).toBeNull();
  });

  it("the stems progress bar fills against every stem's length, not one", () => {
    render(
      <BounceModal
        open
        state={{ phase: "rendering", seconds: 8, rendered: 12, stems: { total: 24 } }}
        sizing={null}
        offline
        stemTracks={4}
        onClose={noop}
        onStart={noop}
        onStop={noop}
      />,
    );
    const bar = document.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuemax")).toBe("24");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("50%");
    expect(document.body.textContent).toMatch(/Rendering stems — 0:08 each/);
  });
});

/**
 * #1666 — a stems export renders the song once per TRACK and holds every result
 * until the zip is built, so its cost is seconds x tracks and its ceiling has
 * to fall as tracks rise. Measured: six tracks of an hour held 4.1 GB and the
 * export failed in the archive step, after paying for every render.
 *
 * The dialog is where this has to be true, because it is the only place the
 * length is chosen — a refusal further down would arrive after the renders.
 */
describe("BounceModal — a stems export is offered less than the mix (#1666)", () => {
  /** An arranged song of `seconds`, which the dialog offers whole. */
  const song = (seconds: number): BounceSizing => ({
    length: { kind: "arranged", cycles: seconds / 2 },
    cps: 0.5,
  });

  it("offers a forty-minute song whole as a mix, and refuses it as six stems", () => {
    renderModal({ offline: true, stemTracks: 6, sizing: song(2400) });
    expect(offer("Whole song")).toBeDefined();

    fireEvent.click(button("Stems")!);
    expect(offer("Whole song")).toBeUndefined();
    // Names the track count, because that is the half the user can change.
    expect(document.body.textContent).toMatch(
      /runs 40:00, longer than a 6-track stems export can hold at once/i,
    );
  });

  it("keeps offering it when the song has few enough tracks", () => {
    renderModal({ offline: true, stemTracks: 1, sizing: song(2400) });
    fireEvent.click(button("Stems")!);
    expect(offer("Whole song")).toBeDefined();
  });

  it("drops fixed lengths past the ceiling once Stems is chosen", () => {
    // 12 tracks -> 300s each. 300s stays, and it is the last one that does.
    renderModal({ offline: true, stemTracks: 12 });
    expect(button("300s")).toBeDefined();
    fireEvent.click(button("Stems")!);
    expect(button("300s")).toBeDefined();

    cleanup();
    // 24 tracks -> 150s, so 300s and 120s part company.
    renderModal({ offline: true, stemTracks: 24 });
    fireEvent.click(button("Stems")!);
    expect(button("120s")).toBeDefined();
    expect(button("300s")).toBeUndefined();
  });

  it("moves a selection the ceiling has overtaken, rather than starting a bounce it no longer offers", () => {
    const onStart = vi.fn();
    // Picked as a mix, where 300s is on offer...
    renderModal({ offline: true, stemTracks: 24, onStart });
    fireEvent.click(button("300s")!);
    // ...then switched to stems, where it is not.
    fireEvent.click(button("Stems")!);
    fireEvent.click(button("Start Bounce")!);
    expect(onStart).toHaveBeenCalledWith(120, true);
  });
});
