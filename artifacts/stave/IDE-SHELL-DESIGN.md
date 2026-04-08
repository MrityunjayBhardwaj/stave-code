# IDE Shell — Design Document

**Last updated:** 2026-04-08
**Scope:** Phase 10.2 (Workspace Shell Refactor) + Phase 10.3 (IDE Shell on top)
**Status:** Approved direction. Phase 10.2 builds the foundation, Phase 10.3 builds the shell.

---

## 1. The Question We Answered

After shipping the Viz Editor (Phase 10.1), the natural next step looked like:

> Add a menu bar (File, Edit, View, Preferences), file explorer, and command palette to make Stave feel like a real IDE.

The strategic question was: **build it ourselves, or port to a browser-based VS Code (`code-oss`, `openvscode-server`, Theia)?**

### The trade-off

| Approach | Pros | Cons |
|----------|------|------|
| Build menu + file tree ourselves | Full control, lightweight, tight audio integration | ~1-2 days per feature |
| Fork VS Code web (`code-oss`, Theia) | Free menu bar, file tree, palette, extensions, settings | 10-20MB, slow cold start, doesn't fit live coding model |
| `@codingame/monaco-vscode-api` | VS Code services (file explorer, palette) on top of Monaco | Still big, custom integrations harder |

### The decision: BUILD, don't port

VS Code's core assumptions break against ours:

1. **File-centric model** — VS Code thinks "open file, edit, save." Stave thinks "running pattern, inline viz zones, live audio context, hot reload." These don't map.
2. **Extension lifecycle** — Our `.viz()` inline zones, HapStream taps, hot reload, per-track audio routing are tightly coupled to the host. As VS Code extensions, they lose audio context sharing.
3. **Webview isolation** — VS Code preview panels are isolated iframes. Viz renderers need direct main-thread access to `AudioContext` / `AnalyserNode`. Bridging via `postMessage` loses per-frame FFT latency.
4. **Single editor per view** — VS Code natively supports the markdown / markdown-preview pattern (which we want), but doesn't natively support our current "tab groups with different preview modes per group" — and that pattern is wrong anyway (see §2).
5. **What we'd throw away** — the entire `VizEditor` (tab groups, splits, drag-drop, 4 preview modes, hot reload), `LiveCodingEditor` (inline view zones), `StrudelEditor`, the viz pipeline, plus the audio engine integration. Rebuilding these as VS Code extensions is weeks of work that adds nothing.

**Decision:** Build a lightweight IDE shell on top of our existing Monaco setup. If we ever need real extensions, we can selectively pull `@codingame/monaco-vscode-api` for specific services without forking the IDE.

---

## 2. The Architectural Pivot — Single Editor Per View

Before adding any IDE chrome, we have to fix a structural problem in the current Viz Editor:

**Current state:** Each `EditorGroup` carries `previewMode: 'panel' | 'inline' | 'background' | 'popout'` as part of its state. The preview is rendered as a *part of the editor group*.

**Problem:** This doesn't compose.
- Three separate components (`StrudelEditor`, `LiveCodingEditor`, `VizEditor`) duplicate tab/preview logic.
- A user can't preview viz file A while editing pattern file B.
- A file can't have zero previews open, or multiple previews simultaneously.
- The 3 components can't share a tab bar.

**The right model:** The same one VS Code uses for markdown.

```
Open README.md            →  Monaco editor with markdown syntax
Cmd+K V                   →  "Open Preview to the Side"
                              Opens a sibling view watching the file
```

Applied to Stave:

| File | Editor view | Preview view |
|------|-------------|--------------|
| `pattern.strudel` | Monaco + Strudel syntax | Running pattern + viz panel + transport |
| `pattern.sonicpi` | Monaco + Sonic Pi syntax | Running pattern + viz panel + transport |
| `pianoroll.hydra` | Monaco + Hydra syntax | Hot-reloading viz canvas, audio from active pattern |
| `pianoroll.p5` | Monaco + p5 syntax | Hot-reloading viz canvas |
| `notes.md` | Monaco + markdown | Rendered HTML |

The 4 preview modes from Phase 10.1 (panel/inline/background/popout) become **commands**, not per-group state:

```
Cmd+K V       — Open Preview to the Side (panel)
Cmd+K B       — Toggle Preview as Background (overlay)
Cmd+K W       — Open Preview in New Window (popout)
```

---

## 3. Phase 10.2 — Workspace Shell Refactor

### Components to build

| Component | Owns | Replaces |
|-----------|------|----------|
| `EditorView` | Pure Monaco editor for one file. Language-aware. No embedded preview, no audio engine. | Monaco wrapping in StrudelEditor / LiveCodingEditor / VizEditor |
| `PreviewView` | Renders the right preview for a file's extension by querying `PreviewProviderRegistry`. Hot-reloads on file content change. | The viz panel embedded in editors |
| `PreviewProvider` | `{ extensions, label, render }`. Registered globally. | (new abstraction) |
| `WorkspaceShell` | Generic tab/group/split layout. Holds any view, not just viz tabs. Tab drag-drop between any views. | The tab/group code in VizEditor |
| `WorkspaceAudioBus` | Singleton. Pattern previews publish `{ hapStream, analyser, scheduler }` when running. Viz previews subscribe and re-mount on bus change. | Per-component audio context wiring |

### Built-in providers

```typescript
const STRUDEL_RUNTIME: PreviewProvider = {
  extensions: ['.strudel'],
  label: 'Run Strudel Pattern',
  render: ({ fileContent, audioBus }) => (
    <StrudelRunner code={fileContent} onAudio={(audio) => audioBus.publish(audio)} />
  ),
}

const SONICPI_RUNTIME: PreviewProvider = {
  extensions: ['.sonicpi'],
  label: 'Run Sonic Pi Pattern',
  render: ({ fileContent, audioBus }) => (
    <SonicPiRunner code={fileContent} onAudio={(audio) => audioBus.publish(audio)} />
  ),
}

const HYDRA_VIZ: PreviewProvider = {
  extensions: ['.hydra'],
  label: 'Hydra Visualization',
  render: ({ fileContent, audioBus }) => (
    <HotReloadViz code={fileContent} renderer="hydra" audio={audioBus.consume()} />
  ),
}

const P5_VIZ: PreviewProvider = {
  extensions: ['.p5'],
  label: 'p5 Visualization',
  render: ({ fileContent, audioBus }) => (
    <HotReloadViz code={fileContent} renderer="p5" audio={audioBus.consume()} />
  ),
}

const MARKDOWN_HTML: PreviewProvider = {
  extensions: ['.md'],
  label: 'Markdown Preview',
  render: ({ fileContent }) => <MarkdownRenderer source={fileContent} />,
}
```

### Backwards compatibility

`StrudelEditor`, `LiveCodingEditor`, `VizEditor` exports stay — they become thin compositions over the new primitives so external embedders aren't broken.

### Success criteria (verbatim from ROADMAP Phase 10.2)

1. `EditorView` — Monaco only, language-aware (strudel, sonicpi, hydra, p5js, markdown). No embedded preview.
2. `PreviewView` — file-extension-aware. Renders the right preview via `PreviewProviderRegistry`.
3. Provider registry with 5 built-ins.
4. `WorkspaceShell` — generic tab/group/split. Tab drag-drop between any views.
5. `WorkspaceAudioBus` singleton.
6. Commands: "Open Preview to Side" (Cmd+K V), "Toggle Background Preview" (Cmd+K B), "Open Preview in New Window" (Cmd+K W).
7. `StrudelEditor` / `LiveCodingEditor` / `VizEditor` exports preserved as thin compositions.
8. App page rewired to use `WorkspaceShell` directly. The 3-tab top bar goes away — all 4 tabs (`pattern.strudel`, `pattern.sonicpi`, `pianoroll.p5`, `pianoroll.hydra`) live in the same shell.

---

## 4. Phase 10.3 — IDE Shell Components

Built on top of 10.2's workspace shell.

```
┌──────────────────────────────────────────────────┐
│  File  Edit  View  Run  Preferences  Help        │  ← MenuBar
├──────────┬───────────────────────────────────────┤
│ EXPLORER │                                       │
│ ┌──────┐ │  ┌─ pattern.strudel ─ pianoroll.p5 ─┐ │
│ │ v 📁 │ │  │                                  │ │
│ │  📄  │ │  │  EditorView / PreviewView        │ │
│ │  📄  │ │  │  (from Phase 10.2)               │ │
│ │ v 📁 │ │  │                                  │ │
│ │  📄  │ │  │                                  │ │
│ └──────┘ │  └──────────────────────────────────┘ │
├──────────┴───────────────────────────────────────┤
│ ▸ bpm: 130  ◼ 2 errors  ◉ live  ☰ Cmd+K palette  │  ← StatusBar
└──────────────────────────────────────────────────┘
```

### Components

| Component | What it owns | Storage |
|-----------|--------------|---------|
| `MenuBar` | File / Edit / View / Run / Preferences / Help dropdowns. Each item dispatches a command. | — |
| `FileExplorer` | Tree view of `VirtualFileSystem`. Context menu (rename / duplicate / delete). Drag files into editor groups. | — |
| `VirtualFileSystem` | Generalizes `VizPresetStore` to a full FS — files (`path`, `content`, `language`, `metadata`), virtual folders, recent files, rename, delete, import/export. | IndexedDB |
| `CommandPalette` | Cmd+K / Cmd+Shift+P fuzzy search over `CommandRegistry`. All menu actions, file open, viz commands, settings registered as commands. | — |
| `StatusBar` | BPM, error count, live mode, active engine, file dirty state, language mode. | — |
| `Settings` dialog | Themes (dark/light/custom), keybindings, default audio device, default viz config. | IndexedDB |
| `ProjectManifest` | `stave.project.json` describing files, default file bindings, project-level settings. Import/export as `.zip`. | IndexedDB |

### Out of scope (deferred)

- Real Git integration
- Multi-workspace
- Extension API
- Terminal
- Debugger
- Real filesystem (browser File System Access API, OPFS, cloud sync) — defer until users ask

---

## 5. File Type Registry

| Extension | Language | Default preview |
|-----------|----------|-----------------|
| `.strudel` | Strudel (JS + mini-notation) | StrudelRuntime |
| `.sonicpi` | Sonic Pi (Ruby-like) | SonicPiRuntime |
| `.hydra` | Hydra (JS shader DSL) | HydraViz |
| `.p5` | p5.js sketch | P5Viz |
| `.glsl` | GLSL fragment shader | (Phase 14, GLSL renderer) |
| `.md` | Markdown | MarkdownHTML |
| `.wav`, `.mp3` | Audio sample | AudioPlayer (deferred) |

---

## 6. The "Shared Audio" Trick

This is the one important detail: **viz previews need audio data from the running pattern preview.**

```
[ pattern.strudel preview ]  →  produces hapStream, analyser
                                    ↓
                              WorkspaceAudioBus (singleton)
                                    ↓
[ pianoroll.hydra preview ] ←  consumes hapStream, analyser
```

Without this, you can't have "preview viz A while pattern B runs" — which is the killer feature unlocked by the refactor.

### Bus contract

```typescript
interface WorkspaceAudioBus {
  publish(audio: { hapStream: HapStream, analyser: AnalyserNode, scheduler: PatternScheduler }): void
  unpublish(): void  // when pattern stops
  consume(): { hapStream, analyser, scheduler } | null  // current snapshot
  subscribe(cb: (audio | null) => void): () => void  // unsubscribe fn
}
```

There is exactly one `WorkspaceAudioBus` per workspace. Pattern previews publish on play, unpublish on stop. Viz previews subscribe and re-mount their renderer with the new components on bus change.

---

## 7. Migration Path

### What stays the same (code already shipped, no changes needed)

- `SplitPane` (zero-dep resizable splits)
- Tab drag-and-drop logic in `EditorGroup`
- `compilePreset` (viz code → descriptor)
- `usePopoutPreview` (window.open + audio bridge)
- `VizPresetStore` IndexedDB pattern (gets generalized into `VirtualFileSystem`)
- `HapStream`, `BufferedScheduler`, all engines
- All language registrations (Hydra Monarch, p5js Monarch, Strudel, SonicPi)

### What gets refactored (Phase 10.2)

| Current | New |
|---------|-----|
| `VizEditor` (monolithic, owns tabs + groups + Monaco + previews) | Thin composition over `WorkspaceShell` + `EditorView` + `PreviewView` |
| `LiveCodingEditor` (Monaco + viz panel + engine) | Thin composition over `EditorView` + `PreviewView` (with `STRUDEL_RUNTIME`/`SONICPI_RUNTIME` provider) |
| `StrudelEditor` | Thin wrapper over `LiveCodingEditor` (unchanged from current) |
| `EditorGroup.previewMode` state | Removed — previews are independent views |

### What gets built fresh (Phase 10.3)

`MenuBar`, `FileExplorer`, `VirtualFileSystem`, `CommandPalette`, `StatusBar`, `Settings`, `ProjectManifest`.

---

## 8. Order of Operations

1. **Workspace shell** (Phase 10.2 step 1) — generic tab/group/split with view registry. Refactor existing `EditorGroup`/`SplitPane` into the new shell.
2. **EditorView + PreviewView abstraction** (Phase 10.2 step 2) — split current widgets along this seam.
3. **Preview provider registry** (Phase 10.2 step 3) — register strudel/sonicpi/hydra/p5/md providers.
4. **Shared audio bus** (Phase 10.2 step 4) — singleton; pattern previews publish, viz previews consume.
5. **Backwards-compat exports** (Phase 10.2 step 5) — `StrudelEditor` / `LiveCodingEditor` / `VizEditor` as thin compositions.
6. **App page rewire** (Phase 10.2 step 6) — drop the 3-tab switcher, use `WorkspaceShell` directly.

(Then Phase 10.3 begins — menu bar, file explorer, etc.)

---

## 9. Open Questions (decide during Phase 10.2 planning)

- **Audio bus sharing model:** push (publisher fires events) or pull (consumer polls)? Push wins for latency, pull wins for simplicity.
- **Multiple pattern previews running simultaneously:** does the bus accept multiple publishers (mix them)? Or one publisher at a time (last writer wins)? First version: one at a time.
- **Preview view persistence:** when a file's preview is open and the user switches to a different tab, does the preview keep running or pause? Pattern previews probably keep running (audio is global). Viz previews probably pause (no point rendering offscreen).
- **Command registry storage:** in-memory only, or persisted (so user can rebind keys in Phase 10.3)? Phase 10.2 keeps it in-memory; 10.3 adds persistence.
- **File system API:** Phase 10.3 starts with IndexedDB. Browser File System Access API is a future option for opening real folders.

---

## 10. Why this is the right foundation for everything else

Once Phase 10.2 + 10.3 ship, every future feature gets simpler:

- **Phase 11 (Library Polish)** — `@stave/editor` exports a clean `WorkspaceShell` instead of three competing editors.
- **Phase 19 (Bidirectional DAW)** — DAW becomes a `PreviewProvider` for `.strudel` files. Open the DAW view alongside the code, edits propagate via the IR.
- **Phase 20 (Transform Graph)** — Same. The node patcher is a `PreviewProvider` (or a new view type) for `.strudel` files.
- **Phase 22 (Audio Analysis + Vocals)** — `.wav` files get a preview provider; the AudioRegion editor opens as a sibling view.
- **Phase 23 (Transparent AI)** — Layer 3 kernel views just register more providers.

The single-editor-per-view model is the unifying abstraction the rest of the roadmap needs.
