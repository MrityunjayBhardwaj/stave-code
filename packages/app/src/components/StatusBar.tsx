"use client";

import React from "react";

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
}

export function StatusBar({
  projectName,
  activeFilePath,
  runtime,
  canUndo,
  canRedo,
}: StatusBarProps) {
  const playDot = runtime?.isPlaying ? "#6bff8c" : "#6a6a88";
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
    background: "#111126",
    borderTop: "1px solid #2a2a4a",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    gap: 14,
    fontSize: 11,
    color: "#8888aa",
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
    color: "#c8c8d4",
  },
  path: {
    color: "#8888aa",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 400,
  },
  sep: {
    color: "#4a4a66",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block",
  },
  err: {
    color: "#f87171",
  },
  hint: {
    fontSize: 13,
    color: "#8888aa",
    cursor: "default",
  },
};
