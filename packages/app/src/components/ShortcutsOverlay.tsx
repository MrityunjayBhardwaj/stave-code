"use client";

import React, { useEffect, useMemo, useState } from "react";
import { listCommands, subscribeToCommands, type Command } from "../commands/registry";
import { formatKeybinding, getKeybindingFor, setKeybindingOverride } from "../commands/keybindings";

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState("");
  // The command id whose binding the user is currently re-capturing.
  // When non-null, the next keydown (except modifier-only) becomes the
  // new binding; Escape cancels the capture without closing the modal.
  const [capturingId, setCapturingId] = useState<string | null>(null);

  useEffect(() => subscribeToCommands(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCapturingId(null);
    const onKey = (e: KeyboardEvent) => {
      if (capturingId) {
        // Don't close the overlay while capturing — Escape cancels.
        e.preventDefault(); e.stopPropagation();
        if (e.key === "Escape") { setCapturingId(null); return; }
        // Ignore modifier-only keys; require at least one non-modifier.
        const modOnly = ["Control", "Meta", "Shift", "Alt"].includes(e.key);
        if (modOnly) return;
        const parts: string[] = [];
        if (e.metaKey || e.ctrlKey) parts.push("mod");
        if (e.shiftKey) parts.push("shift");
        if (e.altKey) parts.push("alt");
        const k = e.key.toLowerCase();
        parts.push(k.length === 1 ? k : k);
        setKeybindingOverride(capturingId, parts.join("+"));
        setCapturingId(null);
        setTick((t) => t + 1);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, capturingId]);

  const rows = useMemo(() => {
    const cmds = listCommands();
    // Show EVERY command so users can bind to ones that don't have a
    // default shortcut. Empty binding is allowed.
    const withBindings = cmds
      .map((c) => ({ cmd: c, binding: getKeybindingFor(c) ?? "" }));
    const q = query.trim().toLowerCase();
    const filtered = q
      ? withBindings.filter((r) =>
          `${r.cmd.category ?? ""} ${r.cmd.title}`.toLowerCase().includes(q),
        )
      : withBindings;
    // Group by category for display.
    const byCat = new Map<string, Array<{ cmd: Command; binding: string }>>();
    for (const r of filtered) {
      const cat = r.cmd.category ?? "Misc";
      let list = byCat.get(cat);
      if (!list) { list = []; byCat.set(cat, list); }
      list.push(r as { cmd: Command; binding: string });
    }
    return Array.from(byCat.entries()).sort(([a], [b]) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, query, open]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>Keyboard Shortcuts</div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>
        <input
          autoFocus
          style={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by command or category..."
        />
        <div style={styles.list}>
          {rows.length === 0 && (
            <div style={styles.empty}>No shortcuts match.</div>
          )}
          {rows.map(([category, items]) => (
            <div key={category} style={styles.section}>
              <div style={styles.sectionTitle}>{category}</div>
              {items.map(({ cmd, binding }) => {
                const capturing = capturingId === cmd.id;
                return (
                  <div key={cmd.id} style={styles.row}>
                    <div style={styles.rowTitle}>{cmd.title}</div>
                    <button
                      style={{ ...styles.rowKey, ...styles.rowKeyBtn, ...(capturing ? styles.rowKeyCapturing : {}) }}
                      onClick={() => setCapturingId(cmd.id)}
                      title={binding ? "Click to rebind" : "Click to bind"}
                    >
                      {capturing ? "Press a key combo..." : (binding ? formatKeybinding(binding) : "—")}
                    </button>
                    {binding && (
                      <button
                        style={styles.clearBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setKeybindingOverride(cmd.id, null);
                          // If the cleared binding was a user override, it
                          // falls back to the command's declared default.
                          // We also need to override-to-empty to reflect
                          // a removal fully — but MVP stops here.
                          setTick((t) => t + 1);
                        }}
                        title="Reset to default"
                      >↺</button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0, background: "var(--bg-overlay)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    paddingTop: "8vh", zIndex: 20000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 620, maxWidth: "92vw", maxHeight: "80vh",
    background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", borderRadius: 6,
    display: "flex", flexDirection: "column",
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)", overflow: "hidden",
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
  input: {
    background: "var(--bg-input)", border: "none",
    borderBottom: "1px solid var(--border-subtle)",
    color: "var(--text-primary)", padding: "8px 14px", fontSize: 12,
    fontFamily: "inherit", outline: "none",
  },
  list: { overflowY: "auto", padding: "6px 0", flex: 1 },
  section: { padding: "6px 16px" },
  sectionTitle: {
    fontSize: 10, letterSpacing: 0.8, fontWeight: 600,
    color: "var(--text-tertiary)", textTransform: "uppercase" as const, marginBottom: 4,
  },
  row: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "4px 0", fontSize: 12, color: "var(--text-chrome)",
  },
  rowTitle: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowKey: { fontFamily: 'var(--font-mono), ui-monospace, monospace', color: "var(--text-secondary)", letterSpacing: 0.5 },
  rowKeyBtn: {
    background: "var(--bg-input)", border: "1px solid var(--border-subtle)", borderRadius: 3,
    padding: "2px 8px", cursor: "pointer", fontSize: 11,
    minWidth: 90, textAlign: "center" as const,
  },
  rowKeyCapturing: {
    background: "var(--highlight-bg)", borderColor: "var(--highlight-fg)", color: "var(--highlight-fg)",
  },
  clearBtn: {
    background: "none", border: "none", color: "var(--text-muted)",
    cursor: "pointer", padding: "2px 4px", marginLeft: 4,
    fontSize: 12,
  },
  empty: { padding: 20, textAlign: "center" as const, color: "var(--text-muted)", fontSize: 12 },
};
