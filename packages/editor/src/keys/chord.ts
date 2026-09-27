/**
 * One chord builder for every key in Stave (#1799).
 *
 * A chord is a string like `mod+shift+z`: modifiers, then one key token. The
 * app's command dispatcher, a panel's scoped commands and the Shortcuts panel's
 * "press a key to rebind" capture all build chords HERE, so a binding recorded
 * in Settings is always the chord the dispatcher will match. The grids live in
 * this package, which is why the builder does too — the app imports it, never
 * the other way round.
 *
 * ⚠ `e.key` IS THE CHARACTER A KEYSTROKE PRODUCED, NOT THE KEY PRESSED.
 * Measured with real OS key presses (macOS 15.4.1, ABC layout, headed Chromium
 * and Firefox, 2026-09-27):
 *
 *   ⌥K        key "Dead"                      code "KeyK"
 *   ⌥⌘K       key "Dead" (Chromium) "˚" (FF)  code "KeyK"
 *   ⇧3        key "#"                         code "Digit3"
 *   Space     key " "                         code "Space"
 *
 * So the key token is the LABEL when the label is a plain letter, digit or
 * punctuation mark (⌘Z stays on the key marked Z on every layout), and the
 * PHYSICAL KEY (`e.code`) when the label is a dead key, a character the chord
 * vocabulary has no name for (⌥ composition, a non-Latin layout), or the
 * shifted symbol of a digit/punctuation key (⇧3 is `shift+3`, not `shift+#`).
 *
 * ⚠ Control and Command are DIFFERENT keys on a Mac. `mod` is ⌘ there and
 * Control elsewhere; a Mac's Control is its own `ctrl` token, so ⌃⌫ and ⌘⌫ are
 * two chords (Logic's Clear Step is ⌃⌫). Off a Mac, Ctrl and the Windows/Super
 * key both still read as `mod`, as they always have.
 *
 * Known residual: a non-QWERTY layout whose letters sit on other physical keys
 * is matched by label while the label is Latin, and by QWERTY position only
 * when the label is not. A real layout map is out of scope.
 */

export type ChordOptions = {
  /** Platform override; defaults to `navigator.platform` containing "Mac". */
  isMac?: boolean
  /**
   * Take the key token from the physical key only (`e.code`), ignoring the
   * label — for keys that are a LAYOUT rather than a letter (a piano keyboard
   * on the home row), which must stay put when the layout changes.
   */
  byPosition?: boolean
}

type KeyEventLike = Pick<
  KeyboardEvent,
  'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
>

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
}

/** The unshifted US-layout label of each punctuation key, by `e.code`. */
const PUNCTUATION_BY_CODE: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
}

/**
 * The base key under each shifted US-keyboard symbol. Before #1799 a rebind was
 * saved as the character typed (⇧/ as `shift+?`); reading those back through
 * this table keeps them matching the key that saved them (#1814).
 */
const BASE_OF_SHIFTED: Record<string, string> = {
  '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  _: '-', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`',
}

/** Key token for a physical key: `KeyK` → `k`, `Digit3` → `3`, `Space` → `space`. */
export function tokenForCode(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (code in PUNCTUATION_BY_CODE) return PUNCTUATION_BY_CODE[code]
  return code.toLowerCase()
}

/** A label the chord vocabulary spells as itself: printable ASCII. */
const PLAIN_LABEL = /^[\x21-\x7e]$/

/** True for a keydown of a modifier alone — a capture should keep waiting. */
export function isModifierOnlyKey(e: Pick<KeyboardEvent, 'key'>): boolean {
  return ['Control', 'Meta', 'Shift', 'Alt', 'AltGraph', 'CapsLock', 'Fn'].includes(e.key)
}

function keyToken(e: KeyEventLike, byPosition: boolean): string {
  const fromCode = e.code ? tokenForCode(e.code) : ''
  if (byPosition && fromCode) return fromCode
  const key = e.key
  if (key === ' ') return 'space'
  if (key.length === 1) {
    // Shifted symbol of a digit/punctuation key: ⇧3 is "3" + shift, not "#".
    const codeIsSymbolKey = /^Digit[0-9]$/.test(e.code) || e.code in PUNCTUATION_BY_CODE
    if (e.shiftKey && codeIsSymbolKey) return fromCode
    if (PLAIN_LABEL.test(key)) return key === '+' ? 'plus' : key.toLowerCase()
    // A composed or non-Latin character (⌥K's "˚", Cyrillic "я") has no
    // name in the vocabulary: fall back to where the key is.
    return fromCode || key.toLowerCase()
  }
  if (key === 'Dead' || key === 'Unidentified' || key === '') return fromCode || 'unidentified'
  return key.toLowerCase()
}

/** Build the chord a keystroke means, e.g. `mod+shift+z`, `alt+k`, `ctrl+backspace`. */
export function chordFromEvent(e: KeyEventLike, opts: ChordOptions = {}): string {
  const isMac = opts.isMac ?? isMacPlatform()
  const parts: string[] = []
  if (isMac) {
    if (e.metaKey) parts.push('mod')
    if (e.ctrlKey) parts.push('ctrl')
  } else if (e.metaKey || e.ctrlKey) {
    parts.push('mod')
  }
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  parts.push(keyToken(e, opts.byPosition ?? false))
  return parts.join('+')
}

const MODIFIER_ORDER = ['mod', 'ctrl', 'shift', 'alt'] as const

/** Canonical form of one chord: aliases resolved, modifiers in a fixed order. */
export function normalizeChord(chord: string, opts: ChordOptions = {}): string {
  const isMac = opts.isMac ?? isMacPlatform()
  const mods = new Set<string>()
  let key = ''
  for (const raw of chord.toLowerCase().split('+')) {
    let t = raw
    if (t === 'cmd' || t === 'command' || t === 'meta') t = 'mod'
    else if (t === 'control') t = isMac ? 'ctrl' : 'mod'
    else if (t === 'ctrl' && !isMac) t = 'mod'
    else if (t === 'option' || t === 'opt') t = 'alt'
    if ((MODIFIER_ORDER as readonly string[]).includes(t)) mods.add(t)
    else if (t === ' ' || t === 'spacebar') key = 'space'
    else if (t === 'esc') key = 'escape'
    else if (t === 'return') key = 'enter'
    else key = t
  }
  if (mods.has('shift') && key in BASE_OF_SHIFTED) key = BASE_OF_SHIFTED[key]
  return [...MODIFIER_ORDER.filter((m) => mods.has(m)), key].join('+')
}

/** Does the chord a keystroke built match a declared binding? */
export function chordMatches(eventChord: string, declared: string, opts: ChordOptions = {}): boolean {
  return normalizeChord(eventChord, opts) === normalizeChord(declared, opts)
}
