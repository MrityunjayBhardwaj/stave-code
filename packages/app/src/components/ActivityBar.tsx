"use client";

import React, { useEffect, useState } from "react";
import { listPanels, subscribeToPanels, type Panel } from "../panels/registry";
import { Icon } from "./Icon";

interface ActivityBarProps {
  activePanelId: string | null;
  onSelect: (id: string | null) => void;
}

export function ActivityBar({ activePanelId, onSelect }: ActivityBarProps) {
  const [tick, setTick] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useEffect(() => subscribeToPanels(() => setTick((t) => t + 1)), []);
  const panels: Panel[] = React.useMemo(() => listPanels(), [tick]);

  return (
    <div style={styles.bar}>
      {panels.map((p) => {
        const isActive = activePanelId === p.id;
        const isHovered = hoveredId === p.id;
        // Render the edge bar always, opacity-transitioned. Active shows
        // full accent; hover previews it at reduced intensity via a CSS
        // transition on opacity for the slow fade-in feel.
        const edgeOpacity = isActive ? 1 : isHovered ? 0.45 : 0;
        return (
          <button
            key={p.id}
            style={{ ...styles.item, ...(isActive ? styles.itemActive : {}) }}
            title={p.title}
            aria-label={p.title}
            onClick={() => onSelect(isActive ? null : p.id)}
            onMouseEnter={() => setHoveredId(p.id)}
            onMouseLeave={() => setHoveredId((cur) => (cur === p.id ? null : cur))}
          >
            <span style={styles.icon}>
              <Icon name={p.icon} size="var(--ui-icon-size, 25px)" />
            </span>
            <span style={{ ...styles.activeBar, opacity: edgeOpacity }} />
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
    fontSize: "var(--ui-icon-size, 25px)",
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
    transition: "opacity 260ms ease-out",
    pointerEvents: "none",
  },
};
