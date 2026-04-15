"use client";

import React, { useEffect, useState } from "react";
import { listPanels, subscribeToPanels, type Panel } from "../panels/registry";

interface ActivityBarProps {
  activePanelId: string | null;
  onSelect: (id: string | null) => void;
}

export function ActivityBar({ activePanelId, onSelect }: ActivityBarProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeToPanels(() => setTick((t) => t + 1)), []);
  const panels: Panel[] = React.useMemo(() => listPanels(), [tick]);

  return (
    <div style={styles.bar}>
      {panels.map((p) => {
        const isActive = activePanelId === p.id;
        return (
          <button
            key={p.id}
            style={{ ...styles.item, ...(isActive ? styles.itemActive : {}) }}
            title={p.title}
            aria-label={p.title}
            onClick={() => onSelect(isActive ? null : p.id)}
          >
            <span style={styles.icon}>{p.icon}</span>
            {isActive && <span style={styles.activeBar} />}
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    width: 44,
    minWidth: 44,
    height: "100%",
    background: "var(--bg-chrome)",
    borderRight: "1px solid var(--border-chrome)",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    padding: "6px 0",
    gap: 2,
  },
  item: {
    position: "relative",
    background: "none",
    border: "none",
    color: "var(--text-icon-muted)",
    padding: "8px 0",
    cursor: "pointer",
    fontSize: "var(--ui-icon-size, 18px)",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
  },
  itemActive: {
    color: "var(--text-primary)",
  },
  icon: {
    width: 24,
    height: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  activeBar: {
    position: "absolute",
    left: 0,
    top: 4,
    bottom: 4,
    width: 2,
    background: "var(--accent-strong)",
  },
};
