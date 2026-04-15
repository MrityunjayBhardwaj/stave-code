"use client";

import React, { useEffect, useState } from "react";
import {
  getEditorFontSize,
  setEditorFontSize,
  getEditorMinimap,
  toggleEditorMinimap,
  getEditorBreadcrumbs,
  toggleEditorBreadcrumbs,
  getEditorTheme,
  setEditorTheme,
  type EditorTheme,
} from "@stave/editor";

interface Props {
  open: boolean;
  onClose: () => void;
}

const THEME_OPTIONS: { value: EditorTheme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

export function EditorSettingsModal({ open, onClose }: Props) {
  const [fontSize, setFontSize] = useState(14);
  const [minimap, setMinimap] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState(false);
  const [theme, setTheme] = useState<EditorTheme>("dark");

  useEffect(() => {
    if (!open) return;
    setFontSize(getEditorFontSize());
    setMinimap(getEditorMinimap());
    setBreadcrumbs(getEditorBreadcrumbs());
    setTheme(getEditorTheme());
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={s.title}>Editor Settings</div>
          <button style={s.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={s.body}>
          <Row label="Font size">
            <input
              type="range"
              min={8}
              max={32}
              value={fontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                setFontSize(v);
                setEditorFontSize(v);
              }}
              style={s.range}
            />
            <span style={s.value}>{fontSize}px</span>
          </Row>
          <Row label="Minimap">
            <label style={s.switchLabel}>
              <input
                type="checkbox"
                checked={minimap}
                onChange={() => { toggleEditorMinimap(); setMinimap((v) => !v); }}
              />
              <span>{minimap ? "Enabled" : "Disabled"}</span>
            </label>
          </Row>
          <Row label="File path bar">
            <label style={s.switchLabel}>
              <input
                type="checkbox"
                checked={breadcrumbs}
                onChange={() => { toggleEditorBreadcrumbs(); setBreadcrumbs((v) => !v); }}
              />
              <span>{breadcrumbs ? "Shown" : "Hidden"}</span>
            </label>
          </Row>
          <Row label="Theme">
            <select
              style={s.select}
              value={theme}
              onChange={(e) => {
                const v = e.target.value as EditorTheme;
                setTheme(v);
                setEditorTheme(v);
              }}
            >
              {THEME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Row>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={s.row}>
      <div style={s.rowLabel}>{label}</div>
      <div style={s.rowControl}>{children}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0, background: "var(--bg-overlay)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    paddingTop: "14vh", zIndex: 20000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 460, maxWidth: "92vw", background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)", borderRadius: 6,
    boxShadow: "0 10px 40px rgba(0,0,0,0.5)", overflow: "hidden",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)",
  },
  title: { color: "var(--text-primary)", fontSize: 14, fontWeight: 600 },
  closeBtn: {
    background: "none", border: "none", color: "var(--text-icon)",
    fontSize: 22, cursor: "pointer", padding: "0 4px", lineHeight: 1,
  },
  body: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 },
  row: {
    display: "grid", gridTemplateColumns: "110px 1fr", alignItems: "center", gap: 12,
  },
  rowLabel: { fontSize: 12, color: "var(--text-secondary)" },
  rowControl: { display: "flex", alignItems: "center", gap: 10, color: "var(--text-primary)" },
  range: { flex: 1, accentColor: "var(--accent-strong)" },
  value: { fontSize: 11, color: "var(--text-tertiary)", minWidth: 36, textAlign: "right" as const },
  switchLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" },
  select: {
    background: "var(--bg-active)", border: "1px solid var(--border-strong)", borderRadius: 4,
    color: "var(--text-primary)", padding: "4px 10px", fontSize: 12,
    cursor: "pointer", fontFamily: "inherit", minWidth: 140,
  },
};
