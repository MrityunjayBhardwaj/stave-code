"use client";

import React, { useEffect, useState } from "react";
import { subscribeLog, getLogHistory, type LogEntry } from "@stave/editor";

export interface StatusBarRuntimeState {
  readonly isPlaying: boolean;
  readonly bpm?: number;
  readonly error?: string | null;
}

interface StatusBarProps {
  projectName: string;
  activeFilePath: string | null;
  runtime: StatusBarRuntimeState | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Open the Console panel (or reset unread count if already open). */
  onOpenConsole?: () => void;
}

export function StatusBar({
  projectName,
  activeFilePath,
  runtime,
  canUndo,
  canRedo,
  onOpenConsole,
}: StatusBarProps) {
  const playDot = runtime?.isPlaying ? "var(--success-fg)" : "var(--text-muted)";

  // Unread error count — counts every `error`-level LogEntry emitted
  // since the user last opened the Console panel. Seeded from current
  // history on mount so a reload doesn't zero out the badge.
  const [unreadErrors, setUnreadErrors] = useState(
    () => getLogHistory().filter((e) => e.level === "error").length,
  );
  const [unreadWarns, setUnreadWarns] = useState(
    () => getLogHistory().filter((e) => e.level === "warn").length,
  );
  useEffect(() => {
    return subscribeLog((entry: LogEntry | null) => {
      if (entry === null) {
        setUnreadErrors(0);
        setUnreadWarns(0);
        return;
      }
      if (entry.level === "error") setUnreadErrors((n) => n + 1);
      else if (entry.level === "warn") setUnreadWarns((n) => n + 1);
    });
  }, []);

  const handleConsoleClick = () => {
    setUnreadErrors(0);
    setUnreadWarns(0);
    onOpenConsole?.();
  };
  return (
    <div style={styles.bar} data-stave-statusbar>
      <div style={styles.section}>
        <span style={styles.project}>{projectName}</span>
        {activeFilePath && (
          <>
            <span style={styles.sep}>•</span>
            <span style={styles.path} title={activeFilePath}>
              {activeFilePath}
            </span>
          </>
        )}
      </div>

      <div style={styles.section}>
        {runtime && (
          <>
            <span style={{ ...styles.dot, background: playDot }} />
            <span>{runtime.isPlaying ? "Playing" : "Stopped"}</span>
            {runtime.bpm !== undefined && (
              <span style={styles.sep}>•&nbsp;{runtime.bpm.toFixed(0)} bpm</span>
            )}
            {runtime.error && (
              <>
                <span style={styles.sep}>•</span>
                <span style={styles.err}>error</span>
              </>
            )}
          </>
        )}
      </div>

      <div style={styles.sectionRight}>
        <button
          data-testid="statusbar-console-chip"
          onClick={handleConsoleClick}
          title={
            unreadErrors + unreadWarns > 0
              ? `${unreadErrors} errors, ${unreadWarns} warnings — open Console`
              : "Open Console"
          }
          style={{
            ...styles.chip,
            ...(unreadErrors > 0
              ? styles.chipErr
              : unreadWarns > 0
              ? styles.chipWarn
              : styles.chipIdle),
          }}
        >
          <span style={styles.chipIcon} aria-hidden="true">❯_</span>
          {unreadErrors + unreadWarns > 0 && (
            <span style={styles.chipCount}>
              {unreadErrors + unreadWarns}
            </span>
          )}
        </button>
        <span
          style={{ ...styles.hint, opacity: canUndo ? 1 : 0.4 }}
          title="Undo (⌘Z)"
        >
          ↶
        </span>
        <span
          style={{ ...styles.hint, opacity: canRedo ? 1 : 0.4 }}
          title="Redo (⌘⇧Z)"
        >
          ↷
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    height: 22,
    minHeight: 22,
    background: "var(--bg-chrome-2)",
    borderTop: "1px solid var(--border-subtle)",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    gap: 14,
    fontSize: 11,
    color: "var(--text-tertiary)",
    fontFamily: '"JetBrains Mono", monospace',
    userSelect: "none",
  },
  section: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  sectionRight: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  project: {
    color: "var(--text-chrome)",
  },
  path: {
    color: "var(--text-tertiary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 400,
  },
  sep: {
    color: "var(--border-separator)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block",
  },
  err: {
    color: "var(--danger-fg)",
  },
  hint: {
    fontSize: 13,
    color: "var(--text-tertiary)",
    cursor: "default",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "transparent",
    border: "1px solid transparent",
    color: "var(--text-tertiary)",
    fontFamily: "inherit",
    fontSize: 10,
    height: 18,
    padding: "0 6px",
    borderRadius: 3,
    cursor: "pointer",
    transition: "background 80ms ease, border-color 80ms ease",
  },
  chipIdle: {
    color: "var(--text-tertiary)",
  },
  chipWarn: {
    color: "#f59e0b",
    borderColor: "rgba(245, 158, 11, 0.35)",
    background: "rgba(245, 158, 11, 0.08)",
  },
  chipErr: {
    color: "#ef4444",
    borderColor: "rgba(239, 68, 68, 0.45)",
    background: "rgba(239, 68, 68, 0.08)",
  },
  chipIcon: {
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 600,
  },
  chipCount: {
    fontFamily: '"JetBrains Mono", monospace',
    fontWeight: 600,
    padding: "0 3px",
    borderRadius: 2,
    minWidth: 14,
    textAlign: "center" as const,
    background: "currentColor",
    color: "var(--bg-chrome-2)",
  },
};
