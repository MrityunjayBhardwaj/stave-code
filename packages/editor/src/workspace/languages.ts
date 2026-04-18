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
import { registerP5Providers, P5_DOCS_INDEX } from '../monaco/docs/p5'
import { registerHydraProviders, HYDRA_DOCS_INDEX } from '../monaco/docs/hydra'
import { registerSonicPiProviders } from '../monaco/docs/sonicpi'
import {
  buildIdentifierAlternation,
  keywordRule,
  methodRule,
} from '../monaco/docs/tokenizer-utils'
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
  // Keyword / method / variable sets derived from HYDRA_DOCS_INDEX so every
  // newly-documented symbol is also coloured. `kind: 'function'` captures
  // sources (osc, noise, shape, …); `kind: 'method'` captures chainable
  // transforms (rotate, kaleid, modulate, …); `kind: 'variable'` captures
  // the IO buffers + globals (s0..s3, o0..o3, time, mouse).
  const sources = buildIdentifierAlternation(HYDRA_DOCS_INDEX, {
    includeKinds: ['function'],
  })
  const methods = buildIdentifierAlternation(HYDRA_DOCS_INDEX, {
    includeKinds: ['method'],
  })
  const globals = buildIdentifierAlternation(HYDRA_DOCS_INDEX, {
    includeKinds: ['variable', 'constant'],
    extra: ['Math', 'PI', 'sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'max', 'min', 'random', 'pow', 'sqrt'],
  })
  // Same comprehensive shape as the p5 tokenizer — operators, brackets,
  // delimiters, identifier fallthrough, template-string interpolation.
  // Previous Hydra tokenizer had only keyword/method/variable + simple
  // strings + the `=>` operator, so arithmetic (`+`, `*`, `-`), brackets,
  // property access, and user variables all fell through to the
  // undifferentiated `source.hydra` catch-all.
  monaco.languages.setMonarchTokensProvider('hydra', {
    defaultToken: '',
    tokenPostfix: '.hydra',
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        // `.foo` property access → colored as method if it's a known Hydra
        // transform, else as property identifier. Method rule runs first.
        ...methodRule(methods, 'type'),
        [/\.([a-zA-Z_$][\w$]*)/, 'identifier.property'],
        ...keywordRule(sources, 'keyword'),
        ...keywordRule(globals, 'variable.predefined'),
        [/\ba\b/, 'variable.predefined'],
        [
          /\b(let|const|var|function|for|while|if|else|return|class|new|typeof|instanceof|of|in|break|continue|do|switch|case|default|throw|try|catch|finally|async|await|yield|this|super|import|export|from|as|void|delete|null|undefined|true|false)\b/,
          'keyword',
        ],
        [/[a-zA-Z_$][\w$]*/, 'identifier'],
        [/0[xX][\da-fA-F]+n?/, 'number.hex'],
        [/0[bB][01]+n?/, 'number.binary'],
        [/\d+(\.\d+)?([eE][+-]?\d+)?n?/, 'number'],
        [/\.\d+([eE][+-]?\d+)?/, 'number.float'],
        [/"/, { token: 'string.quote', next: '@string_double' }],
        [/'/, { token: 'string.quote', next: '@string_single' }],
        [/`/, { token: 'string.quote', next: '@string_template' }],
        [/=>/, 'keyword.operator'],
        [/(\?\?|\?\.|\?|:)/, 'keyword.operator'],
        [/===|!==|==|!=|<=|>=|<<|>>>|>>|&&|\|\|/, 'keyword.operator'],
        [/[=!<>]=?/, 'keyword.operator'],
        [/[+\-*/%&|^~]=?/, 'keyword.operator'],
        [/[{}()[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],
      string_double: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, { token: 'string.quote', next: '@pop' }],
      ],
      string_single: [
        [/[^\\']+/, 'string'],
        [/\\./, 'string.escape'],
        [/'/, { token: 'string.quote', next: '@pop' }],
      ],
      string_template: [
        [/[^\\`$]+/, 'string'],
        [/\\./, 'string.escape'],
        [/\$\{/, { token: 'delimiter.bracket', next: '@template_interp' }],
        [/\$/, 'string'],
        [/`/, { token: 'string.quote', next: '@pop' }],
      ],
      template_interp: [
        [/\}/, { token: 'delimiter.bracket', next: '@pop' }],
        { include: 'root' },
      ],
    },
  })
  monaco.languages.setLanguageConfiguration('hydra', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
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
  // Functions/constants/variables derived from P5_DOCS_INDEX so every
  // documented p5 identifier is also syntax-coloured. Stave-specific
  // globals (`scheduler`, `analyser`, `hapStream`) stay in `extra` since
  // they come from the host, not from p5.
  const fns = buildIdentifierAlternation(P5_DOCS_INDEX, {
    includeKinds: ['function'],
  })
  const variables = buildIdentifierAlternation(P5_DOCS_INDEX, {
    includeKinds: ['variable', 'constant'],
  })
  // Stave-specific host globals — injected into every p5 sketch by the
  // runtime. `stave` is the umbrella object; its properties are accessed
  // as `stave.scheduler`, `stave.analyser`, `stave.hapStream`, etc. The
  // property-access rule below colours the `.xxx` portion; this alternation
  // covers the bare `stave` identifier and direct-exposed aliases.
  const HOST_GLOBALS = 'stave|scheduler|analyser|hapStream'
  // Covers: JS keywords, p5 identifiers (from docs), literals, operators,
  // brackets, delimiters, numbers, strings (single / double / template
  // with ${} interpolation), comments. Previously the tokenizer only
  // matched docs-sourced identifiers + JS keywords + numbers + simple
  // strings, leaving operators / brackets / property accesses / local
  // variables rendered as undifferentiated `source.p5js` — the user-
  // visible gap in syntax colour.
  monaco.languages.setMonarchTokensProvider('p5js', {
    defaultToken: '',
    tokenPostfix: '.p5js',
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        // Host-global bare identifier (e.g. `stave` → colour as predefined
        // even when accessed as `stave.foo`). Must come before the
        // property-access rule so `.stave` stays as identifier.property.
        [new RegExp(`\\b(${HOST_GLOBALS})\\b`), 'variable.predefined'],
        // Property access: `.foo` — color the name so `obj.prop` reads as
        // property, not the same colour as bare identifiers. Must come
        // before the keyword rule so p5 names accessed as `.foo` don't
        // get mis-highlighted as top-level functions.
        [/\.([a-zA-Z_$][\w$]*)/, 'identifier.property'],
        ...keywordRule(fns, 'keyword'),
        ...keywordRule(variables, 'variable.predefined'),
        [
          /\b(let|const|var|function|for|while|if|else|return|class|new|typeof|instanceof|of|in|break|continue|do|switch|case|default|throw|try|catch|finally|async|await|yield|this|super|import|export|from|as|void|delete|null|undefined|true|false)\b/,
          'keyword',
        ],
        // Identifier fallthrough — anything left that looks like a name.
        [/[a-zA-Z_$][\w$]*/, 'identifier'],
        // Numbers: 0x…, 0b…, scientific, decimals starting with `.`.
        [/0[xX][\da-fA-F]+n?/, 'number.hex'],
        [/0[bB][01]+n?/, 'number.binary'],
        [/\d+(\.\d+)?([eE][+-]?\d+)?n?/, 'number'],
        [/\.\d+([eE][+-]?\d+)?/, 'number.float'],
        // Strings
        [/"/, { token: 'string.quote', next: '@string_double' }],
        [/'/, { token: 'string.quote', next: '@string_single' }],
        [/`/, { token: 'string.quote', next: '@string_template' }],
        // Operators + delimiters
        [/=>/, 'keyword.operator'],
        [/(\?\?|\?\.|\?|:)/, 'keyword.operator'],
        [/===|!==|==|!=|<=|>=|<<|>>>|>>|&&|\|\|/, 'keyword.operator'],
        [/[=!<>]=?/, 'keyword.operator'],
        [/[+\-*/%&|^~]=?/, 'keyword.operator'],
        [/[{}()[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/./, 'comment'],
      ],
      string_double: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, { token: 'string.quote', next: '@pop' }],
      ],
      string_single: [
        [/[^\\']+/, 'string'],
        [/\\./, 'string.escape'],
        [/'/, { token: 'string.quote', next: '@pop' }],
      ],
      string_template: [
        [/[^\\`$]+/, 'string'],
        [/\\./, 'string.escape'],
        [/\$\{/, { token: 'delimiter.bracket', next: '@template_interp' }],
        [/\$/, 'string'],
        [/`/, { token: 'string.quote', next: '@pop' }],
      ],
      template_interp: [
        [/\}/, { token: 'delimiter.bracket', next: '@pop' }],
        { include: 'root' },
      ],
    },
  })
  monaco.languages.setLanguageConfiguration('p5js', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
    ],
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
  ensureProviders('strudel', monaco, (m) => {
    registerStrudelDotCompletions(m)
    registerStrudelNoteCompletions(m)
    registerStrudelHover(m)
  })
  ensureProviders('p5js', monaco, registerP5Providers)
  ensureProviders('hydra', monaco, registerHydraProviders)
  ensureProviders('sonicpi', monaco, registerSonicPiProviders)
}

// Per-runtime idempotency flags so `ensureWorkspaceLanguages` is safe on
// every EditorView mount. Monaco's provider registry is append-only per
// invocation — without the guard, mounting N editors would register N
// copies of each provider.
const providersRegistered: Record<string, boolean> = {}

function ensureProviders(
  key: string,
  monaco: typeof Monaco,
  register: (m: typeof Monaco) => void,
): void {
  if (providersRegistered[key]) return
  // Tests use a thin Monaco mock — skip when the required APIs are
  // absent rather than crashing on `undefined is not a function`.
  if (
    typeof monaco.languages?.registerCompletionItemProvider !== 'function' ||
    typeof monaco.languages?.registerHoverProvider !== 'function'
  ) {
    return
  }
  providersRegistered[key] = true
  register(monaco)
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
  for (const k of Object.keys(providersRegistered)) {
    providersRegistered[k] = false
  }
}
