"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  WorkspaceShell,
  createWorkspaceFile,
  seedWorkspaceFile,
  getFile,
  subscribeToWorkspaceFile,
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
  seedFromPreset,
  flushToPreset,
  getPresetIdForFile,
  registerPresetAsNamedViz,
  type WorkspaceTab,
  type ChromeContext,
  type VizPreset,
  type PreviewProvider,
} from "@stave/editor";

// ---------------------------------------------------------------------------
// Demo code
// ---------------------------------------------------------------------------

const STRUDEL_CODE = `// Strudel — Declarative pattern algebra
// Ctrl+Enter to play · Ctrl+. to stop

setcps(130/240)

$: stack(
  note("c4 e4 g4 b4 c5 b4 g4 e4")
    .s("sawtooth").gain(0.3).lpf(2400).release(0.12),
  note("e3 g3 b3 e4")
    .s("sine").gain(0.15).release(0.3)
).viz("pianoroll")

$: note("<c2 [g2 c2] f2 [g2 eb2]>")
  .s("square").gain(0.4).lpf(500).release(0.2)
  .viz("pitchwheel")

$: stack(
  s("hh*8").gain(0.3),
  s("bd [~ bd] ~ bd").gain(0.5),
  s("~ sd ~ [sd cp]").gain(0.4)
).viz("wordfall")`;

const SONIC_PI_CODE = `# Sonic Pi — Imperative play/sleep/live_loop
# Ctrl+Enter to play · Ctrl+. to stop

use_bpm 120

live_loop :drums do
  viz :pianoroll
  sample :bd_haus
  sleep 0.5
  sample :sn_dub
  sleep 0.5
end

live_loop :bass do
  viz :scope
  use_synth :tb303
  play choose([36, 39, 43]), release: 0.3
  sleep 0.5
end

live_loop :melody do
  viz :pitchwheel
  use_synth :prophet
  play choose([60, 64, 67, 72]), release: 0.2
  sleep 0.25
end`;

const PIANOROLL_P5_CODE = `// Stave p5 viz — Piano Roll
//
// Injected globals (provided by the Stave runtime, available from
// preload onwards):
//   stave.scheduler   — PatternScheduler | null. Poll with
//                       scheduler.query(from, to) → NormalizedHap[].
//                       Each hap has { begin, end, note, s, gain,
//                       velocity, duration }.
//   stave.analyser    — AnalyserNode | null. Web Audio FFT /
//                       waveform data for any audio source.
//   stave.hapStream   — HapStream | null. Event-driven feed of
//                       currently-firing haps.
//   stave.width       — preview pane width in pixels.
//   stave.height      — preview pane height in pixels. Use these
//                       in createCanvas — NOT the built-in p5
//                       windowWidth/windowHeight, which track the
//                       browser window rather than the preview pane.
//
// p5 globals (createCanvas, background, width, height, mouseX, HSB,
// etc.) work exactly like the p5js editor. Read stave.* INSIDE
// setup/draw, don't cache to module-level let — if the user
// changes the audio source, setup() runs again with fresh values.

let playhead

function setup() {
  createCanvas(stave.width, stave.height)
  colorMode(HSB, 360, 100, 100, 1)
  noStroke()
  playhead = 0.75 // x position of the "now" line, as fraction of width
}

function draw() {
  background(230, 30, 8, 0.25)

  // Playhead — vertical line at the "now" position.
  stroke(0, 0, 100, 0.4)
  strokeWeight(1)
  const px = width * playhead
  line(px, 0, px, height)
  noStroke()

  // --- Pattern events (works when a pattern is playing) ---
  if (stave.scheduler) {
    const now = stave.scheduler.now()
    const haps = stave.scheduler.query(now - 3, now + 1)

    for (const h of haps) {
      // Position on screen: begin=now maps to the playhead, begin
      // earlier goes right (already played), later goes left.
      const x = ((h.begin - now + 3) / 4) * width
      const w = max(4, ((h.duration ?? h.end - h.begin) / 4) * width)
      const y = (1 - (h.note ?? 60) / 127) * height
      const isPlaying = h.begin <= now && (h.begin + (h.duration ?? 0.25)) > now

      // Color by pitch class, brightened when currently playing.
      const hue = (((h.note ?? 60) * 7) % 12) * 30
      const sat = isPlaying ? 80 : 55
      const brightness = isPlaying ? 100 : 70
      fill(hue, sat, brightness, isPlaying ? 1 : 0.85)
      rect(x, y - 3, w, 6, 2)
    }
  }

  // --- Audio spectrum (works with any audio source, including the
  // sample sound when no pattern is playing) ---
  if (stave.analyser) {
    const bins = new Uint8Array(stave.analyser.frequencyBinCount)
    stave.analyser.getByteFrequencyData(bins)
    fill(260, 50, 100, 0.25)
    const bw = width / bins.length
    for (let i = 0; i < bins.length; i++) {
      const h = (bins[i] / 255) * (height * 0.25)
      rect(i * bw, height - h, bw, h)
    }
  }

  // --- Empty-state hint when neither scheduler nor analyser yielded
  // anything to draw ---
  if (!stave.scheduler && !stave.analyser) {
    fill(0, 0, 60, 0.7)
    textSize(11)
    textAlign(CENTER)
    text(
      'no audio source — pick one from the chrome source dropdown, or play a pattern',
      width / 2,
      height - 14,
    )
  }
}`;

const PIANOROLL_HYDRA_CODE = `// Hydra Piano Roll — shader-based frequency bands
// s.a.fft[0]=bass  s.a.fft[1]=low-mid  s.a.fft[2]=high-mid  s.a.fft[3]=treble

s.osc(() => 10 + s.a.fft[0] * 50, -0.3, 0)
  .thresh(() => 0.3 + s.a.fft[0] * 0.5, 0.1)
  .color(0.46, 0.71, 1.0)
  .add(
    s.osc(() => 20 + s.a.fft[1] * 40, 0.2, 0)
      .rotate(Math.PI / 2)
      .thresh(() => 0.4 + s.a.fft[1] * 0.4, 0.08)
      .color(1.0, 0.79, 0.16),
    () => s.a.fft[1] * 0.8
  )
  .add(
    s.osc(() => 40 + s.a.fft[2] * 60, 0.1, 0)
      .thresh(() => 0.6 + s.a.fft[2] * 0.3, 0.05)
      .color(0.54, 0.36, 0.96),
    () => s.a.fft[2] * 0.5
  )
  .modulate(s.noise(2, () => s.a.fft[3] * 0.4), () => s.a.fft[0] * 0.015)
  .scrollX(() => s.a.fft[0] * 0.02)
  .out()`;

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
// Seed workspace files synchronously before the shell mounts
// ---------------------------------------------------------------------------

function seedWorkspaceFiles(p5PresetId: string, hydraPresetId: string) {
  // Pattern files — persistence-aware: if the user edited code last session
  // and it was saved to IndexedDB via the Yjs doc, seedWorkspaceFile returns
  // the persisted version instead of overwriting with the bundled default.
  seedWorkspaceFile(
    "pattern.strudel",
    "pattern.strudel",
    STRUDEL_CODE,
    "strudel",
  );
  seedWorkspaceFile(
    "pattern.sonicpi",
    "pattern.sonicpi",
    SONIC_PI_CODE,
    "sonicpi",
  );

  // Seed viz files from the bundled presets, using the same bridge path
  // Task 06 exposed. We build VizPreset objects in-memory (the IndexedDB
  // write happens in the preset-seeding effect below) and use
  // seedFromPreset to create WorkspaceFiles with the correct meta.
  const p5Preset: VizPreset = {
    id: p5PresetId,
    name: "Piano Roll",
    renderer: "p5",
    code: PIANOROLL_P5_CODE,
    requires: ["streaming"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const hydraPreset: VizPreset = {
    id: hydraPresetId,
    name: "Piano Roll (Hydra)",
    renderer: "hydra",
    code: PIANOROLL_HYDRA_CODE,
    requires: ["audio"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const p5FileId = seedFromPreset(p5Preset);
  const hydraFileId = seedFromPreset(hydraPreset);

  // Register the presets under their user-chosen names so a pattern
  // file can write `.viz("Piano Roll")` or `.viz("Piano Roll (Hydra)")`
  // and have `resolveDescriptor` find the user's viz code instead of a
  // built-in. These names shadow any built-in with the same string.
  registerPresetAsNamedViz(p5Preset);
  registerPresetAsNamedViz(hydraPreset);

  return { p5FileId, hydraFileId };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StrudelEditorClient() {
  // Register providers once
  ensureProviders();

  // Seed files synchronously via useState initializer so they exist before
  // the first render of WorkspaceShell (avoiding the one-frame empty flash
  // noted in the plan pre-mortem).
  const [seedState] = useState(() => {
    const p5PresetId = bundledPresetId("Piano Roll", "p5");
    const hydraPresetId = bundledPresetId("Piano Roll Hydra", "hydra");
    const { p5FileId, hydraFileId } = seedWorkspaceFiles(
      p5PresetId,
      hydraPresetId,
    );
    return { p5FileId, hydraFileId, p5PresetId, hydraPresetId };
  });

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

  // Build the initial tab set: 4 editor tabs in one group
  const initialTabs: WorkspaceTab[] = useState(() => [
    { kind: "editor" as const, id: "tab-strudel", fileId: "pattern.strudel" },
    { kind: "editor" as const, id: "tab-sonicpi", fileId: "pattern.sonicpi" },
    { kind: "editor" as const, id: "tab-p5", fileId: seedState.p5FileId },
    { kind: "editor" as const, id: "tab-hydra", fileId: seedState.hydraFileId },
  ])[0];

  return (
    <WorkspaceShell
      initialTabs={initialTabs}
      theme="dark"
      height={560}
      chromeForTab={chromeForTab}
      editorExtrasForTab={editorExtrasForTab}
      previewProviderFor={previewProviderFor}
      onTabClose={handleTabClose}
      onSaveFile={handleSaveFile}
    />
  );
}
