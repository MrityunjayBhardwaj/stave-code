"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  listEnabledCommands,
  executeCommand,
  subscribeToCommands,
  type Command,
} from "../commands/registry";
import { formatKeybinding, getKeybindingFor } from "../commands/keybindings";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /**
   * Optional prefix applied to the initial input value. For Cmd+P the
   * palette is pre-populated with '' and filters only file-kind rows;
   * for Cmd+Shift+P it starts empty and shows commands. The caller
   * sets this via `initialQuery`. A prefix of '>' mirrors VSCode:
   * the commands-only mode. '' is the files-only mode (QuickOpen).
   */
  initialQuery?: string;
  /**
   * Extra rows to merge into the palette. Used by QuickOpen to show
   * workspace files. Each row has a title, optional description, and
   * a run callback.
   */
  extraRows?: PaletteRow[];
  /** When set, hide registered commands (QuickOpen mode). */
  hideCommands?: boolean;
  /** Placeholder for the input. */
  placeholder?: string;
}

export interface PaletteRow {
  id: string;
  title: string;
  description?: string;
  keybinding?: string;
  category?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  initialQuery = "",
  extraRows,
  hideCommands,
  placeholder,
}: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [tick, forceTick] = useState(0);

  // Reset on open + seed query.
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setActive(0);
      queueMicrotask(() => inputRef.current?.focus());
    }
  }, [open, initialQuery]);

  // Re-render when the command set changes (lets newly-registered commands
  // appear in the palette without closing).
  useEffect(() => subscribeToCommands(() => forceTick((t) => t + 1)), []);

  // Build the row list: registered commands + any extras.
  const allRows: PaletteRow[] = useMemo(() => {
    const rows: PaletteRow[] = [];
    if (!hideCommands) {
      for (const cmd of listEnabledCommands()) {
        rows.push(commandToRow(cmd));
      }
    }
    if (extraRows) rows.push(...extraRows);
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideCommands, extraRows, tick]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRows;
    return fuzzyFilter(allRows, q);
  }, [allRows, query]);

  useEffect(() => { setActive(0); }, [query]);

  // Scroll active row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-palette-row="${active}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const runRow = (row: PaletteRow) => {
    onClose();
    queueMicrotask(() => row.run());
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) runRow(row);
    }
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          style={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder ?? "Type a command..."}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
        />
        <div style={styles.list} ref={listRef}>
          {rows.length === 0 && (
            <div style={styles.empty}>No matches</div>
          )}
          {rows.map((row, i) => (
            <div
              key={row.id}
              data-palette-row={i}
              style={{
                ...styles.row,
                ...(i === active ? styles.rowActive : {}),
              }}
              onMouseEnter={() => setActive(i)}
              onClick={() => runRow(row)}
            >
              <div style={styles.rowLeft}>
                <div style={styles.rowTitle}>
                  {row.category && <span style={styles.rowCategory}>{row.category}: </span>}
                  {row.title}
                </div>
                {row.description && (
                  <div style={styles.rowDescription}>{row.description}</div>
                )}
              </div>
              {row.keybinding && (
                <div style={styles.rowShortcut}>
                  {formatKeybinding(row.keybinding)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function commandToRow(cmd: Command): PaletteRow {
  return {
    id: cmd.id,
    title: cmd.title,
    description: cmd.description,
    category: cmd.category,
    keybinding: getKeybindingFor(cmd),
    run: () => executeCommand(cmd.id),
  };
}

// Simple fuzzy match — every query char must appear in order.
function fuzzyFilter(rows: PaletteRow[], q: string): PaletteRow[] {
  const scored: Array<{ row: PaletteRow; score: number }> = [];
  for (const row of rows) {
    const hay = `${row.category ?? ""} ${row.title} ${row.description ?? ""}`.toLowerCase();
    const score = fuzzyScore(hay, q);
    if (score > 0) scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.row);
}

function fuzzyScore(hay: string, q: string): number {
  let hi = 0;
  let score = 0;
  let streak = 0;
  for (const qc of q) {
    const idx = hay.indexOf(qc, hi);
    if (idx < 0) return 0;
    // Consecutive matches reward streaks; word-boundary matches add bonus.
    if (idx === hi) streak++;
    else streak = 0;
    score += 1 + streak * 2;
    if (idx === 0 || /\s|[\-_.:]/.test(hay[idx - 1])) score += 3;
    hi = idx + 1;
  }
  return score;
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "var(--bg-overlay-soft)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "10vh",
    zIndex: 20000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 620,
    maxWidth: "90vw",
    maxHeight: "70vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
    overflow: "hidden",
  },
  input: {
    background: "var(--bg-input)",
    border: "none",
    borderBottom: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
    padding: "10px 14px",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  },
  list: {
    overflowY: "auto",
    padding: "4px 0",
  },
  empty: {
    padding: "24px",
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 13,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 14px",
    gap: 12,
    cursor: "pointer",
  },
  rowActive: {
    background: "var(--bg-active)",
  },
  rowLeft: {
    minWidth: 0,
    flex: 1,
  },
  rowTitle: {
    fontSize: 13,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowCategory: {
    color: "var(--text-tertiary)",
    fontWeight: 500,
  },
  rowDescription: {
    fontSize: 11,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowShortcut: {
    fontSize: 11,
    color: "var(--text-tertiary)",
    whiteSpace: "nowrap",
    fontFamily: 'var(--font-mono), ui-monospace, monospace',
    letterSpacing: 0.5,
  },
};
