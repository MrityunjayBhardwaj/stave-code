# Coding Conventions

**Analysis Date:** 2026-03-21

## Naming Patterns

**Files:**
- TypeScript files: `camelCase.ts` (e.g., `WavEncoder.ts`, `StrudelEngine.ts`)
- React components: `PascalCase.tsx` (e.g., `StrudelEditor.tsx`, `Toolbar.tsx`)
- Test files: `*.test.ts` suffix (e.g., `WavEncoder.test.ts`)

**Functions:**
- Regular functions: `camelCase` (e.g., `writeString()`, `floatToInt16()`, `extractCps()`)
- React components: `PascalCase` (e.g., `StrudelEditor()`, `Toolbar()`)
- Private/internal helper functions: `camelCase` (e.g., `getEngine()`, `handlePlay()`)
- Icon components (internal): `PascalCase` (e.g., `PlayIcon()`, `StopIcon()`)

**Variables:**
- Constants: `camelCase` (e.g., `DEFAULT_CODE`, `DEFAULT_EXPORT_DURATION`)
- State variables: `camelCase` (e.g., `isPlaying`, `errorMsg`, `internalCode`)
- Refs: `camelCase` with `Ref` suffix (e.g., `containerRef`, `engineRef`, `editorRef`)

**Types:**
- Interfaces: `PascalCase` (e.g., `StrudelEditorProps`, `ToolbarProps`, `HapEvent`)
- Type aliases: `PascalCase` (e.g., `HapHandler`)
- Exported types: `PascalCase` (e.g., `StrudelTheme`, `StrudelEditorProps`)

**Classes:**
- `PascalCase` (e.g., `WavEncoder`, `StrudelEngine`, `HapStream`)
- Static methods and properties on classes are used for utility classes

## Code Style

**Formatting:**
- Indentation: 2 spaces (inferred from source code)
- Line length: Pragmatic (lines extend as needed, no strict limit observed)
- Semicolons: Required at end of statements
- Quotes: Single quotes for strings in most cases

**Linting:**
- No ESLint configuration file found in root or editor package
- ESLint comments used selectively:
  - `@typescript-eslint/no-explicit-any` disabled when external libraries use `any`
  - `react-hooks/exhaustive-deps` disabled with comments explaining why
- TypeScript strict mode enabled (`tsconfig.json`)
- Lint command: `npm run lint` → runs `tsc --noEmit` (type checking only)

**TypeScript Compilation:**
- Target: `ES2020`
- Module resolution: `bundler`
- JSX: `react-jsx` (automatic JSX transform)
- Strict mode: Enabled
- Declaration files: Generated

## Import Organization

**Order:**
1. React and React hooks (`import React, { ... } from 'react'`)
2. External packages (`import MonacoEditorRaw from '@monaco-editor/react'`)
3. Type imports (`import type * as Monaco from 'monaco-editor'`)
4. Relative imports from the same package (`import { Component } from './path'`)
5. Type imports from relatives (`import type { Type } from './path'`)

**Example from `StrudelEditor.tsx`:**
```typescript
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type * as Monaco from 'monaco-editor'
import { StrudelMonaco } from './monaco/StrudelMonaco'
import { Toolbar } from './toolbar/Toolbar'
import { StrudelEngine } from './engine/StrudelEngine'
import { applyTheme } from './theme/tokens'
import type { StrudelTheme } from './theme/tokens'
```

**Path Aliases:**
- No path aliases configured (direct relative imports used)
- Imports use relative paths like `./engine/`, `./theme/`, `./toolbar/`

## Error Handling

**Patterns:**
- Try-catch for async operations (e.g., in `handleExport()` in `StrudelEditor.tsx`)
- Null checks before operations (e.g., `if (!this.initialized)`, `if (!this.audioCtx)`)
- Error objects passed to callback handlers (e.g., `onError?.(error)`)
- Silent error suppression in subscriber loops (e.g., HapStream.emit catches handler errors)
- Initialization guard pattern: methods check `if (!this.initialized)` and call `init()`

**Example from `StrudelEditor.tsx` (lines 143-171):**
```typescript
const handleExport = useCallback(async () => {
  if (isExporting) return
  setIsExporting(true)
  setErrorMsg(null)

  try {
    const engine = getEngine()
    await engine.init()
    const blob = await engine.renderOffline(code, DEFAULT_EXPORT_DURATION)

    if (onExport) {
      await onExport(blob)
    } else {
      // Default: trigger browser download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'pattern.wav'
      a.click()
      URL.revokeObjectURL(url)
    }
  } catch (err) {
    const e = err as Error
    setErrorMsg(e.message ?? String(e))
    onError?.(e)
  } finally {
    setIsExporting(false)
  }
}, [code, isExporting, onExport, onError])
```

**Exception Throwing:**
- Used for initialization state validation (e.g., `throw new Error('StrudelEngine not initialized — call init() first')`)
- Used for missing pattern data (e.g., `throw new Error('OfflineRenderer: no pattern returned from evaluate()')`)

## Logging

**Framework:** No formal logging library; uses `console` implicitly (not observed in code)

**Patterns:**
- No explicit console logs in production code
- Errors are passed through callbacks (`onError?.()`) rather than logged directly
- Code comments explain non-obvious behavior instead

## Comments

**When to Comment:**
- Multi-line JSDoc blocks for public methods (e.g., on `WavEncoder.encode()`, `WavEncoder.encodeChunks()`)
- Inline comments for complex logic (e.g., bit operations in `WavEncoder`)
- Section dividers for helper function groups (e.g., `// ── Helpers ──────────────────`)
- Warnings about limitations (e.g., "LIMITATION: Only oscillator-based sounds work")
- Context for deprecated APIs (e.g., "ScriptProcessorNode is deprecated but remains the most reliable")

**JSDoc/TSDoc:**
- Applied to public class methods and exported functions
- Format: `/** Multi-line description */` above method signatures
- Examples documented in comments when patterns are non-obvious

**Example from `WavEncoder.ts` (lines 1-5):**
```typescript
/**
 * Pure TypeScript RIFF WAV encoder.
 * No dependencies — works in any browser or Node.js environment.
 * Encodes stereo Float32 PCM into a standard 16-bit WAV Blob.
 */
```

## Function Design

**Size:** Functions are compact (most < 20 lines), with larger functions (30+ lines) dedicated to complex tasks like `StrudelEditor` component

**Parameters:**
- Named parameters via interfaces (e.g., `StrudelEditorProps` destructured in component)
- Event handlers use standard React patterns (e.g., `(val: string) => void`)
- Optional parameters marked with `?` (e.g., `onPlay?: () => void`)

**Return Values:**
- Explicit return types on all functions
- `Promise<T>` for async operations
- Union types for optional returns (e.g., `number | null` from `noteToMidi()`)
- Use `void` for callbacks and event handlers

**Example from `StrudelEngine.ts` (lines 75-87):**
```typescript
async evaluate(code: string): Promise<{ error?: Error }> {
  if (!this.initialized) await this.init()

  return new Promise((resolve) => {
    this.evalResolve = resolve
    this.repl.evaluate(code).then(() => {
      // If onEvalError didn't fire, evaluation succeeded
      if (this.evalResolve) { this.evalResolve({}); this.evalResolve = null }
    })
  })
}
```

## Module Design

**Exports:**
- Barrel files used in `index.ts` to organize public API
- Default exports: Not used (named exports preferred)
- Re-export pattern: `export { Class } from './path'`
- Type exports: `export type { Type } from './path'`

**Example from `index.ts`:**
```typescript
export { StrudelEditor } from './StrudelEditor'
export type { StrudelEditorProps } from './StrudelEditor'

export { StrudelEngine } from './engine/StrudelEngine'
export { HapStream } from './engine/HapStream'
export type { HapEvent } from './engine/HapStream'
```

**Barrel Files:**
- `index.ts` at package root aggregates all public exports
- Subdirectory imports preferred over wildcard imports
- Clear separation between types and implementations

## React Patterns

**Hooks Usage:**
- `useCallback()` for event handlers that depend on state
- `useRef()` for persistent mutable values (DOM refs, engine instances)
- `useState()` for UI state (playing, error, export status)
- `useEffect()` for side effects and initialization
- `useMemo()` imported but usage context unclear in samples

**Component Structure:**
- Functional components (no class components)
- Props destructured directly in function signature
- Refs wrapped in `useRef()` with proper typing
- Uncontrolled input pattern: internal state + controlled parent override

**Example from `StrudelEditor.tsx` (lines 54-77):**
```typescript
export function StrudelEditor({
  code: controlledCode,
  defaultCode,
  onChange,
  // ... other props
}: StrudelEditorProps) {
  const isControlled = controlledCode !== undefined
  const [internalCode, setInternalCode] = useState(
    defaultCode ?? DEFAULT_CODE
  )
  const code = isControlled ? controlledCode : internalCode
```

**Inline Styles:**
- CSS-in-JS via `style` prop (no external CSS framework)
- CSS variables for theming (`var(--background)`, `var(--accent)`)
- Flexbox for layout

## TypeScript Strictness

**General:**
- Strict mode enabled in all `tsconfig.json` files
- Explicit types on all function signatures and public APIs
- Use of `as` casts minimized but allowed when working with external libraries
- Optional chaining (`?.`) and nullish coalescing (`??`) used consistently

**Type Safety Patterns:**
- Union types for flexible parameters (e.g., `theme?: 'dark' | 'light' | StrudelTheme`)
- `Record<string, T>` for object maps (e.g., `Record<string, string>` in theme tokens)
- Type guards used implicitly (e.g., `typeof note === 'number'`)
- `as unknown as TargetType` when working with untyped external APIs

**Any Usage:**
- `// eslint-disable-next-line @typescript-eslint/no-explicit-any` used when external libraries force `any`
- Comment explains the reason (e.g., "React 18 vs React 19 JSX incompatibility")

---

*Convention analysis: 2026-03-21*
