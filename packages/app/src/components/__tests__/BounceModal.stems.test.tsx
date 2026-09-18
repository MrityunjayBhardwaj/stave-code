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

afterEach(cleanup);

const noop = () => {};

function renderModal(props: { offline: boolean; stemsAvailable: boolean; onStart?: (s: number, stems: boolean) => void }) {
  return render(
    <BounceModal
      open
      state={{ phase: "choosing" }}
      sizing={null}
      offline={props.offline}
      stemsAvailable={props.stemsAvailable}
      onClose={noop}
      onStart={props.onStart ?? noop}
      onStop={noop}
    />,
  );
}

const button = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === name);

describe("BounceModal — Mix / Stems (#1648)", () => {
  it("offers the choice on the offline path, and Start passes Stems through", () => {
    const onStart = vi.fn();
    renderModal({ offline: true, stemsAvailable: true, onStart });
    expect(document.querySelector('[data-testid="bounce-export-kind"]')).not.toBeNull();
    fireEvent.click(button("16s")!);
    fireEvent.click(button("Stems")!);
    expect(document.body.textContent).toMatch(/one WAV per track in a zip/);
    fireEvent.click(button("Start Bounce")!);
    expect(onStart).toHaveBeenCalledWith(16, true);
  });

  it("defaults to Mix", () => {
    const onStart = vi.fn();
    renderModal({ offline: true, stemsAvailable: true, onStart });
    fireEvent.click(button("Start Bounce")!);
    expect(onStart).toHaveBeenCalledWith(8, false);
  });

  it("hides the choice on the live path, even when the runtime could split", () => {
    renderModal({ offline: false, stemsAvailable: true });
    expect(document.querySelector('[data-testid="bounce-export-kind"]')).toBeNull();
  });

  it("hides the choice when the file cannot export stems", () => {
    renderModal({ offline: true, stemsAvailable: false });
    expect(document.querySelector('[data-testid="bounce-export-kind"]')).toBeNull();
  });

  it("the stems progress bar fills against every stem's length, not one", () => {
    render(
      <BounceModal
        open
        state={{ phase: "rendering", seconds: 8, rendered: 12, stems: { total: 24 } }}
        sizing={null}
        offline
        stemsAvailable
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
