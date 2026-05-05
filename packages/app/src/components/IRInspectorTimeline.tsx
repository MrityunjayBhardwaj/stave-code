/**
 * IRInspectorTimeline — horizontal capture-and-scrub strip rendered
 * below the events table inside IRInspectorPanel.
 *
 * Each captured IRSnapshot in the timelineCapture ring buffer becomes
 * one tick. The most recent capture lives at the right edge (live).
 * Clicking a tick pins that snapshot's reference; the panel's four
 * pass-tabs then render the pinned snapshot via `displaySnapshot =
 * pinnedSnapshot ?? snap` (T-11).
 *
 * Pin-by-reference contract (RESEARCH §7 trap #5):
 *   `onPin(entry.snapshot)` passes the SNAPSHOT REFERENCE, never the
 *   buffer index. FIFO eviction therefore does not invalidate the
 *   pin — React keeps the snapshot alive as long as the panel state
 *   holds it. When the pinned reference is no longer in the live
 *   buffer (eviction case), a ghost marker surfaces at the left edge
 *   so the user is told the pin is "off-strip" rather than silently
 *   showing an unrelated tick.
 *
 * J/K keyboard step-through is wired in T-12 from the panel; the
 * timeline's container is the recommended scope (avoids the tab
 * strip's existing ←/→ binding at IRInspectorPanel.tsx:472-480).
 *
 * Phase 19-08 PR-B T-10. CONTEXT D-02 + D-07. RESEARCH §3 + §7.
 */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  type IRSnapshot,
  type TimelineCaptureEntry,
  getCaptureBuffer,
  subscribeCapture,
} from "@stave/editor";

export type IRInspectorTimelineProps = {
  pinnedSnapshot: IRSnapshot | null;
  onPin: (snap: IRSnapshot) => void;
  onUnpin: () => void;
  collapsed: boolean;
  onToggleCollapsed: (next: boolean) => void;
};

/**
 * Subscribe to the capture buffer; force a re-render on every push
 * (or capacity clamp / clear) by bumping a version counter. Mirrors
 * the existing useState-based subscribe pattern used by
 * IRInspectorPanel for the live snapshot.
 *
 * IMPORTANT — buffer reference stability trap:
 * `getCaptureBuffer()` returns the LIVE internal array reference
 * (timelineCapture.ts:88-90). FIFO eviction (`entries.shift()`) mutates
 * that array in place — same reference, fewer elements. If we returned
 * `getCaptureBuffer()` directly, downstream `useMemo([entries, ...])`
 * would skip recomputation because `entries` would be referentially
 * stable across pushes and the cached value (e.g. `pinnedInBuffer`)
 * would go stale.
 *
 * Slicing here forces a FRESH array reference per call. Cost: one
 * O(n) copy per render with n ≤ 500 (capacity max) — negligible.
 * Benefit: every dependent useMemo recomputes when the buffer
 * changes shape, including evictions of pinned references (probe
 * (g) ghost marker).
 */
function useCaptureBuffer(): readonly TimelineCaptureEntry[] {
  const [, setVersion] = useState<number>(0);
  useEffect(() => {
    return subscribeCapture(() => {
      setVersion((v) => v + 1);
    });
  }, []);
  return [...getCaptureBuffer()];
}

function formatTooltip(entry: TimelineCaptureEntry, isLive: boolean): string {
  const iso = new Date(entry.ts).toISOString();
  const cyc = entry.cycleCount;
  const cycSuffix = cyc != null ? ` · cycle ${cyc.toFixed(3)}` : "";
  const liveSuffix = isLive ? " (live)" : "";
  return `${iso}${cycSuffix}${liveSuffix}`;
}

export function IRInspectorTimeline({
  pinnedSnapshot,
  onPin,
  onUnpin,
  collapsed,
  onToggleCollapsed,
}: IRInspectorTimelineProps): React.ReactElement {
  const entries = useCaptureBuffer();

  // Pin-by-reference: scan the live buffer for an entry that points
  // at the same snapshot ref the panel currently has pinned.
  const pinnedInBuffer = useMemo<boolean>(() => {
    if (!pinnedSnapshot) return false;
    for (const e of entries) {
      if (e.snapshot === pinnedSnapshot) return true;
    }
    return false;
  }, [entries, pinnedSnapshot]);

  const showGhost = pinnedSnapshot != null && !pinnedInBuffer;

  return (
    <div
      role="region"
      aria-label="IR Inspector timeline"
      data-testid="ir-inspector-timeline"
      tabIndex={0}
      style={{
        marginTop: 12,
        border: "1px solid var(--panel-border, rgba(128,128,128,0.2))",
        borderRadius: 4,
        outline: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "4px 8px",
          fontSize: "0.8em",
          opacity: 0.85,
        }}
      >
        <button
          type="button"
          onClick={() => onToggleCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand timeline" : "Collapse timeline"}
          data-testid="ir-timeline-collapse-toggle"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 4px",
            fontSize: "inherit",
            fontWeight: 600,
          }}
        >
          <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
          <span>Timeline</span>
          <span style={{ opacity: 0.6, fontWeight: 400 }}>
            ({entries.length})
          </span>
        </button>
        {pinnedSnapshot != null && (
          <button
            type="button"
            onClick={onUnpin}
            data-testid="ir-timeline-unpin"
            title="Return to live (ESC)"
            style={{
              padding: "2px 8px",
              fontSize: "0.85em",
              fontWeight: 600,
              background: "rgba(134,239,172,0.08)",
              color: "#86efac",
              border: "1px solid #86efac",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Unpin
          </button>
        )}
      </div>
      {!collapsed && (
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 2,
            padding: "6px 8px",
            overflowX: "auto",
            minHeight: 36,
          }}
        >
          {showGhost && (
            <div
              data-testid="ir-timeline-ghost"
              title="Pinned snapshot evicted from history; viewing cached reference."
              aria-label="Pinned snapshot off-strip"
              style={{
                width: 6,
                minWidth: 6,
                height: 24,
                borderRadius: 2,
                border: "1px dashed #86efac",
                background: "rgba(134,239,172,0.05)",
                marginRight: 4,
              }}
            />
          )}
          {entries.length === 0 ? (
            <div style={{ opacity: 0.5, fontSize: "0.8em" }}>
              No captures yet — eval a pattern to populate the timeline.
            </div>
          ) : (
            entries.map((entry, i) => {
              const isLive = i === entries.length - 1;
              const isPinned =
                pinnedSnapshot != null && entry.snapshot === pinnedSnapshot;
              return (
                <button
                  key={i}
                  type="button"
                  data-testid={`ir-timeline-tick-${i}`}
                  data-pinned={isPinned ? "true" : undefined}
                  data-live={isLive ? "true" : undefined}
                  onClick={() => onPin(entry.snapshot)}
                  title={formatTooltip(entry, isLive)}
                  aria-label={`Pin snapshot ${i + 1} of ${entries.length}`}
                  style={{
                    width: 8,
                    minWidth: 8,
                    height: 24,
                    padding: 0,
                    borderRadius: 2,
                    border: isPinned
                      ? "2px solid #86efac"
                      : isLive
                      ? "1px solid var(--accent, #3b82f6)"
                      : "1px solid var(--panel-border, rgba(128,128,128,0.3))",
                    background: isPinned
                      ? "rgba(134,239,172,0.25)"
                      : isLive
                      ? "var(--accent, #3b82f6)"
                      : "var(--panel-active, rgba(128,128,128,0.25))",
                    cursor: "pointer",
                  }}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
