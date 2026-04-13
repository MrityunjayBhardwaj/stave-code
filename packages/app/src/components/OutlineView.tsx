"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  getFile,
  subscribeToWorkspaceFile,
  revealLineInFile,
  type WorkspaceFile,
} from "@stave/editor";

interface OutlineViewProps {
  activeFileId: string | null;
  onJump: (fileId: string, line: number) => void;
}

// Re-export so StaveApp can pass a single handler that both opens the
// file (if it's not already the active tab) and reveals the line.
export { revealLineInFile };

interface Symbol {
  name: string;
  kind: string;
  line: number;
}

/**
 * Parse top-level declarations from a file. Lightweight scanner — not a
 * full AST. Tracks bracket/string state so symbols inside string
 * literals, block comments, and nested scopes are skipped. The goal is a
 * navigation aid, not a correctness tool — false positives are fine.
 *
 * Recognises (in JS-ish files):
 *   - export? const/let/var <name> = (multi-line arrow fns → "fn")
 *   - export? async? function* <name>(…)
 *   - export? class <name>
 *   - .viz("name") anywhere in the file
 *   - Strudel `$: name` markers
 *   - export default <expr>  → emits "default"
 */
function extractSymbols(file: WorkspaceFile): Symbol[] {
  const out: Symbol[] = [];
  const lines = file.content.split("\n");
  const lang = file.language;

  const push = (name: string, kind: string, line: number) => {
    if (!name.trim()) return;
    out.push({ name: name.trim(), kind, line });
  };

  // Markdown stays purely line-by-line.
  if (lang === "markdown") {
    for (let i = 0; i < lines.length; i++) {
      const hmatch = /^(#{1,6})\s+(.+)$/.exec(lines[i]);
      if (hmatch) push(hmatch[2], `h${hmatch[1].length}`, i + 1);
    }
    return out;
  }

  // SonicPi: scan only at indentation depth 0 (Ruby-ish) — `live_loop` /
  // `define` / `defonce` blocks at top level are what matters.
  if (lang === "sonicpi") {
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      let m: RegExpExecArray | null;
      m = /^\s*live_loop\s+:(\w+)/.exec(raw);
      if (m) { push(m[1], "loop", i + 1); continue; }
      m = /^\s*define\s+:(\w+)/.exec(raw);
      if (m) { push(m[1], "def", i + 1); continue; }
      m = /^\s*defonce\s+:(\w+)/.exec(raw);
      if (m) { push(m[1], "def", i + 1); continue; }
    }
    return out;
  }

  // ── JS-ish scanner with bracket-depth tracking. ────────────────────
  // Walks the source character by character, tracking:
  //   - block + line comment state
  //   - string literals (', ", `, with `${…}` re-entering code)
  //   - paren / brace / bracket depth
  // For each line, captures the depth AT the start of the line. Symbols
  // are only emitted from depth-0 lines (true top-level).

  const depthAtLineStart: number[] = new Array(lines.length).fill(0);
  let depth = 0;
  let inBlockComment = false;
  // Template-string nesting stack: each entry is the { depth } at which
  // we entered the template; ${…} pushes a code frame onto templateStack.
  const stringStack: Array<'"' | "'" | '`'> = [];
  // Tracks how many `${` interpolations are open inside the current
  // backtick template — when it drops back to 0 and we hit a backtick,
  // we exit the template.
  const interpDepthStack: number[] = [];

  const src = file.content;
  let lineIdx = 0;
  for (let p = 0; p < src.length; p++) {
    if (src[p] === "\n") {
      lineIdx++;
      if (lineIdx < depthAtLineStart.length) depthAtLineStart[lineIdx] = depth;
      continue;
    }
    if (inBlockComment) {
      if (src[p] === "*" && src[p + 1] === "/") { inBlockComment = false; p++; }
      continue;
    }
    const inString = stringStack.length > 0 && interpDepthStack[interpDepthStack.length - 1] === 0;
    if (inString) {
      const top = stringStack[stringStack.length - 1];
      if (src[p] === "\\") { p++; continue; } // skip escaped char
      if (top === "`" && src[p] === "$" && src[p + 1] === "{") {
        // enter interpolation (code frame)
        interpDepthStack[interpDepthStack.length - 1] = 1;
        depth++; p++;
        continue;
      }
      if (src[p] === top) { stringStack.pop(); interpDepthStack.pop(); }
      continue;
    }
    // Code mode
    const c = src[p];
    if (c === "/" && src[p + 1] === "/") {
      // skip to end of line
      while (p < src.length && src[p] !== "\n") p++;
      // Don't consume the newline — outer loop handles line bookkeeping.
      p--;
      continue;
    }
    if (c === "/" && src[p + 1] === "*") { inBlockComment = true; p++; continue; }
    if (c === '"' || c === "'" || c === "`") {
      stringStack.push(c as '"' | "'" | "`");
      interpDepthStack.push(0);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      // If we're inside an interpolation, bump its depth too.
      if (interpDepthStack.length > 0 && stringStack.length > 0) {
        interpDepthStack[interpDepthStack.length - 1]++;
      }
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth = Math.max(0, depth - 1);
      if (interpDepthStack.length > 0 && stringStack.length > 0) {
        const lvl = (interpDepthStack[interpDepthStack.length - 1] -= 1);
        if (lvl <= 0) {
          // exited the interpolation — but only "leave" the template
          // when we hit the closing backtick later.
          interpDepthStack[interpDepthStack.length - 1] = 0;
        }
      }
      continue;
    }
  }

  // Emit symbols from depth-0 lines.
  for (let i = 0; i < lines.length; i++) {
    if (depthAtLineStart[i] !== 0) continue;
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;

    let m: RegExpExecArray | null;

    // export default <Identifier> or default function/class
    m = /^\s*export\s+default\s+(?:async\s+)?function\s*\*?\s*(\w*)/.exec(raw);
    if (m) { push(m[1] || "default", "fn", i + 1); continue; }
    m = /^\s*export\s+default\s+class\s+(\w*)/.exec(raw);
    if (m) { push(m[1] || "default", "def", i + 1); continue; }

    // export? async? function* name(…)
    m = /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s+(\w+)\s*\(/.exec(raw);
    if (m) { push(m[1], "fn", i + 1); continue; }

    // export? class Name
    m = /^\s*(?:export\s+)?class\s+(\w+)/.exec(raw);
    if (m) { push(m[1], "def", i + 1); continue; }

    // export? const/let/var name = …  → "fn" if the value is an arrow
    // (single-line OR continued: scan up to the next depth-0 blank line
    //  for `=>`). Otherwise "var".
    m = /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(.*)$/.exec(raw);
    if (m) {
      const name = m[1];
      const tail = m[2];
      // Look for `=>` on this line or following lines until depth-0 blank.
      let isArrow = /=>/.test(tail);
      if (!isArrow) {
        for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
          if (depthAtLineStart[j] === 0 && lines[j].trim() === "") break;
          if (/=>/.test(lines[j])) { isArrow = true; break; }
          if (depthAtLineStart[j] === 0 && /^\s*(?:export\s+)?(?:const|let|var|function|class)\b/.test(lines[j])) break;
        }
      }
      push(name, isArrow ? "fn" : "var", i + 1);
      continue;
    }

    // Strudel $: name
    m = /^\s*\$:\s*(\w+)/.exec(raw);
    if (m) { push(m[1], "pat", i + 1); continue; }
  }

  // .viz("name") — scan the whole file; skip occurrences inside strings
  // by relying on the depthAtLineStart heuristic (we accept some noise
  // here since .viz strings ARE the symbol name).
  const vizRe = /\.viz\(["']([^"']+)["']\)/g;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    let m: RegExpExecArray | null;
    while ((m = vizRe.exec(raw)) !== null) {
      push(m[1], "viz", i + 1);
    }
  }

  // De-duplicate and sort by line so multi-pass emits don't reorder.
  const seen = new Set<string>();
  return out
    .filter((s) => {
      const key = `${s.line}:${s.kind}:${s.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.line - b.line);
}

export function OutlineView({ activeFileId, onJump }: OutlineViewProps) {
  const [tick, setTick] = useState(0);

  // Re-render on content changes to the active file.
  useEffect(() => {
    if (!activeFileId) return;
    return subscribeToWorkspaceFile(activeFileId, () => setTick((t) => t + 1));
  }, [activeFileId]);

  const file = activeFileId ? getFile(activeFileId) : undefined;
  const symbols = useMemo(() => (file ? extractSymbols(file) : []), [file, tick]);

  if (!activeFileId) {
    return <div style={styles.empty}>No file open</div>;
  }
  if (!file) {
    return <div style={styles.empty}>File not found</div>;
  }
  if (symbols.length === 0) {
    return <div style={styles.empty}>No symbols</div>;
  }

  return (
    <div style={styles.list}>
      {symbols.map((s, i) => (
        <div
          key={`${s.line}-${s.name}-${i}`}
          style={styles.row}
          onClick={() => onJump(activeFileId, s.line)}
          title={`${s.name} (line ${s.line})`}
        >
          <span style={{ ...styles.kind, ...kindStyle(s.kind) }}>{kindBadge(s.kind)}</span>
          <span style={styles.name}>{s.name}</span>
          <span style={styles.line}>:{s.line}</span>
        </div>
      ))}
    </div>
  );
}

function kindBadge(kind: string): string {
  if (kind.startsWith("h")) return "H";
  switch (kind) {
    case "fn": return "ƒ";
    case "var": return "V";
    case "loop": return "∞";
    case "def": return "D";
    case "viz": return "◎";
    case "pat": return "♪";
    default: return "·";
  }
}

function kindStyle(kind: string): React.CSSProperties {
  const colours: Record<string, string> = {
    fn: "#8bd9ff",
    var: "#c0a0ff",
    loop: "#ffc06a",
    def: "#6bff8c",
    viz: "#ffa0ff",
    pat: "#ffda4a",
  };
  const bg = colours[kind] ?? "var(--text-muted)";
  return { color: bg };
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    overflowY: "auto",
    padding: "2px 0",
    flex: 1,
    minHeight: 0,
  },
  empty: {
    padding: 18,
    textAlign: "center",
    color: "var(--text-muted)",
    fontSize: 11,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 12px",
    cursor: "pointer",
    fontSize: 11,
    color: "var(--text-chrome)",
    fontFamily: '"JetBrains Mono", monospace',
  },
  kind: {
    fontSize: 11,
    fontWeight: 700,
    width: 14,
    textAlign: "center" as const,
    flexShrink: 0,
  },
  name: {
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  line: {
    color: "var(--text-muted)",
    fontSize: 10,
  },
};
