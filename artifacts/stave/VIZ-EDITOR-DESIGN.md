# Viz Editor — Design Document

**Last updated:** 2026-04-08
**Scope:** staveCoder feature — authoring, previewing, and saving custom viz renderers.

---

## 1. Core Concept

A dedicated authoring environment for visualization code (Hydra shaders, p5 sketches, GLSL, Canvas2D). Completely separated from music code — viz code never pollutes the music DSL.

**The user writes viz code → sees it hot-reload live → saves it → references it in patterns via `.viz("name")`.**

---

## 2. Editor Layout — Tab Groups + Splits

Standard editor group model (VS Code-style):

- Each split pane is an **editor group**
- Each group has its own **tab bar** at the top
- Tabs belong to the group they're in
- Drag tabs between groups to move them
- Split horizontally or vertically

```
┌──────────────────────────┬──────────────────────────────┐
│  [pattern.strudel]       │  [myAurora.hydra] [bubbles]  │
├──────────────────────────┼──────────────────────────────┤
│                          │                              │
│  $: note("c4 e4 g4")    │  osc(6, () => a[0]*3)       │
│    .s("sawtooth")        │    .kaleid(4)                │
│    .viz("myAurora")      │    .color(1, 0.3, 0.8)      │
│                          │    .out()                    │
├──────────────────────────┼──────────────────────────────┤
│  [toolbar: play/stop]    │  ████ preview ████████████   │
│  [viz: myAurora ▾]       │  ████████████████████████    │
└──────────────────────────┴──────────────────────────────┘
```

### Tab types

| Extension | Language | Type |
|-----------|----------|------|
| `.strudel` | Strudel (JS + mini-notation) | Pattern code |
| `.sonicpi` | Sonic Pi (Ruby-like) | Pattern code |
| `.hydra` | Hydra (JS shader DSL) | Viz code |
| `.p5` | p5.js sketch | Viz code |
| `.glsl` | GLSL fragment shader | Viz code (future) |

### Multi-model Monaco

Multiple Monaco editor instances sharing models via `monaco.editor.create()` on separate DOM nodes. Each editor group is an independent Monaco instance with `editor.setModel(model)` to switch between tabs.

```typescript
interface EditorTab {
  id: string
  label: string              // "pattern.strudel", "myAurora.hydra"
  language: string           // "strudel", "hydra", "p5js", "glsl"
  model: Monaco.editor.ITextModel
  type: 'pattern' | 'viz'
}

interface EditorGroup {
  id: string
  tabs: EditorTab[]
  activeTabId: string
  /** Preview panel docked to this group */
  preview?: {
    mode: 'inline' | 'background' | 'panel' | 'popout'
  }
}

interface EditorLayout {
  /** Split pane tree — binary tree of groups or nested splits */
  root: SplitNode | GroupNode
  direction: 'horizontal' | 'vertical'
}
```

### Implementation

Use `react-mosaic` or `allotment` for split pane management. Tab bars are custom React components per group.

---

## 3. Viz Editor Inputs

The viz code receives the same data any VizRenderer gets:

| Input | Variable name in viz code | Source |
|-------|--------------------------|--------|
| HapStream events | `hapStream` | `components.streaming.hapStream` |
| AnalyserNode | `analyser` | `components.audio.analyser` |
| AudioContext | `audioCtx` | `components.audio.audioCtx` |
| Pattern scheduler | `scheduler` | `components.queryable.scheduler` |
| IR events | `irEvents` | `components.ir.irEvents` |
| FFT bins (Hydra shorthand) | `a` | Derived from analyser (4-bin average) |

**When no pattern is playing:** A demo audio source (built-in oscillator loop) provides data so the viz preview is reactive during authoring.

---

## 4. Preview Modes

| Mode | Behavior | Use case |
|------|----------|----------|
| **Panel** | Renders in the viz preview area below/beside the viz code editor | Standard authoring |
| **Inline** | Small container at inline zone dimensions (~150px × editor width) | "How will this look as `.viz()` inline?" |
| **Background** | Canvas behind the Monaco editor, code floats on top with transparent bg | Live coding performance aesthetic |
| **Pop-out** | `window.open()` — separate browser window with just the canvas | Second monitor, projection for shows |

Preview switches via buttons in the viz editor toolbar:
```
Preview: [panel] [inline] [bg] [⧉ pop-out]
```

---

## 5. Hot Reload

```
Viz code changes (debounced 300ms)
    ↓
vizCompiler(code, rendererType) → VizDescriptor
    ↓
Destroy current preview renderer
    ↓
Mount new renderer with current engine components
    ↓
Canvas renders immediately with live audio data
```

---

## 6. Saving and Referencing

### VizPreset type

```typescript
interface VizPreset {
  id: string                           // e.g. "myAurora"
  name: string                         // display name
  renderer: 'hydra' | 'p5' | 'glsl'   // which compiler to use
  code: string                         // the viz source code
  requires: (keyof EngineComponents)[] // e.g. ['audio'] or ['streaming']
}
```

### Storage

IndexedDB via a `VizPresetStore` — persists across sessions, no server needed.

### Registration

On app startup + after each save, user presets are compiled to VizDescriptors and merged into the available viz list.

### Usage in pattern code

```js
$: note("c4 e4 g4").viz("myAurora")
```

The resolver finds "myAurora" in the registered descriptors (built-in + user presets). Clean — no viz code in the music DSL.

---

## 7. Viz Picker — Dropdown

Replace the current icon button bar with a grouped dropdown:

```
┌──────────────────────────────┐
│  Viz: [ myAurora         ▾] │
│       ┌─────────────────────┐│
│       │ ── p5 ──            ││
│       │  Piano Roll         ││
│       │  Wordfall           ││
│       │  Scope              ││
│       │  FScope             ││
│       │  Spectrum           ││
│       │  Spiral             ││
│       │  Pitchwheel         ││
│       │ ── hydra ──         ││
│       │  Hydra              ││
│       │  Piano Roll (Hydra) ││
│       │  Scope (Hydra)      ││
│       │  Kaleidoscope       ││
│       │ ── custom ──        ││
│       │  myAurora        ★  ││
│       │  myBubbles       ★  ││
│       │  + New Viz...       ││
│       └─────────────────────┘│
└──────────────────────────────┘
```

Grouped by `renderer` field. Custom presets marked with ★. "+ New Viz..." opens a new viz tab.

---

## 8. Viz Code Templates

When creating a new viz, offer starter templates:

### Hydra template
```js
// Audio-reactive Hydra visualization
// a[0]=bass  a[1]=low-mid  a[2]=high-mid  a[3]=treble

osc(10, 0.1, () => a[0] * 4)
  .color(1.0, 0.5, () => a[1] * 2)
  .rotate(() => a[2] * 6.28)
  .out()
```

### p5 template
```js
// p5.js sketch — hapStream, analyser, scheduler available

background(9, 9, 18)
const now = scheduler?.now() ?? 0
const events = scheduler?.query(now - 2, now + 2) ?? []

for (const e of events) {
  const x = ((e.begin - now + 2) / 4) * width
  const y = (1 - (e.note ?? 60) / 127) * height
  fill(117, 186, 255)
  ellipse(x, y, 8, 8)
}
```

### GLSL template (future)
```glsl
uniform float a[4];   // FFT bins
uniform float time;
uniform vec2 resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float wave = sin(uv.x * 20.0 + time + a[0] * 4.0);
  gl_FragColor = vec4(uv.x, wave * 0.5 + 0.5, a[1], 1.0);
}
```

---

## 9. Build Sequence

### staveCoder v0.1.0 (SHIPPED 2026-04-08, branch feat/viz-mode-renderer-convention)

| Step | What | Status |
|------|------|--------|
| 1 | VizPreset type + VizPresetStore (IndexedDB) | ✅ |
| 2 | vizCompiler (code → VizDescriptor for hydra/p5) | ✅ |
| 3 | VizDropdown (replace icon bar with grouped dropdown) | ✅ |
| 4 | Multi-model Monaco (tab support, `editor.setModel()`) | ✅ |
| 5 | 2-group split layout (pattern left, viz right — toggle) | ✅ |
| 6 | VizPreview — panel mode (reuse VizPanel) | ✅ |
| 7 | Hot reload loop (debounced code change → re-mount renderer) | ✅ |
| 8 | Save preset + register in descriptor list | ✅ |

### Post v0.1.0 (SHIPPED 2026-04-08, same branch)

| Step | What | Status |
|------|------|--------|
| 9 | Arbitrary N-group splits (drag to dock anywhere) | ✅ |
| 10 | Tab dragging between groups | ✅ |
| 11 | Inline preview mode | ✅ |
| 12 | Background mode (canvas behind editor) | ✅ |
| 13 | Pop-out mode (separate window + audio bridge) | ✅ |
| 14 | GLSL renderer support | (deferred) |

---

## 10. Key Constraint

**Viz code and music code are completely separate.** The viz editor never touches the pattern DSL. The only bridge is the `.viz("name")` string reference — a name lookup, not code injection.

---

## 11. Architectural Pivot — Phase 10.2 (NEXT)

After shipping v0.1.0+, a strategic conversation (2026-04-08) identified that the current architecture has a structural limitation:

**The problem:** `VizEditor` has per-group `previewMode: 'panel' | 'inline' | 'background' | 'popout'` state. This works for one editor but doesn't compose:
- Pattern editors (`StrudelEditor`, `LiveCodingEditor`) and viz editors (`VizEditor`) are 3 separate components with duplicated tab/preview logic.
- A user can't preview viz file A while editing pattern file B.
- A file can't have *zero* previews open OR *multiple* previews simultaneously.

**The fix (Phase 10.2):** Refactor along the seam VS Code uses for markdown/markdown-preview — editors are pure code views, previews are first-class sibling views opened via command.

```
EditorView           — Monaco only, language-aware (no embedded preview)
PreviewView          — file-extension-aware, hot-reloads on file change
PreviewProvider      — registry mapping extensions → preview renderers
WorkspaceShell       — generic tab/group/split holding any view
WorkspaceAudioBus    — singleton: pattern previews publish, viz previews consume
```

The current `VizEditor` becomes a thin composition over the new primitives — backwards-compatible export. Then Phase 10.3 adds the IDE shell (menu bar, file explorer, command palette) on top.

See `.planning/ROADMAP.md` Phase 10.2 + 10.3 for full success criteria. See `vyapti.md` PV7 + PV8 for the structural invariants this refactor enforces.
