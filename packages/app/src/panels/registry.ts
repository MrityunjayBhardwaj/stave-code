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

export interface Panel {
  readonly id: string;
  readonly title: string;
  /** Single-char label or emoji rendered in the activity bar. */
  readonly icon: string;
  /** Sort order in the activity bar — lower values render first. */
  readonly order: number;
  /** Render the panel content. Receives a close handle. */
  readonly render: (ctx: PanelContext) => React.ReactNode;
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
