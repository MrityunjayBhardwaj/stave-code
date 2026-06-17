"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ResizableSidebar — the single owner of the left-panel width.
 *
 * The left panel's width is ONE concern, owned in ONE place, regardless of
 * which tab (Explorer / Search / History / Console / Outline / IR Inspector)
 * is active. Previously each tab carried its own width (FileTree was the only
 * resizable one; everything else hardcoded 240px / 360px) which made resize
 * behaviour tab-dependent (#341). This wrapper hoists width + the resize
 * handle + VS Code-style drag-to-collapse out of the individual panels so the
 * width is genuinely tab-invariant: switching tabs swaps only the content.
 *
 * Width is persisted to localStorage (`stave:sidebar-width`) so it survives
 * refresh, and clamped to a sane min/max to avoid degenerate states.
 */

const MIN_WIDTH = 160;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 240;
const STORAGE_KEY = "stave:sidebar-width";
// Pulling the edge further left than half the minimum width visually folds
// the panel shut but KEEPS the drag running — pulling back past the threshold
// within the same gesture re-expands it. Only on mouseup (still past the
// threshold) do we commit the collapse via onCollapse().
const COLLAPSE_THRESHOLD = Math.floor(MIN_WIDTH / 2); // 80px

interface ResizableSidebarProps {
  /** Called when a drag-to-collapse gesture commits on mouseup. */
  onCollapse: () => void;
  children: React.ReactNode;
}

export function ResizableSidebar({ onCollapse, children }: ResizableSidebarProps) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? parseInt(saved, 10) : NaN;
    if (Number.isFinite(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
      return parsed;
    }
    return DEFAULT_WIDTH;
  });

  // Persist to localStorage (debounced slightly via rAF).
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
  // Mid-drag collapse intent. While true the panel folds to zero width but
  // stays mounted so the window-level drag listeners keep running — that's how
  // the user can pull the edge back past the threshold and "uncollapse" in the
  // same gesture. onCollapse() only fires on mouseup if intent is still active.
  const [pendingCollapse, setPendingCollapse] = useState(false);

  // During a drag, track the mouse globally (the user can drag outside the
  // panel). Window listeners (not React events) keep the drag alive even if
  // the pointer leaves the handle briefly.
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
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, raw));
      setWidth(next);
    };
    const handleUp = () => {
      setResizing(false);
      // pendingCollapse state won't be current inside this synchronous
      // callback — read the latest value from the ref instead.
      if (pendingCollapseRef.current) {
        setPendingCollapse(false);
        onCollapse();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing]);

  // Mirror pendingCollapse into a ref so the mouseup handler inside the stable
  // effect above reads the latest value without re-subscribing window
  // listeners on every threshold crossing.
  const pendingCollapseRef = useRef(false);
  useEffect(() => {
    pendingCollapseRef.current = pendingCollapse;
  }, [pendingCollapse]);

  const renderedWidth = pendingCollapse ? 0 : width;

  return (
    <div
      ref={containerRef}
      data-resizable-sidebar
      style={{
        ...styles.container,
        width: renderedWidth,
        minWidth: renderedWidth,
        overflow: pendingCollapse ? "hidden" : undefined,
      }}
    >
      {children}

      {/* Resize handle — 5px strip on the right edge. Cursor is col-resize;
          mousedown enters resize mode and the window-level listeners (effect
          above) drive the width update. Hover previews the accent at reduced
          intensity; drag shows it fully. */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setResizing(true);
        }}
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
  container: {
    height: "100%",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    // The left panel's background is one concern, owned here (#341) — every
    // tab's content fills this and must NOT set its own bg, or switching tabs
    // would flash a different shade.
    background: "var(--bg-sidebar)",
    borderRight: "1px solid var(--border-subtle)",
    zIndex: 1,
  },
  resizeHandle: {
    position: "absolute",
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
