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
  isVizLanguage,
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
  // Signal-bus example sketches (Phase 21) — living docs for the named bus.
  SIGNALS_SPECTRUM_P5_CODE,
  SIGNALS_BACKDROP_P5_CODE,
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

export const SIGNALS_BANDS_HYDRA_CODE = `// Hydra Signals (Bands) — the named musical-signal bus in hydra.
// Try it over a drum pattern, e.g.   $: s("bd*4 hh*8")
//
// IMPORTANT: hydra sketches receive two namespaces — \`s\` (the hydra synth) and
// \`stave\` (the live bus). Unlike p5, nothing is exposed bare here, so write
// \`s.osc(...)\` and \`stave.uBass(...)\`. And in hydra the bus SCALARS are
// () => number THUNKS (call them every frame), while \`fft\` / \`wave\` are arrays:
//
//   stave.uBass()          — master low-band magnitude, 0..1 (a THUNK — call it).
//                            stave.uRms() / uMid() / uTreble() are siblings.
//   stave.u('bd').rms()    — the 'bd' (kick) sound's loudness 0..1 (also a thunk).
//   stave.u('bd').env()    — that sound's envelope, 0..1 (bumps on each hit).
//   stave.u('bd').fft[i]   — that sound's spectrum: an ARRAY, indexed natively.
//                            Wrap the WHOLE expression in () => … so hydra reads
//                            it fresh each frame:  () => stave.u('bd').fft[2]
//
// (In p5 these same names are bare LIVE NUMBERS — see "Signals (Spectrum)".)

s.osc(() => 8 + stave.uBass() * 30, 0.1, 0)        // density rides the low band
  .color(
    () => 0.4 + stave.u('bd').rms() * 0.6,          // red pulses with the kick
    0.5,
    () => 0.6 + stave.uTreble() * 0.4               // blue follows the highs
  )
  .rotate(() => stave.u('bd').fft[2] || 0)          // spin from a kick spectrum bin
  .modulate(s.noise(2), () => stave.uMid() * 0.15)  // wobble with the mids
  .out(s.o0)`;

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

// Bundled GLSL example shaders (issue #287). "Pulse Grid" is an original Stave
// shader; "Prism" is the classic "Creation" demo by Danilo Guanabara, included
// with author credit. Both are single-pass ShaderToy-style `mainImage`.
const PRISM_GLSL_CODE = `// "Prism" — after "Creation" by Danilo Guanabara, made audio-reactive for Stave.
// http://www.pouet.net/prod.php?which=57245
// If you intend to reuse this shader, please add credits to 'Danilo Guanabara'.
// iChannel0: row 0 (y=0.0) = FFT magnitude.
#define t iTime
#define r iResolution.xy

void mainImage( out vec4 fragColor, in vec2 fragCoord ){
    float bass   = texture(iChannel0, vec2(0.03, 0.0)).x;
    float mid    = texture(iChannel0, vec2(0.30, 0.0)).x;
    float treble = texture(iChannel0, vec2(0.65, 0.0)).x;
    vec3 c;
    float l, z = t;
    for (int i = 0; i < 3; i++) {
        vec2 uv, p = fragCoord.xy / r;
        uv = p;
        p -= .5;
        p.x *= r.x / r.y;
        z += .07 + bass * .08;                                  // bass drives the zoom
        l = length(p);
        uv += p / l * (sin(z) + 1.) * abs(sin(l * 9. - z - z))
            * (1. + treble * 1.4);                              // treble ripples the warp
        c[i] = .01 / length(mod(uv, 1.) - .5);
    }
    vec3 col = c / l;
    col = mix(col, col.gbr, mid * .6);                          // mids swirl the hue
    fragColor = vec4(col * (.6 + bass * 1.7), 1.0);             // bass brightens
}
`;

const PULSEGRID_GLSL_CODE = `// "Pulse Grid" — pattern-event reactive cells. An original Stave shader.
// Reacts to PATTERN EVENTS (uKick/uSnare/uHat/uRms), not the raw spectrum.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 g  = uv * vec2(8.0, 5.0);
  vec2 cell = fract(g) - 0.5;
  vec2 id   = floor(g);

  // Per-cell random phase so the grid never pulses uniformly.
  float phase = fract(sin(dot(id, vec2(12.9, 78.2))) * 43758.5);
  float d   = max(abs(cell.x), abs(cell.y));
  float box = smoothstep(0.46, 0.40, d);

  vec3 col = vec3(0.02, 0.02, 0.05);
  col += vec3(1.0, 0.3, 0.2) * uKick  * box * (0.4 + 0.6 * step(id.x, 3.0)); // kick → left red
  col += vec3(0.3, 0.6, 1.0) * uSnare * box * step(2.0, id.y);               // snare → top blue
  col += vec3(1.0)           * uHat   * box * (0.3 + 0.7 * phase);           // hat  → scattered white
  col += box * uRms * 0.25 * (0.5 + 0.5 * sin(iTime * 3.0 + phase * 6.28));  // loudness → breathing
  fragColor = vec4(col, 1.0);
}
`;

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
    ext: "p5" | "hydra" | "glsl",
    code: string,
  ): TemplateFile => {
    const lang: WorkspaceLanguage =
      ext === "hydra" ? "hydra" : ext === "glsl" ? "glsl" : "p5js";
    const renderer = ext === "hydra" ? "hydra" : ext === "glsl" ? "glsl" : "p5";
    const presetId = bundledPresetId(name, renderer);
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
    // Signal-bus example sketches (Phase 21) — bundled docs for the named bus.
    vizFile("Signals (Spectrum)", "p5", SIGNALS_SPECTRUM_P5_CODE),
    vizFile("Signals (Backdrop)", "p5", SIGNALS_BACKDROP_P5_CODE),
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
    vizFile("Signals (Bands)", "hydra", SIGNALS_BANDS_HYDRA_CODE),
    // Viz presets — GLSL / ShaderToy (issue #287)
    vizFile("Prism", "glsl", PRISM_GLSL_CODE),
    vizFile("Pulse Grid", "glsl", PULSEGRID_GLSL_CODE),
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
    if (isVizLanguage(f.language)) {
      seedWorkspaceFile(f.id, f.path, f.content, f.language, f.meta);
    }
  }
}
