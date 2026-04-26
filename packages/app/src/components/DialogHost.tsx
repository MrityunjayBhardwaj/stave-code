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
          <button style={styles.cancel} onClick={cancel}>Cancel</button>
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
          style={{
            ...styles.toast,
            ...(t.level === "error" ? styles.toastError : {}),
            position: "relative",
          }}
          onClick={() => dismissToast(t.id)}
        >
          <span style={{ paddingRight: t.count > 1 ? 28 : 0, display: "block" }}>
            {t.message}
          </span>
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
    borderRadius: 4,
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
