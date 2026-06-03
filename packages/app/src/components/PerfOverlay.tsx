"use client";

/**
 * PerfOverlay — live performance HUD for the profiler (issue #228).
 *
 * Subscribes to the perf-enabled setting; when on, polls `perf.snapshot()` at a
 * fixed low rate (5Hz — cheap, and the overlay must not itself dominate the
 * frame budget it's measuring) and renders a compact fixed panel: per-instance
 * FPS / frame p95 / drops, per-section ms (p50·p95), long-task count+max, live
 * viz-instance counts, and trigger throughput.
 *
 * Renders NOTHING when profiling is disabled (the default) — zero cost in
 * normal use. Toggle from Settings → Performance overlay, the Alt+P shortcut
 * (wired in StaveApp), or `window.__stavePerf.setEnabled(true)`.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  perf,
  getPerfEnabled,
  setPerfEnabled,
  onPerfEnabledChange,
  type PerfSnapshot,
} from "@stave/editor";

const REFRESH_MS = 200; // 5Hz

function ms(n: number): string {
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0);
}

export function PerfOverlay() {
  // Subscribe to the perf-enabled external store (reflects Alt+P / settings /
  // window.__stavePerf toggles). useSyncExternalStore is the idiomatic, lint-
  // clean way to mirror an external store into render — no setState-in-effect.
  const enabled = useSyncExternalStore(
    (cb) => onPerfEnabledChange(cb),
    () => getPerfEnabled(),
    () => false, // SSR snapshot — never enabled on the server
  );

  const [snap, setSnap] = useState<PerfSnapshot | null>(null);

  // Poll the snapshot only while enabled. setState lives in the timer callback
  // (not the effect body), so it doesn't trigger cascading renders. The first
  // sample appears after one REFRESH_MS tick; until then render is gated below.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setSnap(perf.snapshot()), REFRESH_MS);
    return () => clearInterval(id);
  }, [enabled]);

  // When disabled we render nothing regardless of any stale snapshot.
  if (!enabled || !snap) return null;

  const frameIds = Object.keys(snap.frames).sort();
  const sectionNames = Object.keys(snap.sections).sort();
  const triggers = snap.counters["audio.triggers"] ?? 0;
  const triggerRate =
    snap.uptimeMs > 0 ? (triggers / snap.uptimeMs) * 1000 : 0;
  const p5n = snap.gauges["viz.p5"] ?? 0;
  const hydraN = snap.gauges["viz.hydra"] ?? 0;

  return (
    <div style={styles.panel} role="status" aria-label="Performance overlay">
      <div style={styles.header}>
        <span>⚡ perf</span>
        <button
          type="button"
          onClick={() => setPerfEnabled(false)}
          style={styles.close}
          aria-label="Close performance overlay"
          title="Close (Alt+P)"
        >
          ×
        </button>
      </div>

      <div style={styles.row}>
        <span style={styles.k}>viz</span>
        <span style={styles.v}>
          p5 {p5n} · hydra {hydraN}
        </span>
      </div>
      <div style={styles.row}>
        <span style={styles.k}>triggers</span>
        <span style={styles.v}>
          {triggers} ({triggerRate.toFixed(1)}/s)
        </span>
      </div>
      <div style={styles.row}>
        <span style={styles.k}>longtask</span>
        <span style={snap.longtasks.count > 0 ? styles.vWarn : styles.v}>
          {snap.longtasks.count} · max {ms(snap.longtasks.maxMs)}ms
        </span>
      </div>

      {frameIds.length > 0 && <div style={styles.sub}>frames (fps · p95 · drop)</div>}
      {frameIds.map((id) => {
        const f = snap.frames[id];
        return (
          <div key={id} style={styles.row}>
            <span style={styles.k}>{id}</span>
            <span style={f.fps < 50 ? styles.vWarn : styles.v}>
              {f.fps.toFixed(0)} · {ms(f.p95)}ms · {f.drops}
            </span>
          </div>
        );
      })}

      {sectionNames.length > 0 && <div style={styles.sub}>sections (p50 · p95 ms)</div>}
      {sectionNames.map((name) => {
        const s = snap.sections[name];
        return (
          <div key={name} style={styles.row}>
            <span style={styles.k}>{name}</span>
            <span style={styles.v}>
              {ms(s.p50)} · {ms(s.p95)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const mono =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: "fixed",
    top: 8,
    right: 8,
    zIndex: 99999,
    minWidth: 190,
    maxWidth: 280,
    padding: "6px 8px",
    background: "rgba(12,14,18,0.86)",
    color: "#d8dee9",
    font: `11px/1.5 ${mono}`,
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    backdropFilter: "blur(4px)",
    pointerEvents: "auto",
    userSelect: "none",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontWeight: 600,
    marginBottom: 4,
    color: "#ffd479",
  },
  close: {
    background: "none",
    border: "none",
    color: "#9aa5b1",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
    padding: "0 2px",
  },
  sub: {
    marginTop: 5,
    marginBottom: 1,
    color: "#7a8694",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: { display: "flex", justifyContent: "space-between", gap: 10 },
  k: { color: "#9aa5b1", whiteSpace: "nowrap" },
  v: { color: "#d8dee9", textAlign: "right", whiteSpace: "nowrap" },
  vWarn: { color: "#ff6b6b", textAlign: "right", whiteSpace: "nowrap" },
};
