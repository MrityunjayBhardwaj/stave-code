"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getProject,
  listProjects,
  createProject,
  renameProject,
  deleteProject,
  touchProject,
  switchProject,
  resetFileStore,
  setActiveHistoryFile,
  setFileHistoryTarget,
  HistoryPanel,
  undo,
  redo,
  canUndo,
  canRedo,
  subscribeToUndoState,
  type ProjectMeta,
  type WorkspaceShellHandle,
  type HapStream,
  type BreakpointStore,
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
import {
  bumpEditorFontSize,
  toggleEditorMinimap,
  cycleEditorTheme,
  applyPersistedTheme,
  applyPersistedUiIconSize,
  applyPersistedInlineVizActionSize,
  applyPersistedVizQuality,
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
import { IRInspectorPanel } from "./IRInspectorPanel";
import { registerCommand } from "../commands/registry";
import { installKeybindingDispatcher } from "../commands/keybindings";
import { registerPanel } from "../panels/registry";
import {
  listWorkspaceFiles,
  subscribeToFileList,
  subscribeLog,
  installEngineLogMarkers,
  installGlobalErrorCatch,
  seedWorkspaceFile,
  setContent,
} from "@stave/editor";
import StrudelEditorClient from "./StrudelEditorClient";
import { MusicalTimeline } from "./MusicalTimeline";
import {
  registerBottomPanelTab,
  readPersistedOpen,
  readPersistedActiveTabId,
  setCurrentCycleAccessor,
  setSoundCatalogAccessor,
  notifySoundCatalogChanged,
  groupSoundCatalog,
  setDrumKitAccessor,
  groupDrumKits,
  banksFromDrumMachineManifest,
  type SoundMapDict,
  type DrumMachineManifest,
} from "@stave/editor";
import {
  applyPersistedPerfEnabled,
  togglePerfEnabled,
  applyPersistedAdaptivePerf,
} from "@stave/editor";
import { getLogHistory } from "@stave/editor";
import { isVizLanguage, languageForRenderer } from "@stave/editor";
import { PerfOverlay } from "./PerfOverlay";

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
    applyPersistedVizQuality();
  }, []);

  // Monaco marker bridge — engineLog entries that carry a `source` +
  // `line` become inline squiggles on the matching file's model,
  // cleared whenever `emitFixed` fires for the same (runtime, source).
  // Idempotent — installs on first mount; no-op thereafter.
  useEffect(() => {
    installEngineLogMarkers();
  }, []);

  // Global error floor — catches any throw / rejected promise that
  // escaped the per-runtime bridges. The bridges still enrich known
  // error shapes with friendly messages and source attribution; this
  // is the guarantee that even unknown-shape errors become visible
  // instead of vanishing.
  useEffect(() => {
    installGlobalErrorCatch();
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

  // Open the Version History side panel — now backed by the project commit
  // store (HistoryPanel), not the retired legacy snapshotStore.
  const openSnapshotPanel = useCallback(() => {
    setActivePanelId("snapshots");
  }, []);

  // Global keybinding dispatcher — matches chords against registered
  // commands. Commands register in a later effect once all handlers
  // exist (some handlers close over state defined below this point).
  useEffect(() => installKeybindingDispatcher(), []);

  // Perf profiler (#228): restore the persisted overlay state on load, and bind
  // Alt+P to toggle it (low-collision; the overlay also has a Settings row +
  // window.__stavePerf hook). The profiler is inert when disabled.
  useEffect(() => {
    applyPersistedPerfEnabled();
    // Adaptive performance (the viz GPU-budget governor, P122/PV91) — restore the
    // persisted preference (ON by default) so the governor's live gate agrees.
    applyPersistedAdaptivePerf();
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        togglePerfEnabled();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // (Legacy 60s auto-snapshot retired — the project commit store + its
  //  idle/eval/unload driver, wired in StrudelEditorClient, is now the single
  //  history system. See HistoryPanel in the Version History side panel.)

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

  // Tell the history service which file is focused so the History panel's
  // File scope targets it (Phase G, #197).
  useEffect(() => {
    setActiveHistoryFile(activeFileId);
  }, [activeFileId]);

  /**
   * Promote a viz file to the active group's backdrop, or clear with
   * `null`. The shell's `setBackgroundFile` mutates group state and
   * fires `onBackgroundFileChange`, which StrudelEditorClient records
   * against the active tab (#347 per-tab map — the source of truth for
   * persistence). We only mirror the new value into React state here so
   * the FileTree menu label (Set ↔ Clear) and crop/reveal handlers
   * update without a second round-trip. (#371 — the old project-global
   * `setProjectBackgroundFileId` persist was removed; per-tab is SoT.)
   */
  const handleSetAsBackground = useCallback((fileId: string | null) => {
    shellRef.current?.setBackgroundFile?.(fileId);
    setBackgroundFileId(fileId);
  }, []);

  // E2E-only hook (Phase 21 T5-C/D): seed a custom viz workspace FILE and pin
  // it as the backdrop directly. Production pins the backdrop by mapping a
  // non-underscore code method (`.scope()`/`.pianoroll()`) to a project viz
  // file's basename — only the methods in STRUDEL_VIZ_METHODS are installed,
  // so a one-off custom backdrop sketch can't be reached by code alone. T5
  // proves the BACKDROP surface reads `sig.tracks`/`sig.track(id).color` (T4's
  // compiledVizProvider threading), NOT the method→file mapping, so shortcut
  // only the pin. Guarded on `__STAVE_E2E__`. Uses the SAME `seedWorkspaceFile`
  // + `setBackgroundFile` the production restore/pin paths use.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Defense-in-depth: never install the E2E hooks in a production build —
    // `process.env.NODE_ENV` is statically replaced so the body dead-code-
    // eliminates. The `__STAVE_E2E__` flag is the runtime gate for dev/test.
    if (process.env.NODE_ENV === "production") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any).__STAVE_E2E__) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__staveSeedAndPinBackdrop = (
      id: string,
      name: string,
      renderer: "p5" | "hydra" | "glsl",
      code: string,
    ): boolean => {
      const lang = languageForRenderer(renderer);
      seedWorkspaceFile(id, `preset/viz/${name}.${renderer}`, code, lang, {
        presetId: id,
      });
      handleSetAsBackground(id);
      return true;
    };
    // #257 — expose the engine log so e2e can observe worker viz runtime errors
    // re-emitted into the main engineLog (Console/issues panel).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__staveGetLog = () => getLogHistory();
    // Override an EXISTING workspace viz file's code (e.g. the bundled
    // `preset/viz/spectrum.p5`) so a real non-underscore method (`.spectrum()`)
    // pins it through the production code-driven backdrop path — which is the
    // ONLY path that associates the running audio source with the backdrop
    // PreviewView. A directly-pinned ad-hoc file gets a null audioSource, so
    // T5-C/D drive the real method instead. Returns the file id that was
    // overridden, or null if no workspace file with that basename exists.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__staveOverrideVizFile = (
      basename: string,
      code: string,
    ): string | null => {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const target = norm(basename);
      const f = listWorkspaceFiles().find(
        (wf) =>
          isVizLanguage(wf.language) &&
          norm(wf.path.split("/").pop()!.replace(/\.[^.]+$/, "")) === target,
      );
      if (!f) return null;
      setContent(f.id, code);
      return f.id;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__staveBackgroundFileId = (): string | null =>
      backgroundFileId;
  });

  /**
   * Code-driven backdrop — CODE IS THE SOURCE OF TRUTH. Fires on every
   * Strudel eval with the code's current backdrop viz, or `null` when the
   * code has no non-underscore viz method:
   *   - renderer id ("scope", "pianoroll", …) → pin the matching viz file
   *   - null → clear the backdrop (removing `.scope()` un-pins it; this also
   *     overrides a manually-picked backdrop on the next eval, by design)
   *
   * The backdrop is file-keyed, so we map the renderer id to a project viz
   * FILE by NORMALIZED basename (lowercase, alphanumerics only) — `Piano
   * Roll.p5` matches "pianoroll", `scope.p5` matches "scope". p5js wins over
   * hydra. No-ops when nothing changes (idempotent — no churn in live mode)
   * or when the project has no matching viz file (leaves the backdrop as-is
   * rather than clearing, so a typo'd viz name doesn't blank the screen).
   */
  const handleCodeBackdropChange = useCallback(
    (vizId: string | null) => {
      // #350a — code is a TRANSIENT OVERRIDE on the ACTIVE pane, not the manual
      // sticky. `null` drops the override so the user's manual sticky (if any)
      // shows again — previously this WIPED the sticky ("removing .scope()
      // un-pins"), now superseded by the #350 per-pane precedence model
      // (override ?? sticky). The shell call is idempotent, so no churn in live.
      if (vizId === null) {
        shellRef.current?.setBackgroundOverride?.(null);
        return;
      }
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const target = norm(vizId);
      const matches = listWorkspaceFiles().filter(
        (f) =>
          isVizLanguage(f.language) &&
          norm(f.path.split("/").pop()!.replace(/\.[^.]+$/, "")) === target,
      );
      if (matches.length === 0) return; // no viz file — leave the override as-is
      const fileId =
        matches.find((f) => f.language === "p5js")?.id ?? matches[0].id;
      shellRef.current?.setBackgroundOverride?.(fileId);
    },
    [],
  );

  // Restore the per-project backdrop CROP when the active project
  // changes. The backdrop *file* itself is restored per-tab by
  // StrudelEditorClient (#347 `tabBackdrops` → `setBackgroundFile` on
  // the active-tab sync), which is the source of truth — so this effect
  // no longer reads/pushes `backgroundFileId` (#371 retired the
  // project-global slot, which used to double-restore and fight the
  // per-tab path on reload). Crop stays project-global
  // (`ProjectMeta.backgroundCrop`); it's plain React state consumed by
  // the shell wrapper render, so no shell handle / rAF gating is needed.
  useEffect(() => {
    let cancelled = false;
    getProject(activeProject.id)
      .then((meta) => {
        if (cancelled) return;
        setBackgroundCropState(meta?.backgroundCrop ?? null);
      })
      .catch((err) =>
        console.warn("[stave] backdrop crop restore failed:", err),
      );
    return () => {
      cancelled = true;
    };
  }, [activeProject.id]);

  // Phase 20-01 PR-B (DB-01) — refs hold the latest runtime accessors
  // so the registered MusicalTimeline element never re-registers when
  // the active runtime swaps. Drawer-open + active-tab read through
  // localStorage on every accessor invocation; the rAF loop downstream
  // gates the cost of those reads (DB-08).
  const getCycleRef = useRef<() => number | null>(() => null);
  const getCpsRef = useRef<() => number | null>(() => null);
  // Phase 20-06 (PV38, PK13 step 7+8) — closure-bound accessor onto the
  // active runtime's HapStream for the MusicalTimeline subscriber.
  const getHapStreamRef = useRef<() => HapStream | null>(() => null);
  // #384/#385 — transport seek accessors for the full-song timeline. Same
  // ref-closure shape as getCycleRef so the registered element never
  // re-registers when the active runtime swaps. getSongPosition is the
  // transport-offset-aware clock; onSeek drives runtime.seekTo. Defaults
  // are no-ops so non-Strudel runtimes (DemoEngine, SonicPi) are well-typed.
  const getSongPositionRef = useRef<() => number | null>(() => null);
  const onSeekRef = useRef<(cycle: number) => void>(() => {});
  // #394 — on-demand IR snapshot capture so the full-song view can populate
  // the instant it opens (cold eval publishes its snapshot ~2.5s late). No-op
  // default until a runtime attaches.
  const onRequestSnapshotRef = useRef<() => void>(() => {});
  // Phase 20-07 wave γ (R-2) — Inspector accessors. Live alongside
  // getHapStreamRef. Each ref holds a closure that reads through the
  // active runtime; default returns null/false so renders before the
  // runtime is attached are well-typed. The IRInspectorPanel reads the
  // refs each render via wrapping arrow closures (mirrors 20-06's
  // `getHapStream={() => getHapStreamRef.current()}` shape).
  const getBreakpointStoreRef = useRef<() => BreakpointStore | null>(() => null);
  const getIsPausedRef = useRef<() => boolean>(() => false);
  const onResumeRef = useRef<() => void>(() => {});
  // Listener bus — IRInspectorPanel + Monaco command both subscribe to
  // pause-state transitions through this. Default is "subscribe and
  // immediately unsubscribe" so the panel's useEffect cleanup is safe.
  const onPauseChangedRef = useRef<(cb: (paused: boolean) => void) => () => void>(
    () => () => {},
  );

  const handleRuntimeStateChange = useCallback(
    (
      s:
        | {
            isPlaying: boolean;
            bpm?: number;
            error: string | null;
            getCycle?: () => number | null;
            getCps?: () => number | null;
            getHapStream?: () => HapStream | null;
            // #384/#385 — transport seek accessors (Strudel only).
            getSongPosition?: () => number | null;
            onSeek?: (cycle: number) => void;
            onRequestSnapshot?: () => void;
            // Phase 20-07 wave γ (R-2) — debugger accessors. Optional
            // because non-Strudel runtimes (DemoEngine, SonicPi) skip
            // them; the default no-op refs survive a null assignment.
            getBreakpointStore?: () => BreakpointStore | null;
            getIsPaused?: () => boolean;
            onResume?: () => void;
            onPauseChanged?: (cb: (paused: boolean) => void) => () => void;
          }
        | null,
    ) => {
      // Always update the accessor refs first — even when the status
      // payload didn't change shape, the underlying runtime may have
      // swapped (active tab changed). When `s` is null, swap in
      // no-op accessors so the rAF loop reads `null` and goes idle.
      getCycleRef.current = s?.getCycle ?? (() => null);
      getCpsRef.current = s?.getCps ?? (() => null);
      getHapStreamRef.current = s?.getHapStream ?? (() => null);
      getSongPositionRef.current = s?.getSongPosition ?? (() => null);
      onSeekRef.current = s?.onSeek ?? (() => {});
      onRequestSnapshotRef.current = s?.onRequestSnapshot ?? (() => {});
      // Phase 20-07 wave γ (R-2) — Inspector accessor refs. When `s` is
      // null (runtime detached / non-Strudel tab), the no-op defaults
      // mean IRInspectorPanel renders without breakpoint / pulse / Resume
      // affordances (the legacy 20-04 + 19-08 surface).
      getBreakpointStoreRef.current = s?.getBreakpointStore ?? (() => null);
      getIsPausedRef.current = s?.getIsPaused ?? (() => false);
      onResumeRef.current = s?.onResume ?? (() => {});
      onPauseChangedRef.current = s?.onPauseChanged ?? (() => () => {});
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

  // Phase 20-01 PR-B (DA-05 idempotent replace) — register the real
  // MusicalTimeline content once on mount. PR-A's seedTabs registered
  // a placeholder at editor-bundle load; this useEffect runs after the
  // app mounts and replaces it. Re-registration on every active-tab
  // change would race the BottomPanel subscriber and cause flicker;
  // ref pattern keeps the registered element identity stable.
  useEffect(() => {
    registerBottomPanelTab({
      id: "musical-timeline",
      title: "Timeline",
      content: (
        <MusicalTimeline
          getCycle={() => getCycleRef.current()}
          getCps={() => getCpsRef.current()}
          getHapStream={() => getHapStreamRef.current()}
          getSongPosition={() => getSongPositionRef.current()}
          onSeek={(cycle) => onSeekRef.current(cycle)}
          onRequestSnapshot={() => onRequestSnapshotRef.current()}
          getDrawerOpen={() => readPersistedOpen()}
          getActiveTabId={() => readPersistedActiveTabId()}
        />
      ),
    });
    // No unregister — the tab lives for the lifetime of the app. PR-A's
    // placeholder seed is benign even after a hot reload because the
    // registry's idempotent semantics (DA-05) make re-registration a
    // no-fanfare swap.
  }, []);

  // #391 — expose the live transport cycle to the editor-seeded visual panels
  // (Sequencer / Piano Roll) so they can highlight the playing step. Reuses the
  // same getCycleRef the MusicalTimeline reads (active runtime, gated on
  // isPlaying); the panels run their own rAF against this accessor.
  useEffect(() => {
    setCurrentCycleAccessor(() => getCycleRef.current());
    return () => setCurrentCycleAccessor(null);
  }, []);

  // #514 / PV141 #6 — expose the live instrument registry (superdough's
  // `soundMap`) to the editor-seeded Mixer picker. The app owns superdough; the
  // panel reads the grouped catalog through `useSoundCatalog` and falls back to
  // the curated list until this is available. The soundMap grows async as CDN
  // samples load, so we poll and notify while the count is still changing, then
  // stop once it settles (the store's own subscribe API isn't contractual).
  useEffect(() => {
    const readDict = (): SoundMapDict | null =>
      (globalThis as unknown as { soundMap?: { get?: () => SoundMapDict } })
        .soundMap?.get?.() ?? null;
    setSoundCatalogAccessor(() => groupSoundCatalog(readDict()));
    let lastCount = -1;
    let stable = 0;
    const tick = () => {
      const dict = readDict();
      const count = dict ? Object.keys(dict).length : 0;
      if (count !== lastCount) {
        lastCount = count;
        stable = 0;
        notifySoundCatalogChanged();
      } else {
        stable += 1;
      }
    };
    const id = window.setInterval(() => {
      tick();
      if (stable >= 4) window.clearInterval(id); // count settled → stop polling
    }, 1500);
    tick();
    return () => {
      window.clearInterval(id);
      setSoundCatalogAccessor(null);
    };
  }, []);

  // #515 / PV141 #6 — enumerate live drum banks for the Mixer's Kit picker.
  // Banks load from the tidal-drum-machines manifest (its keys are
  // `Bank_voice`), which the engine also fetches at boot (StrudelEngine.ts:365),
  // so this is usually an HTTP-cache hit. We fetch once, derive the distinct
  // bank names, and register the kit reader; until it resolves (or on any fetch
  // error) the picker falls back to the curated DRUM_KITS.
  useEffect(() => {
    // Same CDN base as StrudelEngine.ts:365 — kept in sync by grep if it moves.
    const MANIFEST_URL = "https://strudel.b-cdn.net/tidal-drum-machines.json";
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(MANIFEST_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const manifest = (await res.json()) as DrumMachineManifest;
        if (cancelled) return;
        const banks = banksFromDrumMachineManifest(manifest);
        // setDrumKitAccessor recomputes + notifies subscribers internally; the
        // manifest is static so one set is enough (no polling, unlike soundMap).
        setDrumKitAccessor(() => groupDrumKits(banks));
      } catch (e) {
        console.warn(
          "[StaveApp] drum-machine manifest fetch failed; Kit picker using curated list.",
          e,
        );
      }
    })();
    return () => {
      cancelled = true;
      setDrumKitAccessor(null);
    };
  }, []);

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
      id: "console",
      title: "Console",
      icon: "terminal",
      order: 50,
      render: () => null,
    }));
    unregs.push(registerPanel({
      id: "ir-inspector",
      title: "IR Inspector",
      icon: "inspect",
      order: 60,
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

  // #347 — backdrop crop/reveal, shared by the menubar bg-popover AND the
  // pattern-bar "set bg" popover (StrudelEditorClient). Both act on the active
  // pane's resolved backdrop (`backgroundFileId`).
  const handleRevealBackdrop = () => {
    if (backgroundFileId) handleOpenFile(backgroundFileId);
  };
  const handleCropBackdrop = () => {
    if (!backgroundFileId) return;
    // Read the actual backdrop container size so the crop preview renders at
    // the same dimensions as the live viz.
    const bgEl = document.querySelector("[data-workspace-background]");
    const rect = bgEl?.getBoundingClientRect();
    const renderSize =
      rect && rect.width > 0
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
  };

  return (
    <div style={styles.root}>
      <MenuBar
        // Backdrop selection moved to the per-tab pattern-bar dropdown (#347);
        // the menubar no longer owns it.
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
            onSelect={(id) => {
              // Opening Version History from the rail shows the PROJECT graph;
              // the per-file focus is only entered via the "File History" action.
              if (id === "snapshots") setFileHistoryTarget(null);
              setActivePanelId(id);
            }}
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
            onFileHistory={(fileId) => {
              setFileHistoryTarget(fileId);
              setActivePanelId("snapshots");
            }}
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
            <div style={{ flex: 1, minHeight: 0 }}>
              <HistoryPanel
                onOpenHistoryTab={(req) => shellRef.current?.openHistoryTab(req)}
              />
            </div>
          </div>
        )}
        {!zenMode && activePanelId === "console" && <ConsolePanel />}
        {!zenMode && activePanelId === "ir-inspector" && (
          <IRInspectorPanel
            getHapStream={() => getHapStreamRef.current()}
            getBreakpointStore={() => getBreakpointStoreRef.current()}
            getIsPaused={() => getIsPausedRef.current()}
            onResume={() => onResumeRef.current()}
            onPauseChanged={(cb) => onPauseChangedRef.current(cb)}
          />
        )}
        <div style={styles.editorArea}>
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            {switching ? (
              <div style={styles.switchingOverlay}>Loading project...</div>
            ) : (
              <StrudelEditorClient
                key={activeProject.id}
                projectId={activeProject.id}
                shellRef={shellRef}
                onActiveFileChange={setActiveFileId}
                onActiveRuntimeStateChange={handleRuntimeStateChange}
                onCodeBackdropChange={handleCodeBackdropChange}
                // #347 — pattern-bar "set bg" popover reuses the same crop /
                // reveal handlers as the menubar bg-popover.
                onCropBackdrop={handleCropBackdrop}
                onRevealBackdrop={handleRevealBackdrop}
                // #350a — mirror the RESOLVED backdrop (code override ?? sticky)
                // so the menubar indicator / popover reflect what's actually
                // showing, including a code-driven `.scope()`. NOT persisted here
                // (code overrides are transient — persistence stays on the manual
                // path); the shell ref-guards this so steady code never churns it.
                onActiveBackdropChange={(fileId) => setBackgroundFileId(fileId)}
                backgroundCrop={backgroundCrop}
                // Mirror every manual sticky into local state for the
                // crop/reveal handlers + file-tree label. Persistence is
                // owned per-tab by StrudelEditorClient's recorder, which
                // wraps this same callback (#347); #371 removed the old
                // project-global `setProjectBackgroundFileId` write here.
                onBackgroundFileChange={(_groupId, fileId) => {
                  setBackgroundFileId(fileId);
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
                  // A base name can exist for both renderers (scope.p5 +
                  // scope.hydra), so prefer the renderer the vizId implies
                  // (bare = p5, ":hydra" suffix = hydra) — a name-only match
                  // would point the crop at the wrong viz.
                  let resolvedPresetId = presetId;
                  if (!resolvedPresetId) {
                    const norm = (s: string) => s.toLowerCase().replace(/[\s\-_:]/g, "");
                    // vizId may carry a renderer qualifier (`name:hydra` /
                    // `name:glsl`) mirroring registerAllVizFiles; a bare name
                    // defaults to the p5 renderer (p5 wins on basename collision).
                    const qual = /:(hydra|glsl)$/i.exec(vizId)?.[1]?.toLowerCase();
                    const wantLang = qual === "hydra" ? "hydra" : qual === "glsl" ? "glsl" : "p5js";
                    const target = norm(vizId.replace(/:(hydra|glsl)$/i, ""));
                    const allFiles = listWorkspaceFiles();
                    const matches = allFiles.filter(f => {
                      if (!isVizLanguage(f.language)) return false;
                      const base = f.path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
                      return norm(base) === target;
                    });
                    const vizFile =
                      matches.find(f => f.language === wantLang) ??
                      matches[0];
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

      {/* Perf overlay (#228) — renders only when profiling is enabled. */}
      <PerfOverlay />

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
