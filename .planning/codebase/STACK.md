# Technology Stack

**Analysis Date:** 2026-03-21

## Languages

**Primary:**
- TypeScript 5.4.x - All source code (editor package, app package, configs)
- JSX/TSX 5.4.x - React components with strict mode enabled

**Secondary:**
- JavaScript (ES2020) - Configuration files and generated output

## Runtime

**Environment:**
- Node.js >=20
- Browser/Web Standard APIs (WebAudio, OfflineAudioContext, Web Workers for audio processing)

**Package Manager:**
- pnpm 9.0.0+
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core UI:**
- React 19.2.4 - Application framework
- React DOM 19.2.4 - DOM rendering
- Next.js 16.2.1 - Full-stack app framework (in `packages/app`)

**Code Editor:**
- Monaco Editor 0.50.0 - Code editing component
- @monaco-editor/react 4.6.0 - React wrapper for Monaco

**Audio/Music:**
- Strudel.js (via @strudel/core, @strudel/webaudio, @strudel/mini, @strudel/tonal, @strudel/transpiler) - Live-codeable pattern DSL and synthesis engine
- Web Audio API - Native browser audio APIs (no additional library)

**Styling:**
- Tailwind CSS 4.x - Utility-first CSS framework (in `packages/app`)
- @tailwindcss/postcss 4.x - PostCSS plugin for Tailwind

**Build & Bundling:**
- tsup 8.0.0 - TypeScript bundler for libraries (`packages/editor`)
- Turbo 2.0.0+ - Monorepo task orchestrator (root)

**Testing:**
- Vitest 1.6.0 - Unit test runner
- @testing-library/react 16.0.0 - React testing utilities
- jsdom 24.0.0 - DOM environment for jsdom tests

**Linting & Code Quality:**
- ESLint 9.x - JavaScript/TypeScript linter
- eslint-config-next 16.2.1 - Next.js ESLint config presets (type-checking, core-web-vitals, TypeScript)
- TypeScript compiler (tsc --noEmit) - Type checking as lint step

**Type Definitions:**
- TypeScript 5.4.0 - Type definitions and compiler
- @types/react 19.x - React type definitions
- @types/react-dom 19.x - React DOM type definitions
- @types/node 20.x - Node.js type definitions (in `packages/app`)

## Key Dependencies

**Critical Runtime:**
- @strudel/core 1.0.0 - Pattern evaluation and scheduling core
- @strudel/webaudio 1.0.0 - Web Audio output and scheduler for superdough
- @strudel/mini 1.0.0 - Mini-notation support (side-effect registration)
- @strudel/tonal 1.0.0 - Tonal.js music theory integration (side-effect registration)
- @strudel/transpiler 1.2.6 - Pattern syntax transpiler ($: notation support)
- monaco-editor 0.50.0 - Syntax highlighting and editor functionality

**Utility:**
- @monaco-editor/react 4.6.0 - React bridge for Monaco Editor

## Build Configuration

**TypeScript:**
- Compiler Target: ES2020
- Module System: ESNext with bundler resolution
- JSX: react-jsx (automatic runtime)
- Strict Mode: Enabled
- Declaration Maps: Enabled for source debugging
- Source Maps: Enabled

**Editor Package Build (tsup):**
- Entry: `packages/editor/src/index.ts`
- Formats: ESM + CJS dual-output
- Declaration: Yes (with source maps)
- External: react, react-dom (peerDependencies)
- Tree-shake: Enabled
- Config: `packages/editor/tsup.config.ts`

**App Package Build (Next.js):**
- Transpilation: @strucode/editor (workspace package transpiled for ESM consumption)
- Config: `packages/app/next.config.ts`

**Turbo Task Pipeline:**
- build: Outputs to `dist/**`
- dev: Non-cached, persistent (watch mode)
- test: Depends on build, outputs `coverage/**`
- lint: Type checking and ESLint
- clean: Remove build artifacts
- Config: `turbo.json`

## Project Structure

**Monorepo:**
- Root: `package.json` (private workspace, orchestrates via Turbo)
- Workspaces: `packages/*` (pnpm-workspace.yaml)
- Packages:
  - `@strucode/editor` - Reusable React editor component + audio engine
  - `@strucode/app` - Next.js demo application

## Platform Requirements

**Development:**
- Node.js >=20
- pnpm >=9
- Supported on macOS, Linux, Windows (standard Node.js environment)

**Production:**
- Modern browser with:
  - ES2020 JavaScript support
  - Web Audio API support
  - OfflineAudioContext support
  - DOM APIs (contenteditable, event listeners)
- Deployment: Static Next.js export or server-side rendering

## Configuration Files

**Root:**
- `tsconfig.json` - Shared TypeScript compiler options
- `turbo.json` - Monorepo task orchestration
- `pnpm-workspace.yaml` - Workspace configuration

**Packages:**
- `packages/editor/package.json` - Editor library metadata
- `packages/editor/tsup.config.ts` - Library bundling configuration
- `packages/editor/vitest.config.ts` - Unit test configuration
- `packages/app/package.json` - Next.js app metadata
- `packages/app/next.config.ts` - Next.js build configuration
- `packages/app/eslint.config.mjs` - ESLint configuration (ESM format)

## Environment Configuration

**No .env file required** - struCode is a client-side audio editor with no backend integrations.

**Next.js Runtime:**
- Development: `next dev` (hot reload)
- Production Build: `next build && next start`

---

*Stack analysis: 2026-03-21*
