/**
 * Unread engine-log counts — errors and warnings emitted since the Console
 * panel was last opened.
 *
 * This is the one thing the retired status bar carried that wasn't a second
 * copy of something already on screen (#1368). The division of labour it
 * serves is stated at the toast bridge in StaveApp: an error also raises a
 * toast that auto-dismisses in about 4s, but a WARNING has no transient
 * surface at all. Without a persistent count, a warning is only visible to
 * someone who already has the Console open — which, mid-take, is exactly when
 * they don't.
 *
 * Module-level singleton, matching the log it observes. The subscription is
 * opened lazily on the first subscriber and the seed is read at that moment,
 * so importing this module never costs anything and never races the engine's
 * own boot logging. Once opened it STAYS open, and it seeds exactly once: a
 * remount that dropped the listener count to zero (React's development
 * double-invoke does exactly this) would otherwise tear down and re-seed from
 * history, silently resurrecting a count the user had just cleared.
 */

import { subscribeLog, getLogHistory, type LogEntry } from "@stave/editor";
import type { PanelBadge } from "../panels/registry";

let errors = 0;
let warns = 0;
let unsubscribeLog: (() => void) | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function start(): void {
  if (unsubscribeLog) return;
  // Seed from history so a reload doesn't zero a count the user hasn't seen.
  const history = getLogHistory();
  errors = history.filter((e) => e.level === "error").length;
  warns = history.filter((e) => e.level === "warn").length;
  unsubscribeLog = subscribeLog((entry: LogEntry | null) => {
    // A null entry is the log's own "cleared" signal — the counts describe
    // the log, so they clear with it.
    if (entry === null) {
      if (errors === 0 && warns === 0) return;
      errors = 0;
      warns = 0;
      notify();
      return;
    }
    if (entry.level === "error") errors++;
    else if (entry.level === "warn") warns++;
    else return; // info and below are not unread WORK
    notify();
  });
}

/** Errors + warnings since the Console was last opened. */
export function getUnreadLogCount(): number {
  return errors + warns;
}

/** Split counts, for a tooltip that can say which is which. */
export function getUnreadLogBreakdown(): { errors: number; warns: number } {
  return { errors, warns };
}

/** Reset the count — the user has seen them. */
export function clearUnreadLog(): void {
  if (errors === 0 && warns === 0) return;
  errors = 0;
  warns = 0;
  notify();
}

export function subscribeUnreadLog(cb: () => void): () => void {
  start();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Test seam — drops the subscription and the counts. */
export function __resetUnreadLogForTests(): void {
  unsubscribeLog?.();
  unsubscribeLog = null;
  listeners.clear();
  errors = 0;
  warns = 0;
}

export const consoleBadge: PanelBadge = {
  get: getUnreadLogCount,
  subscribe: subscribeUnreadLog,
  clear: clearUnreadLog,
  // Errors outrank warnings: if anything at all failed, that is what the
  // colour should say. Warnings alone stay amber — the retired status bar
  // drew this same distinction, and collapsing it would report every
  // self-inflicted warning as a failure.
  tone: () => (errors > 0 ? "danger" : "warning"),
  describe: () => {
    const parts: string[] = [];
    if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
    if (warns > 0) parts.push(`${warns} warning${warns === 1 ? "" : "s"}`);
    return parts.length ? `${parts.join(", ")} — open Console` : "Open Console";
  },
};
