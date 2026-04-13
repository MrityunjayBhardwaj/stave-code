/**
 * Monaco language registration for workspace views — Phase 10.2 Task 03.
 *
 * `EditorView` mounts Monaco once per file, not once per workspace. Every
 * mount potentially touches a different language (`strudel`, `sonicpi`,
 * `hydra`, `p5js`). Rather than scatter registration calls across the four
 * legacy monoliths (`LiveCodingEditor`, `StrudelEditor`, `VizEditor`,
 * `StrudelMonaco`), this module exposes one entry point — `ensureWorkspaceLanguages()`
 * — that every workspace editor calls on Monaco mount.
 *
 * @remarks
 * ## Idempotency
 *
 * `monaco.languages.register({ id })` is NOT idempotent — calling it twice
 * with the same id inside a single Monaco instance leaves the definition in
 * a degraded state (duplicate registration warnings, partial tokenizer
 * reset). Each individual register function in this module guards via a
 * module-level `registered` flag AND via `monaco.languages.getLanguages()`
 * lookup, so second-and-subsequent calls are safe no-ops.
 *
 * ## Why not import from `LiveCodingEditor.tsx` / `VizEditor.tsx`?
 *
 * Those files are destined for deletion in Task 09 (per the plan) and
 * currently live in the `visualizers/` directory — importing from them
 * would create a reverse dependency from the new workspace module into the
 * legacy monoliths, blocking their removal. Instead we:
 *
 *   - Reuse the already-extracted `registerStrudelLanguage` /
 *     `registerSonicPiLanguage` from `monaco/language.ts` (both helpers
 *     predate Task 09 and will survive it).
 *   - Define the hydra and p5js Monarch providers inline here, mirroring
 *     the existing `VizEditor.tsx:28-78` definitions verbatim. When
 *     `VizEditor.tsx` is deleted, these become the single source of truth.
 *
 * ## Pattern borrowed from Task 02
 *
 * `recency: string[]` and the identity guard in `WorkspaceAudioBus.ts`
 * established the discipline: module-level state is fine as long as it has
 * a `__reset*ForTests` escape hatch. This file follows the same discipline
 * so unit tests can register-reset-register without hitting the
 * already-registered guard.
 */

import type * as Monaco from 'monaco-editor'
import {
  registerStrudelLanguage,
  registerSonicPiLanguage,
} from '../monaco/language'
import {
  registerStrudelDotCompletions,
  registerStrudelNoteCompletions,
} from '../monaco/strudelCompletions'
import { registerStrudelHover } from '../monaco/strudelDocs'
import type { WorkspaceLanguage } from './types'

/**
 * Idempotency guards. Each language is registered at most once per Monaco
 * instance. If Monaco is torn down and re-created (rare — happens in tests
 * that call `monaco.editor.dispose`), these should be reset via
 * `__resetWorkspaceLanguagesForTests()` before the next call.
 */
let hydraRegistered = false
let p5jsRegistered = false

function registerHydraLanguage(monaco: typeof Monaco): void {
  if (hydraRegistered) return
  const langs = monaco.languages.getLanguages()
  if (langs.some((l) => l.id === 'hydra')) {
    hydraRegistered = true
    return
  }
  hydraRegistered = true
  monaco.languages.register({ id: 'hydra' })
  monaco.languages.setMonarchTokensProvider('hydra', {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [
          /\b(osc|noise|shape|gradient|solid|voronoi|src|s0|s1|s2|s3|o0|o1|o2|o3)\b/,
          'keyword',
        ],
        [
          /\.(color|rotate|scale|modulate|blend|add|diff|layer|mask|luma|thresh|posterize|shift|kaleid|scroll|scrollX|scrollY|pixelate|repeat|repeatX|repeatY|out|brightness|contrast|saturate|hue|invert)\b/,
          'type',
        ],
        [
          /\b(Math|PI|sin|cos|tan|abs|floor|ceil|round|max|min|random|pow|sqrt)\b/,
          'variable',
        ],
        [/\ba\b/, 'variable.predefined'],
        [/\b\d+\.?\d*\b/, 'number'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/=>/, 'keyword.operator'],
      ],
      comment: [
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],
    },
  })
}

function registerP5JsLanguage(monaco: typeof Monaco): void {
  if (p5jsRegistered) return
  const langs = monaco.languages.getLanguages()
  if (langs.some((l) => l.id === 'p5js')) {
    p5jsRegistered = true
    return
  }
  p5jsRegistered = true
  monaco.languages.register({ id: 'p5js' })
  monaco.languages.setMonarchTokensProvider('p5js', {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [
          /\b(background|fill|stroke|noFill|noStroke|rect|ellipse|line|point|arc|triangle|quad|beginShape|endShape|vertex|text|textSize|textAlign|image|loadImage|createCanvas|resizeCanvas|push|pop|translate|rotate|scale)\b/,
          'keyword',
        ],
        [
          /\b(width|height|mouseX|mouseY|frameCount|millis|hapStream|analyser|scheduler)\b/,
          'variable.predefined',
        ],
        [
          /\b(let|const|var|function|for|while|if|else|return|class|new|typeof|of|in)\b/,
          'keyword',
        ],
        [/\b\d+\.?\d*\b/, 'number'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/`[^`]*`/, 'string'],
      ],
      comment: [
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],
    },
  })
}

/**
 * Ensure every workspace-supported Monaco language is registered on the
 * provided Monaco instance. Safe to call on every `EditorView` mount —
 * unregistered languages are registered, already-registered languages are
 * skipped. Call from `<MonacoEditor onMount>` before returning control to
 * the caller's own mount handler so the language id is valid by the time
 * any subsequent code asks for it.
 *
 * Markdown is intentionally not registered here — Monaco ships a built-in
 * `markdown` language and registering a custom one would clobber it. The
 * `WorkspaceLanguage` value `'markdown'` maps straight to Monaco's built-in
 * id of the same name.
 */
export function ensureWorkspaceLanguages(monaco: typeof Monaco): void {
  registerStrudelLanguage(monaco)
  registerSonicPiLanguage(monaco)
  registerHydraLanguage(monaco)
  registerP5JsLanguage(monaco)
  ensureStrudelProviders(monaco)
}

// Completion + hover providers for strudel. Monaco's provider registry
// is append-only per invocation, so we guard with a module-level flag
// to avoid fan-out when multiple EditorView instances mount. Tests use
// a thin Monaco mock — skip when the required APIs are absent.
let strudelProvidersRegistered = false
function ensureStrudelProviders(monaco: typeof Monaco): void {
  if (strudelProvidersRegistered) return
  if (
    typeof monaco.languages?.registerCompletionItemProvider !== 'function' ||
    typeof monaco.languages?.registerHoverProvider !== 'function'
  ) {
    return
  }
  strudelProvidersRegistered = true
  registerStrudelDotCompletions(monaco)
  registerStrudelNoteCompletions(monaco)
  registerStrudelHover(monaco)
}

/**
 * Map a `WorkspaceLanguage` to the Monaco language id string. The mapping
 * is currently identity — the `WorkspaceLanguage` string literals were
 * chosen to match Monaco registrations — but the function exists so that
 * any future divergence (e.g., a workspace language with dialect variants)
 * lives in one place.
 */
export function toMonacoLanguage(lang: WorkspaceLanguage): string {
  switch (lang) {
    case 'strudel':
      return 'strudel'
    case 'sonicpi':
      return 'sonicpi'
    case 'hydra':
      return 'hydra'
    case 'p5js':
      return 'p5js'
    case 'markdown':
      return 'markdown'
  }
}

/**
 * TESTING ONLY — reset the idempotency guards so a fresh Monaco instance
 * (test fixture) can re-register the inline `hydra` / `p5js` languages.
 * Does NOT reset `registerStrudelLanguage` / `registerSonicPiLanguage` —
 * those helpers own their own guards and are stable enough across tests
 * that resetting them has never been needed. Not exported from the barrel.
 */
export function __resetWorkspaceLanguagesForTests(): void {
  hydraRegistered = false
  p5jsRegistered = false
}
