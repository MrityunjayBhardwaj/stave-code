import type * as Monaco from 'monaco-editor'
import { SONICPI_DOCS_INDEX } from './docs/sonicpi'
import { STRUDEL_DOCS_INDEX } from './strudelDocs'
import { buildIdentifierAlternation } from './docs/tokenizer-utils'

export function registerSonicPiLanguage(monaco: typeof Monaco): void {
  const langs = monaco.languages.getLanguages()
  if (langs.some((l) => l.id === 'sonicpi')) return

  monaco.languages.register({ id: 'sonicpi' })

  // Two token-classes restore the prior visual distinction:
  //
  //   sonicpi.music    — pitch + randomness + ring helpers that feel
  //                      mathematical (choose, rrand, ring, range, chord,
  //                      scale, note, tick, …). All western_theory / maths
  //                      categories + a curated list of random/ring fns.
  //   sonicpi.function — DSL flow / audio / MIDI (play, sleep, live_loop,
  //                      sample, synth, with_fx, use_bpm, cc, …).
  //
  // Symbols (`:dull_bell`) hit the `:\w+` rule below; synth / fx / sample
  // kinds are dropped from both alternations.
  const MUSIC_HELPER_NAMES = new Set([
    'choose', 'rrand', 'rrand_i', 'rand', 'rand_i', 'dice', 'one_in',
    'ring', 'knit', 'range', 'line', 'spread', 'tick', 'look',
    'shuffle', 'sort_by', 'reflect', 'stretch', 'repeat', 'mirror',
  ])
  const musicFns = buildIdentifierAlternation(SONICPI_DOCS_INDEX, {
    excludeKinds: ['synth', 'fx', 'sample'],
    filter: (name, doc) =>
      doc.category === 'western_theory' ||
      doc.category === 'maths' ||
      MUSIC_HELPER_NAMES.has(name),
  })
  const dslFns = buildIdentifierAlternation(SONICPI_DOCS_INDEX, {
    excludeKinds: ['synth', 'fx', 'sample'],
    filter: (name, doc) =>
      doc.category !== 'western_theory' &&
      doc.category !== 'maths' &&
      !MUSIC_HELPER_NAMES.has(name),
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

        // Keyword args (release:, amp:, rate:) — BEFORE the fn rule so
        // `amp:` doesn't get classified as the `amp` function.
        [/\b[a-z_]\w*:/, 'sonicpi.kwarg'],

        // Keywords first — `end` / `do` would otherwise match the function
        // list (Sonic Pi has many fns named alike, but these are lexical).
        [/\b(do|end|if|else|elsif|unless|loop|while|until|for|in|true|false|nil|and|or|not|begin|rescue|ensure|return|yield|then|when|case|break|next|redo|retry|module|class|def|lambda|proc|self)\b/, 'keyword'],

        // Music helpers (mathy / pitch / randomness) — pink-tinted class.
        [new RegExp(`\\b(${musicFns})\\b`), 'sonicpi.music'],

        // DSL / sound / MIDI functions — blue-tinted class.
        [new RegExp(`\\b(${dslFns})\\b`), 'sonicpi.function'],

        // Note names: c3, eb4, f#2
        [/\b[a-gA-G][bs#]?\d\b/, 'sonicpi.note'],

        // Identifier fallthrough — user variables, iterator names, etc.
        [/[a-zA-Z_][\w]*/, 'identifier'],

        // Numbers
        [/0x[\da-fA-F]+/, 'number.hex'],
        [/\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],

        // Strings
        [/"/, { token: 'string.quote', next: '@string_double' }],
        [/'/, { token: 'string.quote', next: '@string_single' }],

        // Operators + delimiters
        [/=>|<=>|==|!=|<=|>=|&&|\|\||\.\.\.?/, 'keyword.operator'],
        [/[=!<>]=?/, 'keyword.operator'],
        [/[+\-*/%&|^~]=?/, 'keyword.operator'],
        [/[{}()[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
      ],

      string_double: [
        [/#\{/, { token: 'string.interpolation', next: '@interpolation' }],
        [/\\./, 'string.escape'],
        [/[^"#\\]+/, 'string'],
        [/#/, 'string'],
        [/"/, { token: 'string.quote', next: '@pop' }],
      ],

      string_single: [
        [/\\./, 'string.escape'],
        [/[^'\\]+/, 'string'],
        [/'/, { token: 'string.quote', next: '@pop' }],
      ],

      interpolation: [
        [/\}/, { token: 'string.interpolation', next: '@pop' }],
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
