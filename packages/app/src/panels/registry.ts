/**
 * Panel registry — contributes side-panel views that render between the
 * activity bar and the editor. Explorer (file tree), Search, Snapshots
 * are all panels; any future feature (Outline, Problems, ...) joins the
 * same registry and appears automatically in the activity bar.
 *
 * Same module-level pattern as commands/registry.ts.
 */

import type React from "react";

export interface PanelContext {
  /** Close the active panel — collapses the side region. */
  close: () => void;
}

/**
 * An unread-work count a panel can surface on its activity-bar button.
 *
 * The count is the PANEL'S concern, not the rail's — the rail knows how to
 * draw a number, and nothing about what it means. Expressed as an observable
 * rather than a hook so the rail can subscribe to every panel in one effect
 * without calling hooks in a loop over a list that changes at runtime.
 */
export interface PanelBadge {
  /** Current count. Zero or less renders nothing. */
  readonly get: () => number;
  /** Notify on change. Returns an unsubscribe. */
  readonly subscribe: (cb: () => void) => () => void;
  /** Called when the user opens this panel from the rail. */
  readonly clear?: () => void;
  /**
   * How urgent the count is. Defaults to "danger". A panel whose count mixes
   * severities is expected to report the highest one present — a badge that
   * paints warnings in the error colour is worse than no colour at all,
   * because it says something untrue about what is waiting.
   */
  readonly tone?: () => "danger" | "warning";
  /** Tooltip while the count is non-zero. Falls back to the panel title. */
  readonly describe?: () => string;
}

export interface Panel {
  readonly id: string;
  readonly title: string;
  /** Codicon name (without the `codicon-` prefix) rendered in the
   *  activity bar via the shared `Icon` component. See
   *  https://microsoft.github.io/vscode-codicons/dist/codicon.html */
  readonly icon: string;
  /** Sort order in the activity bar — lower values render first. */
  readonly order: number;
  /** Render the panel content. Receives a close handle. */
  readonly render: (ctx: PanelContext) => React.ReactNode;
  /** Optional unread count shown on this panel's activity-bar button. */
  readonly badge?: PanelBadge;
}

const panels = new Map<string, Panel>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function registerPanel(panel: Panel): () => void {
  panels.set(panel.id, panel);
  notify();
  return () => {
    if (panels.get(panel.id) === panel) {
      panels.delete(panel.id);
      notify();
    }
  };
}

export function listPanels(): Panel[] {
  return Array.from(panels.values()).sort((a, b) => a.order - b.order);
}

export function getPanel(id: string): Panel | undefined {
  return panels.get(id);
}

export function subscribeToPanels(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
