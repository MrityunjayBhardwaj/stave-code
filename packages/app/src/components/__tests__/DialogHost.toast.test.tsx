/**
 * The toast's test handle and its keyboard surface (#1411).
 *
 * Two gaps, one shape. `ToastStack` rendered a bare styled `div`: no handle, so
 * the only way to address a toast — from a test OR from a keyboard — was its
 * message text and a mouse. Both got more expensive after #1410, where the
 * offer to keep a refused bounce lives on a toast and NOWHERE else.
 *
 * What is pinned here is STRUCTURE, deliberately:
 *   - the handle exists and carries the level
 *   - an actionable toast's message is a real <button>, so it is in the tab
 *     order and gets native Enter/Space activation
 *   - clicking that button runs the action ONCE, not twice through the
 *     container's own onClick
 *
 * ⚠ NOT pinned here: that Enter actually activates it. jsdom does not implement
 * a button's default activation behaviour, so a passing `fireEvent.keyDown`
 * would prove nothing about a browser. That claim belongs to — and is made by —
 * the keyboard arm in `tests/bounce-silent-save-anyway.spec.ts`, which drives a
 * real Chromium with a real Tab and a real Enter.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, cleanup, fireEvent } from "@testing-library/react";
import { DialogHost } from "../DialogHost";
import { showToast, getToasts, dismissToast } from "../../dialogs/host";

beforeEach(() => {
  for (const t of getToasts()) dismissToast(t.id);
});

afterEach(() => {
  cleanup();
  for (const t of getToasts()) dismissToast(t.id);
});

describe("toast test handle (#1411)", () => {
  it("carries data-testid + data-level, so an arm need not select on prose", () => {
    const { container } = render(<DialogHost />);
    act(() => {
      showToast("plain news", "info");
      showToast("something broke", "error");
    });

    const toasts = container.querySelectorAll('[data-testid="toast"]');
    expect(toasts).toHaveLength(2);
    expect([...toasts].map((el) => el.getAttribute("data-level"))).toEqual([
      "info",
      "error",
    ]);
  });

  it("does not let the handle alone identify a message — levels are shared", () => {
    // The reason the handle is for SELECTION and the text for ASSERTION: two
    // different failures land on the same level. An arm that stopped at
    // `[data-level="error"]` would pass on either one.
    const { container } = render(<DialogHost />);
    act(() => {
      showToast("Bounce failed — see console for details.", "error");
      showToast("Bounce produced no sound. Click to save it anyway.", "error");
    });
    const errors = container.querySelectorAll(
      '[data-testid="toast"][data-level="error"]',
    );
    expect(errors).toHaveLength(2);
  });
});

describe("toast keyboard surface (#1411)", () => {
  it("renders an actionable toast's message as a real button", () => {
    const { container } = render(<DialogHost />);
    act(() => {
      showToast("Click to save it anyway.", "error", 4000, () => {});
    });

    const action = container.querySelector('[data-testid="toast-action"]');
    expect(action).not.toBeNull();
    // A native <button> is what buys the tab stop, Enter/Space and the focus
    // ring. `role="button"` on the container would not — and would nest an
    // interactive element inside another one.
    expect(action!.tagName).toBe("BUTTON");
    expect(action!.textContent).toContain("Click to save it anyway.");

    // In the tab order, and focusable.
    expect(action!.hasAttribute("disabled")).toBe(false);
    (action as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(action);
  });

  it("leaves a plain toast as text — nothing to activate, nothing to focus", () => {
    const { container } = render(<DialogHost />);
    act(() => {
      showToast("saved", "info");
    });
    expect(container.querySelector('[data-testid="toast-action"]')).toBeNull();
    expect(container.querySelector('[data-testid="toast"]')!.textContent).toContain(
      "saved",
    );
  });

  it("runs the action exactly once — the container's click must not double it", () => {
    const onActivate = vi.fn();
    const { container } = render(<DialogHost />);
    act(() => {
      showToast("Click to save it anyway.", "error", 4000, onActivate);
    });

    const action = container.querySelector(
      '[data-testid="toast-action"]',
    ) as HTMLButtonElement;
    act(() => {
      fireEvent.click(action);
    });

    expect(onActivate).toHaveBeenCalledTimes(1);
    // …and the toast is gone, exactly as a body click used to leave it.
    expect(getToasts()).toHaveLength(0);
  });

  it("puts the offer ahead of the × in the DOM, so Tab reaches it first", () => {
    // Constructive before destructive. The × is `position: absolute`, so its
    // place in the DOM is purely about tab order — and with it first, the first
    // stop a keyboard user's hand reached was the button that throws a refused
    // bounce away, with the offer to keep it second.
    const { container } = render(<DialogHost />);
    act(() => {
      showToast("Click to save it anyway.", "error", 4000, () => {});
    });

    const buttons = [
      ...container.querySelectorAll('[data-testid="toast"] button'),
    ];
    expect(buttons.map((b) => b.getAttribute("data-testid") ?? "dismiss")).toEqual(
      ["toast-action", "dismiss"],
    );
  });

  it("still dismisses without acting when the × is used", () => {
    const onActivate = vi.fn();
    const { container } = render(<DialogHost />);
    act(() => {
      showToast("Click to save it anyway.", "error", 4000, onActivate);
    });

    const close = container.querySelector(
      '[aria-label="Dismiss notification"]',
    ) as HTMLButtonElement;
    act(() => {
      fireEvent.click(close);
    });

    expect(onActivate).not.toHaveBeenCalled();
    expect(getToasts()).toHaveLength(0);
  });
});
