"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  VizPresetStore,
  compilePreset,
  mountVizRenderer,
  workspaceAudioBus,
  setZoneCropOverride,
  getZoneCropOverride,
  type CropRegion,
  type VizPreset,
  type VizRenderer,
} from "@stave/editor";
import { showToast } from "../dialogs/host";

interface CropPopupProps {
  vizId: string;
  presetId: string;
  /** File id of the editor tab that owns this zone — override key part 1. */
  fileId: string;
  /** Per-$:-block identifier — override key part 2. Same as the engine's
   *  trackKey (vizRequests / trackSchedulers / trackAnalysers). */
  trackKey: string;
  onClose: () => void;
}

const PREVIEW_W = 640;
const PREVIEW_H = 400;

export function CropPopup({ vizId, presetId, fileId, trackKey, onClose }: CropPopupProps) {
  const [preset, setPreset] = useState<VizPreset | null>(null);
  const [crop, setCrop] = useState<CropRegion>(() => {
    // Seed from the per-instance override so the popup opens on the same
    // crop the inline zone is currently showing — not the preset default,
    // which may be different (or shared across sibling instances).
    const override = getZoneCropOverride(fileId, trackKey);
    return override ?? { x: 0, y: 0, w: 1, h: 1 };
  });
  const [dragging, setDragging] = useState<
    | { kind: "move"; startX: number; startY: number; origCrop: CropRegion }
    | { kind: "resize"; edge: string; startX: number; startY: number; origCrop: CropRegion }
    | null
  >(null);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<{ renderer: VizRenderer; disconnect: () => void } | null>(null);

  // Load preset on mount. Do NOT seed `crop` from preset.cropRegion — that's
  // a per-preset legacy default; the per-instance override (seeded above) is
  // the source of truth for this zone. Only use the preset to compile the
  // renderer for the preview canvas.
  useEffect(() => {
    VizPresetStore.get(presetId).then((p) => {
      if (p) setPreset(p);
    });
  }, [presetId]);

  // Mount the live viz renderer once the preset is loaded
  useEffect(() => {
    if (!preset || !canvasContainerRef.current) return;

    let descriptor;
    try {
      descriptor = compilePreset(preset);
    } catch {
      return; // compile error — show placeholder only
    }

    // Pin to the file that owns the zone being cropped, not the default
    // (most-recent) publisher — otherwise the popup reacts to whichever file
    // published most recently, which may not be this zone's file.
    let unsub: (() => void) | null = null;
    let mounted = false;

    unsub = workspaceAudioBus.subscribe(
      { kind: "file", fileId },
      (payload) => {
        if (mounted || !canvasContainerRef.current) return;
        mounted = true;

        // Narrow engineComponents down to THIS track, mirroring the inline
        // zone's wiring in viewZones.ts: prefer the per-track AnalyserNode /
        // scheduler / hapStream keyed by `trackKey`, fall back to master
        // when no per-track analyser is published (e.g. Sonic Pi today).
        const components = (payload?.engineComponents ?? payload ?? {}) as any;
        const audioCtx = components.audio?.audioCtx;
        const trackAnalyser = components.audio?.trackAnalysers?.get(trackKey);
        const trackStream = components.inlineViz?.trackStreams?.get(trackKey);
        const trackScheduler =
          components.queryable?.trackSchedulers?.get(trackKey) ?? null;

        const zoneAudio = trackAnalyser && audioCtx
          ? {
              analyser: trackAnalyser,
              audioCtx,
              trackAnalysers: components.audio?.trackAnalysers,
            }
          : components.audio;

        const zoneComponents = {
          ...components,
          ...(trackStream ? { streaming: { hapStream: trackStream } } : {}),
          audio: zoneAudio,
          queryable: {
            scheduler: trackScheduler,
            trackSchedulers:
              components.queryable?.trackSchedulers ?? new Map(),
          },
        };

        rendererRef.current = mountVizRenderer(
          canvasContainerRef.current! as HTMLDivElement,
          descriptor.factory,
          zoneComponents,
          { w: PREVIEW_W, h: PREVIEW_H },
          console.error,
        );
        rendererRef.current.renderer.resume?.();
      },
    );

    return () => {
      unsub?.();
      if (rendererRef.current) {
        rendererRef.current.renderer.destroy();
        rendererRef.current.disconnect();
        rendererRef.current = null;
      }
    };
  }, [preset, fileId, trackKey]);

  const handleSave = useCallback(() => {
    // Save the crop as a per-instance override on the WORKSPACE FILE, not on
    // the shared VizPreset. Two $: blocks using the same preset now have
    // independent crops. The file-level subscription in EditorView triggers
    // a zone remount so the inline zone picks up the new crop.
    setZoneCropOverride(fileId, trackKey, crop, vizId);
    showToast(`Crop saved for "${vizId}"`, "info");
    onClose();
  }, [crop, fileId, trackKey, vizId, onClose]);

  const handleReset = useCallback(() => {
    setZoneCropOverride(fileId, trackKey, null);
    setCrop({ x: 0, y: 0, w: 1, h: 1 });
    showToast(`Crop cleared for "${vizId}"`, "info");
  }, [fileId, trackKey, vizId]);

  // Drag handlers
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
        if (edge.includes("e")) w = Math.max(0.05, Math.min(1 - x, w + dx));
        if (edge.includes("w")) { x = Math.max(0, Math.min(x + w - 0.05, x + dx)); w = orig.x + orig.w - x; }
        if (edge.includes("s")) h = Math.max(0.05, Math.min(1 - y, h + dy));
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

  const edgeHandle = (edge: string, style: React.CSSProperties): React.ReactElement => (
    <div
      key={edge}
      style={{ position: "absolute", zIndex: 3, ...style }}
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
          <div
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
            {/* Live viz canvas */}
            <div
              ref={canvasContainerRef}
              style={{
                position: "absolute",
                inset: 0,
                overflow: "hidden",
              }}
            />

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
