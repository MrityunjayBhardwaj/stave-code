import type * as Monaco from 'monaco-editor'
import { SONICPI_DOCS_INDEX } from './docs/sonicpi'
import { STRUDEL_DOCS_INDEX } from './strudelDocs'
import { buildIdentifierAlternation } from './docs/tokenizer-utils'

export function registerSonicPiLanguage(monaco: typeof Monaco): void {
  const langs = monaco.languages.getLanguages()
  if (langs.some((l) => l.id === 'sonicpi')) return

  monaco.languages.register({ id: 'sonicpi' })

  // Derive the function-name alternation from the docs index so every
  // upstream-sourced entry (313 across lang / synth / fx) is highlighted.
  // Symbols (`:dull_bell`) are handled by the `:\w+` rule below — we only
  // need bare identifiers here, so synth / fx / sample kinds are dropped.
  const sonicPiFns = buildIdentifierAlternation(SONICPI_DOCS_INDEX, {
    excludeKinds: ['synth', 'fx', 'sample'],
    extra: ['puts', 'print'],
  })

  monaco.languages.setMonarchTokensProvider('sonicpi', {
    defaultToken: '',
    tokenPostfix: '.sonicpi',

    keywords: [
      'do', 'end', 'if', 'else', 'elsif', 'unless', 'loop', 'while', 'until',
      'for', 'in', 'begin', 'rescue', 'ensure', 'true', 'false', 'nil', 'and', 'or', 'not',
    ],

    tokenizer: {
      root: [
        // Ruby comment
        [/#.*$/, 'comment'],

        // Ruby symbols :name
        [/:\w+/, 'sonicpi.symbol'],

        // Sonic Pi language + music functions (derived from docs index)
        [new RegExp(`\\b(${sonicPiFns})\\b`), 'sonicpi.function'],

        // Keywords
        [/\b(do|end|if|else|elsif|unless|loop|while|until|for|in|true|false|nil)\b/, 'keyword'],

        // Note names: c3, eb4, f#2
        [/\b[a-gA-G][bs#]?\d\b/, 'sonicpi.note'],

        // Numbers
        [/\b\d+(\.\d+)?\b/, 'number'],

        // Strings
        [/"/, 'string', '@string_double'],
        [/'/, 'string', '@string_single'],

        // Keyword args (release:, amp:, rate:)
        [/\b(\w+):/, 'sonicpi.kwarg'],
      ],

      string_double: [
        [/#\{/, 'string.interpolation', '@interpolation'],
        [/"/, 'string', '@pop'],
        [/[^"#]+/, 'string'],
        [/./, 'string'],
      ],

      string_single: [
        [/'/, 'string', '@pop'],
        [/[^']+/, 'string'],
      ],

      interpolation: [
        [/\}/, 'string.interpolation', '@pop'],
        { include: 'root' },
      ],
    },
  })

  monaco.languages.setLanguageConfiguration('sonicpi', {
    comments: {
      lineComment: '#',
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  })
}

export function registerStrudelLanguage(monaco: typeof Monaco): void {
  // Only register once
  const langs = monaco.languages.getLanguages()
  if (langs.some((l) => l.id === 'strudel')) return

  monaco.languages.register({ id: 'strudel' })

  // Derive the function-name alternation from the docs index. Extras stay
  // as a short hand-curated list for symbols the docs haven't covered yet
  // (mini-notation helpers and tempo aliases).
  const strudelFns = buildIdentifierAlternation(STRUDEL_DOCS_INDEX, {
    extra: [
      'sub', 'add', 'mul', 'div', 'mod', 'abs',
      'sine', 'saw', 'square', 'tri',
      'setcps', 'setCps', 'cpm',
      'loopBegin', 'loopEnd', 'n', 'ftype', 'fanchor',
    ],
  })

  monaco.languages.setMonarchTokensProvider('strudel', {
    defaultToken: '',
    tokenPostfix: '.strudel',

    keywords: [
      'const', 'let', 'var', 'await', 'async', 'return', 'if', 'else',
      'for', 'while', 'function', 'class', 'import', 'export', 'from',
    ],

    tokenizer: {
      root: [
        // $: pattern-start marker
        [/\$\s*:/, 'strudel.pattern-start'],

        // setcps / setCps tempo
        [/\bsetcps\b|\bsetCps\b/, 'strudel.tempo'],

        // Note names: c3, eb4, f#2, C#5
        [/\b[a-gA-G][b#]?\d\b/, 'strudel.note'],

        // Strudel function names (must come before keywords check)
        [new RegExp(`\\b(${strudelFns})\\b`), 'strudel.function'],

        // JS keywords
        [
          /\b(const|let|var|await|async|return|if|else|for|while|function|class|import|export|from)\b/,
          'keyword',
        ],

        // Line comment
        [/\/\/.*$/, 'comment'],

        // Block comment
        [/\/\*/, 'comment', '@block_comment'],

        // Strings (mini-notation)
        [/"/, 'string', '@mini_string_double'],
        [/'/, 'string', '@mini_string_single'],
        [/`/, 'string', '@template_string'],

        // Numbers
        [/\b\d+(\.\d+)?\b/, 'number'],
      ],

      block_comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],

      mini_string_double: [
        [/[~*!%?@<>\[\]{}|,_]/, 'strudel.mini.operator'],
        [/[a-gA-G][b#]?\d?/, 'strudel.mini.note'],
        [/\d+(\.\d+)?/, 'strudel.mini.number'],
        [/"/, 'string', '@pop'],
        [/[^"]+/, 'string'],
      ],

      mini_string_single: [
        [/[~*!%?@<>\[\]{}|,_]/, 'strudel.mini.operator'],
        [/[a-gA-G][b#]?\d?/, 'strudel.mini.note'],
        [/\d+(\.\d+)?/, 'strudel.mini.number'],
        [/'/, 'string', '@pop'],
        [/[^']+/, 'string'],
      ],

      template_string: [
        [/`/, 'string', '@pop'],
        [/[^`]+/, 'string'],
      ],
    },
  })

  monaco.languages.setLanguageConfiguration('strudel', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
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
    ],
  })
}
