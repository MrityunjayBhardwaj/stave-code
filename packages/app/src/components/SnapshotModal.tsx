"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { SnapshotMeta } from "@stave/editor";

interface SnapshotModalProps {
  open: boolean;
  projectName: string;
  snapshots: SnapshotMeta[];
  onClose: () => void;
  onSaveNew: (label: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function SnapshotModal({
  open, projectName, snapshots, onClose, onSaveNew, onRestore, onDelete,
}: SnapshotModalProps) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const doSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSaveNew(label);
      setLabel("");
    } finally {
      setSaving(false);
    }
  }, [label, onSaveNew]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Version History — {projectName}</h2>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={styles.saveRow}>
          <input
            style={styles.input}
            placeholder="Version label (e.g., 'Before refactor')"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSave(); }}
            disabled={saving}
          />
          <button style={styles.saveBtn} onClick={doSave} disabled={saving}>
            {saving ? "Saving..." : "Save Version"}
          </button>
        </div>

        <div style={styles.list}>
          {snapshots.length === 0 && (
            <div style={styles.empty}>No versions saved yet.</div>
          )}
          {snapshots.map((s) => (
            <div key={s.id} style={styles.row}>
              <div style={styles.rowLeft}>
                <div style={styles.rowName}>{s.label}</div>
                <div style={styles.rowMeta}>{formatRelative(s.createdAt)}</div>
              </div>
              <div style={styles.rowActions}>
                <button
                  style={styles.actionBtn}
                  onClick={async () => {
                    if (!confirm(`Restore "${s.label}"? This replaces the current files.`)) return;
                    await onRestore(s.id);
                    onClose();
                  }}
                >
                  Restore
                </button>
                <button
                  style={styles.deleteBtn}
                  onClick={() => onDelete(s.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  if (delta < 3600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86400_000) return `${Math.floor(delta / 3600_000)}h ago`;
  return new Date(ts).toLocaleString();
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 560,
    maxWidth: "90vw",
    maxHeight: "80vh",
    background: "#1a1a2e",
    border: "1px solid #3a3a5a",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column" as const,
    color: "#c8c8d4",
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid #2a2a4a",
  },
  title: { margin: 0, fontSize: 15, fontWeight: 600, color: "#e8e8f0" },
  closeBtn: {
    background: "none", border: "none", color: "#8888aa",
    fontSize: 24, cursor: "pointer", padding: "0 4px", lineHeight: 1,
  },
  saveRow: {
    display: "flex", gap: 8, padding: "12px 20px",
    borderBottom: "1px solid #2a2a4a",
  },
  input: {
    flex: 1,
    background: "#0f0f1e",
    border: "1px solid #2a2a4a",
    borderRadius: 4,
    color: "#e8e8f0",
    padding: "6px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  },
  saveBtn: {
    background: "#6a6ac8",
    border: "none",
    borderRadius: 4,
    color: "#fff",
    padding: "6px 16px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  list: { overflow: "auto", padding: "8px 0", flex: 1 },
  empty: { padding: "24px", textAlign: "center" as const, color: "#6a6a88", fontSize: 13 },
  row: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 20px",
  },
  rowLeft: { display: "flex", flexDirection: "column" as const, gap: 2 },
  rowName: { fontSize: 13, color: "#e8e8f0", fontWeight: 500 },
  rowMeta: { fontSize: 11, color: "#6a6a88" },
  rowActions: { display: "flex", gap: 4 },
  actionBtn: {
    background: "none", border: "1px solid #3a3a5a", color: "#c8c8d4",
    cursor: "pointer", padding: "4px 10px", borderRadius: 3,
    fontSize: 12, fontFamily: "inherit",
  },
  deleteBtn: {
    background: "none", border: "none", color: "#f87171",
    cursor: "pointer", padding: "4px 8px", borderRadius: 3, fontSize: 12,
  },
};
