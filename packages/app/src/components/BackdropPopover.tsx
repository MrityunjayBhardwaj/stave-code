"use client";

/**
 * BackdropPopover — single-surface backdrop control, anchored to the
 * MenuBar bg indicator. Opens on click. Contents adapt to whether a
 * backdrop is currently pinned:
 *
 *   - UNPINNED: just a viz-file picker. Selecting a file pins it.
 *   - PINNED:   swap picker + opacity slider + quality dropdown +
 *               blur slider + crop button + clear + reveal link.
 *
 * Follows VS Code's status-bar-item-click-opens-menu pattern. Closes
 * on outside click or Escape. Scoped to viz files (`.p5` / `.hydra`);
 * pattern files don't appear in the picker.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  getEditorBackdropBlur,
  setEditorBackdropBlur,
  getBackdropOpacity,
  setBackdropOpacity,
  onBackdropOpacityChange,
  getBackdropQuality,
  setBackdropQuality,
  onBackdropQualityChange,
  type BackdropQuality,
} from "@stave/editor";

export interface BackdropPopoverVizFile {
  id: string;
  name: string;
}

interface Props {
  anchorRect: DOMRect;
  onClose: () => void;
  vizFiles: readonly BackdropPopoverVizFile[];
  backgroundFileId: string | null;
  backgroundFileName: string | null;
  onSetBackdrop: (fileId: string | null) => void;
  onCropBackground: () => void;
  onRevealBackground: () => void;
}

export function BackdropPopover(props: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        props.onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    // defer attach one tick so the opening click doesn't immediately close.
    const t = setTimeout(
      () => document.addEventListener("mousedown", onDown),
      0,
    );
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [props]);

  // Subscriptions — live-update when settings change elsewhere.
  const [opacity, setOpacity] = useState(() => getBackdropOpacity());
  useEffect(() => onBackdropOpacityChange(setOpacity), []);
  const [quality, setQuality] = useState<BackdropQuality>(() =>
    getBackdropQuality(),
  );
  useEffect(() => onBackdropQualityChange(setQuality), []);
  const [blur, setBlur] = useState(() => getEditorBackdropBlur());

  const pinned = props.backgroundFileId != null;

  // Position below the indicator, right-aligned to its right edge.
  const left = Math.max(
    8,
    Math.min(
      window.innerWidth - 8 - 320,
      props.anchorRect.right - 320,
    ),
  );
  const top = props.anchorRect.bottom + 6;

  return (
    <div
      ref={ref}
      data-testid="backdrop-popover"
      data-pinned={pinned ? "true" : "false"}
      style={{
        position: "fixed",
        left,
        top,
        width: 320,
        background: "var(--bg-elevated, var(--surface))",
        border: "1px solid var(--border-strong, var(--border))",
        borderRadius: 6,
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
        zIndex: 16000,
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 11,
        padding: 0,
      }}
    >
      {/* Header — swap picker (pinned) or "Set backdrop" (unpinned). */}
      <div style={headerStyle}>
        <span style={{ color: "var(--text-secondary)" }}>
          {pinned ? "backdrop:" : "set backdrop"}
        </span>
        <select
          data-testid="backdrop-popover-picker"
          value={props.backgroundFileId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            props.onSetBackdrop(v === "" ? null : v);
          }}
          style={selectStyle}
        >
          {!pinned && <option value="">— choose a viz file —</option>}
          {props.vizFiles.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {pinned && (
        <>
          <div style={divider} />

          {/* Opacity slider */}
          <Row label="opacity">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => {
                const v = Number(e.target.value);
                setOpacity(v);
                setBackdropOpacity(v);
              }}
              style={rangeStyle}
            />
            <span style={valueStyle}>{Math.round(opacity * 100)}%</span>
          </Row>

          {/* Quality picker */}
          <Row label="quality">
            <select
              data-testid="backdrop-chrome-quality"
              value={quality}
              onChange={(e) => {
                const v = e.target.value as BackdropQuality;
                setQuality(v);
                setBackdropQuality(v);
              }}
              style={selectStyle}
            >
              <option value="full">Full</option>
              <option value="half">Half</option>
              <option value="quarter">Quarter</option>
            </select>
          </Row>

          {/* Code surface blur */}
          <Row label="code blur">
            <input
              type="range"
              min={0}
              max={24}
              step={1}
              value={blur}
              onChange={(e) => {
                const v = Number(e.target.value);
                setBlur(v);
                setEditorBackdropBlur(v);
              }}
              style={rangeStyle}
            />
            <span style={valueStyle}>{blur}px</span>
          </Row>

          <div style={divider} />

          <div style={actionRowStyle}>
            <button
              data-testid="backdrop-chrome-crop"
              onClick={() => {
                props.onCropBackground();
                props.onClose();
              }}
              style={actionBtnStyle}
            >
              <span aria-hidden="true">⬚</span> crop…
            </button>
            <button
              data-testid="backdrop-popover-reveal"
              onClick={() => {
                props.onRevealBackground();
                props.onClose();
              }}
              style={actionBtnStyle}
            >
              → reveal in editor
            </button>
            <button
              data-testid="backdrop-chrome-clear"
              onClick={() => {
                props.onSetBackdrop(null);
                props.onClose();
              }}
              style={{ ...actionBtnStyle, color: "var(--danger-fg, #f87171)" }}
            >
              × clear
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr auto",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
      }}
    >
      <span style={{ color: "var(--text-secondary)", fontSize: 10 }}>
        {label}
      </span>
      {children}
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
};
const divider: React.CSSProperties = {
  height: 1,
  background: "var(--border-subtle, var(--border))",
};
const rangeStyle: React.CSSProperties = {
  flex: 1,
  accentColor: "var(--accent-strong, var(--accent))",
};
const valueStyle: React.CSSProperties = {
  color: "var(--text-tertiary, var(--foreground-muted))",
  fontSize: 10,
  minWidth: 36,
  textAlign: "right" as const,
};
const selectStyle: React.CSSProperties = {
  flex: 1,
  background: "var(--bg-input, var(--surface))",
  color: "var(--foreground)",
  border: "1px solid var(--border)",
  borderRadius: 3,
  padding: "3px 6px",
  fontSize: 11,
  fontFamily: "inherit",
  cursor: "pointer",
};
const actionRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  padding: "6px 0",
};
const actionBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  background: "none",
  border: "none",
  color: "var(--text-primary)",
  fontSize: 11,
  fontFamily: "inherit",
  textAlign: "left" as const,
  cursor: "pointer",
};
