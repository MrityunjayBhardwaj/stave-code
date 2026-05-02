/**
 * IR Inspector — observation-only view of the parsed PatternIR + the
 * collected IREvents from the most recent successful Strudel eval.
 *
 * v0 scope: tree (HTML <details>/<summary> nesting) + sortable events
 * table + click-to-source provenance from event.loc. No graph layout,
 * no diff between cycles, no edit-IR-to-recompile.
 *
 * Data source: subscribeIRSnapshot from @stave/editor. The snapshot
 * is republished on every onEvaluateSuccess in StrudelEditorClient.
 */
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  type IRSnapshot,
  type IREvent,
  type PatternIR,
  getIRSnapshot,
  subscribeIRSnapshot,
  revealLineInFile,
} from "@stave/editor";

// ----- Color tokens by IR tag — keep close to the design system -----------

const TAG_COLOR: Record<PatternIR["tag"], string> = {
  Pure:     "var(--ir-pure, #6b7280)",
  Seq:      "var(--ir-seq, #3b82f6)",
  Stack:    "var(--ir-stack, #a855f7)",
  Play:     "var(--ir-play, #10b981)",
  Sleep:    "var(--ir-sleep, #6b7280)",
  Choice:   "var(--ir-choice, #eab308)",
  Every:    "var(--ir-every, #f97316)",
  Cycle:    "var(--ir-cycle, #06b6d4)",
  When:     "var(--ir-when, #14b8a6)",
  FX:       "var(--ir-fx, #ec4899)",
  Ramp:     "var(--ir-ramp, #f97316)",
  Fast:     "var(--ir-fast, #f97316)",
  Slow:     "var(--ir-slow, #f97316)",
  Elongate: "var(--ir-elongate, #d946ef)",
  Loop:     "var(--ir-loop, #6366f1)",
  Code:     "var(--ir-code, #ef4444)",
};

function summarize(node: PatternIR): string {
  switch (node.tag) {
    case "Pure":   return "()";
    case "Play":   return `${JSON.stringify(node.note)} dur=${round(node.duration)}`;
    case "Sleep":  return `dur=${round(node.duration)}`;
    case "Seq":    return `${node.children.length} children`;
    case "Stack":  return `${node.tracks.length} tracks`;
    case "Cycle":  return `${node.items.length} items`;
    case "Choice": return `p=${node.p}`;
    case "Every":  return `n=${node.n}`;
    case "When":   return `gate=${node.gate}`;
    case "FX":     return `${node.name}(${Object.keys(node.params).join(", ")})`;
    case "Ramp":   return `${node.param} ${node.from}→${node.to} over ${node.cycles}c`;
    case "Fast":
    case "Slow":
    case "Elongate":
      return `factor=${node.factor}`;
    case "Loop":   return "";
    case "Code":   return JSON.stringify(node.code).slice(0, 60);
  }
}

function children(node: PatternIR): readonly PatternIR[] {
  switch (node.tag) {
    case "Seq":   return node.children;
    case "Stack": return node.tracks;
    case "Cycle": return node.items;
    case "Choice": return [node.then, node.else_];
    case "Every": return node.default_ ? [node.body, node.default_] : [node.body];
    case "When":  return [node.body];
    case "FX":
    case "Ramp":
    case "Fast":
    case "Slow":
    case "Elongate":
    case "Loop":  return [node.body];
    default:      return [];
  }
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}

// ----- Components ---------------------------------------------------------

function IRNodeRow({ node, depth }: { node: PatternIR; depth: number }): React.ReactElement {
  const kids = children(node);
  const tagColor = TAG_COLOR[node.tag];
  const summary = summarize(node);

  if (kids.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "baseline",
          paddingLeft: depth * 12,
          paddingTop: 2,
          paddingBottom: 2,
        }}
      >
        <span
          style={{
            color: tagColor,
            fontWeight: 600,
            fontSize: "0.85em",
            minWidth: 60,
          }}
        >
          {node.tag}
        </span>
        <span style={{ opacity: 0.75, fontFamily: "var(--font-mono, monospace)", fontSize: "0.85em" }}>
          {summary}
        </span>
      </div>
    );
  }

  return (
    <details open={depth < 2} style={{ paddingLeft: depth * 12 }}>
      <summary style={{ cursor: "pointer", padding: "2px 0", listStyle: "none" }}>
        <span style={{ color: tagColor, fontWeight: 600, fontSize: "0.85em" }}>
          {node.tag}
        </span>
        {summary && (
          <span style={{ opacity: 0.75, fontFamily: "var(--font-mono, monospace)", fontSize: "0.85em", marginLeft: 6 }}>
            {summary}
          </span>
        )}
      </summary>
      {kids.map((c, i) => (
        <IRNodeRow key={i} node={c} depth={depth + 1} />
      ))}
    </details>
  );
}

const MAX_EVENT_ROWS = 200;

function EventsTable({ events, source }: { events: readonly IREvent[]; source?: string }): React.ReactElement {
  const truncated = events.length > MAX_EVENT_ROWS;
  const shown = truncated ? events.slice(0, MAX_EVENT_ROWS) : events;

  const onRowClick = (event: IREvent) => {
    if (!event.loc || event.loc.length === 0 || !source) return;
    // event.loc carries character offsets. revealLineInFile expects a
    // line number, so we don't use it directly — instead we go through
    // the workspace file API: convert offset → line by counting
    // newlines in the source string we cached, then reveal.
    const offset = event.loc[0].start;
    const fileSnap = getIRSnapshot();
    if (!fileSnap) return;
    const line = countLines(fileSnap.code, offset);
    revealLineInFile(source, line);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px 1fr 60px 60px 60px 80px 1fr",
          gap: 6,
          fontSize: "0.8em",
          opacity: 0.7,
          paddingBottom: 4,
          borderBottom: "1px solid var(--panel-border, rgba(128,128,128,0.2))",
        }}
      >
        <span>begin</span>
        <span>note / s</span>
        <span>gain</span>
        <span>vel</span>
        <span>track</span>
        <span>loc</span>
        <span>params</span>
      </div>
      {shown.map((e, i) => (
        <div
          key={i}
          role="button"
          tabIndex={e.loc && e.loc.length > 0 ? 0 : -1}
          onClick={() => onRowClick(e)}
          onKeyDown={(ev) => { if (ev.key === "Enter") onRowClick(e); }}
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 60px 60px 60px 80px 1fr",
            gap: 6,
            fontSize: "0.8em",
            fontFamily: "var(--font-mono, monospace)",
            padding: "2px 0",
            cursor: e.loc && e.loc.length > 0 ? "pointer" : "default",
            opacity: e.loc && e.loc.length > 0 ? 1 : 0.7,
            borderBottom: "1px dashed var(--panel-border, rgba(128,128,128,0.1))",
          }}
          title={e.loc && e.loc.length > 0 ? "Click to jump to source" : "No source location"}
        >
          <span>{round(e.begin)}</span>
          <span>{e.note ?? e.s ?? "·"}</span>
          <span>{round(e.gain)}</span>
          <span>{round(e.velocity)}</span>
          <span>{e.trackId ?? "·"}</span>
          <span>{e.loc && e.loc.length > 0 ? `${e.loc[0].start}-${e.loc[0].end}` : "·"}</span>
          <span style={{ opacity: 0.75 }}>
            {(() => {
              if (!e.params) return "·";
              // Hide keys already shown in dedicated columns — collect.ts
              // mirrors them into params for FX/Ramp overrides, but that's
              // noise in the table. Only the engine-specific extras matter.
              const KNOWN = new Set(["s", "gain", "velocity", "color", "note", "freq"]);
              const extras = Object.keys(e.params).filter(k => !KNOWN.has(k));
              return extras.length > 0 ? extras.join(",") : "·";
            })()}
          </span>
        </div>
      ))}
      {truncated && (
        <div style={{ fontSize: "0.8em", opacity: 0.6, padding: "6px 0" }}>
          (truncated to first {MAX_EVENT_ROWS} of {events.length})
        </div>
      )}
    </div>
  );
}

function countLines(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src.charCodeAt(i) === 0x0a /* \n */) line++;
  }
  return line;
}

// ----- Main panel ---------------------------------------------------------

export function IRInspectorPanel(): React.ReactElement {
  const [snap, setSnap] = useState<IRSnapshot | null>(getIRSnapshot);
  // Persisted by name so the selection survives re-evals when the new
  // snapshot still has that pass. Falls back to the last pass otherwise.
  const [selectedTabName, setSelectedTabName] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    return subscribeIRSnapshot((s) => setSnap(s));
  }, []);

  const ageLabel = useMemo(() => {
    if (!snap) return "";
    const ms = Date.now() - snap.ts;
    if (ms < 1000) return "just now";
    if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
    return `${Math.round(ms / 60_000)}m ago`;
  }, [snap]);

  const selectedIndex = useMemo<number>(() => {
    if (!snap || snap.passes.length === 0) return -1;
    const i = selectedTabName ? snap.passes.findIndex((p) => p.name === selectedTabName) : -1;
    return i >= 0 ? i : snap.passes.length - 1;
  }, [snap, selectedTabName]);

  if (!snap) {
    return (
      <div
        role="region"
        aria-label="IR Inspector"
        style={{
          padding: 16,
          fontSize: "0.9em",
          opacity: 0.7,
          height: "100%",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>IR INSPECTOR</div>
        <div>Run a Strudel pattern to see its IR.</div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="IR Inspector"
      style={{
        padding: 12,
        fontSize: "0.9em",
        height: "100%",
        overflow: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <div style={{ fontWeight: 600 }}>IR INSPECTOR</div>
        <div style={{ fontSize: "0.8em", opacity: 0.6 }}>
          {snap.runtime} · {snap.events.length} events · {ageLabel}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="IR passes"
        data-testid="ir-passes-tablist"
        style={{
          display: "flex",
          gap: 4,
          borderBottom: "1px solid var(--panel-border, rgba(128,128,128,0.2))",
          marginBottom: 6,
        }}
        onKeyDown={(e) => {
          if (snap == null || snap.passes.length === 0) return;
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          const dir = e.key === "ArrowRight" ? 1 : -1;
          const next = (selectedIndex + dir + snap.passes.length) % snap.passes.length;
          setSelectedTabName(snap.passes[next].name);
          tabRefs.current[next]?.focus();
          e.preventDefault();
        }}
      >
        {snap.passes.map((p, i) => (
          <button
            key={p.name}
            ref={(el) => { tabRefs.current[i] = el; }}
            role="tab"
            aria-selected={i === selectedIndex}
            aria-controls="ir-tree-panel"
            tabIndex={i === selectedIndex ? 0 : -1}
            onClick={() => setSelectedTabName(p.name)}
            data-testid={`ir-pass-tab-${p.name}`}
            style={{
              padding: "4px 10px",
              fontSize: "0.85em",
              fontWeight: i === selectedIndex ? 600 : 400,
              background: i === selectedIndex ? "var(--panel-active, rgba(128,128,128,0.15))" : "transparent",
              border: "none",
              borderBottom: i === selectedIndex ? "2px solid var(--accent, #3b82f6)" : "2px solid transparent",
              cursor: "pointer",
              color: "inherit",
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="ir-tree-panel" data-testid="ir-tree-section">
        <details open>
          <summary style={{ cursor: "pointer", fontWeight: 600, padding: "4px 0", opacity: 0.85, listStyle: "none" }}>
            IR tree{snap.passes.length > 1 && selectedIndex >= 0 ? ` · ${snap.passes[selectedIndex].name}` : null}
          </summary>
          <div style={{ paddingLeft: 4 }}>
            {selectedIndex >= 0 && <IRNodeRow node={snap.passes[selectedIndex].ir} depth={0} />}
          </div>
        </details>
      </div>

      <details open data-testid="ir-events-section" style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, padding: "4px 0" }}>
          Events ({snap.events.length})
        </summary>
        <EventsTable events={snap.events} source={snap.source} />
      </details>
    </div>
  );
}
