"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  setProjectBackgroundFileId,
  getProject,
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
import { importProjectFromZip } from "../importProject";
import {
  buildShareUrl,
  decodeSharePayload,
  applyShareManifest,
  readShareFragment,
  clearShareFragment,
} from "../shareProject";
import { MenuBar } from "./MenuBar";
import { FileTree, type FileTreeHandle } from "./FileTree";
import { TemplateModal } from "./TemplateModal";
import { ProjectSwitcherModal } from "./ProjectSwitcherModal";
import { SnapshotView } from "./SnapshotView";
import { OutlineView } from "./OutlineView";
import {
  revealLineInFile,
  bumpEditorFontSize,
  toggleEditorMinimap,
  cycleEditorTheme,
  applyPersistedTheme,
  applyPersistedUiIconSize,
  applyPersistedInlineVizActionSize,
} from "@stave/editor";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { EditorSettingsModal } from "./EditorSettingsModal";
import { CropPopup, createBackdropCropAdapter } from "./CropPopup";
import { DialogHost } from "./DialogHost";
import { showPrompt, showToast, showConfirm } from "../dialogs/host";
import { CommandPalette, type PaletteRow } from "./CommandPalette";
import { WorkspaceSearchView, type WorkspaceSearchViewHandle } from "./WorkspaceSearchView";
import { ActivityBar } from "./ActivityBar";
import { StatusBar, type StatusBarRuntimeState } from "./StatusBar";
import { ConsolePanel } from "./ConsolePanel";
import { registerCommand } from "../commands/registry";
import { installKeybindingDispatcher } from "../commands/keybindings";
import { registerPanel } from "../panels/registry";
import { listWorkspaceFiles, subscribeToFileList, subscribeLog } from "@stave/editor";
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
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [editorSettingsOpen, setEditorSettingsOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<
    | { mode: "inline"; vizId: string; presetId: string; fileId: string; trackKey: string; renderSize?: { w: number; h: number } }
    | { mode: "backdrop"; adapter: import("./CropPopup").CropAdapter }
    | null
  >(null);

  // Apply persisted theme on first mount so the user's choice survives
  // reloads. Runs once — later theme changes go through toggleEditorTheme.
  useEffect(() => {
    applyPersistedTheme();
    applyPersistedUiIconSize();
    applyPersistedInlineVizActionSize();
  }, []);

  // Toast bridge — every new error-level engineLog entry also surfaces
  // as a transient toast so the user notices even when the Console panel
  // isn't open. Warnings stay in the LED + Console only (noisier to
  // toast every warn, and live coders warn themselves a lot). The toast
  // auto-dismisses in ~4s; the Console entry + status-bar LED persist.
  useEffect(() => {
    return subscribeLog((entry) => {
      if (!entry) return;
      if (entry.level !== "error") return;
      const text = entry.suggestion
        ? `${entry.message} → try \`${entry.suggestion.name}\``
        : entry.message;
      showToast(text, "error");
    });
  }, []);

  const [zenMode, setZenMode] = useState(false);
  const searchViewRef = useRef<WorkspaceSearchViewHandle | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const fileTreeRef = useRef<FileTreeHandle | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<{
    tabId: string;
    fileId: string | null;
    x: number;
    y: number;
  } | null>(null);

  // Mirror of the active group's backdrop fileId so the file-tree can
  // render "Set as Background" vs. "Clear Background" in the context
  // menu without subscribing to every shell state change. Updated by
  // handleSetAsBackground below — the single write site — and read
  // into the FileTree prop. Survives tab switches because the shell
  // stores it on group state, not on the active tab.
  const [backgroundFileId, setBackgroundFileId] = useState<string | null>(
    null,
  );
  // Backdrop crop — mirrors ProjectMeta.backgroundCrop. Restored on
  // project load alongside backgroundFileId; persisted on Save in
  // the crop popup. `null` means full-rect (default).
  const [backgroundCrop, setBackgroundCropState] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // File-list revision counter — bumps whenever the workspace
  // file list mutates (add / remove / rename). Read by the MenuBar's
  // backdrop dropdown so it sees fresh viz files without us having
  // to lift the entire file list into React state.
  const [fileListRev, setFileListRev] = useState(0);
  useEffect(
    () => subscribeToFileList(() => setFileListRev((n) => n + 1)),
    [],
  );

  const handleImportZip = useCallback(async (file: File) => {
    try {
      const meta = await importProjectFromZip(file);
      const list = await listProjects();
      setProjects(list);
      setActiveProject(meta);
      showToast(`Imported ${meta.name}`, "info");
    } catch (err) {
      console.error("[stave] import failed:", err);
      showToast(
        `Import failed — ${(err as Error).message ?? "see console"}`,
        "error",
      );
    }
  }, []);

  const triggerImportPicker = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleShareProject = useCallback(async () => {
    if (!activeProject) return;
    try {
      const url = await buildShareUrl(activeProject);
      await navigator.clipboard.writeText(url);
      showToast(`Share link copied (${url.length.toLocaleString()} chars).`, "info");
    } catch (err) {
      console.error("[stave] share failed:", err);
      showToast(
        `Share failed — ${(err as Error).message ?? "see console"}`,
        "error",
      );
    }
  }, [activeProject]);

  // On-mount: if we landed with #share=, decode and offer to import.
  // Runs once per session — the fragment is cleared either way so a
  // refresh doesn't re-prompt.
  const sharePromptHandledRef = useRef(false);
  useEffect(() => {
    if (sharePromptHandledRef.current) return;
    sharePromptHandledRef.current = true;
    const encoded = readShareFragment();
    if (!encoded) return;
    void (async () => {
      try {
        const manifest = await decodeSharePayload(encoded);
        const ok = await showConfirm({
          title: "Import shared project?",
          description: `Import "${manifest.project.name}" as a new project? It contains ${manifest.files.length} file(s).`,
          confirmLabel: "Import",
        });
        clearShareFragment();
        if (!ok) return;
        const meta = await applyShareManifest(manifest);
        const list = await listProjects();
        setProjects(list);
        setActiveProject(meta);
        showToast(`Imported ${meta.name}`, "info");
      } catch (err) {
        console.error("[stave] share import failed:", err);
        showToast(
          `Couldn't import shared project — ${(err as Error).message ?? "malformed link"}`,
          "error",
        );
        clearShareFragment();
      }
    })();
  }, []);

  // Esc exits zen mode. Registered at window level because there's no
  // chrome to click when zen is on; the only way out is the keyboard.
  useEffect(() => {
    if (!zenMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setZenMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zenMode]);

  // Drive the browser's Fullscreen API alongside zen mode so the URL
  // bar / tab strip / window chrome all disappear. Browsers require a
  // user gesture to enter fullscreen, which this effect inherits because
  // zenMode is only ever flipped by a click or shortcut. If the user
  // exits fullscreen via the browser's own affordance (F11, Esc on
  // some browsers), keep the React state in sync via fullscreenchange.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const fsEl = () => document.fullscreenElement;
    if (zenMode && !fsEl()) {
      // Best-effort — Safari throws if the gesture isn't trusted.
      void document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (!zenMode && fsEl()) {
      void document.exitFullscreen?.().catch(() => {});
    }
    const sync = () => {
      if (!fsEl() && zenMode) setZenMode(false);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [zenMode]);

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

  const openSnapshotPanel = useCallback(async () => {
    setActivePanelId("snapshots");
    await refreshSnapshots(activeProject.id);
  }, [activeProject.id, refreshSnapshots]);

  // Refresh the snapshot list whenever the Version History panel
  // becomes visible — auto-snapshots could have been added by the
  // 60s idle debouncer while the user was elsewhere.
  useEffect(() => {
    if (activePanelId === "snapshots") {
      refreshSnapshots(activeProject.id);
    }
  }, [activePanelId, activeProject.id, refreshSnapshots]);

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
  const [activeRuntime, setActiveRuntime] = useState<StatusBarRuntimeState | null>(null);

  /**
   * Promote a viz file to the active group's backdrop, or clear with
   * `null`. The shell's `setBackgroundFile` mutates group state; we
   * mirror the new value into React state so the FileTree menu label
   * (Set ↔ Clear) updates without a second round-trip, and persist
   * to project metadata so the choice survives reload / project
   * switch. Cmd+K B paths inside the shell route through
   * `onBackgroundFileChange` below — same write site.
   */
  const handleSetAsBackground = useCallback(
    (fileId: string | null) => {
      shellRef.current?.setBackgroundFile?.(fileId);
      setBackgroundFileId(fileId);
      // Fire-and-forget; the IDB write is best-effort. A failure
      // here doesn't roll back the React state — user still sees
      // the backdrop on screen, it just won't survive reload.
      setProjectBackgroundFileId(activeProject.id, fileId).catch((err) =>
        console.warn("[stave] backdrop persist failed:", err),
      );
    },
    [activeProject.id],
  );

  // Restore the persisted backdrop when the active project changes.
  // Reads the stored fileId from project metadata and pushes it into
  // the shell + local state. Skips the push when nothing is stored or
  // the stored file no longer exists in this project (e.g., user
  // deleted it before re-opening). The shell remount on
  // `key={activeProject.id}` guarantees the imperative call lands on
  // the new shell, not the previous one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const meta = await getProject(activeProject.id);
      if (cancelled) return;
      const stored = meta?.backgroundFileId ?? null;
      // Wait one tick for the shell + file store to be ready —
      // shellRef is set after WorkspaceShell's first render, and the
      // file store needs to have switched to the new project before
      // we ask the shell to render the backdrop.
      requestAnimationFrame(() => {
        if (cancelled) return;
        // Validate the file still exists; otherwise drop silently
        // and clear persistence so a stale id doesn't keep getting
        // re-applied on every reload.
        if (stored) {
          const exists = listWorkspaceFiles().some((f) => f.id === stored);
          if (!exists) {
            setProjectBackgroundFileId(activeProject.id, null).catch(
              (err) =>
                console.warn(
                  "[stave] backdrop stale-clean failed:",
                  err,
                ),
            );
            shellRef.current?.setBackgroundFile?.(null);
            setBackgroundFileId(null);
            return;
          }
        }
        shellRef.current?.setBackgroundFile?.(stored);
        setBackgroundFileId(stored);
        // Restore per-project backdrop crop — null means full-rect
        // (default). Rendering applies in the shell wrapper.
        setBackgroundCropState(meta?.backgroundCrop ?? null);
      });
    })().catch((err) =>
      console.warn("[stave] backdrop restore failed:", err),
    );
    return () => {
      cancelled = true;
    };
  }, [activeProject.id]);

  const handleRuntimeStateChange = useCallback(
    (s: { isPlaying: boolean; bpm?: number; error: string | null } | null) => {
      setActiveRuntime((prev) => {
        if (!s) return prev === null ? prev : null;
        if (
          prev &&
          prev.isPlaying === s.isPlaying &&
          prev.bpm === s.bpm &&
          prev.error === s.error
        ) {
          return prev; // same values — skip re-render
        }
        return { isPlaying: s.isPlaying, bpm: s.bpm, error: s.error };
      });
    },
    [],
  );

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
    const newName = await showPrompt({
      title: "Rename project",
      initialValue: activeProject.name,
      placeholder: "Project name",
      confirmLabel: "Rename",
    });
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
    const newName = await showPrompt({
      title: "Rename project",
      initialValue: proj.name,
      placeholder: "Project name",
      confirmLabel: "Rename",
    });
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

  const handleOpenFile = useCallback((fileId: string, intent?: { preview?: boolean }) => {
    // Ask the shell to open or focus the editor tab for this file. Tree
    // single-click passes preview: true so the tab is a transient preview
    // slot; double-click promotes it. Command-palette Quick Open defaults
    // to preview off (pinned) since the user explicitly picked the file.
    shellRef.current?.openOrFocusFile(fileId, intent);
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
          showToast("Export failed — see console for details.", "error");
        });
      },
    }));
    unregs.push(registerCommand({
      id: "stave.project.import",
      title: "Import Project from .zip...",
      category: "File",
      run: () => triggerImportPicker(),
    }));
    unregs.push(registerCommand({
      id: "stave.project.versionHistory",
      title: "Version History",
      category: "File",
      run: () => { openSnapshotPanel(); },
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
      id: "stave.view.zen",
      title: "Toggle Zen / Perform Mode",
      category: "View",
      description: "Hide menu bar, activity bar, and status bar. Esc to exit.",
      keybinding: "mod+alt+z",
      run: () => setZenMode((z) => !z),
    }));
    unregs.push(registerCommand({
      id: "stave.view.fontUp",
      title: "Increase Editor Font Size",
      category: "View",
      keybinding: "mod+=",
      run: () => bumpEditorFontSize(1),
    }));
    unregs.push(registerCommand({
      id: "stave.view.fontDown",
      title: "Decrease Editor Font Size",
      category: "View",
      keybinding: "mod+-",
      run: () => bumpEditorFontSize(-1),
    }));
    unregs.push(registerCommand({
      id: "stave.view.toggleMinimap",
      title: "Toggle Minimap",
      category: "View",
      run: () => toggleEditorMinimap(),
    }));
    unregs.push(registerCommand({
      id: "stave.view.cycleTheme",
      title: "Cycle Theme (Dark → Light → System)",
      category: "View",
      run: () => { cycleEditorTheme(); },
    }));
    unregs.push(registerCommand({
      id: "stave.view.splitRight",
      title: "Split Editor Right",
      category: "View",
      keybinding: "mod+\\",
      run: () => { shellRef.current?.splitActiveGroup?.("east"); },
    }));
    unregs.push(registerCommand({
      id: "stave.view.splitDown",
      title: "Split Editor Down",
      category: "View",
      keybinding: "mod+shift+\\",
      run: () => { shellRef.current?.splitActiveGroup?.("south"); },
    }));
    unregs.push(registerCommand({
      id: "stave.file.share",
      title: "Copy Share Link",
      category: "File",
      description: "Copy a URL that imports this project on another machine.",
      run: () => { void handleShareProject(); },
    }));
    unregs.push(registerCommand({
      id: "stave.view.shortcuts",
      title: "Keyboard Shortcuts",
      category: "View",
      description: "List every command that has a shortcut.",
      keybinding: "mod+/",
      run: () => setShortcutsOpen(true),
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
      run: () => {
        setActivePanelId("search");
        // Defer focus until after the panel mounts / remounts.
        setTimeout(() => searchViewRef.current?.focus(), 50);
      },
    }));
    // Activity-bar panel registry — the panel body itself is rendered
    // by StaveApp via activePanelId; registering here just gives the
    // activity bar a button for it. The `render` callback is a stub
    // that the dispatcher currently ignores in favour of inline JSX
    // below — kept for future extension (external panel contributors).
    unregs.push(registerPanel({
      id: "explorer",
      title: "Explorer",
      icon: "files",
      order: 10,
      render: () => null,
    }));
    unregs.push(registerPanel({
      id: "search",
      title: "Search",
      icon: "search",
      order: 20,
      render: () => null,
    }));
    unregs.push(registerPanel({
      id: "snapshots",
      title: "Version History",
      icon: "history",
      order: 30,
      render: () => null,
    }));
    unregs.push(registerPanel({
      id: "outline",
      title: "Outline",
      icon: "symbol-class",
      order: 40,
      render: () => null,
    }));
    unregs.push(registerPanel({
      id: "console",
      title: "Console",
      icon: "terminal",
      order: 50,
      render: () => null,
    }));
    return () => { for (const u of unregs) u(); };
  }, [activeProject, handleRenameActiveProject, openSnapshotPanel, handleShareProject]);

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
        // Resolve backdrop file id → display name. Re-derived each
        // render; cheap (list is in memory) and picks up renames
        // without a separate subscription.
        backgroundFileName={(() => {
          if (!backgroundFileId) return null;
          const f = listWorkspaceFiles().find(
            (x) => x.id === backgroundFileId,
          );
          if (!f) return null;
          const parts = f.path.split("/");
          return parts[parts.length - 1].replace(/\.[^.]+$/, "");
        })()}
        backgroundFileId={backgroundFileId}
        vizFiles={listWorkspaceFiles()
          .filter((f) => f.language === "hydra" || f.language === "p5js")
          .map((f) => ({
            id: f.id,
            name: f.path
              .split("/")
              .pop()!
              .replace(/\.[^.]+$/, ""),
          }))}
        onSetBackdrop={(id) => handleSetAsBackground(id)}
        onRevealBackground={() => {
          if (backgroundFileId) handleOpenFile(backgroundFileId);
        }}
        onCropBackground={() => {
          if (!backgroundFileId) return;
          // Read the actual backdrop container size so the crop
          // preview renders at the same dimensions as the live viz.
          const bgEl = document.querySelector("[data-workspace-background]");
          const rect = bgEl?.getBoundingClientRect();
          const renderSize = rect && rect.width > 0
            ? { w: Math.round(rect.width), h: Math.round(rect.height) }
            : undefined;
          setCropTarget({
            mode: "backdrop",
            adapter: createBackdropCropAdapter({
              projectId: activeProject.id,
              fileId: backgroundFileId,
              initialCrop: backgroundCrop,
              onChange: (c) => setBackgroundCropState(c),
              renderSize,
            }),
          });
        }}
        projectName={activeProject.name}
        onOpenEditorSettings={() => setEditorSettingsOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onNewProject={() => setTemplateModalOpen(true)}
        onOpenProject={() => setSwitcherModalOpen(true)}
        onRenameProject={handleRenameActiveProject}
        onExportProject={() => {
          exportProjectAsZip(activeProject).catch((err) => {
            console.error("[stave] export failed:", err);
            showToast("Export failed — see console for details.", "error");
          });
        }}
        onImportProject={triggerImportPicker}
        onShareProject={handleShareProject}
        onVersionHistory={openSnapshotPanel}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        sidebarCollapsed={sidebarCollapsed}
        onToggleZenMode={() => setZenMode((z) => !z)}
        zenMode={zenMode}
        onUndo={() => { undo(); }}
        onRedo={() => { redo(); }}
        canUndo={undoState.canUndo}
        canRedo={undoState.canRedo}
      />

      <div style={styles.main} data-stave-main-backdrop={backgroundFileId ? "on" : "off"}>
        {!zenMode && (
          <ActivityBar
            activePanelId={activePanelId}
            onSelect={setActivePanelId}
          />
        )}
        {!zenMode && activePanelId === "explorer" && (
          <FileTree
            ref={fileTreeRef}
            projectName={activeProject.name}
            onOpenFile={handleOpenFile}
            activeFileId={activeFileId}
            onToggleCollapse={() => setActivePanelId(null)}
            onImportZipProject={handleImportZip}
          />
        )}
        {!zenMode && activePanelId === "search" && (
          <div style={styles.panelRoot} data-sidebar>
            <div style={styles.panelHeader}>SEARCH</div>
            <WorkspaceSearchView
              ref={searchViewRef}
              compact
              onOpenFile={(id) => handleOpenFile(id, { preview: true })}
            />
          </div>
        )}
        {!zenMode && activePanelId === "snapshots" && (
          <div style={styles.panelRoot} data-sidebar>
            <div style={styles.panelHeader}>VERSION HISTORY</div>
            <SnapshotView
              snapshots={snapshots}
              onSaveNew={handleSaveSnapshot}
              onRestore={handleRestoreSnapshot}
              onDelete={handleDeleteSnapshot}
            />
          </div>
        )}
        {!zenMode && activePanelId === "console" && <ConsolePanel />}
        {!zenMode && activePanelId === "outline" && (
          <div style={styles.panelRoot} data-sidebar>
            <div style={styles.panelHeader}>OUTLINE</div>
            <OutlineView
              activeFileId={activeFileId}
              onJump={(fileId, line) => {
                handleOpenFile(fileId, { preview: false });
                // The tab may need a tick to mount its Monaco instance;
                // retry up to a few times until the editor is registered.
                let tries = 0;
                const tick = () => {
                  if (revealLineInFile(fileId, line)) return;
                  if (++tries < 10) setTimeout(tick, 40);
                };
                setTimeout(tick, 50);
              }}
            />
          </div>
        )}

        <div style={styles.editorArea}>
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            {switching ? (
              <div style={styles.switchingOverlay}>Loading project...</div>
            ) : (
              <StrudelEditorClient
                key={activeProject.id}
                shellRef={shellRef}
                onActiveFileChange={setActiveFileId}
                onActiveRuntimeStateChange={handleRuntimeStateChange}
                backgroundCrop={backgroundCrop}
                onBackgroundFileChange={(_groupId, fileId) => {
                  setBackgroundFileId(fileId);
                  // Same persistence as handleSetAsBackground — this
                  // path covers the Cmd+K B keybind which writes
                  // through the shell directly without going via the
                  // file-tree callback.
                  setProjectBackgroundFileId(
                    activeProject.id,
                    fileId,
                  ).catch((err) =>
                    console.warn("[stave] backdrop persist failed:", err),
                  );
                }}
                onTabContextMenu={(tab, x, y) => {
                  const fileId =
                    tab.kind === "editor" || tab.kind === "preview"
                      ? tab.fileId
                      : null;
                  setTabContextMenu({ tabId: tab.id, fileId, x, y });
                }}
                onEditViz={(vizId) => {
                  // Resolve viz name to a workspace file — fuzzy match
                  // (strip spaces, lowercase) so "pianoroll" matches "Piano Roll.p5".
                  const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, "");
                  const target = norm(vizId);
                  const allFiles = listWorkspaceFiles();
                  for (const f of allFiles) {
                    const baseName = f.path.replace(/\.[^.]+$/, "");
                    const lastSeg = baseName.split("/").pop() ?? "";
                    if (norm(lastSeg) === target || norm(baseName) === target) {
                      handleOpenFile(f.id);
                      setActivePanelId("explorer");
                      setTimeout(() => fileTreeRef.current?.revealFile(f.id), 50);
                      return;
                    }
                  }
                  showToast(`Viz file "${vizId}" not found in workspace`, "error");
                }}
                onCropViz={(vizId, presetId, trackKey) => {
                  const fileId = activeFileId ?? listWorkspaceFiles().find(f => f.language === 'strudel' || f.language === 'sonicpi')?.id ?? null;
                  if (!fileId) {
                    showToast("Open an editor file before cropping", "error");
                    return;
                  }
                  // If presetId is null (async preset lookup hasn't completed),
                  // resolve by searching workspace files for a matching viz name.
                  let resolvedPresetId = presetId;
                  if (!resolvedPresetId) {
                    const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, "");
                    const target = norm(vizId);
                    const allFiles = listWorkspaceFiles();
                    const vizFile = allFiles.find(f => {
                      if (f.language !== "p5js" && f.language !== "hydra") return false;
                      const base = f.path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
                      return norm(base) === target;
                    });
                    if (vizFile?.meta?.presetId) {
                      resolvedPresetId = vizFile.meta.presetId as string;
                    }
                  }
                  if (!resolvedPresetId) {
                    showToast(`No preset found for "${vizId}" — save it first`, "error");
                    return;
                  }
                  // Read the live inline viz canvas dimensions so the
                  // crop preview renders at the same native size.
                  const vizCanvas = document.querySelector(
                    `[data-viz-zone-track="${trackKey}"] canvas`
                  ) as HTMLCanvasElement | null;
                  const renderSize = vizCanvas
                    ? { w: vizCanvas.offsetWidth, h: vizCanvas.offsetHeight }
                    : undefined;
                  setCropTarget({ mode: "inline", vizId, presetId: resolvedPresetId, fileId, trackKey, renderSize });
                }}
              />
            )}
          </div>
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

      <input
        ref={importInputRef}
        type="file"
        accept=".zip,application/zip"
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = "";
          if (file) await handleImportZip(file);
        }}
      />

      {tabContextMenu && (
        <>
          <div
            style={styles.tabCtxBackdrop}
            onClick={() => setTabContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setTabContextMenu(null); }}
          />
          <div
            style={{
              ...styles.tabCtxMenu,
              left: tabContextMenu.x,
              top: tabContextMenu.y,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              data-stave-ctx-item
              data-stave-menu-item
              style={styles.menuItem}
              onClick={() => {
                shellRef.current?.closeTabsForFile(
                  tabContextMenu.fileId ?? tabContextMenu.tabId,
                );
                setTabContextMenu(null);
              }}
            >Close</button>
            <button
              data-stave-ctx-item
              data-stave-menu-item
              style={styles.menuItem}
              onClick={() => {
                shellRef.current?.closeOtherTabs(tabContextMenu.tabId);
                setTabContextMenu(null);
              }}
            >Close Others</button>
            <button
              data-stave-ctx-item
              data-stave-menu-item
              style={styles.menuItem}
              onClick={() => {
                shellRef.current?.closeAllTabsInGroup(tabContextMenu.tabId);
                setTabContextMenu(null);
              }}
            >Close All</button>
            {tabContextMenu.fileId && (
              <>
                <div style={styles.menuDivider} />
                <button
                  data-stave-ctx-item
                  style={styles.menuItem}
                  onClick={() => {
                    const fid = tabContextMenu.fileId!;
                    setActivePanelId("explorer");
                    setTabContextMenu(null);
                    // Wait for explorer panel to mount, then reveal.
                    setTimeout(() => fileTreeRef.current?.revealFile(fid), 50);
                  }}
                >Reveal in Sidebar</button>
              </>
            )}
          </div>
        </>
      )}

      <ShortcutsOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <EditorSettingsModal
        open={editorSettingsOpen}
        onClose={() => setEditorSettingsOpen(false)}
      />

      {cropTarget?.mode === "inline" && (
        <CropPopup
          vizId={cropTarget.vizId}
          presetId={cropTarget.presetId}
          fileId={cropTarget.fileId}
          trackKey={cropTarget.trackKey}
          renderSize={cropTarget.renderSize}
          onClose={() => setCropTarget(null)}
        />
      )}
      {cropTarget?.mode === "backdrop" && (
        <CropPopup
          adapter={cropTarget.adapter}
          onClose={() => setCropTarget(null)}
        />
      )}

      <DialogHost />

      {!zenMode && <StatusBar
        projectName={activeProject.name}
        activeFilePath={
          activeFileId
            ? listWorkspaceFiles().find((f) => f.id === activeFileId)?.path ?? null
            : null
        }
        runtime={activeRuntime}
        canUndo={undoState.canUndo}
        canRedo={undoState.canRedo}
        onOpenConsole={() => setActivePanelId("console")}
      />}

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
    zIndex: 0,
    display: "flex",
    flexDirection: "column" as const,
  },
  collapsedStrip: {
    width: 28,
    minWidth: 28,
    height: "100%",
    background: "var(--bg-sidebar)",
    borderRight: "1px solid var(--border-subtle)",
    color: "var(--text-tertiary)",
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
    color: "var(--text-tertiary)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 14,
  },
  panelRoot: {
    width: 240,
    height: "100%",
    background: "var(--bg-panel)",
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  panelHeader: {
    padding: "10px 14px",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.8,
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-subtle)",
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
    color: "var(--text-tertiary)",
    lineHeight: 1.5,
  },
  panelBtn: {
    background: "var(--bg-active)",
    border: "1px solid var(--border-strong)",
    borderRadius: 4,
    color: "var(--text-primary)",
    padding: "6px 12px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    alignSelf: "flex-start",
  },
  tabCtxBackdrop: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 9998,
  },
  tabCtxMenu: {
    position: "fixed" as const,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 4,
    padding: "4px 0",
    zIndex: 9999,
    minWidth: 160,
    boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  menuItem: {
    display: "block",
    width: "100%",
    padding: "6px 14px",
    background: "none",
    border: "none",
    color: "var(--text-chrome)",
    fontSize: 12,
    textAlign: "left" as const,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  menuDivider: {
    height: 1,
    margin: "4px 0",
    background: "var(--border-subtle)",
  },
};
