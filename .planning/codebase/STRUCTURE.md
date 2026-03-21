# Codebase Structure

**Analysis Date:** 2026-03-21

## Directory Layout

```
struCode/
├── packages/
│   ├── editor/                     # React component library (@strucode/editor)
│   │   ├── src/
│   │   │   ├── engine/             # Audio engine, scheduling, rendering, export
│   │   │   │   ├── StrudelEngine.ts        # Main engine class: evaluate, play, stop, record, render
│   │   │   │   ├── HapStream.ts            # Event bus: emits enriched Hap events to subscribers
│   │   │   │   ├── OfflineRenderer.ts      # Fast offline rendering via OfflineAudioContext
│   │   │   │   ├── LiveRecorder.ts         # Real-time audio capture via ScriptProcessorNode
│   │   │   │   ├── WavEncoder.ts           # Pure TS RIFF WAV encoder (no dependencies)
│   │   │   │   ├── noteToMidi.ts           # Note name → MIDI number conversion utility
│   │   │   │   └── WavEncoder.test.ts      # Unit tests for WAV encoding
│   │   │   ├── monaco/             # Monaco editor integration
│   │   │   │   ├── StrudelMonaco.tsx       # Monaco wrapper component with Strudel config
│   │   │   │   └── language.ts             # Strudel language definition (tokenizer, syntax rules)
│   │   │   ├── toolbar/            # Playback + export controls
│   │   │   │   └── Toolbar.tsx             # Play/stop/export buttons, BPM display, error badge
│   │   │   ├── theme/              # Design tokens + theming
│   │   │   │   ├── tokens.ts               # Dark/light theme token maps, applyTheme() function
│   │   │   │   └── monacoTheme.ts          # Monaco editor theme definition
│   │   │   ├── StrudelEditor.tsx           # Root component: orchestrates engine, Monaco, toolbar
│   │   │   ├── index.ts                    # Public API barrel export
│   │   │   └── strudel.d.ts                # Type definitions for @strudel packages
│   │   ├── dist/                   # Build output (generated)
│   │   ├── package.json            # Editor package manifest
│   │   ├── tsconfig.json           # TypeScript config
│   │   └── vitest.config.ts        # Test runner config (implicit, uses defaults)
│   │
│   └── app/                        # Next.js 15 demo application
│       ├── src/
│       │   ├── app/
│       │   │   ├── page.tsx                # Landing page with editor demo
│       │   │   ├── layout.tsx              # Root layout
│       │   │   ├── docs/                   # (Future) Usage documentation pages
│       │   │   └── examples/               # (Future) Example pattern gallery
│       │   └── components/
│       │       ├── EditorWrapper.tsx       # Dynamic import wrapper (SSR-safe)
│       │       └── StrudelEditorClient.tsx # Client component with editor initialization
│       ├── public/                 # Static assets (favicon, etc.)
│       ├── package.json            # App package manifest (Next.js dependencies)
│       ├── next.config.ts          # Next.js configuration
│       └── tsconfig.json           # TypeScript config
│
├── pnpm-workspace.yaml             # Workspace configuration
├── turbo.json                      # Turborepo build cache + task config
├── ARCHITECTURE.md                 # Design specification (architecture reference)
├── README.md                       # Project readme
└── .planning/
    └── codebase/                   # GSD codebase documentation
        ├── ARCHITECTURE.md         # (This file's companion: runtime patterns)
        └── STRUCTURE.md            # (This file)
```

## Directory Purposes

**packages/editor/src/engine/:**
- Purpose: Audio scheduling, evaluation, and rendering engine
- Contains: Audio I/O, WebAudio integration, pattern evaluation, WAV encoding
- Key files: `StrudelEngine.ts` (main API), `HapStream.ts` (event distribution), `OfflineRenderer.ts` (fast rendering)
- Pattern: All audio work is engine-owned; UI is event-driven via HapStream subscription
- Generated: No
- Committed: Yes

**packages/editor/src/monaco/:**
- Purpose: Monaco code editor customization for Strudel
- Contains: Language definition (tokenizer, keywords, syntax rules), Monaco component wrapper
- Key files: `StrudelMonaco.tsx` (component), `language.ts` (language definition)
- Pattern: Language definition is static; component is a thin wrapper around `@monaco-editor/react`
- Generated: No
- Committed: Yes

**packages/editor/src/toolbar/:**
- Purpose: Playback control UI and status display
- Contains: Play/stop/export buttons, BPM display, error badge
- Key files: `Toolbar.tsx` (all UI in one file with inline SVG icons)
- Pattern: Pure component; no state — all state managed by parent StrudelEditor
- Generated: No
- Committed: Yes

**packages/editor/src/theme/:**
- Purpose: Design tokens and theme application
- Contains: Dark/light color token maps, CSS custom property injection, Monaco theme customization
- Key files: `tokens.ts` (token definitions + applyTheme), `monacoTheme.ts` (Monaco theme)
- Pattern: Tokens are plain data; applyTheme() applies CSS custom properties to DOM element
- Generated: No
- Committed: Yes

**packages/editor/:**
- Purpose: Root component orchestrating all layers
- Key files: `StrudelEditor.tsx` (main export), `index.ts` (API barrel)
- Pattern: Manages engine lifecycle, code state, playback state; wires all event handlers
- Generated: No
- Committed: Yes

**packages/app/src/app/:**
- Purpose: Next.js App Router pages and layouts
- Key files: `page.tsx` (landing/demo page), `layout.tsx` (root layout)
- Pattern: Minimal; delegates editor rendering to client component wrapper
- Generated: No
- Committed: Yes

**packages/app/src/components/:**
- Purpose: App-specific wrapper components
- Contains: Dynamic import wrapper (SSR-safe), client component initialization
- Key files: `EditorWrapper.tsx` (dynamic import), `StrudelEditorClient.tsx` (editor instantiation)
- Pattern: Wrappers isolate Next.js/SSR concerns from @strucode/editor
- Generated: No
- Committed: Yes

## Key File Locations

**Entry Points:**
- `packages/editor/src/index.ts`: Public API exports (component, engine, utilities)
- `packages/editor/src/StrudelEditor.tsx`: Root React component
- `packages/editor/src/engine/StrudelEngine.ts`: Audio engine class
- `packages/app/src/app/page.tsx`: Next.js demo page

**Configuration:**
- `package.json`: Workspace root (pnpm config)
- `pnpm-workspace.yaml`: Workspace configuration
- `turbo.json`: Build cache + task definitions
- `packages/editor/package.json`: Editor library metadata (tsup config implicit in package.json scripts)
- `packages/editor/tsconfig.json`: TypeScript strict mode config
- `packages/app/package.json`: Next.js app dependencies
- `packages/app/next.config.ts`: Next.js config (if present)

**Core Logic:**
- `packages/editor/src/engine/StrudelEngine.ts`: Audio scheduling, evaluation, rendering APIs
- `packages/editor/src/engine/HapStream.ts`: Event bus for audio scheduling
- `packages/editor/src/engine/OfflineRenderer.ts`: CPU-speed audio rendering
- `packages/editor/src/monaco/language.ts`: Strudel syntax definition

**Testing:**
- `packages/editor/src/engine/WavEncoder.test.ts`: WAV encoder unit tests
- Tests run via: `npm run test` (from editor package)

## Naming Conventions

**Files:**
- Components: PascalCase (e.g., `StrudelEditor.tsx`, `Toolbar.tsx`)
- Utilities: camelCase (e.g., `noteToMidi.ts`, `language.ts`)
- Tests: `<file>.test.ts` or `<file>.spec.ts` suffix
- Config: lowercase with dots (e.g., `turbo.json`, `tsconfig.json`)

**Directories:**
- Feature/layer directories: lowercase (e.g., `engine/`, `monaco/`, `toolbar/`)
- Plurals only when grouping multiple related items: `packages/` (multiple packages)
- Never use underscores; use hyphens or camelCase

**Functions:**
- Exports: camelCase or PascalCase (components are PascalCase)
- Internal helpers: camelCase (e.g., `extractCps()`, `renderNote()`)
- Event handlers: `on<Event>` pattern (e.g., `onPlay`, `onChange`)

**Variables & Constants:**
- Constants (theme tokens, config): UPPERCASE_WITH_UNDERSCORES (e.g., `DARK_THEME_TOKENS`)
- Variables: camelCase
- CSS custom properties: kebab-case prefixed with `--` (e.g., `--background`, `--accent-rgb`)

**React Props:**
- Interface suffix: `Props` (e.g., `StrudelEditorProps`, `ToolbarProps`)
- Required props: no suffix
- Optional props marked with `?`

## Where to Add New Code

**New Feature (e.g., spectrum analyzer):**
- Primary code: `packages/editor/src/visualizers/Spectrum.tsx`
- Tests: `packages/editor/src/visualizers/Spectrum.test.ts`
- Export via: Add to `packages/editor/src/index.ts`
- Subscribe to events: `engine.on('hap', handler)` or use `engine.getHapStream().on(handler)`

**New Component/Module (e.g., oscilloscope):**
- Implementation: `packages/editor/src/visualizers/Scope.tsx`
- If reusable canvas logic: Extract to `packages/editor/src/visualizers/useCanvasAnimation.ts`
- If shared utilities: Add to `packages/editor/src/utils/<feature>.ts` (create directory if needed)

**New Engine Feature (e.g., stem export):**
- Implementation: `packages/editor/src/engine/<Feature>.ts`
- Expose via: `StrudelEngine` method or property
- Export via: `packages/editor/src/index.ts`
- Example: `renderStems()` already exists in `StrudelEngine`

**Utilities & Helpers:**
- General purpose: `packages/editor/src/utils/<category>.ts` (create if needed)
- Audio-specific: `packages/editor/src/engine/<utility>.ts`
- Monaco-specific: `packages/editor/src/monaco/<feature>.ts`

**Tests:**
- Co-located: same directory as source file, `<file>.test.ts` suffix
- Configuration: `vitest.config.ts` in package root
- Run: `npm run test` (all tests) or `npm run test:watch` (watch mode)

**Styles:**
- No separate CSS files; inline styles via `style={}` props or CSS custom properties
- Color/token values: reference `--*` custom properties from `theme/tokens.ts`
- Example: `background: 'var(--background)'`, `color: 'var(--accent)'`

## Special Directories

**packages/editor/dist/:**
- Purpose: Build output from tsup (generated)
- Contains: `.js`, `.cjs`, `.d.ts` files
- Generated: Yes (via `npm run build`)
- Committed: No (gitignored)

**packages/app/.next/:**
- Purpose: Next.js build cache and output
- Contains: Build artifacts, server/client chunks
- Generated: Yes (via `npm run build`)
- Committed: No (gitignored)

**node_modules/:**
- Purpose: Installed dependencies
- Generated: Yes (via `pnpm install`)
- Committed: No (gitignored)

**.turbo/:**
- Purpose: Turborepo build cache
- Generated: Yes (during `pnpm build`)
- Committed: No (gitignored)

**.planning/codebase/:**
- Purpose: GSD codebase documentation (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: No (manually maintained)
- Committed: Yes

## Module Organization

**Public API Surface (packages/editor/src/index.ts):**
```
- StrudelEditor (component)
- StrudelEditorProps (type)
- StrudelEngine (class)
- HapStream (class)
- HapEvent (type)
- WavEncoder (class)
- OfflineRenderer (class)
- LiveRecorder (class)
- noteToMidi (function)
- StrudelTheme (type)
- DARK_THEME_TOKENS (const)
- LIGHT_THEME_TOKENS (const)
- applyTheme (function)
```

**Internal Modules (not exported):**
- `Monaco/language.ts`: Registered dynamically, not exported
- `Monaco/StrudelMonaco.tsx`: Used only by StrudelEditor
- `Toolbar.tsx`: Used only by StrudelEditor
- `theme/monacoTheme.ts`: Used only by StrudelMonaco

**Barrel Files:**
- `packages/editor/src/index.ts`: Main barrel (aggregates all public exports)
- No other barrel files; sub-directories export directly

---

*Structure analysis: 2026-03-21*
