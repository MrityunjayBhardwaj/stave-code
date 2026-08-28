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

  // Badges — one effect subscribing to every panel that declares one, rather
  // than a hook per panel: the panel list is a runtime registry, so hooks in a
  // loop over it would change in number between renders. The rail knows how to
  // draw a count and nothing about what it counts.
  const [, setBadgeTick] = useState(0);
  useEffect(() => {
    const unsubs = panels
      .filter((p) => p.badge)
      .map((p) => p.badge!.subscribe(() => setBadgeTick((t) => t + 1)));
    return () => { for (const u of unsubs) u(); };
  }, [panels]);

  return (
    <div style={styles.bar} data-activity-bar>
      {panels.map((p) => {
        const isActive = activePanelId === p.id;
        const isHovered = hoveredId === p.id;
        // Render the edge bar always, opacity-transitioned. Active shows
        // full accent; hover previews it at reduced intensity via a CSS
        // transition on opacity for the slow fade-in feel.
        const edgeOpacity = isActive ? 1 : isHovered ? 0.45 : 0;
        // Read live during render — `badgeTick` above is what schedules the
        // re-render, so by the time we get here the value is current.
        const count = p.badge?.get() ?? 0;
        const tone = count > 0 ? p.badge?.tone?.() ?? "danger" : "danger";
        return (
          <button
            key={p.id}
            data-panel-id={p.id}
            style={{ ...styles.item, ...(isActive ? styles.itemActive : {}) }}
            title={(count > 0 ? p.badge?.describe?.() : undefined) ?? p.title}
            aria-label={count > 0 ? `${p.title}, ${count} unread` : p.title}
            onClick={() => {
              const opening = !isActive;
              // Opening the panel is what marks its work as seen.
              if (opening) p.badge?.clear?.();
              onSelect(opening ? p.id : null);
            }}
            onMouseEnter={() => setHoveredId(p.id)}
            onMouseLeave={() => setHoveredId((cur) => (cur === p.id ? null : cur))}
          >
            <span style={styles.icon}>
              <Icon name={p.icon} size="var(--ui-icon-size, 25px)" />
            </span>
            {count > 0 && (
              <span
                data-panel-badge={p.id}
                data-badge-tone={tone}
                // The button above announces the count; this is decoration.
                aria-hidden="true"
                style={{
                  ...styles.badge,
                  ...(tone === "warning" ? styles.badgeWarning : styles.badgeDanger),
                }}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
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
  badge: {
    position: "absolute",
    top: 4,
    right: 5,
    minWidth: 15,
    height: 15,
    padding: "0 3px",
    borderRadius: 8,
    color: "var(--bg-chrome)",
    fontSize: 9,
    fontWeight: 700,
    fontFamily: 'var(--font-mono), ui-monospace, monospace',
    lineHeight: "15px",
    textAlign: "center",
    pointerEvents: "none",
  },
  badgeDanger: {
    background: "var(--danger-fg)",
  },
  badgeWarning: {
    background: "#f59e0b",
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
