"use client";

import React, { useEffect, useMemo, useState } from "react";
import { listCommands, subscribeToCommands, type Command } from "../../commands/registry";
import { keybindingTokens, getKeybindingFor, setKeybindingOverride } from "../../commands/keybindings";

interface KeyboardShortcutsPanelProps {
  query: string;
}

interface Row {
  cmd: Command;
  binding: string;
}

/**
 * The Keyboard Shortcuts surface (#739) inside the shell pane. Ports the
 * legacy ShortcutsOverlay's search + click-to-rebind capture into the
 * shell's category nav + kb-row styling.
 *
 * Phase A keeps the existing (in-memory) override behaviour so both tabs
 * are functional; Phase B (#743/#744/#745) adds persistence, conflict
 * detection, and read-only "System" rows for editor-owned Monaco keys.
 */
export function KeyboardShortcutsPanel({ query }: KeyboardShortcutsPanelProps) {
  const [, force] = useState(0);
  const tick = () => force((t) => t + 1);
  const [activeCat, setActiveCat] = useState("all");
  const [capturingId, setCapturingId] = useState<string | null>(null);

  useEffect(() => subscribeToCommands(tick), []);

  // Capture: while capturing, the next non-modifier keydown becomes the
  // binding; Escape cancels. Capture-phase + stopPropagation so it never
  // reaches the shell's Escape-to-close handler.
  useEffect(() => {
    if (!capturingId) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setCapturingId(null); return; }
      if (["Control", "Meta", "Shift", "Alt"].includes(e.key)) return;
      const parts: string[] = [];
      if (e.metaKey || e.ctrlKey) parts.push("mod");
      if (e.shiftKey) parts.push("shift");
      if (e.altKey) parts.push("alt");
      parts.push(e.key.toLowerCase());
      setKeybindingOverride(capturingId, parts.join("+"));
      setCapturingId(null);
      tick();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturingId]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // All commands → rows, grouped by category.
  const { categories, byCat } = useMemo(() => {
    const rows: Row[] = listCommands().map((c) => ({ cmd: c, binding: getKeybindingFor(c) ?? "" }));
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const cat = r.cmd.category ?? "Misc";
      const list = map.get(cat) ?? [];
      list.push(r);
      map.set(cat, list);
    }
    const cats = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    return { categories: cats, byCat: map };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const rowMatches = (r: Row): boolean =>
    !q || `${r.cmd.category ?? ""} ${r.cmd.title}`.toLowerCase().includes(q);

  const visibleCats = searching
    ? categories
    : activeCat === "all"
      ? categories
      : categories.filter((c) => c === activeCat);

  const renderChord = (r: Row): React.ReactNode => {
    const capturing = capturingId === r.cmd.id;
    const tokens = r.binding ? keybindingTokens(r.binding) : [];
    return (
      <button
        className={`chord${capturing ? " capturing" : ""}${r.binding ? "" : " unbound"}`}
        data-testid={`chord-${r.cmd.id}`}
        onClick={() => setCapturingId(capturing ? null : r.cmd.id)}
        title={r.binding ? "Click to rebind" : "Click to bind"}
      >
        {capturing ? (
          <kbd>Press keys…</kbd>
        ) : tokens.length ? (
          tokens.map((t, i) => <kbd key={i}>{t}</kbd>)
        ) : (
          <kbd>Add binding</kbd>
        )}
      </button>
    );
  };

  return (
    <>
      <nav className="nav">
        <div className="nav-eyebrow">Commands</div>
        <button
          className="nav-item"
          aria-current={!searching && activeCat === "all"}
          onClick={() => setActiveCat("all")}
        >
          <span>All</span>
          <span className="nav-count">{listCommands().length}</span>
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className="nav-item"
            aria-current={!searching && activeCat === cat}
            onClick={() => setActiveCat(cat)}
          >
            <span>{cat}</span>
            <span className="nav-count">{byCat.get(cat)!.length}</span>
          </button>
        ))}
      </nav>

      <div className="content" tabIndex={-1} data-testid="keys-content">
        {visibleCats.map((cat) => {
          const rows = (byCat.get(cat) ?? []).filter(rowMatches);
          if (rows.length === 0) return null;
          return (
            <section className="grp" key={cat} data-testid={`keys-section-${cat}`}>
              <div className="grp-head"><div className="grp-title">{cat}</div></div>
              {rows.map((r) => (
                <div className="kb-row" key={r.cmd.id}>
                  <div className="kb-cmd"><div className="kb-name">{r.cmd.title}</div></div>
                  <div className="kb-right">
                    {r.binding ? (
                      <button
                        className="kb-reset"
                        title="Reset to default"
                        onClick={() => { setKeybindingOverride(r.cmd.id, null); tick(); }}
                      >
                        ↺
                      </button>
                    ) : null}
                    {renderChord(r)}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
        {visibleCats.every((cat) => (byCat.get(cat) ?? []).filter(rowMatches).length === 0) ? (
          <div className="empty">No shortcuts match “{query}”.</div>
        ) : null}
      </div>
    </>
  );
}
