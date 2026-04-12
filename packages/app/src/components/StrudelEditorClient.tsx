"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  WorkspaceShell,
  type WorkspaceShellHandle,
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
  type WorkspaceTab,
  type ChromeContext,
  type VizPreset,
  type PreviewProvider,
} from "@stave/editor";
import { PIANOROLL_P5_CODE, PIANOROLL_HYDRA_CODE } from "../templates";


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
}

export default function StrudelEditorClient({
  shellRef,
  onActiveFileChange,
}: StrudelEditorClientProps = {}) {
  // Register providers once
  ensureProviders();

  // Bundled preset IDs (used for the preset-seeding effect + named-viz
  // registration). Files themselves are seeded by templates.ts at
  // project-creation time — NOT here.
  const [seedState] = useState(() => ({
    p5PresetId: bundledPresetId("Piano Roll", "p5"),
    hydraPresetId: bundledPresetId("Piano Roll Hydra", "hydra"),
  }));

  // Register bundled presets as named viz (for `.viz("Piano Roll")` lookup).
  useEffect(() => {
    const p5Preset: VizPreset = {
      id: seedState.p5PresetId,
      name: "Piano Roll",
      renderer: "p5",
      code: PIANOROLL_P5_CODE,
      requires: ["streaming"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const hydraPreset: VizPreset = {
      id: seedState.hydraPresetId,
      name: "Piano Roll (Hydra)",
      renderer: "hydra",
      code: PIANOROLL_HYDRA_CODE,
      requires: ["audio"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    registerPresetAsNamedViz(p5Preset);
    registerPresetAsNamedViz(hydraPreset);
  }, [seedState.p5PresetId, seedState.hydraPresetId]);

  // Persist bundled presets to IndexedDB (non-blocking, fire-and-forget).
  useEffect(() => {
    async function seedPresets() {
      const LEGACY_IDS = ["pianoroll-p5-custom", "pianoroll-hydra-custom"];
      for (const legacy of LEGACY_IDS) {
        const stale = await VizPresetStore.get(legacy);
        if (stale) await VizPresetStore.delete(legacy);
      }
      const now = Date.now();
      await VizPresetStore.put({
        id: seedState.p5PresetId, name: "Piano Roll", renderer: "p5",
        code: PIANOROLL_P5_CODE, requires: ["streaming"], createdAt: now, updatedAt: now,
      });
      await VizPresetStore.put({
        id: seedState.hydraPresetId, name: "Piano Roll (Hydra)", renderer: "hydra",
        code: PIANOROLL_HYDRA_CODE, requires: ["audio"], createdAt: now, updatedAt: now,
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
      const presetId = getPresetIdForFile(file);
      if (!presetId) return; // Not a viz file backed by a preset — nothing to save.
      flushToPreset(file.id, presetId)
        .then(() => VizPresetStore.get(presetId))
        .then((preset) => {
          // Re-register under the (possibly unchanged) name so inline
          // `.viz("<name>")` resolves to the fresh compiled code.
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

  // Build tabs from the project's current file list. One editor tab per
  // file. The shell reads `initialTabs` once on mount — when the file
  // list changes (add/delete file via sidebar), we remount the shell via
  // the `key` prop so the new tab set takes effect. This is a coarse but
  // simple approach for PM Phase 2.5; a finer imperative API for
  // add/remove tabs is a later enhancement.
  const [fileListRev, setFileListRev] = useState(0);
  useEffect(() => subscribeToFileList(() => setFileListRev((r) => r + 1)), []);

  const initialTabs: WorkspaceTab[] = React.useMemo(() => {
    const files = listWorkspaceFiles();
    return files.map((f) => ({
      kind: "editor" as const,
      id: `tab-${f.id}`,
      fileId: f.id,
    }));
  }, [fileListRev]);

  // Shell remount key — includes file ids so adding/deleting files
  // triggers a remount with the new tab set.
  const shellKey = React.useMemo(
    () => initialTabs.map((t) => t.id).join("|"),
    [initialTabs],
  );

  return (
    <WorkspaceShell
      key={shellKey}
      ref={shellRef}
      initialTabs={initialTabs}
      theme="dark"
      height={560}
      chromeForTab={chromeForTab}
      editorExtrasForTab={editorExtrasForTab}
      previewProviderFor={previewProviderFor}
      onTabClose={handleTabClose}
      onSaveFile={handleSaveFile}
      onActiveTabChange={(tab) =>
        onActiveFileChange?.(
          tab && (tab.kind === "editor" || tab.kind === "preview")
            ? tab.fileId
            : null,
        )
      }
    />
  );
}
