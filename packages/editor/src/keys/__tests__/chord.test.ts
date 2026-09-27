import { describe, expect, it } from 'vitest'
import { chordFromEvent, chordMatches, isModifierOnlyKey, normalizeChord, tokenForCode } from '../chord'

type Ev = Parameters<typeof chordFromEvent>[0]
const ev = (key: string, code: string, mods: Partial<Ev> = {}): Ev => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})
const mac = { isMac: true }
const win = { isMac: false }

// Field-for-field from real OS key presses (osascript → headed Chromium and
// Firefox, macOS 15.4.1, ABC layout, 2026-09-27; store probes/keyboard-1083).
describe('chordFromEvent — the real-key table (#1799)', () => {
  it('⌥K is alt+k although the browser reports key "Dead"', () => {
    expect(chordFromEvent(ev('Dead', 'KeyK', { altKey: true }), mac)).toBe('alt+k')
    expect(chordFromEvent(ev('Dead', 'KeyA', { altKey: true }), mac)).toBe('alt+a')
  })

  it('⌥⌘K is mod+alt+k in Chromium ("Dead") and in Firefox ("˚")', () => {
    expect(chordFromEvent(ev('Dead', 'KeyK', { altKey: true, metaKey: true }), mac)).toBe('mod+alt+k')
    expect(chordFromEvent(ev('˚', 'KeyK', { altKey: true, metaKey: true }), mac)).toBe('mod+alt+k')
  })

  it('⌥P is alt+p although macOS composes "π"', () => {
    expect(chordFromEvent(ev('π', 'KeyP', { altKey: true }), mac)).toBe('alt+p')
  })

  it('⇧3 is shift+3, not shift+#', () => {
    expect(chordFromEvent(ev('#', 'Digit3', { shiftKey: true }), mac)).toBe('shift+3')
    expect(chordMatches(chordFromEvent(ev('#', 'Digit3', { shiftKey: true }), mac), 'shift+3', mac)).toBe(true)
  })

  it('⌃⌫ and ⌘⌫ are two chords on a Mac', () => {
    const ctrl = chordFromEvent(ev('Backspace', 'Backspace', { ctrlKey: true }), mac)
    const cmd = chordFromEvent(ev('Backspace', 'Backspace', { metaKey: true }), mac)
    expect(ctrl).toBe('ctrl+backspace')
    expect(cmd).toBe('mod+backspace')
    expect(chordMatches(ctrl, 'mod+backspace', mac)).toBe(false)
  })

  it('⌃⇧P is not ⌘⇧P on a Mac', () => {
    const ctrl = chordFromEvent(ev('P', 'KeyP', { ctrlKey: true, shiftKey: true }), mac)
    expect(chordMatches(ctrl, 'mod+shift+p', mac)).toBe(false)
    const cmd = chordFromEvent(ev('P', 'KeyP', { metaKey: true, shiftKey: true }), mac)
    expect(chordMatches(cmd, 'mod+shift+p', mac)).toBe(true)
  })

  it('off a Mac, Ctrl is mod as before, and a declared ctrl means Ctrl', () => {
    const c = chordFromEvent(ev('z', 'KeyZ', { ctrlKey: true }), win)
    expect(c).toBe('mod+z')
    expect(chordMatches(c, 'ctrl+z', win)).toBe(true)
  })

  it('Space is space', () => {
    expect(chordFromEvent(ev(' ', 'Space'), mac)).toBe('space')
    expect(chordMatches('space', ' ', mac)).toBe(true)
  })

  it('keys that were already fine stay as they were', () => {
    expect(chordFromEvent(ev('ArrowRight', 'ArrowRight', { altKey: true }), mac)).toBe('alt+arrowright')
    expect(chordFromEvent(ev('ArrowUp', 'ArrowUp', { altKey: true, shiftKey: true }), mac)).toBe('shift+alt+arrowup')
    expect(chordFromEvent(ev("'", 'Quote'), mac)).toBe("'")
    expect(chordFromEvent(ev('`', 'Backquote'), mac)).toBe('`')
    expect(chordFromEvent(ev('-', 'Minus'), mac)).toBe('-')
    expect(chordFromEvent(ev('B', 'KeyB', { shiftKey: true }), mac)).toBe('shift+b')
  })

  it('the label wins over the position for a plain letter (⌘Z on AZERTY is the key marked Z)', () => {
    expect(chordFromEvent(ev('z', 'KeyW', { metaKey: true }), mac)).toBe('mod+z')
  })

  it('byPosition takes the physical key only', () => {
    expect(chordFromEvent(ev('z', 'KeyW'), { ...mac, byPosition: true })).toBe('w')
  })
})

describe('normalizeChord', () => {
  it('orders modifiers and resolves aliases', () => {
    expect(normalizeChord('shift+mod+z', mac)).toBe('mod+shift+z')
    expect(normalizeChord('cmd+option+k', mac)).toBe('mod+alt+k')
    expect(normalizeChord('control+delete', mac)).toBe('ctrl+delete')
    expect(normalizeChord('ctrl+delete', win)).toBe('mod+delete')
  })
})

it('tokenForCode', () => {
  expect(tokenForCode('KeyK')).toBe('k')
  expect(tokenForCode('Digit3')).toBe('3')
  expect(tokenForCode('Slash')).toBe('/')
  expect(tokenForCode('Space')).toBe('space')
})

it('isModifierOnlyKey', () => {
  expect(isModifierOnlyKey({ key: 'Meta' })).toBe(true)
  expect(isModifierOnlyKey({ key: 'k' })).toBe(false)
})
