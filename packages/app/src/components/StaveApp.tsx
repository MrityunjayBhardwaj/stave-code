"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listProjects,
  createProject,
  renameProject,
  deleteProject,
  touchProject,
  switchProject,
  resetFileStore,
  saveSnapshot,
  listSnapshots,
  deleteSnapshot,
  restoreSnapshot,
  subscribeToDocUpdate,
  AUTO_SNAPSHOT_PREFIX,
  undo,
  redo,
  canUndo,
  canRedo,
  subscribeToUndoState,
  type ProjectMeta,
  type SnapshotMeta,
  type WorkspaceShellHandle,
} from "@stave/editor";
import { seedProjectFromTemplate } from "../templates";
import { exportProjectAsZip } from "../exportProject";
import { MenuBar } from "./MenuBar";
import { FileTree } from "./FileTree";
import { TemplateModal } from "./TemplateModal";
import { ProjectSwitcherModal } from "./ProjectSwitcherModal";
import { SnapshotModal } from "./SnapshotModal";
import { CommandPalette, type PaletteRow } from "./CommandPalette";
import { WorkspaceSearchPalette } from "./WorkspaceSearchPalette";
import { ActivityBar } from "./ActivityBar";
import { registerCommand } from "../commands/registry";
import { installKeybindingDispatcher } from "../commands/keybindings";
import { registerPanel } from "../panels/registry";
import { listWorkspaceFiles } from "@stave/editor";
import StrudelEditorClient from "./StrudelEditorClient";

interface StaveAppProps {
  initialProject: ProjectMeta;
}

/**
 * StaveApp — top-level layout.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────┐
 *   │ MenuBar (File, Edit, View, Help)               │
 *   ├──────────┬─────────────────────────────────────┤
 *   │          │                                     │
 *   │ FileTree │ StrudelEditorClient (WorkspaceShell)│
 *   │          │                                     │
 *   └──────────┴─────────────────────────────────────┘
 *
 * Project actions (new/open/rename/export) are in the File menu.
 * The sidebar is a file tree for the CURRENT project only.
 * Switching projects remounts StrudelEditorClient via key={activeProject.id}.
 */
export function StaveApp({ initialProject }: StaveAppProps) {
  const [activeProject, setActiveProject] = useState<ProjectMeta>(initialProject);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  // activePanelId drives which registered side-panel is visible. null =
  // activity bar only, no panel. 'explorer' is the legacy file-tree view.
  const [activePanelId, setActivePanelId] = useState<string | null>("explorer");
  const sidebarCollapsed = activePanelId === null;
  const setSidebarCollapsed = useCallback((updater: boolean | ((c: boolean) => boolean)) => {
    setActivePanelId((current) => {
      const collapsed = current === null;
      const next = typeof updater === "function" ? updater(collapsed) : updater;
      return next ? null : (current ?? "explorer");
    });
  }, []);
  const [switching, setSwitching] = useState(false);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [switcherModalOpen, setSwitcherModalOpen] = useState(false);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);

  // Subscribe to the structural undo manager so Edit menu items can
  // enable/disable reactively.
  useEffect(() => {
    const update = () => setUndoState({ canUndo: canUndo(), canRedo: canRedo() });
    update();
    return subscribeToUndoState(update);
  }, [activeProject.id]);

  const refreshSnapshots = useCallback(async (projectId: string) => {
    setSnapshots(await listSnapshots(projectId));
  }, []);

  const openSnapshotModal = useCallback(async () => {
    await refreshSnapshots(activeProject.id);
    setSnapshotModalOpen(true);
  }, [activeProject.id, refreshSnapshots]);

  const handleSaveSnapshot = useCallback(async (label: string) => {
    await saveSnapshot(activeProject.id, label);
    await refreshSnapshots(activeProject.id);
  }, [activeProject.id, refreshSnapshots]);

  const handleDeleteSnapshot = useCallback(async (id: string) => {
    await deleteSnapshot(id);
    await refreshSnapshots(activeProject.id);
  }, [activeProject.id, refreshSnapshots]);

  const handleRestoreSnapshot = useCallback(async (id: string) => {
    await restoreSnapshot(id);
    resetFileStore();
  }, []);

  // Global keybinding dispatcher — matches chords against registered
  // commands. Commands register in a later effect once all handlers
  // exist (some handlers close over state defined below this point).
  useEffect(() => installKeybindingDispatcher(), []);

  // Auto-snapshot: debounce doc updates; after IDLE_MS of inactivity,
  // capture an auto-labelled snapshot. The snapshotStore prunes older
  // auto entries down to MAX_AUTO_SNAPSHOTS (10) so this stays bounded.
  // Tracked per-session only — if the user reloads or switches projects
  // before the debounce fires, the pending save is dropped.
  useEffect(() => {
    // Idle duration can be shortened via localStorage for automated
    // tests — production default is 60s.
    const override =
      typeof window !== "undefined"
        ? parseInt(window.localStorage.getItem("stave:autosnapIdleMs") ?? "", 10)
        : NaN;
    const IDLE_MS = Number.isFinite(override) && override > 0 ? override : 60_000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const projectId = activeProject.id;
    const unsubscribe = subscribeToDocUpdate(
      () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          const now = new Date();
          const hh = String(now.getHours()).padStart(2, "0");
          const mm = String(now.getMinutes()).padStart(2, "0");
          saveSnapshot(projectId, `${AUTO_SNAPSHOT_PREFIX}${hh}:${mm}`, "auto")
            .catch((err) => console.warn("[stave] auto-snapshot failed:", err));
        }, IDLE_MS);
      },
      { localOnly: true },
    );
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [activeProject.id]);

  // Bidirectional sync between FileTree ↔ WorkspaceShell.
  //
  // - `shellRef` — imperative handle into the shell. FileTree clicks call
  //   shellRef.current.openOrFocusFile(fileId) to open/focus a tab.
  // - `activeFileId` — the currently-active tab's fileId (null if no tab
  //   active or active tab has no fileId). Updated by the shell via
  //   onActiveTabChange. Passed to FileTree so it highlights the active
  //   file in the tree.
  const shellRef = useRef<WorkspaceShellHandle | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    setProjects(await listProjects());
  }, []);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  // ── Project operations ──────────────────────────────────────────────

  const doSwitchProject = useCallback(async (id: string) => {
    if (id === activeProject.id || switching) return;
    setSwitching(true);
    try {
      resetFileStore();
      await switchProject(id);
      await touchProject(id);
      const list = await listProjects();
      const selected = list.find((p) => p.id === id);
      if (selected) {
        setActiveProject(selected);
        setProjects(list);
      }
    } finally {
      setSwitching(false);
    }
  }, [activeProject.id, switching]);

  const handleCreateProject = useCallback(async (name: string, templateId: string) => {
    setTemplateModalOpen(false);
    setSwitching(true);
    try {
      const meta = await createProject(name);
      resetFileStore();
      await switchProject(meta.id);
      await touchProject(meta.id);
      // Seed template files into the new Y.Doc
      seedProjectFromTemplate(templateId);
      setActiveProject(meta);
      await refreshProjects();
    } finally {
      setSwitching(false);
    }
  }, [refreshProjects]);

  const handleRenameActiveProject = useCallback(async () => {
    const newName = prompt("Rename project:", activeProject.name);
    if (!newName || !newName.trim() || newName === activeProject.name) return;
    await renameProject(activeProject.id, newName.trim());
    const list = await listProjects();
    const updated = list.find((p) => p.id === activeProject.id);
    if (updated) setActiveProject(updated);
    setProjects(list);
  }, [activeProject]);

  const handleRenameProjectFromSwitcher = useCallback(async (id: string) => {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    const newName = prompt("Rename project:", proj.name);
    if (!newName || !newName.trim() || newName === proj.name) return;
    await renameProject(id, newName.trim());
    const list = await listProjects();
    if (id === activeProject.id) {
      const updated = list.find((p) => p.id === id);
      if (updated) setActiveProject(updated);
    }
    setProjects(list);
  }, [projects, activeProject.id]);

  const handleDeleteProjectFromSwitcher = useCallback(async (id: string) => {
    if (projects.length <= 1) return;
    await deleteProject(id);
    if (id === activeProject.id) {
      const remaining = projects.filter((p) => p.id !== id);
      const next = remaining[0];
      if (next) {
        resetFileStore();
        await switchProject(next.id);
        await touchProject(next.id);
        setActiveProject(next);
      }
    }
    await refreshProjects();
  }, [activeProject.id, projects, refreshProjects]);

  // ── Tab ↔ Tree sync ─────────────────────────────────────────────────

  const handleOpenFile = useCallback((fileId: string) => {
    // Ask the shell to open or focus the editor tab for this file.
    shellRef.current?.openOrFocusFile(fileId);
  }, []);

  // Register every app-level action as a command. Commands are the
  // single source of truth for menu items, palette entries, and
  // keybindings. Re-registers when dependencies change so closures
  // capture fresh handlers.
  useEffect(() => {
    const unregs: Array<() => void> = [];
    unregs.push(registerCommand({
      id: "stave.palette.open",
      title: "Show All Commands",
      category: "View",
      keybinding: "mod+shift+p",
      run: () => setPaletteOpen(true),
    }));
    unregs.push(registerCommand({
      id: "stave.project.new",
      title: "New Project...",
      category: "File",
      keybinding: "mod+n",
      run: () => setTemplateModalOpen(true),
    }));
    unregs.push(registerCommand({
      id: "stave.project.open",
      title: "Open Project...",
      category: "File",
      keybinding: "mod+o",
      run: () => setSwitcherModalOpen(true),
    }));
    unregs.push(registerCommand({
      id: "stave.project.rename",
      title: "Rename Project...",
      category: "File",
      run: () => handleRenameActiveProject(),
    }));
    unregs.push(registerCommand({
      id: "stave.project.export",
      title: "Export Project as .zip",
      category: "File",
      run: () => {
        exportProjectAsZip(activeProject).catch((err) => {
          console.error("[stave] export failed:", err);
          alert("Export failed — see console for details.");
        });
      },
    }));
    unregs.push(registerCommand({
      id: "stave.project.versionHistory",
      title: "Version History...",
      category: "File",
      run: () => { openSnapshotModal(); },
    }));
    unregs.push(registerCommand({
      id: "stave.edit.undo",
      title: "Undo",
      category: "Edit",
      keybinding: "mod+z",
      when: () => canUndo(),
      run: () => { undo(); },
    }));
    unregs.push(registerCommand({
      id: "stave.edit.redo",
      title: "Redo",
      category: "Edit",
      keybinding: "mod+shift+z",
      when: () => canRedo(),
      run: () => { redo(); },
    }));
    unregs.push(registerCommand({
      id: "stave.view.toggleSidebar",
      title: "Toggle Sidebar",
      category: "View",
      keybinding: "mod+b",
      run: () => setSidebarCollapsed((c) => !c),
    }));
    unregs.push(registerCommand({
      id: "stave.quickOpen",
      title: "Quick Open File",
      category: "Go",
      keybinding: "mod+p",
      run: () => setQuickOpenOpen(true),
    }));
    unregs.push(registerCommand({
      id: "stave.workspaceSearch",
      title: "Search in Files",
      category: "Find",
      keybinding: "mod+shift+f",
      run: () => setWorkspaceSearchOpen(true),
    }));
    // Activity-bar panel registry — the panel body itself is rendered
    // by StaveApp via activePanelId; registering here just gives the
    // activity bar a button for it. The `render` callback is a stub
    // that the dispatcher currently ignores in favour of inline JSX
    // below — kept for future extension (external panel contributors).
    unregs.push(registerPanel({
      id: "explorer",
      title: "Explorer",
      icon: "▢",
      order: 10,
      render: () => null,
    }));
    unregs.push(registerPanel({
      id: "search",
      title: "Search",
      icon: "⌕",
      order: 20,
      render: () => null,
    }));
    unregs.push(registerPanel({
      id: "snapshots",
      title: "Version History",
      icon: "⟳",
      order: 30,
      render: () => null,
    }));
    return () => { for (const u of unregs) u(); };
  }, [activeProject, handleRenameActiveProject, openSnapshotModal]);

  // Build file rows for QuickOpen — memoised so mount of the palette
  // has a stable array. Rebuilt when the file list changes.
  const quickOpenRows: PaletteRow[] = useMemo(() => {
    if (!quickOpenOpen) return [];
    return listWorkspaceFiles()
      .filter((f) => !f.path.endsWith("/.keep"))
      .map((f) => {
        const name = f.path.split("/").pop() ?? f.path;
        const folder = f.path.includes("/")
          ? f.path.slice(0, f.path.lastIndexOf("/"))
          : "";
        return {
          id: `file:${f.id}`,
          title: name,
          description: folder || undefined,
          run: () => handleOpenFile(f.id),
        };
      });
  }, [quickOpenOpen, handleOpenFile]);

  return (
    <div style={styles.root}>
      <MenuBar
        projectName={activeProject.name}
        onNewProject={() => setTemplateModalOpen(true)}
        onOpenProject={() => setSwitcherModalOpen(true)}
        onRenameProject={handleRenameActiveProject}
        onExportProject={() => {
          exportProjectAsZip(activeProject).catch((err) => {
            console.error("[stave] export failed:", err);
            alert("Export failed — see console for details.");
          });
        }}
        onVersionHistory={openSnapshotModal}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        sidebarCollapsed={sidebarCollapsed}
        onUndo={() => { undo(); }}
        onRedo={() => { redo(); }}
        canUndo={undoState.canUndo}
        canRedo={undoState.canRedo}
      />

      <div style={styles.main}>
        <ActivityBar
          activePanelId={activePanelId}
          onSelect={setActivePanelId}
        />
        {activePanelId === "explorer" && (
          <FileTree
            projectName={activeProject.name}
            onOpenFile={handleOpenFile}
            activeFileId={activeFileId}
            onToggleCollapse={() => setActivePanelId(null)}
          />
        )}
        {activePanelId === "search" && (
          <div style={styles.panelRoot}>
            <div style={styles.panelHeader}>SEARCH</div>
            <div style={styles.panelBody}>
              <div style={styles.panelHint}>Press ⌘⇧F to open full-screen search</div>
              <button
                style={styles.panelBtn}
                onClick={() => setWorkspaceSearchOpen(true)}
              >
                Search in Files…
              </button>
            </div>
          </div>
        )}
        {activePanelId === "snapshots" && (
          <div style={styles.panelRoot}>
            <div style={styles.panelHeader}>VERSION HISTORY</div>
            <div style={styles.panelBody}>
              <div style={styles.panelHint}>
                Auto-saves every 60s.
              </div>
              <button
                style={styles.panelBtn}
                onClick={openSnapshotModal}
              >
                Manage Snapshots…
              </button>
            </div>
          </div>
        )}

        <div style={styles.editorArea}>
          {switching ? (
            <div style={styles.switchingOverlay}>Loading project...</div>
          ) : (
            <StrudelEditorClient
              key={activeProject.id}
              shellRef={shellRef}
              onActiveFileChange={setActiveFileId}
            />
          )}
        </div>
      </div>

      <TemplateModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onCreate={handleCreateProject}
      />

      <ProjectSwitcherModal
        open={switcherModalOpen}
        projects={projects}
        activeProjectId={activeProject.id}
        onClose={() => setSwitcherModalOpen(false)}
        onSelect={doSwitchProject}
        onRename={handleRenameProjectFromSwitcher}
        onDelete={handleDeleteProjectFromSwitcher}
      />

      <SnapshotModal
        open={snapshotModalOpen}
        projectName={activeProject.name}
        snapshots={snapshots}
        onClose={() => setSnapshotModalOpen(false)}
        onSaveNew={handleSaveSnapshot}
        onRestore={handleRestoreSnapshot}
        onDelete={handleDeleteSnapshot}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        placeholder="Type a command..."
      />

      <CommandPalette
        open={quickOpenOpen}
        onClose={() => setQuickOpenOpen(false)}
        placeholder="Search files by name..."
        hideCommands
        extraRows={quickOpenRows}
      />

      <WorkspaceSearchPalette
        open={workspaceSearchOpen}
        onClose={() => setWorkspaceSearchOpen(false)}
        onOpenFile={handleOpenFile}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    width: "100%",
    height: "100%",
    minHeight: 0,
  },
  main: {
    flex: 1,
    display: "flex",
    minHeight: 0,
  },
  editorArea: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    position: "relative",
  },
  collapsedStrip: {
    width: 28,
    minWidth: 28,
    height: "100%",
    background: "#1a1a2e",
    borderRight: "1px solid #2a2a4a",
    color: "#8888aa",
    cursor: "pointer",
    border: "none",
    borderTop: "none",
    borderBottom: "none",
    borderLeft: "none",
    padding: "8px 0",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    fontSize: 14,
    fontFamily: "inherit",
  },
  switchingOverlay: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#8888aa",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 14,
  },
  panelRoot: {
    width: 240,
    height: "100%",
    background: "#14142a",
    borderRight: "1px solid #2a2a4a",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  panelHeader: {
    padding: "10px 14px",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.8,
    color: "#9a9ac0",
    borderBottom: "1px solid #2a2a4a",
  },
  panelBody: {
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    flex: 1,
  },
  panelHint: {
    fontSize: 11,
    color: "#8888aa",
    lineHeight: 1.5,
  },
  panelBtn: {
    background: "#2a2a55",
    border: "1px solid #3a3a5a",
    borderRadius: 4,
    color: "#e8e8f0",
    padding: "6px 12px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    alignSelf: "flex-start",
  },
};
