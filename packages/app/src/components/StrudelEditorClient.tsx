"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  WorkspaceShell,
  createWorkspaceFile,
  registerRuntimeProvider,
  registerPreviewProvider,
  STRUDEL_RUNTIME,
  SONICPI_RUNTIME,
  HYDRA_VIZ,
  P5_VIZ,
  VizPresetStore,
  bundledPresetId,
  compilePreset,
  seedFromPreset,
  type WorkspaceTab,
  type VizDescriptor,
  type VizPreset,
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

const PIANOROLL_P5_CODE = `// p5 Piano Roll — scrolling note visualization
// hapStream, analyser, scheduler available as globals

background(9, 9, 18)

const now = scheduler?.now() ?? 0
const events = scheduler?.query(now - 3, now + 1) ?? []

// Playhead
stroke(255, 255, 255, 80)
strokeWeight(1)
const px = width * 0.75
line(px, 0, px, height)

if (events.length > 0) {
  // Real notes from the pattern
  noStroke()
  for (const e of events) {
    const x = ((e.begin - now + 3) / 4) * width
    const w = Math.max(4, (e.duration ?? 0.25) / 4 * width)
    const y = (1 - (e.note ?? 60) / 127) * height
    const playing = e.begin <= now && (e.begin + (e.duration ?? 0.25)) > now
    fill(playing ? 255 : 117, playing ? 202 : 186, playing ? 40 : 255)
    rect(x, y - 3, w, 6, 2)
  }
} else {
  // Demo mode — animated sine wave so the canvas isn't empty
  const t = millis() / 1000
  noStroke()
  for (let i = 0; i < 32; i++) {
    const x = (i / 32) * width
    const phase = t * 2 + i * 0.4
    const y = height / 2 + Math.sin(phase) * height * 0.3
    const hue = Math.sin(phase * 0.5) * 0.5 + 0.5
    fill(117 + hue * 100, 186, 255 - hue * 50, 200)
    ellipse(x + 8, y, 8 + Math.sin(phase * 3) * 4, 8)
  }

  // "no audio" hint
  fill(255, 255, 255, 60)
  textSize(11)
  textAlign(CENTER)
  text('preview mode — play a pattern to see live notes', width / 2, height - 14)
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
  createWorkspaceFile(
    "pattern.strudel",
    "pattern.strudel",
    STRUDEL_CODE,
    "strudel",
  );
  createWorkspaceFile(
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
  // This keeps the VizPresetStore populated for the VizEditor compat shim
  // and for future sessions.
  useEffect(() => {
    async function seedPresets() {
      // Legacy cleanup (safe to remove once no local users have stale data)
      const LEGACY_IDS = ["pianoroll-p5-custom", "pianoroll-hydra-custom"];
      for (const legacy of LEGACY_IDS) {
        const stale = await VizPresetStore.get(legacy);
        if (stale) await VizPresetStore.delete(legacy);
      }

      const now = Date.now();
      await VizPresetStore.put({
        id: seedState.p5PresetId,
        name: "Piano Roll",
        renderer: "p5",
        code: PIANOROLL_P5_CODE,
        requires: ["streaming"],
        createdAt: now,
        updatedAt: now,
      });
      await VizPresetStore.put({
        id: seedState.hydraPresetId,
        name: "Piano Roll (Hydra)",
        renderer: "hydra",
        code: PIANOROLL_HYDRA_CODE,
        requires: ["audio"],
        createdAt: now,
        updatedAt: now,
      });
    }
    seedPresets();
  }, [seedState.p5PresetId, seedState.hydraPresetId]);

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
    />
  );
}
