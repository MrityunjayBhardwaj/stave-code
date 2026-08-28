"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * SidePanel — the single owner of the left panel's width.
 *
 * The width of the region between the activity bar and the editor is ONE
 * concern, and it belongs to the REGION, not to whichever panel happens to be
 * rendering inside it. Before this existed the width lived in four modules
 * with four different values (#1367): FileTree carried a draggable 160–600,
 * StaveApp's `panelRoot` hardcoded 240 for Search and Version History,
 * AssetLibraryPanel 260, ConsolePanel 360. Only Explorer had a resize handle,
 * so dragging the edge changed one fifth of the UI and every other tab snapped
 * back to a number the user never chose.
 *
 * Hoisting it here makes switching tabs swap only the CONTENT. Panels render
 * at `width: 100%` and say nothing about how wide they are.
 *
 * The persisted key is unchanged (`stave:sidebar-width`) so a width someone
 * already dragged into place survives the change — it simply starts applying
 * to every tab instead of one.
 */

const MIN_WIDTH = 160;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 240;
const STORAGE_KEY = "stave:sidebar-width";
// Pulling the edge further left than half the minimum width folds the panel
// shut visually but KEEPS THE DRAG RUNNING, so pulling back past the threshold
// within the same gesture re-expands it. Only on mouseup, with the intent still
// active, does the collapse commit. The RAW (unclamped) cursor offset drives
// this — the clamped width plateaus at MIN_WIDTH and would never cross back.
const COLLAPSE_THRESHOLD = Math.floor(MIN_WIDTH / 2); // 80px

interface SidePanelProps {
  /** Fires when a drag-to-collapse gesture commits on mouseup. */
  onCollapse: () => void;
  children: React.ReactNode;
}

export function SidePanel({ onCollapse, children }: SidePanelProps) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? parseInt(saved, 10) : NaN;
    if (Number.isFinite(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
      return parsed;
    }
    return DEFAULT_WIDTH;
  });

  // Persist, debounced by a frame so a drag writes once per paint rather than
  // once per mousemove.
  const persistTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (persistTimerRef.current !== null) cancelAnimationFrame(persistTimerRef.current);
    persistTimerRef.current = requestAnimationFrame(() => {
      try { window.localStorage.setItem(STORAGE_KEY, String(width)); } catch { /* ignore quota */ }
    });
    return () => {
      if (persistTimerRef.current !== null) cancelAnimationFrame(persistTimerRef.current);
    };
  }, [width]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState(false);
  const [resizeHover, setResizeHover] = useState(false);
  const [pendingCollapse, setPendingCollapse] = useState(false);

  // Mirror the collapse intent into a ref so the mouseup handler inside the
  // stable effect below reads the latest value without `pendingCollapse` being
  // an effect dep — which would re-subscribe the window listeners on every
  // threshold crossing, mid-drag.
  const pendingCollapseRef = useRef(false);
  useEffect(() => { pendingCollapseRef.current = pendingCollapse; }, [pendingCollapse]);

  // `onCollapse` likewise goes through a ref: the effect must not re-subscribe
  // just because the parent handed down a new closure on re-render.
  const onCollapseRef = useRef(onCollapse);
  useEffect(() => { onCollapseRef.current = onCollapse; }, [onCollapse]);

  // Track the mouse on the WINDOW during a drag — the pointer routinely leaves
  // the 5px handle, and React events on the handle alone would drop the gesture.
  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const raw = e.clientX - rect.left;
      if (raw < COLLAPSE_THRESHOLD) {
        setPendingCollapse(true);
        return;
      }
      setPendingCollapse(false);
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, raw)));
    };
    const handleUp = () => {
      setResizing(false);
      if (pendingCollapseRef.current) {
        setPendingCollapse(false);
        onCollapseRef.current();
      }
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = "";
    };
  }, [resizing]);

  // While the collapse intent is live the panel folds to zero width but stays
  // MOUNTED, which is what lets the same gesture uncommit it.
  const renderedWidth = pendingCollapse ? 0 : width;

  return (
    <div
      ref={containerRef}
      data-side-panel
      style={{
        ...styles.root,
        width: renderedWidth,
        minWidth: renderedWidth,
        overflow: pendingCollapse ? "hidden" : undefined,
      }}
    >
      <div style={styles.content}>{children}</div>

      {/* Resize handle — a 5px strip on the right edge. Hover previews the
          accent at reduced intensity; dragging shows it fully. */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setResizing(true); }}
        onMouseEnter={() => setResizeHover(true)}
        onMouseLeave={() => setResizeHover(false)}
        style={{
          ...styles.resizeHandle,
          ...(resizing
            ? styles.resizeHandleActive
            : resizeHover
              ? styles.resizeHandleHover
              : {}),
        }}
        title="Drag to resize sidebar"
        aria-label="Resize sidebar"
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    // width + minWidth are set dynamically above.
    height: "100%",
    display: "flex",
    position: "relative" as const,
    zIndex: 1,
  },
  content: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column" as const,
  },
  resizeHandle: {
    position: "absolute" as const,
    top: 0,
    right: -2,
    width: 5,
    height: "100%",
    cursor: "col-resize",
    zIndex: 10,
    background: "transparent",
    transition: "background 260ms ease-out",
  },
  resizeHandleHover: {
    background: "color-mix(in srgb, var(--accent-strong) 45%, transparent)",
  },
  resizeHandleActive: {
    background: "var(--accent-strong)",
    transition: "background 80ms ease-out",
  },
};
