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
  initHistory,
  startHistoryDriver,
  resetHistoryState,
  commitWorkspace,
  getViewedContent,
  isViewing,
  subscribeToRuntimeView,
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
  resolveAlias,
  collectCycles,
  runPasses,
  publishIRSnapshot,
  IR,
  runRawStage,
  runMiniExpandedStage,
  runChainAppliedStage,
  runFinalStage,
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
  type HapStream,
  type BreakpointStore,
  loadShellState,
  saveShellState,
  buildDefaultSnapshot,
  hydrateSnapshot,
  type ShellSnapshot,
  PIANOROLL_P5_CODE,
} from "@stave/editor";
import { PIANOROLL_HYDRA_CODE, seedMissingPresetFiles } from "../templates";


// Phase 19-07 (#79) — 4-stage parser pipeline. Each stage emits its own
// IRSnapshot.passes[] entry; FINAL output is byte-identical to today's
// parseStrudel(code). Tab name 'Parsed' kept for IRInspectorPanel
// persistence backward-compat (RESEARCH §3.2). RAW reads input.code from
// the pre-pass-0 seed (Code-wrapped raw source); subsequent stages take
// the previous stage's PatternIR output. Future passes that rewrite Play
// nodes must preserve or compose `loc` (PV24).
const STRUDEL_PASSES: readonly Pass<PatternIR>[] = [
  { name: "RAW",            run: runRawStage           },
  { name: "MINI-EXPANDED",  run: runMiniExpandedStage  },
  { name: "CHAIN-APPLIED",  run: runChainAppliedStage  },
  { name: "Parsed",         run: runFinalStage         },
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
  /**
   * Active project id — used to scope the workspace-shell state
   * persistence (issue #175). StaveApp already keys this component by
   * `activeProject.id`, so within a single mount the id is stable; on
   * project switch the component remounts and reads the new project's
   * persisted tabs.
   */
  projectId: string;
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
    /**
     * Phase 20-01 PR-B (DB-01) — live runtime accessors carried alongside
     * the status payload so subscribers (notably MusicalTimeline) can
     * sample `getCurrentCycle()` / cps on a hot loop without coupling to
     * the runtime map. Both return `null` when the engine isn't running.
     */
    getCycle: () => number | null;
    getCps: () => number | null;
    /**
     * Phase 20-06 (PV38, PK13 step 7+8) — accessor onto the engine's
     * HapStream so the MusicalTimeline subscriber can resolve to a live
     * stream through the same closure-bound pattern. Returns null when
     * the engine isn't running or the runtime is non-Strudel.
     */
    getHapStream: () => HapStream | null;
    /**
     * Phase 20-07 wave γ (R-2) — debugger accessors. Mirror the
     * `getHapStream` shape: closure-bound reads through `runtimesRef`
     * so the closures stay valid across active-tab swaps. Non-Strudel
     * runtimes return null/false/no-op disposers (LiveCodingRuntime
     * delegates with optional chaining).
     */
    getBreakpointStore: () => BreakpointStore | null;
    getIsPaused: () => boolean;
    onResume: () => void;
    onPauseChanged: (cb: (paused: boolean) => void) => () => void;
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
  /**
   * Fires after EVERY successful Strudel evaluate with the code's current
   * backdrop viz — the resolved renderer id of a non-underscore viz method
   * (`.scope()`, `.pianoroll()`, …), or `null` when the code has none. Code
   * is the source of truth: StaveApp pins the resolved viz file as the
   * backdrop, or clears the backdrop when `null` (so removing the method
   * un-pins it). Fires on every eval so the backdrop tracks code edits.
   */
  onCodeBackdropChange?: (vizId: string | null) => void;
}

export default function StrudelEditorClient({
  projectId,
  shellRef,
  onActiveFileChange,
  onActiveRuntimeStateChange,
  onTabContextMenu,
  onEditViz,
  onCropViz,
  onBackgroundFileChange,
  backgroundCrop,
  onCodeBackdropChange,
}: StrudelEditorClientProps) {
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
      const vizFiles = allFiles.filter(
        (f) => f.language === "p5js" || f.language === "hydra",
      );
      // Basename (sans extension) of every p5 viz file. When a hydra file
      // shares a basename with a p5 file (e.g. scope.p5 + scope.hydra), the
      // bare mode name belongs to the p5 default renderer — register the
      // hydra one as "<name>:hydra" so inline `.viz("scope")` deterministically
      // resolves to the p5 preset instead of last-write-wins (#181). This
      // also keeps inline `.viz("scope")` in lockstep with the `.scope()`
      // backdrop, which always prefers the p5 file.
      const baseOf = (p: string) =>
        p.split("/").pop()!.replace(/\.[^.]+$/, "");
      const p5Basenames = new Set(
        vizFiles.filter((f) => f.language === "p5js").map((f) => baseOf(f.path)),
      );
      for (const f of vizFiles) {
        let presetId = getPresetIdForFile(f);
        if (!presetId) {
          const baseName = f.path.replace(/\.[^.]+$/, "");
          presetId = `user_${baseName.replace(/[^a-zA-Z0-9]/g, "_")}`;
        }
        await flushToPreset(f.id, presetId);
        const preset = await VizPresetStore.get(presetId);
        if (!preset) continue;
        const base = baseOf(f.path);
        const name =
          f.language === "hydra" && p5Basenames.has(base)
            ? `${base}:hydra`
            : preset.name;
        registerPresetAsNamedViz(preset, name);
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

  // Persist bundled presets to IndexedDB on FIRST seed only — never
  // overwrite an existing entry. Earlier the bundled `code` was put
  // back every mount, which silently erased user edits to the bundled
  // Piano Roll preset on every reload (#189). Workspace files follow
  // the same seed-when-missing rule via `seedWorkspaceFile`; bringing
  // VizPresetStore in line removes the "bundled preset is privileged"
  // duality at the data layer.
  useEffect(() => {
    async function seedPresets() {
      const LEGACY_IDS = ["pianoroll-p5-custom", "pianoroll-hydra-custom"];
      for (const legacy of LEGACY_IDS) {
        const stale = await VizPresetStore.get(legacy);
        if (stale) await VizPresetStore.delete(legacy);
      }
      const now = Date.now();
      const existingP5 = await VizPresetStore.get(seedState.p5PresetId);
      if (!existingP5) {
        await VizPresetStore.put({
          id: seedState.p5PresetId, name: "Piano Roll", renderer: "p5",
          code: PIANOROLL_P5_CODE, requires: ["streaming"],
          nativeSize: { w: 1400, h: 350 },
          createdAt: now, updatedAt: now,
        });
      }
      const existingHydra = await VizPresetStore.get(seedState.hydraPresetId);
      if (!existingHydra) {
        await VizPresetStore.put({
          id: seedState.hydraPresetId, name: "Piano Roll (Hydra)", renderer: "hydra",
          code: PIANOROLL_HYDRA_CODE, requires: ["audio"],
          nativeSize: { w: 1400, h: 400 },
          createdAt: now, updatedAt: now,
        });
      }
    }
    seedPresets();
  }, [seedState.p5PresetId, seedState.hydraPresetId]);

  // Project commit store (file-history Phase F, #196). Seeds commit c0 from
  // the live workspace on first run (the workspace files are already present
  // at mount — registerAllVizFiles above relies on the same), then starts the
  // idle + unload auto-commit driver. Per-eval commits are fired from
  // onEvaluateSuccess below. Runs alongside the legacy snapshotStore-backed
  // Version History panel; Phase G (#197) unifies the UI and retires the old.
  useEffect(() => {
    let cancelled = false;
    let teardown = () => {};
    (async () => {
      await initHistory(projectId);
      if (cancelled) return;
      teardown = startHistoryDriver();
    })();
    return () => {
      cancelled = true;
      teardown();
      resetHistoryState();
    };
  }, [projectId]);

  // ── Runtime management ──────────────────────────────────────────────
  // One LiveCodingRuntime per pattern-file tab, keyed by fileId. Per-file
  // runtime state (isPlaying/error/bpm/autoRefresh) mirrors runtime events
  // into React state so chromeForTab can read it cheaply.
  const runtimesRef = useRef<Map<string, LiveCodingRuntime>>(new Map());
  // Latest-value ref: each runtime's onEvaluateSuccess handler is registered
  // ONCE (runtimes are cached in runtimesRef), so reading the prop directly in
  // that closure would capture the first-render value. The ref keeps the call
  // fresh across re-renders without re-creating runtimes.
  const onCodeBackdropChangeRef = useRef(onCodeBackdropChange);
  onCodeBackdropChangeRef.current = onCodeBackdropChange;
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
      // #204 time-travel: when a commit is checked out, the runtime evaluates
      // its snapshot content; falls back to live Y.Text when not viewing.
      () => getViewedContent(fileId) ?? getFile(fileId)?.content ?? "",
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
      // Phase 20-14 β-5 — pull the per-eval alias resolutions off the
      // engine instance (StrudelEngine-only — duck-typed so non-Strudel
      // engines harmlessly pass `undefined`). The friendly-error builder
      // appends "tried alias `kick` → `bd`" on the resolved path and
      // "alias map: no entry for `xyz`" on the miss path.
      const engineWithAlias = engine as unknown as {
        getLastAliasResolutions?: () => ReadonlyArray<{ from: string; to: string }>;
      };
      const aliasResolutions = engineWithAlias.getLastAliasResolutions?.();
      const parts = formatFriendlyError(err, runtimeId, {
        index,
        aliasContext: runtimeId === "strudel"
          ? { resolutions: aliasResolutions, lookupAlias: resolveAlias }
          : undefined,
      });
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
      // Per-eval commit (file-history Phase F, #196 / RESEARCH Q1): an eval is
      // an intentional checkpoint, so capture the state that produced this
      // sound — bypassing the significance floor. No-op if nothing changed
      // since HEAD, so frequent live-mode re-evals stay cheap.
      // Paused while time-travelling (#204 Decision D): the re-eval that
      // enters/exits a view fires onEvaluateSuccess, but the view must never
      // drive a commit (it would just capture live state at a confusing time).
      if (!isViewing()) {
        void commitWorkspace("auto", { gate: false }).catch((err) =>
          console.warn("[stave] eval commit failed:", err),
        );
      }

      // IR Inspector snapshot — only meaningful for Strudel today.
      // parseStrudel + collect are pure and cheap on the user's source
      // string; published via the irInspector store so the panel can
      // re-render without coupling to the editor lifecycle. `source`
      // is the workspace fileId (NOT the human-visible path) because
      // revealLineInFile keys by id; the Inspector's click-to-source
      // handler depends on this lookup matching.
      if (runtimeId === "strudel" && fileNow) {
        try {
          // Phase 19-07 (#79) — pre-pass-0 seed: wrap raw source as a
          // Code node so pass 0 (RAW) reads input.code and runs
          // extractTracks. runPasses signature unchanged. End-to-end
          // FINAL output (passes[last].ir) is byte-identical to today's
          // parseStrudel(code) (D-06 regression gate; verified by
          // parity.test.ts + parseStrudel.stages.test.ts).
          const seed: PatternIR = IR.code(fileNow.content);
          const passes = runPasses(seed, STRUDEL_PASSES);
          // finalIR drives both `collect` (events reflect post-pass IR
          // when real passes land later) and the `ir` alias on the
          // snapshot. Single source of truth — passes[last].ir and the
          // alias cannot drift apart (PV27).
          const finalIR = passes[passes.length - 1].ir;
          // Phase 20-12 — collect across the same cycle window the
          // timeline displays. WINDOW_CYCLES (musicalTimeline/timeAxis.ts)
          // is currently 2; collecting only [0, 1) leaves the cycle-1
          // column empty for static viz. `collectCycles` loops collect()
          // once per cycle so cross-cycle alternation patterns
          // (`<a b c>`), randomized patterns, and steady-state loops all
          // render their full visible-window shape. The constant is
          // duplicated here because chrome (app) and engine (editor)
          // can't import each other; if WINDOW_CYCLES changes there,
          // update this number to match.
          const TIMELINE_WINDOW_CYCLES = 2;
          const events = collectCycles(finalIR, 0, TIMELINE_WINDOW_CYCLES);
          publishIRSnapshot(
            {
              ts: Date.now(),
              source: fileNow.id,
              runtime: "strudel",
              code: fileNow.content,
              passes,
              ir: finalIR, // alias of passes[last].ir per IRSnapshot contract
              events,
            },
            // Phase 19-08: cycleCount lands on the timeline capture entry
            // (not on IRSnapshot) so PV27's per-snapshot alias contract
            // stays untouched. `getCurrentCycle()` returns null when the
            // scheduler is unavailable; the timeline tooltip falls back
            // to wall-clock in that case.
            { cycleCount: runtime.getCurrentCycle() },
          );
        } catch {
          // parseStrudel guarantees graceful fallback to Code node;
          // collect is total. Anything thrown here is unexpected — keep
          // the eval-success path quiet.
        }

        // Code-driven backdrop — a non-underscore viz method (`.scope()`,
        // `.pianoroll()`, …) maps to Stave's backdrop; its absence clears it.
        // Code is the source of truth, so we forward on EVERY eval (null
        // included) — removing the method un-pins the backdrop on next eval.
        // StaveApp resolves the id to a viz file (or clears) and the "set bg"
        // UI auto-updates. Idempotent on StaveApp's side (no churn in live mode).
        onCodeBackdropChangeRef.current?.(runtime.getBackdropVizRequest());
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

  // #204 time-travel: on checkout enter/exit/swap, re-evaluate every PLAYING
  // runtime so audio + inline viz reflect the swapped content. The content
  // source now reads getViewedContent first, so play() re-evals the snapshot
  // (or live, on exit). Non-playing runtimes are left alone — checkout must
  // never auto-start audio.
  useEffect(
    () =>
      subscribeToRuntimeView(() => {
        runtimesRef.current.forEach((rt) => {
          if (rt.getIsPlaying()) void rt.play();
        });
      }),
    [],
  );

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

  // Seed the shell's initial state from persistence (issue #175). The
  // shell reads these props exactly once on mount; after that we drive
  // add/remove imperatively so create/delete in the sidebar doesn't blow
  // away the whole tab layout.
  //
  // Strategy:
  //   1. Read the project's persisted shell state, validated against
  //      the live workspace files. Stale fileIds are pruned; if
  //      nothing usable remains, the loader returns null.
  //   2. On null, build a SANE DEFAULT — one group with a single tab
  //      pointing at the project's Strudel file (if any), else an
  //      empty group. This replaces the previous "open ALL 11 files"
  //      behavior that overwhelmed new visitors.
  //
  // Reading happens inside a `useRef` initializer so it runs exactly
  // once per mount and survives every re-render without re-seeding.
  const initialSnapshot = useRef<ShellSnapshot>(
    (() => {
      const files = listWorkspaceFiles();
      const validIds = new Set(files.map((f) => f.id));
      const persisted = loadShellState(projectId, validIds);
      if (persisted) return hydrateSnapshot(persisted);
      // First load (or wiped persistence) → single Strudel tab.
      const strudelFile = files.find((f) => f.language === "strudel") ?? files[0];
      return buildDefaultSnapshot("g-main", strudelFile?.id ?? null);
    })(),
  ).current;

  // Incremental sync: watch the file list and route adds to
  // openOrFocusFile, deletes to closeTabsForFile. The shell mounts once
  // and mutates in place — no flash, no tab-set churn.
  //
  // Critical: seed prevFileIdsRef from the LIVE workspace, NOT from the
  // initial tab set. If we seeded from tabs, the very first subscribe
  // fire would see every workspace file that isn't yet a tab as "added"
  // and auto-open them all — re-creating the 11-tab problem under a
  // different code path. Files added AFTER mount (user-created in the
  // sidebar) still flow through openOrFocusFile as intended.
  const prevFileIdsRef = useRef<Set<string>>(
    new Set(listWorkspaceFiles().map((f) => f.id)),
  );
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
    if (!st) {
      onActiveRuntimeStateChange(null);
      return;
    }
    // Phase 20-01 PR-B (DB-01) — pass live accessors that read through
    // runtimesRef so the closures stay valid across active-tab swaps
    // without re-registering the bottom-panel content.
    const accessorFid = fid;
    onActiveRuntimeStateChange({
      fileId: fid,
      isPlaying: st.isPlaying,
      bpm: st.bpm,
      error: st.error ? st.error.message : null,
      getCycle: () =>
        runtimesRef.current.get(accessorFid)?.getCurrentCycle?.() ?? null,
      getCps: () => {
        const bpm = runtimesRef.current.get(accessorFid)?.getBpm?.();
        // cps = bpm / (60 sec/min * 4 beats/cycle).
        return bpm != null && Number.isFinite(bpm) ? bpm / 240 : null;
      },
      getHapStream: () =>
        runtimesRef.current.get(accessorFid)?.getHapStream?.() ?? null,
      // Phase 20-07 wave γ (R-2) — Inspector accessors. Mirror getHapStream's
      // closure shape so they read through runtimesRef on every invocation.
      getBreakpointStore: () =>
        runtimesRef.current.get(accessorFid)?.getBreakpointStore?.() ?? null,
      getIsPaused: () =>
        runtimesRef.current.get(accessorFid)?.getPaused?.() ?? false,
      onResume: () => {
        runtimesRef.current.get(accessorFid)?.resume?.();
      },
      onPauseChanged: (cb) =>
        runtimesRef.current.get(accessorFid)?.onPausedChanged?.(cb) ??
        (() => {}),
    });
  }, [runtimeStates, onActiveRuntimeStateChange]);

  // Persist on every shell mutation (#175). Fires reactively from the
  // shell's single onGroupsChange sink; no debounce — localStorage
  // writes are O(1) and the snapshot is small.
  const handleGroupsChange = useCallback(
    (snapshot: ShellSnapshot) => {
      saveShellState(projectId, snapshot);
    },
    [projectId],
  );

  return (
    <WorkspaceShell
      ref={shellRef}
      initialGroups={initialSnapshot.groups}
      initialLayout={initialSnapshot.layout}
      initialActiveGroupId={initialSnapshot.activeGroupId}
      onGroupsChange={handleGroupsChange}
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
        if (!st) {
          onActiveRuntimeStateChange(null);
          return;
        }
        // Phase 20-01 PR-B (DB-01) — same accessor wiring as the
        // useEffect above; both sites push state to the parent so any
        // call must include the cycle/cps closures.
        const accessorFid = fid;
        onActiveRuntimeStateChange({
          fileId: fid,
          isPlaying: st.isPlaying,
          bpm: st.bpm,
          error: st.error ? st.error.message : null,
          getCycle: () =>
            runtimesRef.current
              .get(accessorFid)
              ?.getCurrentCycle?.() ?? null,
          getCps: () => {
            const bpm = runtimesRef.current
              .get(accessorFid)
              ?.getBpm?.();
            return bpm != null && Number.isFinite(bpm) ? bpm / 240 : null;
          },
          getHapStream: () =>
            runtimesRef.current
              .get(accessorFid)
              ?.getHapStream?.() ?? null,
          // Phase 20-07 wave γ (R-2) — Inspector accessors. Mirrors the
          // useEffect closure builder above; both push the same shape to
          // the parent on every active-tab transition.
          getBreakpointStore: () =>
            runtimesRef.current
              .get(accessorFid)
              ?.getBreakpointStore?.() ?? null,
          getIsPaused: () =>
            runtimesRef.current
              .get(accessorFid)
              ?.getPaused?.() ?? false,
          onResume: () => {
            runtimesRef.current
              .get(accessorFid)
              ?.resume?.();
          },
          onPauseChanged: (cb) =>
            runtimesRef.current
              .get(accessorFid)
              ?.onPausedChanged?.(cb) ?? (() => {}),
        });
      }}
    />
  );
}
