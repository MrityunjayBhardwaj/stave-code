"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  VizPresetStore,
  type CropRegion,
  type VizPreset,
} from "@stave/editor";
import { showToast } from "../dialogs/host";

interface CropPopupProps {
  vizId: string;
  presetId: string;
  onClose: () => void;
}

const PREVIEW_W = 640;
const PREVIEW_H = 400;

/**
 * Overlay popup with a live viz preview and a draggable/resizable crop
 * visor. The user adjusts the crop region, then clicks Save to persist
 * it to VizPreset.cropRegion. The inline viz picks it up on next
 * remount (via the namedVizRegistry change listener).
 */
export function CropPopup({ vizId, presetId, onClose }: CropPopupProps) {
  const [preset, setPreset] = useState<VizPreset | null>(null);
  const [crop, setCrop] = useState<CropRegion>({ x: 0, y: 0, w: 1, h: 1 });
  const [dragging, setDragging] = useState<
    | { kind: "move"; startX: number; startY: number; origCrop: CropRegion }
    | { kind: "resize"; edge: string; startX: number; startY: number; origCrop: CropRegion }
    | null
  >(null);

  // Load preset on mount
  useEffect(() => {
    VizPresetStore.get(presetId).then((p) => {
      if (p) {
        setPreset(p);
        if (p.cropRegion) setCrop(p.cropRegion);
      }
    });
  }, [presetId]);

  const handleSave = useCallback(async () => {
    if (!preset) return;
    const updated = { ...preset, cropRegion: crop, updatedAt: Date.now() };
    await VizPresetStore.put(updated);
    showToast(`Crop saved for "${vizId}"`, "info");
    onClose();
  }, [preset, crop, vizId, onClose]);

  const handleReset = useCallback(async () => {
    if (!preset) return;
    const { cropRegion: _, ...rest } = preset;
    const updated = { ...rest, updatedAt: Date.now() } as VizPreset;
    await VizPresetStore.put(updated);
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
    showToast(`Crop cleared for "${vizId}"`, "info");
  }, [preset, vizId]);

  // Drag handlers (move + edge resize)
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, kind: "move" | "resize", edge = "") => {
      e.preventDefault();
      e.stopPropagation();
      setDragging({ kind, edge, startX: e.clientX, startY: e.clientY, origCrop: { ...crop } } as any);
    },
    [crop],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragging.startX) / PREVIEW_W;
      const dy = (e.clientY - dragging.startY) / PREVIEW_H;
      const orig = dragging.origCrop;

      if (dragging.kind === "move") {
        setCrop({
          x: Math.max(0, Math.min(1 - orig.w, orig.x + dx)),
          y: Math.max(0, Math.min(1 - orig.h, orig.y + dy)),
          w: orig.w,
          h: orig.h,
        });
      } else if (dragging.kind === "resize") {
        const edge = (dragging as any).edge as string;
        let { x, y, w, h } = orig;
        if (edge.includes("e")) { w = Math.max(0.05, Math.min(1 - x, w + dx)); }
        if (edge.includes("w")) { x = Math.max(0, Math.min(x + w - 0.05, x + dx)); w = orig.x + orig.w - x; }
        if (edge.includes("s")) { h = Math.max(0.05, Math.min(1 - y, h + dy)); }
        if (edge.includes("n")) { y = Math.max(0, Math.min(y + h - 0.05, y + dy)); h = orig.y + orig.h - y; }
        setCrop({ x, y, w, h });
      }
    };
    const handleUp = () => setDragging(null);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  if (!preset) return null;

  const visorStyle: React.CSSProperties = {
    position: "absolute",
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
    border: "2px solid var(--accent-strong, #7c7cff)",
    boxSizing: "border-box",
    cursor: "move",
    background: "transparent",
    zIndex: 2,
  };

  const dimStyle = (area: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    background: "rgba(0,0,0,0.55)",
    pointerEvents: "none",
    zIndex: 1,
    ...area,
  });

  // Resize handles on edges
  const edgeHandle = (edge: string, style: React.CSSProperties): React.ReactElement => (
    <div
      key={edge}
      style={{
        position: "absolute",
        zIndex: 3,
        ...style,
      }}
      onMouseDown={(e) => handleMouseDown(e, "resize", edge)}
    />
  );

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>Crop — {vizId}</div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div style={styles.body}>
          {/* Preview area with crop visor overlay */}
          <div
            ref={overlayRef}
            style={{
              position: "relative",
              width: PREVIEW_W,
              height: PREVIEW_H,
              background: "var(--bg-input, #0f0f1e)",
              borderRadius: 4,
              overflow: "hidden",
              border: "1px solid var(--border-strong, #3a3a5a)",
            }}
          >
            {/* Placeholder for viz canvas — shows a checkerboard pattern */}
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: "repeating-conic-gradient(var(--bg-hover) 0% 25%, transparent 0% 50%)",
              backgroundSize: "20px 20px",
              opacity: 0.3,
            }} />

            {/* Dim areas outside crop */}
            <div style={dimStyle({ top: 0, left: 0, right: 0, height: `${crop.y * 100}%` })} />
            <div style={dimStyle({ bottom: 0, left: 0, right: 0, height: `${Math.max(0, (1 - crop.y - crop.h)) * 100}%` })} />
            <div style={dimStyle({ top: `${crop.y * 100}%`, left: 0, width: `${crop.x * 100}%`, height: `${crop.h * 100}%` })} />
            <div style={dimStyle({ top: `${crop.y * 100}%`, right: 0, width: `${Math.max(0, (1 - crop.x - crop.w)) * 100}%`, height: `${crop.h * 100}%` })} />

            {/* Crop visor */}
            <div
              style={visorStyle}
              onMouseDown={(e) => handleMouseDown(e, "move")}
            >
              {/* Corner + edge resize handles */}
              {edgeHandle("nw", { top: -4, left: -4, width: 8, height: 8, cursor: "nw-resize" })}
              {edgeHandle("ne", { top: -4, right: -4, width: 8, height: 8, cursor: "ne-resize" })}
              {edgeHandle("sw", { bottom: -4, left: -4, width: 8, height: 8, cursor: "sw-resize" })}
              {edgeHandle("se", { bottom: -4, right: -4, width: 8, height: 8, cursor: "se-resize" })}
              {edgeHandle("n", { top: -3, left: "10%", right: "10%", height: 6, cursor: "n-resize" })}
              {edgeHandle("s", { bottom: -3, left: "10%", right: "10%", height: 6, cursor: "s-resize" })}
              {edgeHandle("w", { left: -3, top: "10%", bottom: "10%", width: 6, cursor: "w-resize" })}
              {edgeHandle("e", { right: -3, top: "10%", bottom: "10%", width: 6, cursor: "e-resize" })}
            </div>
          </div>

          {/* Crop info */}
          <div style={styles.info}>
            <span>x: {(crop.x * 100).toFixed(0)}%</span>
            <span>y: {(crop.y * 100).toFixed(0)}%</span>
            <span>w: {(crop.w * 100).toFixed(0)}%</span>
            <span>h: {(crop.h * 100).toFixed(0)}%</span>
          </div>
        </div>

        <div style={styles.footer}>
          <button style={styles.resetBtn} onClick={handleReset}>Reset</button>
          <button style={styles.saveBtn} onClick={handleSave}>Save Crop</button>
        </div>
      </div>
    </div>
  );
}

// ── dimStyle is used inline above as a function; the static "dim"
//    elements are generated imperatively. This helper just returns JSX
//    for the four dimming divs. ──

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0, background: "var(--bg-overlay)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 25000, fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
    borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
    display: "flex", flexDirection: "column", maxWidth: "95vw", maxHeight: "95vh",
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
  body: {
    padding: 16, display: "flex", flexDirection: "column", gap: 12,
    alignItems: "center",
  },
  info: {
    display: "flex", gap: 16, fontSize: 11, color: "var(--text-tertiary)",
    fontFamily: '"JetBrains Mono", monospace',
  },
  footer: {
    display: "flex", justifyContent: "flex-end", gap: 8,
    padding: "12px 16px", borderTop: "1px solid var(--border-subtle)",
  },
  resetBtn: {
    background: "none", border: "1px solid var(--border-strong)",
    borderRadius: 4, color: "var(--text-chrome)", padding: "6px 14px",
    fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  },
  saveBtn: {
    background: "var(--accent)", border: "1px solid var(--accent)",
    borderRadius: 4, color: "#fff", padding: "6px 14px",
    fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
  },
};
