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

export const PIANOROLL_P5_CODE = `// Stave p5 viz — Piano Roll
// stave.scheduler, stave.analyser, stave.hapStream are injected globals

function setup() {
  createCanvas(stave.width, stave.height)
  colorMode(HSB, 360, 100, 100, 1)
  noStroke()
}

function draw() {
  background(230, 30, 8, 0.25)
  if (stave.scheduler) {
    const now = stave.scheduler.now()
    const haps = stave.scheduler.query(now - 3, now + 1)
    for (const h of haps) {
      const x = ((h.begin - now + 3) / 4) * width
      const w = max(4, ((h.duration ?? h.end - h.begin) / 4) * width)
      const y = (1 - (h.note ?? 60) / 127) * height
      const playing = h.begin <= now && (h.begin + (h.duration ?? 0.25)) > now
      const hue = (((h.note ?? 60) * 7) % 12) * 30
      fill(hue, playing ? 80 : 55, playing ? 100 : 70, playing ? 1 : 0.85)
      rect(x, y - 3, w, 6, 2)
    }
  }
}`;

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

export const SCOPE_P5_CODE = `// Stave p5 viz — Scope (oscilloscope / event pulses)
function setup() {
  createCanvas(stave.width, stave.height)
  noFill()
}
function draw() {
  background(9, 9, 18)
  stroke(40, 50, 70); strokeWeight(0.5)
  line(0, height * 0.75, width, height * 0.75)
  if (stave.analyser) {
    const buf = stave.analyser.frequencyBinCount
    const data = new Float32Array(buf)
    stave.analyser.getFloatTimeDomainData(data)
    let trig = 0
    for (let i = 1; i < buf; i++) { if (data[i-1] > 0 && data[i] <= 0) { trig = i; break } }
    stroke('#75baff'); strokeWeight(2); beginShape()
    for (let i = trig; i < buf; i++) vertex((i - trig) * width / (buf - trig), (0.75 - 0.25 * data[i]) * height)
    endShape()
  } else if (stave.scheduler) {
    const now = stave.scheduler.now()
    const haps = stave.scheduler.query(now - 4, now + 0.1)
    noStroke()
    for (const h of haps) {
      const age = now - h.begin, decay = max(0, 1 - age / 4)
      const x = ((h.begin - now + 4) / 4) * width
      const w = max(3, ((h.end - h.begin) / 4) * width)
      const pH = height * 0.6 * decay * (h.gain ?? 1)
      fill(117, 186, 255, decay * 200)
      rect(x, height * 0.75 - pH / 2, w, pH, 2)
    }
  }
}`;

export const FSCOPE_P5_CODE = `// Stave p5 viz — Frequency Scope (FFT bars / note bars)
function setup() {
  createCanvas(stave.width, stave.height)
  noStroke()
}
function draw() {
  background(9, 9, 18)
  stroke(40, 50, 70); strokeWeight(0.5); noFill()
  line(0, height * 0.75, width, height * 0.75); noStroke()
  if (stave.analyser) {
    const buf = stave.analyser.frequencyBinCount
    const data = new Float32Array(buf)
    stave.analyser.getFloatFrequencyData(data)
    fill('#75baff')
    const sw = width / buf
    for (let i = 0; i < buf; i++) {
      const n = constrain((data[i] + 100) / 100, 0, 1), v = n * 0.25
      rect(i * sw, (0.75 - v * 0.5) * height, max(sw, 1), v * height)
    }
  } else if (stave.scheduler) {
    const now = stave.scheduler.now()
    const haps = stave.scheduler.query(now - 0.2, now + 0.05)
    const bins = new Float32Array(64)
    for (const h of haps) {
      const note = typeof h.note === 'string' ? 60 : (h.note ?? 60)
      const freq = 440 * pow(2, (note - 69) / 12)
      if (freq < 30) continue
      const idx = constrain(floor(log(freq / 30) / log(4000 / 30) * 64), 0, 63)
      bins[idx] = max(bins[idx], max(0, 1 - (now - h.begin) / 0.5) * (h.gain ?? 1))
    }
    const sw = width / 64
    for (let i = 0; i < 64; i++) {
      if (bins[i] <= 0) continue
      const v = bins[i] * 0.25
      fill(117, 186, 255, bins[i] * 220)
      rect(i * sw, (0.75 - v * 0.5) * height, max(sw - 1, 1), v * height)
    }
  }
}`;

export const SPECTRUM_P5_CODE = `// Stave p5 viz — Spectrum (scrolling waterfall)
function setup() {
  createCanvas(stave.width, stave.height)
  pixelDensity(1); noStroke()
}
function draw() {
  const ctx = drawingContext
  if (stave.analyser) {
    const buf = stave.analyser.frequencyBinCount
    const data = new Float32Array(buf)
    stave.analyser.getFloatFrequencyData(data)
    const img = ctx.getImageData(0, 0, width, height)
    ctx.clearRect(0, 0, width, height)
    ctx.putImageData(img, -2, 0)
    ctx.fillStyle = '#75baff'
    for (let i = 0; i < buf; i++) {
      const n = constrain((data[i] + 80) / 80, 0, 1)
      if (n <= 0) continue
      ctx.globalAlpha = n
      const yEnd = (log(i + 1) / log(buf)) * height
      const yStart = i > 0 ? (log(i) / log(buf)) * height : 0
      ctx.fillRect(width - 2, height - yEnd, 2, max(2, yEnd - yStart))
    }
    ctx.globalAlpha = 1
  } else if (stave.scheduler) {
    const now = stave.scheduler.now()
    const img = ctx.getImageData(0, 0, width, height)
    ctx.clearRect(0, 0, width, height)
    ctx.putImageData(img, -2, 0)
    const haps = stave.scheduler.query(now - 0.3, now + 0.05)
    for (const h of haps) {
      const note = typeof h.note === 'string' ? 60 : (h.note ?? 60)
      const freq = 440 * pow(2, (note - 69) / 12)
      if (freq < 20) continue
      const logPos = log(freq / 20) / log(4000 / 20)
      const y = height - logPos * height
      const alpha = max(0.1, 1 - (now - h.begin) / 0.5) * (h.gain ?? 1)
      ctx.fillStyle = h.color ?? '#75baff'
      ctx.globalAlpha = alpha
      ctx.fillRect(width - 2, y - 2, 2, max(4, height * 0.03))
    }
    ctx.globalAlpha = 1
  } else { background(9, 9, 18) }
}`;

export const SPIRAL_P5_CODE = `// Stave p5 viz — Spiral
function setup() {
  createCanvas(300, 200)
  pixelDensity(window.devicePixelRatio || 1)
  noFill()
}
function xySpiral(rot, margin, cx, cy, rotate) {
  const a = ((rot + rotate) * 360 - 90) * PI / 180
  return [cx + cos(a) * margin * rot, cy + sin(a) * margin * rot]
}
function draw() {
  background(9, 9, 18)
  if (!stave.scheduler) return
  const now = stave.scheduler.now()
  const haps = stave.scheduler.query(now - 2, now + 1)
  const cx = width / 2, cy = height / 2
  const sz = min(width, height) * 0.38, mg = sz / 3
  for (const h of haps) {
    const active = h.begin <= now && h.end > now
    const from = h.begin - now + 3, to = h.end - now + 3 - 0.005
    const op = max(0, 1 - abs((h.begin - now) / 2))
    const c = color(h.color ?? (active ? '#75baff' : '#8a919966'))
    c.setAlpha(op * 255)
    stroke(c); strokeWeight(mg / 2); strokeCap(ROUND)
    beginShape()
    for (let a = from; a <= to; a += 1/60) {
      const [x, y] = xySpiral(a, mg, cx, cy, now)
      vertex(x, y)
    }
    endShape()
  }
  stroke(255); strokeWeight(mg / 2)
  beginShape()
  for (let a = 2.98; a <= 3; a += 1/60) {
    const [x, y] = xySpiral(a, mg, cx, cy, now)
    vertex(x, y)
  }
  endShape()
}`;

export const PITCHWHEEL_P5_CODE = `// Stave p5 viz — Pitchwheel
const ROOT_FREQ = 440 * pow(2, (36 - 69) / 12)
function setup() {
  createCanvas(300, 200)
  pixelDensity(window.devicePixelRatio || 1)
}
function freq2angle(f) { return 0.5 - (log(f / ROOT_FREQ) / log(2) % 1) }
function circPos(cx, cy, r, a) {
  const rad = a * TWO_PI
  return [sin(rad) * r + cx, cos(rad) * r + cy]
}
function draw() {
  background(9, 9, 18)
  if (!stave.scheduler) return
  const now = stave.scheduler.now()
  let haps = stave.scheduler.query(now - 0.01, now + 0.01)
  haps = haps.filter(h => h.begin <= now && h.end > now)
  const sz = min(width, height), r = sz / 2 - 12
  const cx = width / 2, cy = height / 2
  noStroke(); fill(117, 186, 255, 64)
  for (let i = 0; i < 12; i++) {
    const a = freq2angle(ROOT_FREQ * pow(2, i / 12))
    const [x, y] = circPos(cx, cy, r, a)
    circle(x, y, 7)
  }
  noFill(); stroke(117, 186, 255, 48); strokeWeight(1)
  circle(cx, cy, r * 2)
  for (const h of haps) {
    const note = typeof h.note === 'string' ? 60 : (h.note ?? 60)
    const freq = 440 * pow(2, (note - 69) / 12)
    const a = freq2angle(freq)
    const [x, y] = circPos(cx, cy, r, a)
    const c = h.color ?? '#75baff'
    stroke(c); strokeWeight(2)
    line(cx, cy, x, y)
    fill(c); noStroke()
    circle(x, y, 12)
  }
}`;

export const WORDFALL_P5_CODE = `// Stave p5 viz — Wordfall (vertical pianoroll with labels)
function setup() {
  createCanvas(stave.width, stave.height)
  pixelDensity(window.devicePixelRatio || 1)
}
function draw() {
  background(9, 9, 18)
  if (!stave.scheduler) return
  const now = stave.scheduler.now()
  const CYCLES = 4, PH = 0.5
  const haps = stave.scheduler.query(now - CYCLES * PH, now + CYCLES * (1 - PH))
  const vals = [...new Set(haps.map(h => h.note ?? h.s ?? 0))].sort()
  if (!vals.length) return
  const bw = width / vals.length
  for (const h of haps) {
    const active = h.begin <= now && h.end > now
    const dur = h.end - h.begin
    const yOff = h.begin - now
    const y = height * PH - (yOff / CYCLES) * height
    const dH = (dur / CYCLES) * height
    const v = h.note ?? h.s ?? 0
    const x = vals.indexOf(v) * bw
    noStroke()
    if (active) fill(255)
    else { const c = color(h.color ?? '#75baff'); c.setAlpha(160); fill(c) }
    rect(x + 1, y + 1, bw - 2, dH - 2)
    if (dH > 10 && bw > 16) {
      const label = h.note != null ? String(h.note) : (h.s ?? '')
      textSize(min(bw * 0.55, dH * 0.7, 11))
      textAlign(LEFT, TOP); fill(active ? 0 : 255); noStroke()
      text(label, x + 3, y + 3)
    }
  }
  stroke(255, 255, 255, 128); strokeWeight(1)
  line(0, height * PH, width, height * PH)
}`;

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
