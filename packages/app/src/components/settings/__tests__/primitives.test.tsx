import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Switch } from "../Switch";
import { SettingRow } from "../SettingRow";

describe("Switch", () => {
  it("exposes a labelled switch role reflecting checked state", () => {
    render(<Switch ariaLabel="Minimap" checked={false} onChange={() => {}} />);
    const sw = screen.getByRole("switch", { name: "Minimap" });
    expect(sw).toBeTruthy();
    expect((sw as HTMLInputElement).checked).toBe(false);
  });

  it("fires onChange with the toggled value", () => {
    const onChange = vi.fn();
    render(<Switch ariaLabel="Minimap" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Minimap" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is non-interactive when disabled", () => {
    const onChange = vi.fn();
    render(<Switch ariaLabel="Csound" checked={false} disabled onChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Csound" }) as HTMLInputElement;
    expect(sw.disabled).toBe(true);
  });
});

describe("SettingRow", () => {
  it("renders name, description and the control slot", () => {
    render(
      <SettingRow name="Font size" description="Size of the code text.">
        <button>ctrl</button>
      </SettingRow>,
    );
    expect(screen.getByText("Font size")).toBeTruthy();
    expect(screen.getByText("Size of the code text.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ctrl" })).toBeTruthy();
  });

  it("omits the description node when none is given", () => {
    const { container } = render(
      <SettingRow name="Minimap">
        <span>x</span>
      </SettingRow>,
    );
    expect(container.querySelector(".rdesc")).toBeNull();
  });
});
