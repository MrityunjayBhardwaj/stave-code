"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useVizRefWatcher } from "../useVizRefWatcher";
import {
  WorkspaceShell,
  getResolvedTheme,
  onThemeChange,
  type WorkspaceShellHandle,
  type ResolvedTheme,
  getFile,
  subscribeToWorkspaceFile,
  listWorkspaceFiles,
  subscribeToFileList,
  registerRuntimeProvider,
  registerPreviewProvider,
  getRuntimeProviderForLanguage,
  getPreviewProviderForLanguage,
  STRUDEL_RUNTIME,
  SONICPI_RUNTIME,
  HYDRA_VIZ,
  P5_VIZ,
  LiveCodingRuntime,
  VizPresetStore,
  bundledPresetId,
  flushToPreset,
  getPresetIdForFile,
  registerPresetAsNamedViz,
  emitLog,
  emitFixed,
  formatFriendlyError,
  parseStrudel,
  collect,
  runPasses,
  publishIRSnapshot,
  type Pass,
  type PatternIR,
  STRUDEL_DOCS_INDEX,
  SONICPI_DOCS_INDEX,
  type DocsIndex,
  type RuntimeId,
  type WorkspaceTab,
  type ChromeContext,
  type VizPreset,
  type PreviewProvider,
} from "@stave/editor";
import { PIANOROLL_P5_CODE, PIANOROLL_HYDRA_CODE, seedMissingPresetFiles } from "../templates";


// Future passes that rewrite Play nodes must preserve or compose `loc` (PV24).
const STRUDEL_PASSES: readonly Pass<PatternIR>[] = [
  { name: "Parsed", run: (ir) => ir },
];


// ---------------------------------------------------------------------------
// Provider registration (idempotent — safe to call on every mount)
// ---------------------------------------------------------------------------

let providersRegistered = false;
function ensureProviders() {
  if (providersRegistered) return;
  providersRegistered = true;
  registerRuntimeProvider(STRUDEL_RUNTIME);
  registerRuntimeProvider(SONICPI_RUNTIME);
  registerPreviewProvider(HYDRA_VIZ);
  registerPreviewProvider(P5_VIZ);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface StrudelEditorClientProps {
  shellRef?: React.RefObject<WorkspaceShellHandle | null>;
  onActiveFileChange?: (fileId: string | null) => void;
  /**
   * Reports the runtime state (playing / bpm / error) for the currently
   * active editor tab, or null when the active tab has no runtime (viz
   * editor, markdown, unknown). StaveApp uses this to drive the status bar.
   */
  onActiveRuntimeStateChange?: (state: {
    fileId: string;
    isPlaying: boolean;
    bpm?: number;
    error: string | null;
  } | null) => void;
  onTabContextMenu?: (tab: WorkspaceTab, x: number, y: number) => void;
  /** Navigate to a viz file when the user clicks the edit icon on an inline viz. */
  onEditViz?: (vizId: string) => void;
  /** Open crop popup when the user clicks the crop icon on an inline viz. */
  onCropViz?: (vizId: string, presetId: string | null, trackKey: string) => void;
  /** Pass-through of the shell's backdrop change callback — fires on any
   *  group's backgroundFileId transition. StaveApp uses this to mirror
   *  the pinned backdrop into its own React state for the FileTree
   *  context-menu label. */
  onBackgroundFileChange?: (groupId: string, fileId: string | null) => void;
  /** Crop region applied to the pinned backdrop. `null` = full rect. */
  backgroundCrop?: { x: number; y: number; w: number; h: number } | null;
}

export default function StrudelEditorClient({
  shellRef,
  onActiveFileChange,
  onActiveRuntimeStateChange,
  onTabContextMenu,
  onEditViz,
  onCropViz,
  onBackgroundFileChange,
  backgroundCrop,
}: StrudelEditorClientProps = {}) {
  // Register providers once
  ensureProviders();

  // Mirror the resolved editor theme so the WorkspaceShell + Monaco
  // re-render when the user flips Dark / Light / System. Initial state
  // pulls from localStorage via getResolvedTheme.
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    typeof window === "undefined" ? "dark" : getResolvedTheme(),
  );
  useEffect(() => onThemeChange(setResolvedTheme), []);

  // Track active file for the viz-ref watcher hook.
  const [watchedFileId, setWatchedFileId] = useState<string | null>(null);
  useVizRefWatcher(watchedFileId);

  // Bundled preset IDs (used for the preset-seeding effect + named-viz
  // registration). Files themselves are seeded by templates.ts at
  // project-creation time — NOT here.
  const [seedState] = useState(() => ({
    p5PresetId: bundledPresetId("Piano Roll", "p5"),
    hydraPresetId: bundledPresetId("Piano Roll Hydra", "hydra"),
  }));

  // Seed any missing viz preset files into the project so older
  // projects get the full set of built-in viz workspace files.
  useEffect(() => { seedMissingPresetFiles(); }, []);

  // Register ALL .p5/.hydra workspace files as named viz presets so
  // `.viz("name")` works for user-created files, not just bundled ones.
  useEffect(() => {
    async function registerAllVizFiles() {
      const allFiles = listWorkspaceFiles();
      for (const f of allFiles) {
        if (f.language !== "p5js" && f.language !== "hydra") continue;
        let presetId = getPresetIdForFile(f);
        if (!presetId) {
          const baseName = f.path.replace(/\.[^.]+$/, "");
          presetId = `user_${baseName.replace(/[^a-zA-Z0-9]/g, "_")}`;
        }
        await flushToPreset(f.id, presetId);
        const preset = await VizPresetStore.get(presetId);
        if (preset) registerPresetAsNamedViz(preset);
      }
    }
    registerAllVizFiles();
  }, []);

  // Register bundled presets as named viz (for `.viz("Piano Roll")` lookup).
  useEffect(() => {
    const p5Preset: VizPreset = {
      id: seedState.p5PresetId,
      name: "Piano Roll",
      renderer: "p5",
      code: PIANOROLL_P5_CODE,
      requires: ["streaming"],
      // Wide-and-short scrolling-timeline aspect — matches the historical
      // pianoroll look (pre-WYSIWYG default used createCanvas(stave.width,
      // stave.height) which resolved to ~1400×200 in practice).
      nativeSize: { w: 1400, h: 350 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const hydraPreset: VizPreset = {
      id: seedState.hydraPresetId,
      name: "Piano Roll (Hydra)",
      renderer: "hydra",
      code: PIANOROLL_HYDRA_CODE,
      requires: ["audio"],
      nativeSize: { w: 1400, h: 400 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    registerPresetAsNamedViz(p5Preset);
    registerPresetAsNamedViz(hydraPreset);
  }, [seedState.p5PresetId, seedState.hydraPresetId]);

  // Persist bundled presets to IndexedDB (non-blocking, fire-and-forget).
  // IMPORTANT: merge with existing presets to preserve user-set fields
  // like cropRegion that aren't part of the bundled code template.
  useEffect(() => {
    async function seedPresets() {
      const LEGACY_IDS = ["pianoroll-p5-custom", "pianoroll-hydra-custom"];
      for (const legacy of LEGACY_IDS) {
        const stale = await VizPresetStore.get(legacy);
        if (stale) await VizPresetStore.delete(legacy);
      }
      const now = Date.now();
      const existingP5 = await VizPresetStore.get(seedState.p5PresetId);
      await VizPresetStore.put({
        ...existingP5,
        id: seedState.p5PresetId, name: "Piano Roll", renderer: "p5",
        code: PIANOROLL_P5_CODE, requires: ["streaming"],
        nativeSize: existingP5?.nativeSize ?? { w: 1400, h: 350 },
        createdAt: existingP5?.createdAt ?? now, updatedAt: now,
      });
      const existingHydra = await VizPresetStore.get(seedState.hydraPresetId);
      await VizPresetStore.put({
        ...existingHydra,
        id: seedState.hydraPresetId, name: "Piano Roll (Hydra)", renderer: "hydra",
        code: PIANOROLL_HYDRA_CODE, requires: ["audio"],
        nativeSize: existingHydra?.nativeSize ?? { w: 1400, h: 400 },
        createdAt: existingHydra?.createdAt ?? now, updatedAt: now,
      });
    }
    seedPresets();
  }, [seedState.p5PresetId, seedState.hydraPresetId]);

  // ── Runtime management ──────────────────────────────────────────────
  // One LiveCodingRuntime per pattern-file tab, keyed by fileId. Per-file
  // runtime state (isPlaying/error/bpm/autoRefresh) mirrors runtime events
  // into React state so chromeForTab can read it cheaply.
  const runtimesRef = useRef<Map<string, LiveCodingRuntime>>(new Map());
  const [runtimeStates, setRuntimeStates] = useState<Map<string, {
    isPlaying: boolean; error: Error | null; bpm?: number; autoRefresh: boolean;
  }>>(new Map());

  const getOrCreateRuntime = useCallback((fileId: string): LiveCodingRuntime | null => {
    if (runtimesRef.current.has(fileId)) return runtimesRef.current.get(fileId)!;
    const file = getFile(fileId);
    if (!file) return null;
    const provider = getRuntimeProviderForLanguage(file.language);
    if (!provider) return null;

    const engine = provider.createEngine();
    // Pass the workspace-file subscriber so the runtime's live mode can
    // hook into content changes for debounced re-evaluate. The subscription
    // is installed lazily inside the runtime — no cost until live mode is
    // toggled on.
    const runtime = new LiveCodingRuntime(
      fileId,
      engine,
      () => getFile(fileId)?.content ?? "",
      (cb) => subscribeToWorkspaceFile(fileId, cb),
    );

    runtime.onPlayingChanged((playing: boolean) => {
      setRuntimeStates(prev => {
        const next = new Map(prev);
        const cur = next.get(fileId) ?? { isPlaying: false, error: null, autoRefresh: false };
        next.set(fileId, { ...cur, isPlaying: playing, bpm: runtime.getBpm() });
        return next;
      });
    });
    runtime.onError((err: Error) => {
      setRuntimeStates(prev => {
        const next = new Map(prev);
        const cur = next.get(fileId) ?? { isPlaying: false, error: null, autoRefresh: false };
        next.set(fileId, { ...cur, error: err });
        return next;
      });
      // Pipe into the shared event store so toast / status-bar / console
      // panel / Monaco markers can all react. Runtime identity comes from
      // the workspace file's language (strudel | sonicpi — no other
      // languages are wired to LiveCodingRuntime today).
      const fileNow = getFile(fileId);
      const runtimeId: RuntimeId = fileNow?.language === "sonicpi" ? "sonicpi" : "strudel";
      const index: DocsIndex = runtimeId === "sonicpi" ? SONICPI_DOCS_INDEX : STRUDEL_DOCS_INDEX;
      const parts = formatFriendlyError(err, runtimeId, { index });
      // Strudel routes user code through `@strudel/transpiler`, which
      // rewrites `$:` sugar into method calls and wraps everything in
      // an async IIFE. The resulting wrapper offset is NOT constant —
      // it depends on how many `$:` lines the user has and which
      // transpiler rules fire — so a naive offset constant (like p5's
      // or Hydra's) would drift per sketch. We deliberately drop
      // `parts.line` here: the Console row + toast still surface the
      // error, and the engineLogMarkers bridge's out-of-range guard
      // keeps a bogus stack line from painting the whole file.
      // Sonic Pi's Ruby errors carry user-file lines natively, so the
      // same treatment isn't needed there — but the runtime dispatch
      // here doesn't distinguish, and dropping the line for Sonic Pi
      // is the conservative default until we wire a Ruby-aware
      // line extractor.
      emitLog({
        level: "error",
        runtime: runtimeId,
        source: fileNow?.path ?? fileId,
        message: parts.message,
        suggestion: parts.suggestion,
        stack: parts.stack,
        column: parts.column,
      });
    });
    // Live-mode re-eval has no user-driven play() to clear the error state,
    // so a transient syntax error stays visible until stop+play. Clearing on
    // every successful evaluate gives the "fix-and-continue" flow its natural
    // feedback: marker appears while broken, disappears the moment it parses.
    runtime.onEvaluateSuccess(() => {
      setRuntimeStates(prev => {
        const next = new Map(prev);
        const cur = next.get(fileId) ?? { isPlaying: false, error: null, autoRefresh: false };
        if (cur.error === null) return prev;
        next.set(fileId, { ...cur, error: null });
        return next;
      });
      // Record a fix marker so the Console panel's Live mode can hide
      // any log entry emitted before this clean eval. Non-destructive —
      // history stays intact for users who want the full trail.
      const fileNow = getFile(fileId);
      const runtimeId: RuntimeId = fileNow?.language === "sonicpi" ? "sonicpi" : "strudel";
      emitFixed({ runtime: runtimeId, source: fileNow?.path ?? fileId });

      // IR Inspector snapshot — only meaningful for Strudel today.
      // parseStrudel + collect are pure and cheap on the user's source
      // string; published via the irInspector store so the panel can
      // re-render without coupling to the editor lifecycle. `source`
      // is the workspace fileId (NOT the human-visible path) because
      // revealLineInFile keys by id; the Inspector's click-to-source
      // handler depends on this lookup matching.
      if (runtimeId === "strudel" && fileNow) {
        try {
          const ir = parseStrudel(fileNow.content);
          const passes = runPasses(ir, STRUDEL_PASSES);
          // finalIR drives both `collect` (events reflect post-pass IR
          // when real passes land later) and the `ir` alias on the
          // snapshot. Single source of truth — passes[last].ir and the
          // alias cannot drift apart.
          const finalIR = passes[passes.length - 1].ir;
          const events = collect(finalIR);
          publishIRSnapshot({
            ts: Date.now(),
            source: fileNow.id,
            runtime: "strudel",
            code: fileNow.content,
            passes,
            ir: finalIR, // alias of passes[last].ir per IRSnapshot contract
            events,
          });
        } catch {
          // parseStrudel guarantees graceful fallback to Code node;
          // collect is total. Anything thrown here is unexpected — keep
          // the eval-success path quiet.
        }
      }
    });
    runtime.onAutoRefreshChanged((enabled: boolean) => {
      setRuntimeStates(prev => {
        const next = new Map(prev);
        const cur = next.get(fileId) ?? { isPlaying: false, error: null, autoRefresh: false };
        next.set(fileId, { ...cur, autoRefresh: enabled });
        return next;
      });
    });

    runtimesRef.current.set(fileId, runtime);
    return runtime;
  }, []);

  // Cleanup all runtimes on unmount
  useEffect(() => () => {
    runtimesRef.current.forEach(rt => rt.dispose());
    runtimesRef.current.clear();
  }, []);

  // ── Shell callbacks ─────────────────────────────────────────────────

  const handlePlay = useCallback((fileId: string) => {
    const rt = getOrCreateRuntime(fileId);
    if (!rt) return;
    setRuntimeStates(prev => {
      const next = new Map(prev);
      const cur = prev.get(fileId) ?? { isPlaying: false, error: null, autoRefresh: false };
      next.set(fileId, { ...cur, error: null });
      return next;
    });
    rt.play();
  }, [getOrCreateRuntime]);

  const handleStop = useCallback((fileId: string) => {
    const rt = runtimesRef.current.get(fileId);
    if (rt) rt.stop();
  }, []);

  // Live-mode toggle. The runtime owns the subscription + debounce; we
  // just flip the flag and let runtime.onAutoRefreshChanged drive the
  // React state update (handled by the listener registered in
  // getOrCreateRuntime). Creating the runtime lazily here covers the
  // case where the user toggles live mode before pressing Play — the
  // runtime exists, the flag is set, and the first play() wires the
  // subscription.
  const handleToggleAutoRefresh = useCallback((fileId: string) => {
    const rt = getOrCreateRuntime(fileId);
    if (!rt) return;
    rt.setAutoRefresh(!rt.isAutoRefreshEnabled());
  }, [getOrCreateRuntime]);

  // chromeForTab: runtime chrome for pattern files only. Viz editor chrome
  // (Preview / Background / Save) is resolved by WorkspaceShell's internal
  // fallback via `previewProviderFor` — that path already wires Cmd+K V / B
  // through `executeCommand`, and the Save button is wired via the
  // `onSaveFile` prop below. Handling it here too would duplicate the
  // command plumbing and lose the shell's active-group context.
  const chromeForTab = useCallback((tab: WorkspaceTab) => {
    if (tab.kind !== "editor") return undefined;
    const file = getFile(tab.fileId);
    if (!file) return undefined;

    const runtimeProvider = getRuntimeProviderForLanguage(file.language);
    if (!runtimeProvider) return undefined;

    const rt = getOrCreateRuntime(tab.fileId);
    if (!rt) return undefined;
    const state = runtimeStates.get(tab.fileId) ?? {
      isPlaying: false, error: null, autoRefresh: false,
    };
    const ctx: ChromeContext = {
      runtime: rt,
      file,
      isPlaying: state.isPlaying,
      error: state.error,
      bpm: state.bpm,
      onPlay: () => handlePlay(tab.fileId),
      onStop: () => handleStop(tab.fileId),
      autoRefresh: state.autoRefresh,
      onToggleAutoRefresh: () => handleToggleAutoRefresh(tab.fileId),
    };
    return runtimeProvider.renderChrome(ctx);
  }, [getOrCreateRuntime, runtimeStates, handlePlay, handleStop, handleToggleAutoRefresh]);

  // onSaveFile: Cmd+S / Save button handler. For viz files, flush the
  // current in-memory content back to VizPresetStore via the bridge,
  // then re-register the named viz so pattern files referencing it by
  // name pick up the new code on their next evaluate.
  //
  // For pattern files, no-op for now (pattern files aren't persisted
  // to IndexedDB in 10.2 — that's Phase 10.3's VirtualFileSystem job).
  const handleSaveFile = useCallback(
    (tab: WorkspaceTab & { kind: "editor" }) => {
      const file = getFile(tab.fileId);
      if (!file) return;

      // Only viz files (.p5 / .hydra) get flushed to a preset.
      const isVizFile = file.language === "p5js" || file.language === "hydra";
      if (!isVizFile) return;

      // Use existing presetId, or auto-generate one for manually created
      // viz files so they become available to `.viz("name")`.
      let presetId = getPresetIdForFile(file);
      if (!presetId) {
        const baseName = file.path.replace(/\.[^.]+$/, "");
        presetId = `user_${baseName.replace(/[^a-zA-Z0-9]/g, "_")}`;
      }

      flushToPreset(file.id, presetId)
        .then(() => VizPresetStore.get(presetId))
        .then((preset) => {
          if (preset) registerPresetAsNamedViz(preset);
        })
        .catch((err) => {
          console.warn("[stave] flushToPreset failed:", err);
        });
    },
    [],
  );

  // editorExtrasForTab: play/stop keybindings + error squiggles
  const editorExtrasForTab = useCallback((tab: WorkspaceTab & { kind: "editor" }) => {
    const file = getFile(tab.fileId);
    if (!file) return undefined;
    const provider = getRuntimeProviderForLanguage(file.language);
    if (!provider) return undefined;

    const state = runtimeStates.get(tab.fileId) ?? {
      isPlaying: false, error: null, autoRefresh: false,
    };
    return {
      onPlay: () => {
        if (state.isPlaying) handleStop(tab.fileId);
        else handlePlay(tab.fileId);
      },
      onStop: () => handleStop(tab.fileId),
      error: state.error,
    };
  }, [runtimeStates, handlePlay, handleStop]);

  // previewProviderFor: preview provider resolution for viz tabs
  const previewProviderFor = useCallback((tab: WorkspaceTab & { kind: "preview" }): PreviewProvider | undefined => {
    const file = getFile(tab.fileId);
    if (!file) return undefined;
    return getPreviewProviderForLanguage(file.language) ?? undefined;
  }, []);

  // onTabClose: dispose runtime when pattern tab is closed (U3)
  const handleTabClose = useCallback((closingTab: WorkspaceTab) => {
    if (closingTab.kind !== "editor") return;
    const rt = runtimesRef.current.get(closingTab.fileId);
    if (rt) {
      rt.dispose();
      runtimesRef.current.delete(closingTab.fileId);
      setRuntimeStates(prev => {
        const next = new Map(prev);
        next.delete(closingTab.fileId);
        return next;
      });
    }
  }, []);

  // Seed initial tabs from the current file list — one editor tab per
  // file. The shell reads `initialTabs` once on mount; after that we
  // drive add/remove imperatively so create/delete in the sidebar
  // doesn't blow away the whole tab layout.
  const initialTabs: WorkspaceTab[] = React.useMemo(() => {
    const files = listWorkspaceFiles();
    return files.map((f) => ({
      kind: "editor" as const,
      id: `tab-${f.id}`,
      fileId: f.id,
    }));
    // initialTabs is consumed once on mount — intentionally empty deps
    // so the memo is stable and we don't rebuild tabs for the shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Incremental sync: watch the file list and route adds to
  // openOrFocusFile, deletes to closeTabsForFile. The shell mounts once
  // and mutates in place — no flash, no tab-set churn.
  const prevFileIdsRef = useRef<Set<string>>(new Set(initialTabs.map((t) => t.fileId!)));
  useEffect(() => {
    return subscribeToFileList(() => {
      const current = new Set(listWorkspaceFiles().map((f) => f.id));
      const prev = prevFileIdsRef.current;
      const added: string[] = [];
      const removed: string[] = [];
      for (const id of current) if (!prev.has(id)) added.push(id);
      for (const id of prev) if (!current.has(id)) removed.push(id);
      prevFileIdsRef.current = current;
      const handle = shellRef?.current;
      if (!handle) return;
      for (const id of removed) handle.closeTabsForFile(id);
      for (const id of added) handle.openOrFocusFile(id);
    });
  }, [shellRef]);

  // Whenever runtimeStates change for the currently-active fileId, push
  // the fresh state up to the status bar. Tracked separately from tab
  // switches because `play` / `stop` / error events mutate runtimeStates
  // without changing the active tab.
  const activeFileIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onActiveRuntimeStateChange) return;
    const fid = activeFileIdRef.current;
    if (!fid) return;
    const st = runtimeStates.get(fid);
    onActiveRuntimeStateChange(
      st
        ? {
            fileId: fid,
            isPlaying: st.isPlaying,
            bpm: st.bpm,
            error: st.error ? st.error.message : null,
          }
        : null,
    );
  }, [runtimeStates, onActiveRuntimeStateChange]);

  return (
    <WorkspaceShell
      ref={shellRef}
      initialTabs={initialTabs}
      theme={resolvedTheme}
      height="100%"
      chromeForTab={chromeForTab}
      editorExtrasForTab={editorExtrasForTab}
      previewProviderFor={previewProviderFor}
      onTabClose={handleTabClose}
      onSaveFile={handleSaveFile}
      onTabContextMenu={onTabContextMenu}
      onEditViz={onEditViz}
      onCropViz={onCropViz}
      onBackgroundFileChange={onBackgroundFileChange}
      backgroundCrop={backgroundCrop}
      onActiveTabChange={(tab) => {
        const fid =
          tab && (tab.kind === "editor" || tab.kind === "preview")
            ? tab.fileId
            : null;
        activeFileIdRef.current = fid;
        setWatchedFileId(fid);
        onActiveFileChange?.(fid);
        if (!onActiveRuntimeStateChange) return;
        if (!fid) {
          onActiveRuntimeStateChange(null);
          return;
        }
        const st = runtimeStates.get(fid);
        onActiveRuntimeStateChange(
          st
            ? {
                fileId: fid,
                isPlaying: st.isPlaying,
                bpm: st.bpm,
                error: st.error ? st.error.message : null,
              }
            : null,
        );
      }}
    />
  );
}
