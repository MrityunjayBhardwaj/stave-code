"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useVizRefWatcher } from "../useVizRefWatcher";
import { BackdropPopover } from "./BackdropPopover";
import { PopoutPreviewController } from "./PopoutPreviewController";
import { registerVizWorker } from "../visualizers/registerVizWorker";
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
  GLSL_VIZ,
  LiveCodingRuntime,
  VizPresetStore,
  bundledPresetId,
  flushToPreset,
  getPresetIdForFile,
  isVizLanguage,
  rendererForLanguage,
  compilePreset,
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
  type VizDescriptor,
  type PreviewProvider,
  type HapStream,
  type BreakpointStore,
  loadShellState,
  saveShellState,
  buildDefaultSnapshot,
  hydrateSnapshot,
  type ShellSnapshot,
  PIANOROLL_P5_CODE,
  setVizQuality,
  type VizQualityLevel,
  registerReevalHandler,
  applyEvalSourceTransform,
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

// Phase 20-12 — the timeline collects across the same cycle window the live
// monitor displays (WINDOW_CYCLES in musicalTimeline/timeAxis.ts is 2).
// Duplicated here because chrome (app) and engine (editor) can't import each
// other; if WINDOW_CYCLES changes there, update this to match.
const TIMELINE_WINDOW_CYCLES = 2;

// #457 — debounce for republishing the IR snapshot on a stopped code edit, so
// the Song timeline / IR Inspector track the source as the user types without
// thrashing analyzeSong on every keystroke. ~one comfortable typing pause.
const SNAPSHOT_REFRESH_DEBOUNCE_MS = 300;

/**
 * Parse the file's current source into IR and publish an IRSnapshot for the
 * Inspector + full-song timeline. parseStrudel + collect are pure and cheap on
 * the source string, so this is safe to call outside the eval lifecycle — both
 * the eval-success path AND on-demand (#394: the full-song view needs a
 * snapshot the instant it opens, but a cold eval's `onEvaluateSuccess` lags
 * ~2.5s behind the keypress, leaving the view empty in the meantime).
 *
 * Strudel-only, total: no-op for non-Strudel runtimes / missing files, and
 * swallows parse errors (parseStrudel guarantees a graceful Code-node
 * fallback; collect is total). `source` is the workspace fileId — NOT the
 * human-visible path — because the Inspector's click-to-source keys by id.
 */
function captureAndPublishSnapshot(
  fileId: string,
  cycleCount: number | null,
): void {
  const fileNow = getFile(fileId);
  if (!fileNow) return;
  const runtimeId: RuntimeId =
    fileNow.language === "sonicpi" ? "sonicpi" : "strudel";
  if (runtimeId !== "strudel") return;
  try {
    // Phase 19-07 (#79) — pre-pass-0 seed: wrap raw source as a Code node so
    // pass 0 (RAW) reads input.code and runs extractTracks. finalIR drives both
    // `collect` and the `ir` alias — single source of truth (PV27).
    const seed: PatternIR = IR.code(fileNow.content);
    const passes = runPasses(seed, STRUDEL_PASSES);
    const finalIR = passes[passes.length - 1].ir;
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
      { cycleCount },
    );
  } catch {
    // parseStrudel guarantees graceful fallback to Code node; collect is
    // total. Anything thrown here is unexpected — stay quiet.
  }
}

/**
 * Intrinsic drawing aspect for bundled vizzes, keyed by preset name. The single
 * source of truth: the seed presets AND `registerAllVizFiles` both read it, so
 * a bundled viz keeps its aspect even though `flushToPreset` rebuilds the IDB
 * preset from the (metadata-less) workspace file and would otherwise strip
 * `nativeSize`. The pianoroll uses a wide/short 6:1 to match @strudel/draw's
 * inline pianoroll (#214): a short value axis keeps fold lanes thin so notes
 * read as landscape bars, not tall blocks. Without an entry a viz falls back to
 * the generic 2:1 `DEFAULT_NATIVE`.
 */
const BUNDLED_VIZ_NATIVE_SIZE: Record<string, { w: number; h: number }> = {
  "Piano Roll": { w: 1200, h: 200 },
  "Piano Roll (Hydra)": { w: 1400, h: 400 },
};


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
  registerPreviewProvider(GLSL_VIZ);
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
     * #384/#385 — transport seek accessors for the full-song timeline.
     * `getSongPosition` is the transport-offset-aware clock; `onSeek`
     * seeks to an absolute song cycle. Closure-bound through `runtimesRef`
     * like the others; non-Strudel runtimes return null / no-op.
     */
    getSongPosition: () => number | null;
    onSeek: (cycle: number) => void;
    /**
     * #394 — on-demand IR snapshot capture for the full-song view. The view
     * needs a snapshot the instant it opens, but a cold eval's
     * `onEvaluateSuccess` lags ~2.5s; MusicalTimeline calls this when it
     * enters song mode with no snapshot yet. No-op for non-Strudel runtimes.
     */
    onRequestSnapshot: () => void;
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
  /** #350a — fires when the active group's RESOLVED backdrop (code override ??
   *  manual sticky) changes, so UI mirrors what's showing. Forwarded to the shell. */
  onActiveBackdropChange?: (fileId: string | null) => void;
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
  /** #347 — open the crop modal for the active pane's backdrop (same handler
   *  the menubar bg-popover uses). Invoked from the pattern-bar set-bg popover. */
  onCropBackdrop?: () => void;
  /** #347 — reveal (open) the active pane's backdrop viz file in the editor. */
  onRevealBackdrop?: () => void;
}

/**
 * #347 — per-TAB backdrop persistence. The backdrop a user pins is stored
 * against the file (tab) it was set from, not the pane — so switching tabs
 * swaps/clears the pane's backdrop to match the active tab. Persisted per
 * project in localStorage as a plain `{ fileId: vizFileId }` map; best-effort.
 */
function perTabBackdropKey(projectId: string): string {
  return `stave:perTabBackdrop:${projectId}`;
}
function loadPerTabBackdrop(projectId: string): Map<string, string> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = window.localStorage.getItem(perTabBackdropKey(projectId));
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
  } catch {
    return new Map();
  }
}
function savePerTabBackdrop(
  projectId: string,
  map: ReadonlyMap<string, string>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      perTabBackdropKey(projectId),
      JSON.stringify(Object.fromEntries(map)),
    );
  } catch {
    /* best-effort persistence */
  }
}

/**
 * #347 — "set bg" dropdown injected into the pattern (Strudel) chrome bar via
 * `chromeExtras`, sitting next to the live toggle. Mirrors the menubar
 * bg-indicator: a click opens the SAME `BackdropPopover` (viz-file picker when
 * unpinned; swap + opacity/quality + crop/reveal/clear when pinned), anchored
 * to this button and scoped to THIS pane. A `.strudel` file can't itself be a
 * backdrop (the backdrop renders viz files only), so the picker lists viz files
 * and selecting one pins it as this pane's manual sticky (#350a). `pinned`
 * reflects the pane's resolved backdrop (code override ?? sticky).
 */
function SetBackdropButton({
  pinned,
  fileName,
  onOpen,
}: {
  pinned: boolean;
  fileName: string | null;
  onOpen: (rect: DOMRect) => void;
}): React.ReactElement {
  return (
    <button
      data-testid="strudel-chrome-bg-toggle"
      data-pinned={pinned ? "true" : "false"}
      onClick={(e) => onOpen(e.currentTarget.getBoundingClientRect())}
      title={
        pinned
          ? `Backdrop: ${fileName ?? ""} — click for controls`
          : "Set a viz as this pane's backdrop"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 3,
        fontSize: 10,
        fontFamily: "inherit",
        cursor: "pointer",
        userSelect: "none",
        background: pinned ? "var(--accent-dim)" : "none",
        color: pinned
          ? "var(--accent-strong, var(--accent))"
          : "var(--foreground-muted)",
        border: `1px solid ${pinned ? "var(--accent-dim)" : "var(--border)"}`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: pinned
            ? "var(--accent-strong, var(--accent))"
            : "var(--foreground-muted)",
          flexShrink: 0,
        }}
      />
      <span>{pinned && fileName ? `bg: ${fileName}` : "set bg"}</span>
      <span style={{ fontSize: 9, opacity: 0.8 }}>▾</span>
    </button>
  );
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
  onActiveBackdropChange,
  backgroundCrop,
  onCodeBackdropChange,
  onCropBackdrop,
  onRevealBackdrop,
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

  // #347 — per-TAB backdrop. `tabBackdrops` maps a file (tab) id → the viz file
  // pinned as ITS backdrop. The pane's rendered backdrop follows the active
  // tab (see the active-tab sync + onBackgroundFileChange recorder below), so
  // switching tabs swaps/clears the backdrop instead of bleeding it across the
  // whole pane. `bgPopover` carries the anchor rect AND the file id the popover
  // was opened from, so it edits THAT tab's backdrop.
  const [tabBackdrops, setTabBackdrops] = useState<ReadonlyMap<string, string>>(
    () => loadPerTabBackdrop(projectId),
  );
  const [bgPopover, setBgPopover] = useState<{
    rect: DOMRect;
    fileId: string;
  } | null>(null);

  // #240 — viz pop-out (Cmd+K W). The compiled descriptor for the file being
  // popped out; non-null while a pop-out window is open. Driven by
  // `handleOpenPopout` (wired to the shell's openPopoutPreview action).
  const [popout, setPopout] = useState<{
    fileId: string;
    descriptor: VizDescriptor;
  } | null>(null);

  const handleOpenPopout = useCallback((fileId: string) => {
    const file = getFile(fileId);
    if (!file || !isVizLanguage(file.language)) return;
    const renderer = rendererForLanguage(file.language);
    if (!renderer) return;
    // Compile a fresh descriptor from the file's current content. The popup
    // mounts a MAIN-THREAD renderer (a separate window can't share the
    // OffscreenCanvas worker transfer); compilePreset's factory downgrades to
    // the main-thread path automatically there.
    const preset: VizPreset = {
      id: file.id,
      name: file.path,
      renderer,
      code: file.content,
      requires: [],
      createdAt: 0,
      updatedAt: 0,
    };
    setPopout({ fileId, descriptor: compilePreset(preset) });
  }, []);

  // Persist the per-tab map (best-effort). Re-runs only when the map changes.
  useEffect(() => {
    savePerTabBackdrop(projectId, tabBackdrops);
  }, [projectId, tabBackdrops]);

  // Record a tab's backdrop choice. Pure state update; the persist effect above
  // flushes it. The pane render is driven separately via setBackgroundFile.
  const recordTabBackdrop = useCallback(
    (fileId: string, vizId: string | null) => {
      setTabBackdrops((prev) => {
        if ((prev.get(fileId) ?? null) === vizId) return prev; // no churn
        const next = new Map(prev);
        if (vizId) next.set(fileId, vizId);
        else next.delete(fileId);
        return next;
      });
    },
    [],
  );

  // Pass-through that ALSO captures every manual sticky against the ACTIVE tab,
  // so backdrops set from any surface (pattern-bar popover, VizEditorChrome
  // toggle, file-tree, Cmd+K B) become per-tab and travel with the tab.
  const handleBackgroundFileChange = useCallback(
    (groupId: string, fileId: string | null) => {
      const activeId = activeFileIdRef.current;
      if (activeId) recordTabBackdrop(activeId, fileId);
      onBackgroundFileChange?.(groupId, fileId);
    },
    [recordTabBackdrop, onBackgroundFileChange],
  );

  // Resolve a backdrop fileId → its display basename (no extension).
  const backdropName = useCallback(
    (fileId: string | null): string | null => {
      if (!fileId) return null;
      const f = getFile(fileId);
      if (!f) return null;
      return f.path.split("/").pop()!.replace(/\.[^.]+$/, "");
    },
    [],
  );

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

  // Phase B / B-3 (#245) — register the Next-bundled viz-worker constructor with
  // the editor's DI seam so `WorkerVizRenderer` can spawn it (gated behind the
  // `workerRenderer` flag, OFF by default — this only wires the seam).
  useEffect(() => { registerVizWorker(); }, []);

  // Register ALL .p5/.hydra workspace files as named viz presets so
  // `.viz("name")` works for user-created files, not just bundled ones.
  //
  // #204 time-travel: when a commit is checked out, viz files register from
  // their SNAPSHOT code (via getViewedContent) so inline `.viz()` shows the
  // historical viz — but we skip flushToPreset while viewing so the override
  // never persists historical code to IndexedDB (same non-destructive rule as
  // Y.Text). Re-run on enter/exit restores live (round-trip is total).
  const registerAllVizFiles = useCallback(async () => {
    const viewing = isViewing();
    const allFiles = listWorkspaceFiles();
    const vizFiles = allFiles.filter((f) => isVizLanguage(f.language));
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
      // Persist live code to the preset store — but NEVER while viewing
      // (the override is read-only; persisting historical code would corrupt
      // the live preset, the viz analogue of writing Y.Text).
      if (!viewing) await flushToPreset(f.id, presetId);
      const preset = await VizPresetStore.get(presetId);
      if (!preset) continue;
      // While viewing, override the registered code with this file's snapshot
      // content (null = file absent at the commit → fall back to live preset).
      const viewedCode = getViewedContent(f.id);
      const effective0 =
        viewedCode !== null ? { ...preset, code: viewedCode } : preset;
      // Re-apply the bundled native aspect — `flushToPreset` rebuilds the
      // preset from the metadata-less workspace file and strips `nativeSize`,
      // so without this the pianoroll registers at the generic 2:1 and its
      // pitch lanes get squashed (the "stretched" look). For bundled vizzes the
      // map is authoritative (there's no user-facing nativeSize control), so it
      // also overrides any stale value persisted before this fix.
      const bundledNative = BUNDLED_VIZ_NATIVE_SIZE[effective0.name];
      const effective = bundledNative
        ? { ...effective0, nativeSize: bundledNative }
        : effective0;
      const base = baseOf(f.path);
      // A non-p5 file sharing a basename with a p5 file registers under a
      // renderer-qualified name (`<name>:hydra` / `<name>:glsl`) so bare
      // `.viz("<name>")` deterministically resolves to the p5 preset (#181).
      const name =
        f.language !== "p5js" && p5Basenames.has(base)
          ? `${base}:${f.language === "hydra" ? "hydra" : "glsl"}`
          : preset.name;
      registerPresetAsNamedViz(effective, name);
    }
  }, []);

  useEffect(() => { void registerAllVizFiles(); }, [registerAllVizFiles]);

  // #204 time-travel: re-register viz from the snapshot on checkout
  // enter/exit/swap so inline `.viz()` follows the viewed commit, then
  // restores live on exit.
  useEffect(
    () => subscribeToRuntimeView(() => { void registerAllVizFiles(); }),
    [registerAllVizFiles],
  );

  // Register bundled presets as named viz (for `.viz("Piano Roll")` lookup).
  useEffect(() => {
    const p5Preset: VizPreset = {
      id: seedState.p5PresetId,
      name: "Piano Roll",
      renderer: "p5",
      code: PIANOROLL_P5_CODE,
      requires: ["streaming"],
      // Wide/short 6:1 aspect to match @strudel/draw's inline pianoroll (#214).
      // Block aspect = (dur·lanes/CYCLES)·(W/H); fold packs distinct pitches into
      // contiguous lanes (no gaps), so a short H keeps those lanes thin and notes
      // render as landscape bars (the strudel.cc look). The earlier 1.6:1 came
      // from a mis-diagnosis: a taller surface fattens lanes → MORE stretch.
      nativeSize: BUNDLED_VIZ_NATIVE_SIZE["Piano Roll"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const hydraPreset: VizPreset = {
      id: seedState.hydraPresetId,
      name: "Piano Roll (Hydra)",
      renderer: "hydra",
      code: PIANOROLL_HYDRA_CODE,
      requires: ["audio"],
      nativeSize: BUNDLED_VIZ_NATIVE_SIZE["Piano Roll (Hydra)"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    registerPresetAsNamedViz(p5Preset);
    registerPresetAsNamedViz(hydraPreset);
  }, [seedState.p5PresetId, seedState.hydraPresetId]);

  // E2E-only hook (Phase 21 T5 observation): expose the named-viz registrar so
  // Playwright can register a one-off custom p5/hydra sketch by name and then
  // reference it via `.viz("name")` / `.color()`. This exercises the EXACT
  // production renderer→SignalBus→scheduler path the spine relies on; only the
  // preset-authoring UI step (Viz Editor + Ctrl+S) is shortcut — that flow is
  // not what T5 proves (reactivity + PV64 backdrop threading is). Guarded on
  // `__STAVE_E2E__` so it never attaches in normal use; it calls the same
  // `registerPresetAsNamedViz` the app itself uses for bundled presets.
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Defense-in-depth: never install the E2E hook in a production build —
    // `process.env.NODE_ENV` is statically replaced so the body dead-code-
    // eliminates. The `__STAVE_E2E__` flag is the runtime gate for dev/test.
    if (process.env.NODE_ENV === "production") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any).__STAVE_E2E__) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__staveRegisterViz = (preset: VizPreset): boolean =>
      registerPresetAsNamedViz(preset);
    // #269 — drive the real quality-setting path from E2E so the density-LOD
    // proof exercises setVizQuality (→ resolution + density marshal), not a
    // test-only config poke. Same E2E gate as above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__staveSetVizQuality = (level: VizQualityLevel): void =>
      setVizQuality(level);
  }, []);

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
          nativeSize: BUNDLED_VIZ_NATIVE_SIZE["Piano Roll"],
          createdAt: now, updatedAt: now,
        });
      }
      const existingHydra = await VizPresetStore.get(seedState.hydraPresetId);
      if (!existingHydra) {
        await VizPresetStore.put({
          id: seedState.hydraPresetId, name: "Piano Roll (Hydra)", renderer: "hydra",
          code: PIANOROLL_HYDRA_CODE, requires: ["audio"],
          nativeSize: BUNDLED_VIZ_NATIVE_SIZE["Piano Roll (Hydra)"],
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
  // Latest-value ref so the content-change subscription (#457, below) can read
  // the active file's play/live state without re-binding the subscription on
  // every state change.
  const runtimeStatesRef = useRef(runtimeStates);
  runtimeStatesRef.current = runtimeStates;

  // #457 — keep the Song timeline + IR Inspector snapshot in sync with the
  // SOURCE while the runtime isn't live-evaluating. The snapshot is otherwise
  // republished only on a successful eval (onEvaluateSuccess) or on song-view
  // entry (#394), so a code edit with no re-eval — every edit while stopped,
  // since nothing auto-evaluates — left the timeline frozen at the last eval.
  // subscribeToWorkspaceFile fires on BOTH typing and Pattern-panel write-backs
  // (both mutate the workspace file); captureAndPublishSnapshot is pure on the
  // source string (and a no-op for non-Strudel files), so it's safe off the
  // eval lifecycle. Skipped while live-coding (playing && autoRefresh): there
  // the runtime's own debounced re-eval owns the snapshot, so republishing here
  // would double-publish and flash a mid-keystroke broken parse.
  useEffect(() => {
    const fid = watchedFileId;
    if (!fid) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeToWorkspaceFile(fid, () => {
      const st = runtimeStatesRef.current.get(fid);
      if (st?.isPlaying && st.autoRefresh) return; // eval-path owns it
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        captureAndPublishSnapshot(
          fid,
          runtimesRef.current.get(fid)?.getCurrentCycle?.() ?? null,
        );
      }, SNAPSHOT_REFRESH_DEBOUNCE_MS);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [watchedFileId]);

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
      // S5 solo: the Mixer's eval-source transform (solo overlay) is applied
      // here — identity unless a strip is soloed, so the file is never touched
      // (D3) and normal playback is byte-for-byte unchanged.
      () =>
        applyEvalSourceTransform(
          fileId,
          getViewedContent(fileId) ?? getFile(fileId)?.content ?? "",
        ),
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
        // IR Inspector + full-song timeline snapshot. Factored into
        // captureAndPublishSnapshot (module scope) so the on-demand
        // song-view path (#394) publishes the identical shape — no drift.
        // Phase 19-08: cycleCount lands on the timeline capture entry (not on
        // IRSnapshot) so PV27's per-snapshot alias contract stays untouched.
        captureAndPublishSnapshot(fileId, runtime.getCurrentCycle());

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

  // Live visual editing (Mixer S3 → all Pattern-tab surfaces): a visual mutation
  // (mixer fader/pan/mute, sequencer step, piano-roll note, knob, …) writes the
  // file via `Writeback`, which asks here to make it audible immediately. We
  // re-eval ONLY if the file is already playing (so a control never auto-starts
  // audio) AND only when live mode isn't already re-evaluating on its own (no
  // double eval). `rt.play()` while playing re-evals (same as the checkout path).
  // `rt.play()` is async and does NOT serialise — firing it for each of a burst
  // of edits lets an earlier eval resolve last and clobber the final state. So
  // we serialise per file: while a re-eval is in flight, mark the file pending;
  // when it settles, if still pending, re-eval ONCE more reading the now-current
  // content. The final state always wins, with no long debounce.
  const reevalState = useRef<Map<string, { inFlight: boolean; pending: boolean }>>(new Map());
  useEffect(
    () =>
      registerReevalHandler((fileId: string) => {
        const rt = runtimesRef.current.get(fileId);
        if (!(rt && rt.getIsPlaying() && !rt.isAutoRefreshEnabled())) return;
        const st = reevalState.current.get(fileId) ?? { inFlight: false, pending: false };
        reevalState.current.set(fileId, st);
        if (st.inFlight) { st.pending = true; return; }
        const run = (): void => {
          st.pending = false;
          st.inFlight = true;
          Promise.resolve(rt.play()).finally(() => {
            st.inFlight = false;
            if (st.pending) run();
          });
        };
        run();
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
    // #347 — per-tab "set bg" dropdown. Pinned state + filename come from THIS
    // tab's backdrop (tabBackdrops), so other tabs read their own. The button
    // opens the BackdropPopover (rendered at the component root) anchored to
    // itself and scoped to this tab's file id.
    const tabBg = tabBackdrops.get(tab.fileId) ?? null;
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
      chromeExtras: (
        <SetBackdropButton
          pinned={tabBg != null}
          fileName={backdropName(tabBg)}
          onOpen={(rect) => setBgPopover({ rect, fileId: tab.fileId })}
        />
      ),
    };
    return runtimeProvider.renderChrome(ctx);
  }, [getOrCreateRuntime, runtimeStates, handlePlay, handleStop, handleToggleAutoRefresh, tabBackdrops, backdropName]);

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

      // Only viz files (.p5 / .hydra / .glsl) get flushed to a preset.
      if (!isVizLanguage(file.language)) return;

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

  // E2E hook (dev/test only) — fire the REAL save for a viz file by id WITHOUT a
  // tab switch, so the inline-viz hot-reload gate (viz-hot-reload.spec.ts) can
  // exercise the save→repaint path with the pattern editor MOUNTED throughout
  // (PV89). Mirrors the WorkspaceShell Cmd+S → onSaveFile(tab) path. Same
  // dead-code-eliminated gate as the other `__stave*` hooks.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "production") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any).__STAVE_E2E__) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__staveSaveVizFileById = (fileId: string): boolean => {
      if (!getFile(fileId)) return false;
      handleSaveFile({ kind: "editor", fileId } as WorkspaceTab & {
        kind: "editor";
      });
      return true;
    };
  }, [handleSaveFile]);

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
      // #384/#385 — transport seek accessors. Closure-bound through
      // runtimesRef like getHapStream; seekTo is fire-and-forget here (the
      // full-song ruler doesn't await the re-eval — clock + playhead reflect
      // it on the next rAF tick).
      getSongPosition: () =>
        runtimesRef.current.get(accessorFid)?.getSongPosition?.() ?? null,
      onSeek: (cycle: number) => {
        void runtimesRef.current.get(accessorFid)?.seekTo?.(cycle);
      },
      // #394 — publish the active file's IR for the full-song view on demand.
      onRequestSnapshot: () => {
        captureAndPublishSnapshot(
          accessorFid,
          runtimesRef.current.get(accessorFid)?.getCurrentCycle?.() ?? null,
        );
      },
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
    <>
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
      onBackgroundFileChange={handleBackgroundFileChange}
      onActiveBackdropChange={onActiveBackdropChange}
      onOpenPopoutPreview={handleOpenPopout}
      backgroundCrop={backgroundCrop}
      onActiveTabChange={(tab) => {
        const fid =
          tab && (tab.kind === "editor" || tab.kind === "preview")
            ? tab.fileId
            : null;
        activeFileIdRef.current = fid;
        // #347 — per-tab backdrop: swap the active group's backdrop to the new
        // active tab's stored choice (or clear when it has none). This is what
        // makes the backdrop follow the tab instead of bleeding across the pane.
        shellRef?.current?.setBackgroundFile?.(
          fid ? tabBackdrops.get(fid) ?? null : null,
        );
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
          // #384/#385 — transport seek accessors (same shape as the
          // useEffect builder above).
          getSongPosition: () =>
            runtimesRef.current
              .get(accessorFid)
              ?.getSongPosition?.() ?? null,
          onSeek: (cycle: number) => {
            void runtimesRef.current.get(accessorFid)?.seekTo?.(cycle);
          },
          // #394 — on-demand snapshot capture (same shape as the useEffect
          // builder above).
          onRequestSnapshot: () => {
            captureAndPublishSnapshot(
              accessorFid,
              runtimesRef.current.get(accessorFid)?.getCurrentCycle?.() ?? null,
            );
          },
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
    {bgPopover && (
      <BackdropPopover
        anchorRect={bgPopover.rect}
        onClose={() => setBgPopover(null)}
        vizFiles={listWorkspaceFiles()
          .filter((f) => isVizLanguage(f.language))
          .map((f) => ({
            id: f.id,
            name: f.path.split("/").pop()!.replace(/\.[^.]+$/, ""),
          }))}
        backgroundFileId={tabBackdrops.get(bgPopover.fileId) ?? null}
        backgroundFileName={backdropName(tabBackdrops.get(bgPopover.fileId) ?? null)}
        onSetBackdrop={(id) => {
          // Record against the tab the popover was opened from, and (since that
          // tab is the active one) drive the active group's rendered backdrop.
          recordTabBackdrop(bgPopover.fileId, id);
          shellRef?.current?.setBackgroundFile?.(id);
        }}
        onCropBackground={() => onCropBackdrop?.()}
        onRevealBackground={() => onRevealBackdrop?.()}
        initialOpacity={shellRef?.current?.getBackdropSettings?.().opacity ?? 1}
        initialQuality={
          shellRef?.current?.getBackdropSettings?.().quality ?? "half"
        }
        onSetOpacity={(v) => shellRef?.current?.setBackdropOpacity?.(v)}
        onSetQuality={(v) => shellRef?.current?.setBackdropQuality?.(v)}
      />
    )}
    {/* #240 — viz pop-out window. Mounted only while open; unmount/onClose
        closes the window via the hook's cleanup. */}
    {popout && (
      <PopoutPreviewController
        key={popout.fileId}
        descriptor={popout.descriptor}
        theme={resolvedTheme}
        onClose={() => setPopout(null)}
      />
    )}
    </>
  );
}
