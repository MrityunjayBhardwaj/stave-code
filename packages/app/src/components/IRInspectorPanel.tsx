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
  type SourceLocation,
  getIRSnapshot,
  subscribeIRSnapshot,
  revealLineInFile,
  setCaptureCapacity,
} from "@stave/editor";
import {
  LOCALSTORAGE_KEY,
  projectedLabel,
  projectedChildren,
} from "./irProjection";
import { IRInspectorTimeline } from "./IRInspectorTimeline";

// Phase 19-08 PR-B — localStorage keys for the timeline UI.
// Convention matches `stave:inspector.irMode` at irProjection.ts:37.
const TIMELINE_COLLAPSED_KEY = "stave:inspector.timeline.collapsed";
const TIMELINE_CAPACITY_KEY = "stave:inspector.timeline.capacity";
const TIMELINE_CAPACITY_DEFAULT = 30;
const TIMELINE_CAPACITY_MIN = 1;
const TIMELINE_CAPACITY_MAX = 500;

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
  // Tier 4 (Phase 19-03) — late/degrade/chunk/ply each get a distinct
  // hue so a debugging user can see at a glance which transform shaped
  // a sub-tree without having to read the tag string.
  Late:     "var(--ir-late, #f59e0b)",
  Degrade:  "var(--ir-degrade, #84cc16)",
  Chunk:    "var(--ir-chunk, #fb7185)",
  Ply:      "var(--ir-ply, #22d3ee)",
  // Tier 4 (Phase 19-04) — Struct/Swing/Pick/Shuffle/Scramble/Chop. Each
  // gets a distinct hue from the existing palette. Struct uses a lighter
  // magenta than Elongate (#d946ef) to avoid color collision; the other
  // five take the planner-suggested hues from RESEARCH §5.
  Struct:   "var(--ir-struct, #e879f9)",
  Swing:    "var(--ir-swing, #a3e635)",
  Pick:     "var(--ir-pick, #34d399)",
  Shuffle:  "var(--ir-shuffle, #fbbf24)",
  Scramble: "var(--ir-scramble, #f87171)",
  Chop:     "var(--ir-chop, #c084fc)",
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
    case "Late":    return `offset=${node.offset}`;
    case "Degrade": return `p=${node.p}`;
    case "Chunk":   return `n=${node.n}`;
    case "Ply":     return `n=${node.n}`;
    case "Struct":   return `mask="${node.mask}"`;
    case "Swing":    return `n=${node.n}`;
    case "Pick":     return `${node.lookup.length} entries`;
    case "Shuffle":  return `n=${node.n}`;
    case "Scramble": return `n=${node.n}`;
    case "Chop":     return `n=${node.n}`;
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
    case "Late":
    case "Degrade":
    case "Ply":
    case "Struct":
    case "Swing":
    case "Shuffle":
    case "Scramble":
    case "Chop":
    case "Loop":  return [node.body];
    case "Chunk": return [node.body, node.transform];
    // Pick is the first IR shape with a list-of-sub-IRs alongside a
    // distinguished selector child — render selector first, then the
    // lookup entries as siblings.
    case "Pick":  return [node.selector, ...node.lookup];
    default:      return [];
  }
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}

// ----- Components ---------------------------------------------------------

/**
 * D-02 hide rule, splicing form. Given a list of children for a parent
 * in projected mode, replace any hidden child (projectedLabel ===
 * undefined) with that child's projected children. Recursive — keeps
 * splicing until the list contains only renderable rows. Mini-notation
 * symbol tags and Code are NOT hidden (their projectedLabel returns a
 * value).
 */
function spliceHiddenChildren(
  kids: readonly PatternIR[],
): readonly PatternIR[] {
  const out: PatternIR[] = [];
  for (const k of kids) {
    if (projectedLabel(k) === undefined) {
      // Recurse on its projected children (transitive hide).
      out.push(...spliceHiddenChildren(projectedChildren(k)));
    } else {
      out.push(k);
    }
  }
  return out;
}

function IRNodeRow({
  node,
  depth,
  irMode,
  highlightedLoc,
}: {
  node: PatternIR;
  depth: number;
  irMode: boolean;
  /**
   * Phase 19-08 PR-B T-12 — when the user steps J/K through a pinned
   * snapshot's events, the panel resolves `events[playheadIndex].loc[0]`
   * and drills it down through this prop. A node whose own
   * `loc[0].start` matches gets the .ir-node-highlight class.
   * `null` means no highlight (live mode or synthetic event without loc
   * — graceful fallback per PV24).
   */
  highlightedLoc?: SourceLocation | null;
}): React.ReactElement | null {
  let label: string;
  let kids: readonly PatternIR[];

  if (irMode) {
    label = node.tag;
    kids = children(node);
  } else {
    const projLabel = projectedLabel(node);
    if (projLabel === undefined) {
      // D-02 hide rule: this node would normally be folded into the parent.
      // The parent's spliceHiddenChildren removes it upstream; if a hidden
      // node DOES reach here (e.g., the root has projectedLabel undefined —
      // possible if a future parser path forgets to set userMethod on a
      // root tag), fall back to the raw tag for visibility.
      label = node.tag;
      kids = spliceHiddenChildren(projectedChildren(node));
    } else {
      label = projLabel;
      kids = spliceHiddenChildren(projectedChildren(node));
    }
  }

  // TAG_COLOR keying remains node.tag — color follows structural identity
  // (a Stack-from-layer is still Stack-purple even when labeled "layer").
  // Label follows projection. RESEARCH Q9 / NEW pre-mortem #9.
  const tagColor = TAG_COLOR[node.tag];
  const summary = summarize(node);

  // Phase 19-08 PR-B T-12 — highlight when the J/K-driven event loc
  // matches this node's primary loc start. PV24 fallback: missing loc
  // on either side is a no-op (no crash; just no highlight).
  const isHighlighted =
    highlightedLoc != null &&
    node.loc != null &&
    node.loc.length > 0 &&
    node.loc[0].start === highlightedLoc.start;
  const highlightClass = isHighlighted ? "ir-node-highlight" : undefined;

  if (kids.length === 0) {
    return (
      <div
        className={highlightClass}
        data-ir-node-highlight={isHighlighted ? "true" : undefined}
        style={{
          display: "flex",
          gap: 6,
          alignItems: "baseline",
          paddingLeft: depth * 12,
          paddingTop: 2,
          paddingBottom: 2,
          ...(isHighlighted
            ? {
                outline: "2px solid var(--accent, #4a9eff)",
                background: "rgba(74, 158, 255, 0.12)",
                borderRadius: 2,
              }
            : null),
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
          {label}
        </span>
        <span style={{ opacity: 0.75, fontFamily: "var(--font-mono, monospace)", fontSize: "0.85em" }}>
          {summary}
        </span>
      </div>
    );
  }

  return (
    <details
      open={depth < 2}
      className={highlightClass}
      data-ir-node-highlight={isHighlighted ? "true" : undefined}
      style={{
        paddingLeft: depth * 12,
        ...(isHighlighted
          ? {
              outline: "2px solid var(--accent, #4a9eff)",
              background: "rgba(74, 158, 255, 0.12)",
              borderRadius: 2,
            }
          : null),
      }}
    >
      <summary style={{ cursor: "pointer", padding: "2px 0", listStyle: "none" }}>
        <span style={{ color: tagColor, fontWeight: 600, fontSize: "0.85em" }}>
          {label}
        </span>
        {summary && (
          <span style={{ opacity: 0.75, fontFamily: "var(--font-mono, monospace)", fontSize: "0.85em", marginLeft: 6 }}>
            {summary}
          </span>
        )}
      </summary>
      {kids.map((c, i) => (
        <IRNodeRow
          key={i}
          node={c}
          depth={depth + 1}
          irMode={irMode}
          highlightedLoc={highlightedLoc}
        />
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
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Phase 19-08 PR-B — pinning state. When pinnedSnapshot is non-null,
  // the four pass-tabs render that snapshot's tree (frozen) while the
  // live publisher continues to feed setSnap(s) in the background.
  // playheadIndex is the J/K event-step cursor (T-12).
  const [pinnedSnapshot, setPinnedSnapshot] = useState<IRSnapshot | null>(null);
  const [playheadIndex, setPlayheadIndex] = useState<number>(0);

  // Phase 19-08 PR-B T-14 — collapsed state for the timeline strip.
  const [timelineCollapsed, setTimelineCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(TIMELINE_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        TIMELINE_COLLAPSED_KEY,
        timelineCollapsed ? "1" : "0",
      );
    } catch {
      // Storage quota / private browsing — skip silently.
    }
  }, [timelineCollapsed]);

  // Phase 19-08 PR-B T-13 — trace-length (capture buffer capacity). The
  // user-configured value persists in localStorage (UI preference per
  // RESEARCH §8 question #2); the buffer entries themselves remain
  // in-memory per CONTEXT D-06.
  const [traceLength, setTraceLength] = useState<number>(() => {
    if (typeof window === "undefined") return TIMELINE_CAPACITY_DEFAULT;
    try {
      const v = window.localStorage.getItem(TIMELINE_CAPACITY_KEY);
      const n = v == null ? TIMELINE_CAPACITY_DEFAULT : Number(v);
      if (!Number.isFinite(n) || n < TIMELINE_CAPACITY_MIN) {
        return TIMELINE_CAPACITY_DEFAULT;
      }
      return Math.min(Math.floor(n), TIMELINE_CAPACITY_MAX);
    } catch {
      return TIMELINE_CAPACITY_DEFAULT;
    }
  });
  useEffect(() => {
    setCaptureCapacity(traceLength);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(TIMELINE_CAPACITY_KEY, String(traceLength));
    } catch {
      // Storage quota / private browsing — skip silently.
    }
  }, [traceLength]);

  // 19-06 (#76) — IR-mode toggle. Default false (projected mode); true
  // shows the raw IR shape for IR developers / power users. Persisted
  // via localStorage (RESEARCH §5.2 colon-prefix convention).
  const [irMode, setIrMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(LOCALSTORAGE_KEY) === "true";
    } catch {
      // Private browsing / disabled storage — default to projected.
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LOCALSTORAGE_KEY, String(irMode));
    } catch {
      // Storage quota / private browsing — skip silently.
    }
  }, [irMode]);

  useEffect(() => {
    // The publisher fires every successful eval REGARDLESS of pin state
    // (CONTEXT D-02 publisher-vs-consumer). The pin gate is purely
    // render-side via `displaySnapshot` below.
    return subscribeIRSnapshot((s) => setSnap(s));
  }, []);

  // Phase 19-08 — display gating. When pinnedSnapshot is set, the four
  // pass-tabs derive from it. Live `snap` continues to update in the
  // background; we just don't read it. PV27 alias contract holds against
  // the captured snapshot's `passes[last].ir` per per-snapshot semantics.
  const displaySnapshot = pinnedSnapshot ?? snap;

  const ageLabel = useMemo(() => {
    if (pinnedSnapshot) {
      const ms = Date.now() - pinnedSnapshot.ts;
      if (ms < 1000) return "pinned · just now";
      if (ms < 60_000) return `pinned · ${Math.round(ms / 1000)}s old`;
      return `pinned · ${Math.round(ms / 60_000)}m old`;
    }
    if (!snap) return "";
    const ms = Date.now() - snap.ts;
    if (ms < 1000) return "just now";
    if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
    return `${Math.round(ms / 60_000)}m ago`;
  }, [snap, pinnedSnapshot]);

  const selectedIndex = useMemo<number>(() => {
    if (!displaySnapshot || displaySnapshot.passes.length === 0) return -1;
    const i = selectedTabName
      ? displaySnapshot.passes.findIndex((p) => p.name === selectedTabName)
      : -1;
    return i >= 0 ? i : displaySnapshot.passes.length - 1;
  }, [displaySnapshot, selectedTabName]);

  // Phase 19-08 PR-B T-11 — ESC unpins. Scoped to the panel ref
  // (RESEARCH §3 step 6 — avoids global keybinding pollution and
  // does not collide with the tab strip's ←/→ at lines 472-480).
  useEffect(() => {
    if (!pinnedSnapshot) return;
    const node = panelRef.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinnedSnapshot(null);
        setPlayheadIndex(0);
      }
    };
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [pinnedSnapshot]);

  // Phase 19-08 PR-B T-12 — J/K event step-through (only when pinned).
  // Walks displaySnapshot.events[] (audible-time order, not tree order
  // per CONTEXT D-03 + PV28). Vim-style J=forward, K=back. Scoped to
  // panelRef so it does NOT collide with the tab strip's ←/→ at
  // lines 472-480 (handled separately on the tablist's onKeyDown).
  // PV18 dep array: explicit list of every value the closure reads
  // — pinnedSnapshot, the event array length (used for clamping),
  // and setPlayheadIndex. P29 stale-closure trap mitigated.
  const eventCount = displaySnapshot?.events.length ?? 0;
  useEffect(() => {
    if (!pinnedSnapshot) return;
    if (eventCount === 0) return;
    const node = panelRef.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "j" && e.key !== "J" && e.key !== "k" && e.key !== "K") return;
      // Don't fight typing in form fields.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      setPlayheadIndex((i) => {
        if (e.key === "j" || e.key === "J") {
          return Math.min(i + 1, eventCount - 1);
        }
        return Math.max(i - 1, 0);
      });
    };
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [pinnedSnapshot, eventCount]);

  // Phase 19-08 PR-B T-12 — derive the highlighted source location
  // from the current playhead index. Null when not pinned, when the
  // playhead is past the events array, or when the indexed event has
  // no `loc` (synthetic event — PV24 fallback).
  const highlightedLoc = useMemo<SourceLocation | null>(() => {
    if (!pinnedSnapshot || !displaySnapshot) return null;
    const evt = displaySnapshot.events[playheadIndex];
    if (!evt || !evt.loc || evt.loc.length === 0) return null;
    return evt.loc[0];
  }, [pinnedSnapshot, displaySnapshot, playheadIndex]);

  if (!displaySnapshot) {
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
      ref={panelRef}
      role="region"
      aria-label="IR Inspector"
      tabIndex={-1}
      style={{
        padding: 12,
        fontSize: "0.9em",
        height: "100%",
        overflow: "auto",
        outline: "none",
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
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontSize: "0.8em", opacity: 0.6 }}>
            {displaySnapshot.runtime} · {displaySnapshot.events.length} events · {ageLabel}
          </div>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: "0.75em",
              opacity: 0.85,
            }}
            title="Capture buffer length (trace) — how many past evals to keep"
          >
            <span style={{ opacity: 0.7 }}>trace</span>
            <input
              type="number"
              min={TIMELINE_CAPACITY_MIN}
              max={TIMELINE_CAPACITY_MAX}
              value={traceLength}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                const clamped = Math.min(
                  Math.max(Math.floor(raw), TIMELINE_CAPACITY_MIN),
                  TIMELINE_CAPACITY_MAX,
                );
                setTraceLength(clamped);
              }}
              data-testid="ir-timeline-capacity-input"
              aria-label="Timeline capacity"
              style={{
                width: "3.5rem",
                padding: "1px 4px",
                fontSize: "0.85em",
                background: "transparent",
                color: "inherit",
                border:
                  "1px solid var(--border-subtle, rgba(128,128,128,0.3))",
                borderRadius: 3,
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setIrMode((v) => !v)}
            title={
              irMode
                ? "Show projected user-method view"
                : "Show raw IR shape (developer view)"
            }
            aria-label={irMode ? "Show projected view" : "Show raw IR view"}
            aria-pressed={irMode}
            data-testid="ir-mode-toggle"
            style={{
              padding: "2px 8px",
              fontSize: "0.75em",
              fontWeight: 600,
              letterSpacing: "0.04em",
              color: irMode ? "#86efac" : "var(--text-tertiary, #888)",
              background: irMode ? "rgba(134,239,172,0.08)" : "transparent",
              border: `1px solid ${
                irMode ? "#86efac" : "var(--border-subtle, rgba(128,128,128,0.3))"
              }`,
              borderRadius: 3,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {irMode ? "raw IR" : "IR"}
          </button>
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
          if (displaySnapshot == null || displaySnapshot.passes.length === 0) return;
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          const dir = e.key === "ArrowRight" ? 1 : -1;
          const next =
            (selectedIndex + dir + displaySnapshot.passes.length) %
            displaySnapshot.passes.length;
          setSelectedTabName(displaySnapshot.passes[next].name);
          tabRefs.current[next]?.focus();
          e.preventDefault();
        }}
      >
        {displaySnapshot.passes.map((p, i) => (
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
            IR tree{displaySnapshot.passes.length > 1 && selectedIndex >= 0 ? ` · ${displaySnapshot.passes[selectedIndex].name}` : null}
          </summary>
          <div style={{ paddingLeft: 4 }}>
            {selectedIndex >= 0 && (
              <IRNodeRow
                node={displaySnapshot.passes[selectedIndex].ir}
                depth={0}
                irMode={irMode}
                highlightedLoc={highlightedLoc}
              />
            )}
          </div>
        </details>
      </div>

      <details open data-testid="ir-events-section" style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, padding: "4px 0" }}>
          Events ({displaySnapshot.events.length})
        </summary>
        <EventsTable events={displaySnapshot.events} source={displaySnapshot.source} />
      </details>

      <IRInspectorTimeline
        pinnedSnapshot={pinnedSnapshot}
        onPin={(s) => {
          setPinnedSnapshot(s);
          setPlayheadIndex(0);
        }}
        onUnpin={() => {
          setPinnedSnapshot(null);
          setPlayheadIndex(0);
        }}
        collapsed={timelineCollapsed}
        onToggleCollapsed={setTimelineCollapsed}
      />
    </div>
  );
}
