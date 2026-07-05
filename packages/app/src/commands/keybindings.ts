/**
 * Keybindings — data-driven.
 *
 * Each command declares its suggested shortcut via Command.keybinding
 * as a chord string: 'mod+n', 'mod+shift+z', 'cmd+k z' (space =
 * two-chord). The dispatcher below matches a KeyboardEvent against
 * those strings.
 *
 * User customization (#743): overrides live in a Map keyed by command id →
 * chord string, PERSISTED to localStorage (`stave:keybindings`) so a rebind
 * survives reload. Writes are write-through + notify subscribers. Persistence
 * lives here in the app package — the editor package must NOT depend on app
 * commands (layering).
 */

import { executeCommand, listCommands, getCommand, type Command } from "./registry";

const STORAGE_KEY = "stave:keybindings";

/** Map of command id → override chord (user customisation). */
const overrides = new Map<string, string>();

type KeybindingListener = () => void;
const keybindingListeners = new Set<KeybindingListener>();

function notifyKeybindings(): void {
  for (const l of keybindingListeners) l();
}

/** Subscribe to override changes (set / reset). Returns an unsubscribe. */
export function subscribeKeybindings(cb: KeybindingListener): () => void {
  keybindingListeners.add(cb);
  return () => { keybindingListeners.delete(cb); };
}

/** SSR-guarded: read persisted overrides once at module load. */
function loadOverrides(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [id, chord] of Object.entries(parsed)) {
      if (typeof chord === "string" && chord) overrides.set(id, chord);
    }
  } catch (err) {
    console.warn("[stave] failed to load persisted keybindings:", err);
  }
}

/** SSR-guarded: write the current overrides map through to localStorage. */
function persistOverrides(): void {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, string> = {};
    for (const [id, chord] of overrides) obj[id] = chord;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (err) {
    console.warn("[stave] failed to persist keybindings:", err);
  }
}

loadOverrides();

export function setKeybindingOverride(commandId: string, chord: string | null): void {
  if (chord === null) overrides.delete(commandId);
  else overrides.set(commandId, chord);
  persistOverrides();
  notifyKeybindings();
}

/** True when a command's binding has been user-overridden (differs from default). */
export function isKeybindingOverridden(commandId: string): boolean {
  return overrides.has(commandId);
}

/** Clear every user override — all commands fall back to their declared default. */
export function resetAllKeybindings(): void {
  if (overrides.size === 0) return;
  overrides.clear();
  persistOverrides();
  notifyKeybindings();
}

export function hasAnyKeybindingOverride(): boolean {
  return overrides.size > 0;
}

export function getKeybindingFor(cmd: Command): string | undefined {
  return overrides.get(cmd.id) ?? cmd.keybinding;
}

/**
 * Commands whose EFFECTIVE binding matches `chord`, excluding `excludeId`.
 * Pure — used to flag conflicts when a user assigns a chord already in use.
 * Chord comparison is modifier-order-insensitive (see chordMatches).
 */
export function findConflicts(chord: string, excludeId: string): Command[] {
  if (!chord) return [];
  const hits: Command[] = [];
  for (const cmd of listCommands()) {
    if (cmd.id === excludeId) continue;
    const binding = getKeybindingFor(cmd);
    if (binding && chordMatches(chord, binding)) hits.push(cmd);
  }
  return hits;
}

/** Conflicts for a command's own current binding (excludes itself). */
export function conflictsForCommand(commandId: string): Command[] {
  const cmd = getCommand(commandId);
  const binding = cmd && getKeybindingFor(cmd);
  if (!binding) return [];
  return findConflicts(binding, commandId);
}

/** Display one chord part ('mod', 'shift', 'z') as a symbol / label. */
function formatPart(part: string, isMac: boolean): string {
  const p = part.toLowerCase();
  if (p === "mod") return isMac ? "⌘" : "Ctrl";
  if (p === "cmd" || p === "meta") return "⌘";
  if (p === "ctrl") return isMac ? "⌃" : "Ctrl";
  if (p === "shift") return isMac ? "⇧" : "Shift";
  if (p === "alt" || p === "option") return isMac ? "⌥" : "Alt";
  if (p === "enter") return "⏎";
  if (p === "escape") return "Esc";
  if (p === "tab") return "Tab";
  if (p.length === 1) return p.toUpperCase();
  return part[0].toUpperCase() + part.slice(1);
}

/** Format a chord for display: 'mod+shift+z' → '⌘⇧Z' on mac, 'Ctrl+Shift+Z' otherwise. */
export function formatKeybinding(chord: string): string {
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  return chord
    .split(" ")
    .map((single) =>
      single
        .split("+")
        .map((part) => formatPart(part, isMac))
        .join(isMac ? "" : "+"),
    )
    .join(" ");
}

/**
 * Split a chord into individual display tokens for per-key `<kbd>`
 * rendering. 'mod+shift+z' → ['⌘','⇧','Z']; a two-chord 'mod+k v' →
 * ['⌘','K','V']. Modifier-symbol runs are kept as separate tokens so the
 * settings shell can box each key like VS Code.
 */
export function keybindingTokens(chord: string): string[] {
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  return chord
    .split(" ")
    .flatMap((single) => single.split("+").map((part) => formatPart(part, isMac)));
}

/** Parse a KeyboardEvent into a chord string like 'mod+shift+z'. */
function eventToChord(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  const k = e.key.toLowerCase();
  // Normalise a-z / 0-9 / punctuation to single-char tokens.
  if (k.length === 1) parts.push(k);
  else if (k === "escape") parts.push("escape");
  else if (k === "enter") parts.push("enter");
  else if (k === "tab") parts.push("tab");
  else parts.push(k);
  return parts.join("+");
}

function chordMatches(eventChord: string, declared: string): boolean {
  // Normalise declared chord — lowercase, sort modifiers deterministically.
  const norm = (s: string) => {
    const tokens = s.toLowerCase().split("+");
    const mods = tokens
      .filter((t) => t === "mod" || t === "shift" || t === "alt")
      .sort();
    const rest = tokens.filter(
      (t) => t !== "mod" && t !== "shift" && t !== "alt",
    );
    return [...mods, ...rest].join("+");
  };
  return norm(eventChord) === norm(declared);
}

/** True when focus is inside a text-input context where shortcuts should defer. */
function isEditableContext(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable
  );
}

/**
 * Install a global keydown listener that matches the pressed chord
 * against every registered command's keybinding and executes the first
 * match. Commands can opt out of the editable-context guard by setting
 * `allowInEditable: true` on the declared binding (future — not needed
 * yet). Returns an unsubscribe.
 */
export function installKeybindingDispatcher(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const editable = isEditableContext(e);
    const chord = eventToChord(e);
    for (const cmd of listCommands()) {
      const binding = getKeybindingFor(cmd);
      if (!binding) continue;
      if (!chordMatches(chord, binding)) continue;
      // Deferral rule: any command whose id starts with `stave.editor.`
      // is meant for editor-context commands that should NOT run when
      // the user is NOT in an editable context. All other commands run
      // regardless, EXCEPT we stay out of the way when focus is in an
      // INPUT / TEXTAREA / contentEditable so the user can type freely
      // (Monaco, rename input, etc.). The command itself can override
      // by declaring `mod+shift+<x>` which is rare in text input.
      if (editable) {
        // Allow only palette / quick-open style modals in editable
        // context — those are explicitly global.
        if (!cmd.id.startsWith("stave.palette.") && cmd.id !== "stave.quickOpen") {
          continue;
        }
      }
      e.preventDefault();
      e.stopPropagation();
      executeCommand(cmd.id);
      return;
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
