/**
 * Project templates — PM Phase 2.5
 *
 * Each template defines the starting set of files for a new project.
 * When a user creates a new project with a template, the template's
 * files are seeded into the Y.Doc via seedWorkspaceFile.
 */

import {
  seedWorkspaceFile,
  bundledPresetId,
  workspaceFileIdForPreset,
  type WorkspaceLanguage,
  // Bundled p5 viz source — moved into @stave/editor in #184 so the
  // viz picker (compiled from DEFAULT_VIZ_DESCRIPTORS) and these
  // preset files (seeded below) share one code path.
  PIANOROLL_P5_CODE,
  WORDFALL_P5_CODE,
  SCOPE_P5_CODE,
  FSCOPE_P5_CODE,
  SPECTRUM_P5_CODE,
  SPIRAL_P5_CODE,
  PITCHWHEEL_P5_CODE,
} from "@stave/editor";

// ── Default code snippets ────────────────────────────────────────────

export const STRUDEL_CODE = `// Strudel — Declarative pattern algebra
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

export const SONIC_PI_CODE = `# Sonic Pi — Imperative play/sleep/live_loop
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

export const PIANOROLL_HYDRA_CODE = `// Hydra Piano Roll — shader-based frequency bands
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
  .modulate(s.noise(2, () => s.a.fft[3] * 0.4), () => s.a.fft[0] * 0.015)
  .scrollX(() => s.a.fft[0] * 0.02)
  .out()`;

export const HYDRA_SCOPE_CODE = `// Hydra Scope — audio-reactive oscilloscope
s.osc(() => 20 + s.a.fft[0] * 80, 0.1, 0)
  .color(0.2, 0.8, 1.0)
  .rotate(() => s.a.fft[1] * 0.5)
  .modulate(s.osc(3, 0, 0), () => s.a.fft[2] * 0.1)
  .diff(s.osc(2, 0.1, 0).rotate(0.5))
  .out()`;

export const HYDRA_KALEIDOSCOPE_CODE = `// Hydra Kaleidoscope — mirrored fractal audio patterns
s.osc(6, 0.1, () => s.a.fft[0] * 3)
  .kaleid(() => 3 + Math.floor(s.a.fft[1] * 8))
  .color(
    () => 0.5 + s.a.fft[0] * 0.5,
    () => 0.3 + s.a.fft[1] * 0.7,
    () => 0.8 + s.a.fft[2] * 0.2
  )
  .rotate(() => s.a.fft[3] * 3.14)
  .modulate(s.noise(3), () => s.a.fft[0] * 0.05)
  .out()`;

// ── Types ────────────────────────────────────────────────────────────

export interface TemplateFile {
  id: string;
  path: string;
  content: string;
  language: WorkspaceLanguage;
  meta?: Record<string, unknown>;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  files: TemplateFile[];
}

// Helper — the bundled viz preset IDs
const p5PresetId = () => bundledPresetId("Piano Roll", "p5");
const hydraPresetId = () => bundledPresetId("Piano Roll Hydra", "hydra");

// ── Templates ─────────────────────────────────────────────────────────

/**
 * Starter — the full workspace with Strudel, Sonic Pi, p5.js, and Hydra.
 * Matches the previous hardcoded default. Best for exploring all engines.
 */
function makeStarterFiles(): TemplateFile[] {
  const p5Id = p5PresetId();
  const hydraId = hydraPresetId();

  // Helper — create a viz preset workspace file with the right id/meta
  // so the preset bridge picks it up on mount.
  const vizFile = (
    name: string,
    ext: "p5" | "hydra",
    code: string,
  ): TemplateFile => {
    const lang: WorkspaceLanguage = ext === "hydra" ? "hydra" : "p5js";
    const presetId = bundledPresetId(name, ext === "hydra" ? "hydra" : "p5");
    return {
      id: workspaceFileIdForPreset(presetId),
      path: `preset/viz/${name}.${ext}`,
      content: code,
      language: lang,
      meta: { presetId },
    };
  };

  return [
    // Music presets
    {
      id: "pattern.strudel",
      path: "preset/music/pattern.strudel",
      content: STRUDEL_CODE,
      language: "strudel",
    },
    // NOTE: the Sonic Pi preset file is intentionally omitted from this build —
    // its engine (sibling sonicPiWeb repo) is not vendored yet (#171). Re-add
    // when sonicPiWeb ships as a package.
    // Viz presets — p5
    {
      id: workspaceFileIdForPreset(p5Id),
      path: "preset/viz/Piano Roll.p5",
      content: PIANOROLL_P5_CODE,
      language: "p5js",
      meta: { presetId: p5Id },
    },
    vizFile("scope", "p5", SCOPE_P5_CODE),
    vizFile("fscope", "p5", FSCOPE_P5_CODE),
    vizFile("spectrum", "p5", SPECTRUM_P5_CODE),
    vizFile("spiral", "p5", SPIRAL_P5_CODE),
    vizFile("pitchwheel", "p5", PITCHWHEEL_P5_CODE),
    vizFile("wordfall", "p5", WORDFALL_P5_CODE),
    // Viz presets — Hydra
    {
      id: workspaceFileIdForPreset(hydraId),
      path: "preset/viz/Piano Roll (Hydra).hydra",
      content: PIANOROLL_HYDRA_CODE,
      language: "hydra",
      meta: { presetId: hydraId },
    },
    vizFile("scope", "hydra", HYDRA_SCOPE_CODE),
    vizFile("kaleidoscope", "hydra", HYDRA_KALEIDOSCOPE_CODE),
  ];
}

function makeStrudelOnlyFiles(): TemplateFile[] {
  return [
    {
      id: "pattern.strudel",
      path: "pattern.strudel",
      content: STRUDEL_CODE,
      language: "strudel",
    },
  ];
}

function makeHydraOnlyFiles(): TemplateFile[] {
  const hydraId = hydraPresetId();
  return [
    {
      id: workspaceFileIdForPreset(hydraId),
      path: "sketch.hydra",
      content: PIANOROLL_HYDRA_CODE,
      language: "hydra",
      meta: { presetId: hydraId },
    },
  ];
}

function makeSonicPiOnlyFiles(): TemplateFile[] {
  return [
    {
      id: "pattern.sonicpi",
      path: "pattern.sonicpi",
      content: SONIC_PI_CODE,
      language: "sonicpi",
    },
  ];
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "starter",
    name: "Starter",
    description:
      "The full workspace — Strudel, p5.js, and Hydra files. Best for exploring.",
    icon: "✨",
    files: [], // filled lazily via getTemplateFiles
  },
  {
    id: "strudel",
    name: "Strudel Sketch",
    description: "Just a Strudel pattern file. Pure declarative music.",
    icon: "🎵",
    files: [],
  },
  // Sonic Pi template hidden in this build — engine not vendored yet (#171).
  {
    id: "hydra",
    name: "Hydra Visual",
    description: "Just a Hydra shader sketch. Audio-reactive visuals.",
    icon: "✴️",
    files: [],
  },
  {
    id: "blank",
    name: "Blank",
    description: "Empty project. Add your own files from the sidebar.",
    icon: "📄",
    files: [],
  },
];

export function getTemplateFiles(templateId: string): TemplateFile[] {
  switch (templateId) {
    case "starter":
      return makeStarterFiles();
    case "strudel":
      return makeStrudelOnlyFiles();
    case "sonicpi":
      return makeSonicPiOnlyFiles();
    case "hydra":
      return makeHydraOnlyFiles();
    case "blank":
      return [];
    default:
      return makeStarterFiles();
  }
}

/**
 * Seed all files from a template into the current Y.Doc via seedWorkspaceFile.
 * If files already exist (persisted project), they are returned unchanged —
 * this is idempotent for a given project.
 */
export function seedProjectFromTemplate(templateId: string): void {
  const files = getTemplateFiles(templateId);
  for (const f of files) {
    seedWorkspaceFile(f.id, f.path, f.content, f.language, f.meta);
  }
}

/**
 * Seed any missing viz preset workspace files into the current project.
 * Idempotent — seedWorkspaceFile skips files that already exist.
 * Call on mount so older projects get the new preset files without
 * requiring a project re-creation.
 */
export function seedMissingPresetFiles(): void {
  const starterFiles = makeStarterFiles();
  for (const f of starterFiles) {
    if (f.language === "p5js" || f.language === "hydra") {
      seedWorkspaceFile(f.id, f.path, f.content, f.language, f.meta);
    }
  }
}
