"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  closeDialog,
  dismissToast,
  getDialog,
  getToasts,
  resolveConfirm,
  resolvePrompt,
  subscribeToDialog,
  type DialogState,
  type ToastState,
} from "../dialogs/host";

export function DialogHost() {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeToDialog(() => setTick((t) => t + 1)), []);
  const dialog = getDialog();
  const toasts = getToasts();
  return (
    <>
      {dialog && <DialogBody dialog={dialog} key={dialog.id} />}
      {toasts.length > 0 && <ToastStack toasts={toasts} />}
      {/* tick referenced to keep React subscribed to dialog state */}
      <span data-stave-dialog-tick={tick} hidden />
    </>
  );
}

function DialogBody({ dialog }: { dialog: DialogState }) {
  const [value, setValue] = useState(dialog.kind === "prompt" ? dialog.initialValue : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const v = inputRef.current.value;
        const dotIdx = v.lastIndexOf(".");
        if (dotIdx > 0) inputRef.current.setSelectionRange(0, dotIdx);
        else inputRef.current.select();
      }
    });
  }, []);

  const submit = () => {
    if (dialog.kind === "prompt") {
      if (!value.trim()) { closeDialog(); return; }
      resolvePrompt(value);
    } else {
      resolveConfirm(true);
    }
  };
  const cancel = () => closeDialog();

  return (
    <div style={styles.backdrop} onClick={cancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        if (e.key === "Enter") { e.preventDefault(); submit(); }
      }}>
        <div style={styles.title}>{dialog.title}</div>
        {dialog.description && <div style={styles.description}>{dialog.description}</div>}
        {dialog.kind === "prompt" && (
          <input
            ref={inputRef}
            style={styles.input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={dialog.placeholder}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
          />
        )}
        <div style={styles.actions}>
          <button style={styles.cancel} onClick={cancel}>
            {(dialog.kind === "confirm" && dialog.cancelLabel) || "Cancel"}
          </button>
          <button
            style={
              dialog.kind === "confirm" && dialog.danger
                ? { ...styles.confirm, ...styles.danger }
                : styles.confirm
            }
            onClick={submit}
            autoFocus={dialog.kind === "confirm"}
          >
            {dialog.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastStack({ toasts }: { toasts: ToastState[] }) {
  return (
    <div style={styles.toastStack}>
      {toasts.map((t) => (
        <div
          key={t.id}
          // A stable handle for tests. Until #1411 the only way to address a
          // toast was its message text, which couples an arm to prose — reword
          // the message and the arm stops watching anything, silently. `level`
          // rides along the same way the Console rows carry `data-level`.
          // ⚠ The handle is for SELECTION, not for the assertion: an arm that
          // only checks `[data-level="error"]` would pass on the generic
          // "Bounce failed" fallback too. Select by handle, assert on text.
          data-testid="toast"
          data-level={t.level}
          style={{
            ...styles.toast,
            ...(t.level === "error" ? styles.toastError : {}),
            position: "relative",
            // Only the actionable (error) toasts advertise clickability;
            // plain info toasts keep the default arrow cursor.
            cursor: t.onActivate ? "pointer" : "default",
          }}
          // Body click: run the toast's action (open Console + jump to the
          // error line) when it has one, then clear it. Info toasts with no
          // action just dismiss on body click, as before. The close (×)
          // button below dismisses WITHOUT firing the action.
          onClick={() => {
            t.onActivate?.();
            dismissToast(t.id);
          }}
        >
          {/* Reserve right-edge space: ~20px clears the top-right × on every
              toast; the bottom-right ×N count badge needs a touch more. */}
          {t.onActivate ? (
            // An ACTIONABLE toast renders its message as a real button, so the
            // action is reachable by keyboard. The whole-body click above stays
            // for the mouse; this adds the tab stop, the Enter/Space handling
            // and the focus ring that a native button brings for free.
            // ⚠ Deliberately a SIBLING of the × rather than `role="button"` on
            // the container: a button nested inside a button is invalid, and
            // assistive tech treats the inner one inconsistently.
            // ⚠ This matters more since #1410. The offer to keep a refused
            // bounce exists ONLY on this toast — miss it and a keyboard-only
            // user cannot retrieve their take at all, and re-recording it costs
            // the full length of the bounce in real time.
            <button
              type="button"
              data-testid="toast-action"
              style={{
                ...styles.toastAction,
                paddingRight: t.count > 1 ? 28 : 20,
              }}
              onClick={(e) => {
                // The container's onClick would otherwise run the action a
                // second time — and dismiss a toast that is already gone.
                e.stopPropagation();
                t.onActivate?.();
                dismissToast(t.id);
              }}
            >
              {t.message}
            </button>
          ) : (
            <span style={{ paddingRight: t.count > 1 ? 28 : 20, display: "block" }}>
              {t.message}
            </span>
          )}
          {/* ⚠ THE × COMES AFTER THE MESSAGE IN THE DOM, AND THAT IS THE POINT.
              It is `position: absolute` in the top-right corner, so its place
              here changes nothing visually — what it changes is the TAB ORDER.
              Measured: focus lands on `body` when the Bounce modal closes, and
              the toast stack is the last thing in the document, so the toast is
              two tab stops away. With the × first, the FIRST thing a keyboard
              user's hand reached was the button that throws the refused bounce
              away, and the offer to keep it was second. One reflexive Enter and
              the take is gone — the exact loss #1410 exists to prevent.
              Constructive before destructive; it also puts the DOM in reading
              order, which is what the message-then-affordance layout looks
              like anyway. */}
          <button
            type="button"
            aria-label="Dismiss notification"
            title="Dismiss"
            style={styles.toastClose}
            onClick={(e) => {
              e.stopPropagation();
              dismissToast(t.id);
            }}
          >
            ×
          </button>
          {t.count > 1 && (
            <span
              style={{
                ...styles.toastCount,
                ...(t.level === "error" ? styles.toastCountError : {}),
              }}
              aria-label={`Repeated ${t.count} times`}
              title={`Repeated ${t.count} times`}
            >
              ×{t.count}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "var(--bg-overlay)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "22vh",
    zIndex: 30000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 420,
    maxWidth: "92vw",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "16px 18px",
    color: "var(--text-primary)",
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: "var(--text-secondary)",
    marginBottom: 10,
    lineHeight: 1.4,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--bg-input)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 4,
    color: "var(--text-primary)",
    padding: "8px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    marginTop: 6,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 14,
  },
  cancel: {
    background: "none",
    border: "1px solid var(--border-strong)",
    borderRadius: 4,
    color: "var(--text-chrome)",
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  confirm: {
    background: "var(--accent)",
    border: "1px solid var(--accent)",
    borderRadius: 4,
    color: "#fff",
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 500,
  },
  danger: {
    background: "var(--danger-bg)",
    borderColor: "var(--danger-bg)",
  },
  toastStack: {
    position: "fixed",
    bottom: 36,
    right: 16,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    zIndex: 30000,
    fontFamily: "system-ui, -apple-system, sans-serif",
    pointerEvents: "none",
  },
  toast: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderLeft: "3px solid var(--accent)",
    // Square off the left corners so the accent stripe runs as a straight
    // vertical edge; keep the right corners rounded (#699).
    borderRadius: "0 4px 4px 0",
    padding: "10px 14px",
    color: "var(--text-primary)",
    fontSize: 12,
    maxWidth: 360,
    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
    pointerEvents: "auto",
    cursor: "pointer",
  },
  toastError: {
    borderLeftColor: "var(--danger-fg)",
  },
  // The message of an ACTIONABLE toast, rendered as a real button so it takes
  // keyboard focus. Everything here is about looking exactly like the plain
  // <span> it replaces — no chrome of its own; the toast IS the button's
  // visible surface. `outline` is left alone so the focus ring still shows.
  toastAction: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
  },
  toastClose: {
    position: "absolute",
    top: 2,
    right: 4,
    width: 18,
    height: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    borderRadius: 3,
    color: "var(--text-secondary)",
    fontSize: 15,
    lineHeight: 1,
    cursor: "pointer",
    padding: 0,
    fontFamily: "inherit",
    pointerEvents: "auto",
  },
  toastCount: {
    position: "absolute",
    bottom: 4,
    right: 6,
    background: "var(--bg-input, rgba(255,255,255,0.08))",
    border: "1px solid var(--border-subtle)",
    borderRadius: 10,
    padding: "1px 6px",
    fontSize: 10,
    lineHeight: 1.2,
    color: "var(--text-secondary)",
    fontVariantNumeric: "tabular-nums",
    pointerEvents: "none",
  },
  toastCountError: {
    background: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.5)",
    color: "var(--danger-fg, #f87171)",
  },
};
